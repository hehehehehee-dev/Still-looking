# Demo video script (target: 4 minutes, max 5)

Speak naturally; this is a guide, not something to read word for word. Record your screen, with your
voice (camera optional). Suggested tool: OBS or the Windows Snipping Tool screen recorder. Upload to
YouTube as **Unlisted** and paste the link into Devpost.

**Before recording**
- Check `npm run quota` shows OK, and the Replicate credit/spend limit is fine.
- Open 4 tabs: the live app home, `/create`, `/accuracy`, and the GitHub repo (README).
- Have a test photo ready. **Use a photo you have permission to use**: your own childhood photo and
  your parents' photos (with their OK) are the most powerful; an FG-NET image works too.
- Close other tabs and notifications.

---

## 1. The problem · 0:00–0:30 (home page)

> "When a child has been missing for years, the only photo a family has may show a face that no longer
> exists. Forensic artists age those photos, often using photos of the parents and siblings, but families
> wait a long time. I built **Still Looking**: a private, honest way for families to picture how their
> child may have grown up."

Show: the home page and the "We never save your photos" box.

## 2. Live demo · 0:30–1:45 (`/create`)

1. Choose the child photo and **drag the frame** onto the face. "The family frames the face, so the model
   gets the most detail, and picks the right child in a group photo."
2. Enter date of birth and photo date. Point at the line "Age in photo → age today".
3. Set sex. "In my tests this made the age much more accurate."
4. Click **Suggest from the photo**. "An AI suggests lasting marks like moles or scars, but the family
   checks them. It's never allowed to guess race."
5. Optional: add a parent's photo.
6. Tick the box ("estimate, not identification") and click **Create**. While it runs (~30 s): "Photos are
   only sent to the image model and deleted right after. No accounts, no database."
7. Results: "Three possibilities, not one answer. Each says which model made it, and the confidence note
   uses real test numbers for this age gap. And it always says: share the original photo too."

## 3. Did it work? The honest part · 1:45–3:15 (`/accuracy`)

> "Most AI apps never measure themselves. I tested mine on 42 real people from a research dataset, using
> the exact app code, and compared faces with a face-recognition model."

- Point at the short answer: **"no aged image matched better than the original photo: 0 of 42."**
  "That surprised me. I learned why: the AI 'beautifies' faces, and research calls this the
  **Age-ID trade-off**. The more you age a face, the more of the person you lose."
- "So I ran experiments, changing one thing at a time." Scroll to **Can it be improved?**:
  - Extra childhood photos and AI-suggested marks: "no measurable help."
  - An editing model, SAM: "kept the face, but barely aged it."
  - **Nano Banana 2**: "the first measurable improvement: 0.17 to 0.21, and the whole 95% range is above
    zero. For children missing over ten years, it found the right person 43% of the time instead of 14%."
- "So the app now uses it, with a free backup model."

## 4. What I learned · 3:15–4:00 (GitHub: README / LEARNING.md)

Pick 3 short stories:
- "Image models don't understand 'no'. Writing 'no round cheeks' made one face 55 years old."
- "I found mistakes in my own test: 7 of 42 sex labels, guessed by a model, were wrong. I fixed them
  and re-ran everything."
- "A bigger model isn't automatically better: it followed instructions more, but kept the person less."

> "Everything, including what failed, is in LEARNING.md."

## 5. Close · 4:00–4:20

> "Still Looking never says 'this is your child'. It gives families a way to picture their child, tells
> them exactly how accurate that is, and keeps their photos private. Thank you."

Mention: built with significant AI assistance (Claude Code). Details are in the README.
