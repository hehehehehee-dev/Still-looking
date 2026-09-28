# LEARNING.md

A running log of the key decisions, what I learned, and the problems I hit while building
Still Looking. Newest entries at the bottom of each day.

---

## Day 1 · Thu Sep 25, 2026

### Decision: which AI model generates the images
- **Options:** (A) SAM, a 2021 research model built only for face aging; (B) Nano Banana 2
  (Google's Gemini 3.1 Flash Image), a general image editor that accepts up to 14 reference photos.
- **Chose B**, because it's the only one that can look at the parents' and siblings' photos, which
  is the core idea of the project (copying how NCMEC forensic artists work).
- **Honest limit:** the model *sees* the family photos, but nobody can prove it uses them the way a
  forensic artist would. I'll describe it as "inspired by" the forensic method, not "the same as".
- SAM stays in the plan as a cheap comparison for the accuracy test if there's time.

### Decision: which provider hosts the model
- I wanted the Gemini free tier. **What I learned:** on Google's official pricing page every image
  model is "Not available" on the free tier. And on the free tier Google may use what you send to
  improve its products, which breaks my own "don't let the provider train on uploads" rule.
- First switched to **Replicate** (same model, free trial credit), but its "no training" wording
  was vague, and the trial credit runs out.
- Then looked at **fluxapi.ai** (FLUX.1 schnell, free credits). **Rejected it**, because:
  1. schnell is a text-to-image model. It draws *a* teenager from a description; it can't keep
     *this child's* face, so the result would be fake.
  2. The site says generated images are stored for 14 days, which breaks my "no storage" promise.
  3. Its privacy policy only covers email addresses: nothing about images or training.
- **Final choice: Cloudflare Workers AI with FLUX.2 [klein] 4B.**
  - Free: 10,000 "neurons" (Cloudflare's usage unit) per day, no credit card.
  - Cloudflare says in writing that it doesn't train on your inputs or outputs and doesn't keep them.
  - Takes up to 4 input images (the child plus up to 3 family members), so family mode still works.
- **Trade-offs I accept:** lower image quality than Nano Banana 2, and each input image must be
  smaller than 512×512, so faces carry less detail. The model name changed, but the core idea didn't.
- **Lesson:** "free" and "has an API" aren't enough. For photos of children I had to check
  three things: does it *actually* use the input photo, does it store data, and does it train on it.

### Decision: test photos
- I won't use photos of real children downloaded from the internet; they never agreed to it.
- Using **FG-NET** instead: a research dataset (82 people, 1,002 photos, ages 0–69) collected for
  face-aging research. It's kept out of the public repo because its licence is research-only.
- 77 of the 82 people have a childhood photo (age 12 or under) plus a later photo, which is plenty
  for the accuracy test.

### First real test (the "spike")
- Sent FG-NET subject 001 at age 5 to FLUX.2 klein and asked for age 18. **It worked in 9.7 s and
  wasn't blocked**, so child photos are OK with this provider.
- **Problem: it under-aged him.** Prompt v1 ("show this person at 18, keep identity") came back
  looking about 14: a round, soft, child-like face.
- **Fix: prompt v2 names the physical changes of adolescence** (longer, narrower face, stronger jaw
  and nose, thicker eyebrows, adult proportions) and lists which features to keep (eye shape, brow
  shape, nose, ears, hairline). The results looked clearly older, and the thick, close eyebrows,
  which the real 18-year-old has, came through.
- **Learned:** the model doesn't "know" how aging works for this person; it follows my words. The
  prompt is part of the method, so it has to be written carefully and kept the same in the eval.
- **Learned:** changing the `seed` number gives a different variation from the same inputs.
  That's how the app will make 3 variations.
- **Caution:** one example proves nothing. The eval on ~40 people is what tells us if it works.

### Problem: npm rejected the folder name
- `create-next-app` refused "Still Looking" because npm package names can't have capitals or
  spaces. Fixed by creating the app as `still-looking` in a subfolder and moving it up.

### Ahead of schedule: built the Day 2 work (generate API + upload form + results)
- **How the app is split:**
  - `src/app/api/generate/route.ts` is the server part. It checks the upload, works out the ages,
    builds the prompt, and asks Cloudflare for 3 variations at the same time.
  - `src/app/create/` is the page the family sees.
  - `src/lib/` holds small helpers: age math, prompt writing, the Cloudflare call, photo shrinking.
- **Decision: results show on the same page as the form, not a separate `/results` page.** A
  separate page would need to put the images somewhere (URL, browser storage, or a server) to
  pass them along. Keeping them only in the page's memory means refreshing or closing the page really
  deletes them. That makes the privacy promise true by design, not just a policy.
- **Decision: shrink photos in the browser before upload.** The model needs images under 512×512
  anyway, and hosting platforms reject big uploads. The full-size original never leaves the device.
- **Decision: the server re-checks everything** (file type, size, dates, ages). It never trusts
  what the page sends, because anyone can call an API directly.
- **Decision: the "confidence note" is not a made-up score.** The model gives no confidence
  number. The note will quote the real eval result for the same age gap (filled in on Day 3).
- **Tests:**
  - The API returned 3 variations in ~9 s.
  - Wrong inputs (no photo, photo dated before birth, missing family age, non-image file) each
    return a clear error message.
  - Family mode ran with a stand-in photo from FG-NET. It only tests the mechanics, since FG-NET
    has no real family members. The result still looked like the child, not the stand-in.
- **Surprise worth telling judges:** for the browser test I uploaded a *cartoon* face (an oval
  with two dots). The model still returned 3 realistic teenage boys, even though sex was set to
  "prefer not to say". **It never says "I can't tell". It invents a confident-looking face.**
  That's exactly why the app must show 3 variations, the disclaimers, and the measured accuracy
  instead of one "answer".
- **Problem:** one run took 25 s instead of 9 s (Cloudflare's speed varies). Changed the waiting
  message to "usually 10–30 seconds" and gave the server 60 s before it times out.
- **Problem I spotted while testing the web page myself: the results still looked like children**
  (about 13–14 instead of 18). I had left sex on "prefer not to say". Tried 4 prompt versions on the
  same photo (FG-NET 001, age 5 → 18):
  | Version | What changed | Result |
  |---|---|---|
  | current | called them "a child at age 5… as an 18-year-old adult" | ~13–14, still a child |
  | v3 | added "no childlike features such as round cheeks, small chin…" | one seed came out **~55 years old** |
  | v4 | positive wording only + a life stage ("the age of a university student") | 17–22 on 5 of 5 images |
  | v4 + "is now 13 years older" | added the number of years | all 3 came out **~45–55** |
  | final | v4, saying "has now grown up" instead | ~16–17 if sex unknown, **~18–22 if sex = boy** |
- **What I learned about image models:**
  1. **They don't understand "no".** Writing "no round cheeks" still puts "round cheeks" in its head.
  2. **Some words are heavy.** "Child" pulled results young; "13 years older" pulled them old.
  3. **Naming a familiar life stage** ("high-school student", "university student") steadies the age.
  4. **Telling it the sex helps a lot**, so the form now says so next to that field.
  5. **The same prompt gives very different ages with different seeds.** Judging by eye from a
     few pictures is unreliable, so the Day 3 eval will also **measure the apparent age of every
     result with an age-estimation model**, not only whether it looks like the right person.
- **Problem:** one request failed with "Capacity temporarily exceeded" (Cloudflare busy). The app now
  waits 2 seconds and retries once.
- **Free-tier maths:** Cloudflare's dashboard showed 218 neurons for the first 3 images, so
  ~73 neurons per image, or about **135 free images per day** (45 app runs).

### Ahead of schedule again: the accuracy test ("eval"), Day 3's work
- **How it works:** 3 scripts in `/eval`.
  1. `select_pairs.py` picks 42 FG-NET people: a childhood photo plus a later photo each,
     14 per age-gap group, one pair per person.
  2. `generate.mjs` ages each childhood photo with **the app's own code** (same prompt, same
     model, 3 variations).
  3. `score.py` compares faces with ArcFace (InsightFace) and estimates ages.
- **The key comparison is a "baseline":** how similar is the *unchanged* childhood photo to the
  real later photo? If our aged image isn't more similar than that, aging didn't help.
- **Problem: Python refused to download the face model** (an SSL certificate error, common on
  Windows). Downloaded the same file with `curl` instead.
- **Problem: the face detector missed 14 of 42 faces.** FG-NET photos are cropped tightly around
  the face. The detector enlarges images to 640 px, which made the faces too big for it to spot.
  Setting it to 320 px found all 14. **Lesson: check *why* data is missing before trusting results.**
- **Pilot on 3 people: aging made the match worse in 3/3** (similarity 0.23 vs 0.46 baseline).
  Looking at the images, the model "beautifies" faces into smooth, symmetrical stock-photo faces.
  They look the right age, but lose what makes them *that* person.
- **Tried to fix it without cheating:** tested 3 prompt versions on 5 *different* FG-NET people
  (a "dev set") who are **not** in the 42-person test. Tuning the prompt on the test people
  would make the test meaningless.
  | Prompt | Similarity to real later photo (dev set) | Did it actually age the face? |
  |---|---|---|
  | Baseline: unchanged childhood photo | 0.37 | n/a |
  | A (the app's prompt: passport-style) | 0.13 | Yes |
  | B ("keep the same pose, lighting and photo style") | 0.24 | **Often no:** babies stayed babies |
  | C ("keep natural imperfections, not idealised") | 0.20 | Partly |
- **The trap I found:** B scored best only because it barely changed the photo. **A face-matching
  score rewards doing nothing**, so it can't be the only measure. Our eval reports *both* the face
  match and whether the image actually aged. I kept prompt A in the app, since a family needs
  an image that actually shows the older age.
- **The age-estimation model is unreliable on old scanned photos:** it guessed an 18-year-old in
  FG-NET was 58. So the age check is reported next to the model's own error on the *real* photos,
  and treated as a rough signal only.
- **Why "do nothing" is a hard baseline to beat:** ArcFace was trained to recognise the *same
  person across ages*, so it's already good at matching a child photo to the adult. Any
  re-drawing of the face adds noise it has to see through.

### Eval results (38 of 42 people; the last 4 ran out of free quota and finish tomorrow)
- **Aging never beat doing nothing:** 0 of 38 people. Average similarity to the real later
  photo: 0.17 aged vs 0.40 unchanged. The 95% range of the difference (−0.27 to −0.20) is entirely
  below zero, so this isn't bad luck.
- **But the aged images aren't random faces:** in 89% of cases the aged image was closer to the
  right person than to the other 37 people's later photos (0.17 vs 0.03 "chance level").
- **Picking the right person out of 38:** the unchanged photo picks the right adult first 84%
  of the time; the aged image 45%. With gaps over 10 years: 64% vs 14%.
- **The age check didn't work:** InsightFace's age model almost never guesses under ~20 for
  children, even on the real photos (true average 16, estimated 33). So I can't claim the images
  hit the right age. I can only show the chart and explain why it's inconclusive.
- **Added a fairer second question after seeing the first result:** "is it better than
  chance?" as well as "is it better than doing nothing?". One number alone would either oversell
  or undersell the tool.
- **What this means for the product:** the images look older, but a free image model re-draws
  faces in a way that loses individual features. The app must present them as *"a way to
  picture how a child might have grown"*, **never** as a better match than the original photo,
  and should tell families to always share the original photo too.

### Two new ideas to fix the "beautified face" problem (they run when tonight's quota resets)
1. **More photos of the child.** One photo shows one angle, one smile, one light. With 2–3
   photos the model may see which features are really *theirs*. FG-NET has several childhood
   photos per person, so this is **measurable**: 31 of the 42 test people have extra childhood
   photos taken at the same age or *younger* (never older, which would be peeking at the future).
   Same seed as the normal run, so the only difference is the extra photos.
2. **Distinguishing features (my idea after seeing the results).** Missing-child posters list
   "distinguishing marks". A vision model (Gemma 4, also on Cloudflare, same free quota and privacy)
   *suggests* moles, scars, birthmarks, eye colour… and they're written into the image prompt.
   - **The family checks the list first.** The model can mistake dust on an old scan for a mole,
     and parents know marks the photo doesn't show.
   - **Decided not to let AI guess race/ethnicity:** unreliable, sensitive, and skin tone is
     already in the photo. Families can type it themselves if they want.
   - Also told it to skip things that change in childhood (baby teeth), and the form warns that
     eye colour and some birthmarks change in the first years.
   - **Measurable, but only the worst case:** in the eval nobody checks the AI's suggestions.
- **Engineering note:** I added both as *optional* extra text in the prompt. I checked that
  the normal prompt is exactly the same as before, character for character, so the
  results already measured stay valid.
- **Mistake I made:** said the quota resets at "7 AM Vietnam time". The computer's clock is on
  US Eastern time, so it's 8 PM EDT. Lesson: check the clock, don't assume.

### Added a clear "out of free quota" message
- When the free daily allowance runs out, both AI features now say so in plain words, with the reset
  time, instead of a vague error. Tested it for real while the quota was used up.
- This matters once the app is public: judges share the same 10,000 neurons/day, so I must not
  run the eval on the day they test it.

---

## Day 2 · Sat Sep 26, 2026

### Problem: Cloudflare's quota didn't come back at the "reset" time
- The dashboard said usage reset at 00:00 UTC, but at 09:00 UTC the API still answered
  "you have used up your daily free allocation" (error 4006).
- I checked our server log first: nothing of ours had called Cloudflare since the reset.
- Then I searched: many people report the same thing on Cloudflare's community forum (dashboard
  shows 0/10k, API still says 4006). So it's their side, not our code.
- **My guess (not confirmed):** the limit really works as a rolling 24 hours, not a calendar day.
- **What I did:** instead of refreshing by hand, a small script tries a tiny request every
  15 minutes (almost zero cost) and starts the eval automatically once Cloudflare allows it.
- **Lesson:** a free tier's "resets at midnight" isn't a promise. Plan the demo and judging day so
  they don't depend on a fresh quota, and have a friendly message ready when it's out.

### Question I asked: is the accuracy problem the model or the prompt?
- **Mostly the model.** Evidence from our own data:
  1. The aged images are only 0.30 similar to *the very photo they were made from*. One person
     aged by a single year (9 → 10) dropped from 0.51 to 0.02. The model re-draws a new face
     instead of editing the old one.
  2. Changing the prompt only moved *which* mistake it made: prompt A aged the face but lost
     identity; prompt B kept identity but didn't age. No wording got both, which points to a
     limit of the model, not of the words.
  3. The model is small and fast (4B parameters, 4 fixed steps), and its inputs must be under
     512 px, so faces lose fine detail.
- **Also realistic:** ArcFace is *built* to recognise people across ages, so "beat the original
  photo" is a very high bar. A better goal: keep more identity (raise the 0.17) while still
  looking the right age.
- **Plan (all $0):** tonight's two experiments, then try the bigger FLUX.2 klein 9B on the 5 dev
  people (~1,400 neurons per image, so it needs its own day), and add face framing.

### Added: the family frames the child's face before upload
- A square cropper in the browser, so the face fills the ~500 px image the model gets instead of
  being a small part of a wide photo. It also lets a family pick the right child from a group photo.
- I chose *manual* framing over automatic face detection: no extra AI model to download, and
  families know which child is theirs.
- It won't change the eval numbers (FG-NET photos are already tightly cropped), but it helps real,
  messier family photos.

### Added: cheaper ways to test
- `AI_MODE=mock` in `.env.local` means no AI calls at all: the app sends back your own photo, with
  a clear "Test mode" banner. Costs 0, good for testing the layout and buttons.
- `AI_MODE=cheap` makes 1 image at 512 px instead of 3 at 768 px. Cloudflare charges per
  512×512 "tile" of output, so this is roughly 7× cheaper (estimate, not yet measured).
- The deployed site leaves `AI_MODE` empty, so families and judges get the full version.

### The quota came back at 12:33 UTC (not 00:00), and the first run hit two new problems
- My waiting script checked every 15 minutes and started the eval by itself at 12:33 UTC, about 24
  hours after yesterday's heavy use. That fits the "rolling 24 hours" guess.
- **Problem 1: many "Request timeout" errors from Cloudflare.** The app only retried "capacity"
  errors. It now retries timeouts too (3 attempts, waiting a bit longer each time).
- **Problem 2: the distinguishing-features experiment silently did nothing.** Every person got
  an empty feature list, so 31 images were made with the *normal* prompt, wasting quota.
  - I printed the model's raw reply. Gemma 4 **"thinks" before answering** (it writes out its
    reasoning first), and that used up the whole 300-token limit, so the actual answer was
    empty or cut off.
  - Raising the limit to 1,200 wasn't enough for some photos. **Turning thinking off**
    (`enable_thinking: false`) fixed it: short, clean answers for ~25 neurons each.
  - Deleted the 31 invalid images and re-ran. The eval now also skips people with no features
    found, since their prompt would be identical to the normal one.
- **Lesson:** my code treated "no answer" the same as "the model found nothing". I should have
  looked at a few real replies *before* running 40 of them. Now I always check a small sample by eye first.
- **Honest note about the features:** on these old, blurry scans the model is very cautious and
  mostly finds only "dark eyes" or "thick eyebrows", because I told it not to guess. A real family would
  add actual marks (a scar, a birthmark), which a dataset like FG-NET can't provide.

### Final eval results (all 42 people, 126 aged images)
- **Main result didn't change with the last 4 people:** aged images 0.17 vs original photo 0.42;
  0 of 42 beat the original; 90% were closer to the right person than to strangers; right person
  ranked first 45% (aged) vs 86% (original). Over 10 years: 14% vs 64%.
- **Extra childhood photos (31 people): no measurable help.** 0.187 → 0.169; the 95% range
  (−0.044 to +0.007) includes zero, and it was slightly worse on average. My guess: with several
  faces to look at, the model blends them rather than learning what's constant.
- **AI-suggested features (18 people, unfinished because the quota ran out): no measurable help.**
  0.168 → 0.167. But this is a weak test: the model mostly found "dark eyes".
- **What I take from this:** my two ideas were reasonable, and testing them *properly* (same seed,
  one change at a time, a 95% range instead of one lucky example) showed they don't fix the core
  problem, which is the model redrawing faces. That's a real finding, not a failure to report.
- **I'm keeping both features in the app anyway, for honest reasons:** extra photos cost nothing,
  and families' own marks (a scar, a birthmark) are exactly what a photo-only test can't measure.
  The Accuracy page states clearly that neither was shown to improve the match.

### Research: how do other projects and papers do this?
- **GitHub "find missing children" projects** (e.g. MissingChildIdentification, Progressive-Face-Ageing):
  mostly student projects with older GANs plus a face-matching database. None I found publish
  accuracy or explain privacy, and I found none that uses parents'/siblings' photos to age a specific
  child. (I say "I didn't find", not "nobody has done it".)
- **The big one:** the 2025 paper *Cradle2Cane* names exactly what my eval found: the
  **"Age-ID trade-off"**. The more you age a face, the more identity you lose, and the reverse.
  My prompt A vs prompt B results were this trade-off. I rediscovered and measured a known
  research problem on my own, with free tools.
- **How researchers fight it:**
  - *Two passes:* first age the face, then inject identity back from the original photo (Cradle2Cane).
  - *Personal fine-tuning:* train the model a little on 3–5 photos of the same person (SelfAge).
    This explains why my "extra photos" test didn't help: I only *showed* the photos to the model,
    I didn't *train* it on them.
  - *Edit, don't redraw:* networks like FRAN (face_reaging) predict only the *change* and add it
    to the original.
- **Papers measure the same way I do:** ArcFace identity similarity plus an age estimator. Good to
  know my method matches the field.
- **Decision:** try a free imitation of the two-pass idea with our own model (pass 2: give it the
  aged image *and* the original, and ask it to restore the original's features while keeping the
  age). Test on the 5 dev people first. Skipped FRAN and ChildGAN's dataset for time; they're future work.

### Confirmed: the free limit is a rolling 24 hours, not "per day"
- The dashboard's "Neurons used today: 0/10k" only counts since 00:00 UTC. The **"Last 24 hours"**
  chart showed ~11k neurons used (10.2k images + 0.8k vision), and the API stays blocked until
  that usage is more than 24 hours old.
- Also spotted there: the vision model had used 809 neurons, mostly from the "thinking" bug
  (now fixed, ~25 per call).
- Added `npm run quota`: asks the API directly for a 1-token reply (~0.05 neurons) and prints
  OK or BLOCKED. More reliable than the dashboard.
- **Lesson for the demo:** don't run heavy tests in the 24 hours before recording or judging.

### My idea: describe *this* child, not children in general
- The prompt tells every child the same thing: "longer, narrower face, stronger jaw, thicker
  eyebrows…". **My hypothesis:** identical generic wording pushes every face toward the same
  template, which may be part of the "stock-photo face" problem.
- Better: describe the person's own **stable** features (eye shape and spacing, eyelids, brow
  shape, ear shape, hairline, lips, chin) plus marks (moles, scars, birthmarks), and let the model
  age everything else naturally.
