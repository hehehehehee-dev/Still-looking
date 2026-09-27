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

### Setup facts
- Next.js 16 (App Router, TypeScript, Tailwind). Cloudflare is called with plain `fetch` (no SDK needed).
- API key lives only in `.env.local`, which git ignores. `.env.example` shows the variable name.
