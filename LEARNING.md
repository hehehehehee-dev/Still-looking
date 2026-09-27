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

### Setup facts
- Next.js 16 (App Router, TypeScript, Tailwind). Cloudflare is called with plain `fetch` (no SDK needed).
- API key lives only in `.env.local`, which git ignores. `.env.example` shows the variable name.