- **Careful, from what we learned:** keep the life-stage age anchor ("the age of a university
  student"), because dropping all age wording made faces look too young in v1. And avoid
  features that change a lot in childhood (baby fat, overall nose or jaw size).
- **Test (5 dev people, same seed):** A = current prompt · E = age anchor only, generic wording
  removed · D = E + this person's own features (read by the vision model). Comparing E with A
  shows the effect of removing generic words; D with E shows the effect of personal features.

### Result: neither my wording idea nor the two-pass idea helped (5 dev people)
| Version | Similarity to real later photo | To own child photo |
|---|---|---|
| Baseline (unchanged photo) | 0.37 | – |
| A: current prompt | 0.13 | 0.37 |
| E: generic face wording removed | 0.13 | 0.38 |
| D: + this person's own features (my idea) | 0.11 | 0.35 |
| P2a / P2b: two passes | 0.13 / 0.12 | 0.36 / 0.35 |
- All within ±0.02 of each other; with only 5 people that's noise, so **no version is better**.
- **Looking at the images says the same:** for each person, all five versions look almost alike.
  The result is decided mostly by the input photo and the model, and the wording barely matters.
  That confirms "it's mostly the model, not the prompt".
- **Two failures every version shared, which the prompt couldn't fix:**
  - A girl (person 049) came out as a **boy in all versions**, even though the prompt said "teenage girl".
  - A baby aged 0 → 8 stayed a **toddler wearing the same bib** in all versions.
- The vision model described each child sensibly ("almond-shaped eyes, wide eye spacing, arched
  eyebrows", and it spotted "a small mole on the lower right cheek"), but the image model didn't use
  that information in a measurable way.
- **Decision:** stop tuning the prompt; keep A in the app. It was a fair test of a reasonable
  idea, the answer was "no", and that's worth knowing. Keeping family-confirmed marks in the app
  costs nothing, but I won't claim they improve accuracy.

### Tried a bigger model: FLUX.2 klein 9B (5 dev people, same prompt and seed)
| Model | Similarity to real later photo | To own child photo |
|---|---|---|
| Baseline (unchanged photo) | 0.37 | – |
| 4B (the app's model) | 0.13 | 0.37 |
| **9B (bigger)** | **0.10** | **0.22** |
- **Better at following instructions:** the girl who came out as a boy with every 4B prompt is
  finally a girl with 9B, and black-and-white photos are turned into natural colour.
- **Worse at keeping the person:** 9B's faces are even cleaner and more "idealised", and less
  like the child they came from (0.22 vs 0.37). It's the Age-ID trade-off again: a stronger model
  follows the prompt ("an 18-year-old…") more and the photo less.
- **Still failed the same hard case:** the baby aged 0 → 8 is still a toddler in a bib.
- **Cost:** ~1,400 neurons per image vs ~73, about 20× more; only ~7 free images a day.
- **Decision:** keep 4B in the app. "Bigger" isn't automatically "better" for this task; the
  right next step would be a model built to *edit* faces while keeping identity, not a bigger
  general image model.

### Reconsidering "edit" vs "redraw" (my question: why didn't we edit the existing face?)
- Apps like FaceApp or gender-swap filters **edit** a face: they move it in a face model's
  "latent space" toward "older" or "female" and keep pose, light and most pixels. Our model **redraws**
  a new picture from the photo plus instructions. Also, those apps are never scored against a real
  answer, and child → adult (bones grow) is much harder than adult → old (wrinkles, grey hair).
- **Why we didn't pick an editing model at the start:** the pitch was family-guided, and the
  editing model SAM takes only one photo (no family photos). Then the $0 choice led to Cloudflare,
  which has no face-editing model. SAM was planned as a comparison, but was dropped when we switched.
- **What changed:** the eval showed family guidance can't be measured and redrawing loses
  identity, so the main reason to skip editing is weaker now. Changing course when data says so
  is fine, but editing isn't automatically better for children, so **measure first**: run SAM
  (via Replicate, ~$0.004/image) on the same 42 people and score it the same way.
- Can SAM run on Vercel itself? No: it needs a GPU and PyTorch. Vercel can only *call* it
  through Replicate's API, the same way we call Cloudflare today.

### Result: the editing model SAM on all 42 test people
- **Identity:** SAM 0.204 vs our FLUX 0.172 (same people, first variation), better for 66% of people.
  The 95% range is −0.003 to +0.066: *almost* clearly better, but it just touches zero, so I
  can't honestly call it a win yet. Right person ranked first: 47% vs 45%. Still 0 people beat the original photo.
- **Looking at the images:** SAM keeps the face, pose and even the old-photo look, but it **ages too
  little** (an 8 → 18 girl looked about 10) and the images are soft or blurry.
- **Robustness:** SAM refused 4 of 42 old scans ("could not find face"). FLUX never refused.
- **Money:** about $0.16 on Replicate. A token stopped working halfway (401 "invalid token", not a
  credit or rate-limit problem); a new token fixed it, and the run resumed without redoing images.
- **Next idea:** since SAM under-ages, ask it for an *older* target (+5 or +10 years) to
  compensate. Also try two modern editing models that are built to keep identity and accept
  several photos (Qwen-Image-Edit, Nano Banana 2). All on the 5 dev people first.

### Round 2 on the 5 dev people: SAM with an older target, and two modern editing models
| Version | Similarity to real later photo | To own child photo | What the images look like |
|---|---|---|---|
| Baseline (unchanged photo) | 0.37 | – | – |
| A: our FLUX prompt | 0.13 | 0.37 | right age, "stock" faces |
| SAM (target age) | 0.19 | 0.43 | keeps the face but barely ages it; a baby photo came out as a ghostly smear |
| SAM +5 years | 0.21 | 0.42 | almost the same as SAM: asking for older didn't really age it more |
| SAM +10 years | 0.19 | 0.40 | same |
| Qwen-Image-Edit-2511 | **0.04** | 0.06 | a completely different "model" face: worst of all |
| **Nano Banana 2** | **0.16** | 0.30 | **the only one that looks the right age and still like the child**; the 0 → 8 baby finally became an ~8-year-old |
- Lesson: "editing model" isn't one thing. Qwen, sold as identity-preserving, lost the identity completely
  on these old photos, while Nano Banana 2 balanced age and identity best.
- Decision: run Nano Banana 2 on all 42 test people with the app's exact prompt (~$2.80).

### Found a flaw in my own eval: 7 of 42 sex labels were wrong
- FG-NET has no sex labels, so the eval used InsightFace to *guess* sex from each later photo.
  Looking at all 42 photos myself, 7 were clearly wrong (6 boys labelled "girl", 1 woman labelled "boy").
- So about 1 in 6 prompts told the model the wrong sex. That hurts a model that *listens* to the
  prompt (Nano Banana 2 made girls) more than one that ignores it (FLUX mostly did).
- **Fix:** corrected the 7 labels by hand (marked `sex_checked=fixed` in `eval/pairs.csv`; unclear
  faces were left as they were), re-made those people's FLUX and Nano Banana 2 images, and left
  them out of the two older experiments whose extra images used the old label.
- **Lesson:** an automatic label is a guess too. Check a sample of labels by eye before trusting them.

### Result: Nano Banana 2 is the first thing that measurably beats our FLUX setup (all 42 people)
- Identity: **0.208 vs 0.173** for FLUX (same people, first image), change **+0.035, 95% range
  +0.003 to +0.070**. The whole range is above zero, so this is a real (if modest) improvement.
  Right person ranked first: 48% vs 43%.
- It also *looks* right more often: correct age (FLUX sometimes made an 18-year-old look 40), follows
  the requested sex, and turned babies into children of the right age.
- Still far from the original photo (0.42). The Age-ID trade-off is smaller, not gone.
- Costs money (~$0.067 per image on Replicate) and privacy terms are less explicit than Cloudflare's.
  Whether to use it in the app is a product decision (cost, privacy, reliability), not only an accuracy one.

### Setup facts
- Next.js 16 (App Router, TypeScript, Tailwind). Cloudflare is called with plain `fetch` (no SDK needed).
- API key lives only in `.env.local`, which git ignores. `.env.example` shows the variable name.
