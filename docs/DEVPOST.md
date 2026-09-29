# Devpost submission text: Still Looking

Copy each section into the matching Devpost field. Edit freely: it should sound like you.

---

## Tagline (one line)

An honest, private way for families of long-term missing children to picture how their child may have grown up, and a tool that measured itself.

## Inspiration

When a child has been missing for years, the only photo a family has may show a face that no longer exists. Forensic artists (for example at NCMEC) create age progressions, and they often use photos of the child's parents and siblings to see which features run in the family. Consumer "aging" apps use a single photo, keep uploads, and never say how accurate they are. I wanted to build something that works like the forensic approach, respects grieving families, and is honest about what it can and can't do.

## What it does

- A parent uploads a photo of the child, the date of birth and roughly when the photo was taken, and frames the child's face.
- Optionally they add photos of biological parents or siblings, and distinguishing marks (moles, scars, birthmarks). An AI can *suggest* marks, but the family confirms them. The AI never guesses race or ethnicity.
- The app computes the child's age in the photo and today, and creates **three** possible images of the child today, never a single "this is your child" image.
- Each result shows which AI model made it and a **confidence note based on real test results** for that age gap, plus guidance: share with police or NCMEC, **always share the original photo too**, and don't post estimates publicly.
- Safety by design: no accounts, no database, no gallery, no search or matching. Photos go only to the image model and are deleted right after.

## How I built it

- **App:** Next.js 16 (TypeScript, Tailwind) on Vercel. Photos are framed and shrunk in the browser; the server validates inputs, computes ages, writes the instructions (prompt) and calls the image model.
- **Image models:** Google's Nano Banana 2 via Replicate as the main model, chosen because it measurably kept identity best in my tests. The free FLUX.2 klein model on Cloudflare Workers AI is an automatic backup, so the app never breaks when credit runs out. A Gemma 4 vision model suggests distinguishing marks.
- **Evaluation:** a Python pipeline on the FG-NET research dataset (photos of the same people at different ages). For 42 people I aged a childhood photo to the age of a real later photo, using *exactly the app's code*, and compared faces with ArcFace (InsightFace). Key question: does aging beat simply using the original photo?

## Challenges I ran into

- **The result wasn't what I hoped.** No aged image matched the real grown-up better than the original childhood photo (0 of 42). The model "beautifies" faces into smooth stock-photo faces. Research calls this the **Age-ID trade-off**: the more you age a face, the more identity you lose.
- **Prompts behave in surprising ways.** "Child" made results look too young, "13 years older" made them look 50, and image models don't understand "no". Naming a life stage ("the age of a university student") fixed the age.
- **I found flaws in my own evaluation.** The face detector missed faces on old scans; a "features" experiment silently did nothing because the vision model spent its whole answer "thinking"; and 7 of 42 sex labels, guessed automatically, were wrong. Each time I checked real examples, fixed it and re-ran.
- **Free-tier limits.** Cloudflare's "daily" allowance actually behaves like a rolling 24 hours, so I wrote a tool to check it and planned tests around it.

## Accomplishments that I'm proud of

- Tested **seven approaches** with a fair method (same people, one change at a time, 95% ranges instead of lucky examples), tuning on separate "dev" people so the test set stayed honest.
- Found a **measurable improvement**: Nano Banana 2 raised identity similarity from 0.173 to 0.208 (95% range of the change +0.003 to +0.070). For children missing **over 10 years**, the right person was picked first **43%** of the time vs **14%** before.
- Published the numbers, including what failed, on an Accuracy page inside the app.
- Kept every privacy promise true in the code, not just in words.

## What I learned

- A face-matching score alone rewards "doing nothing": you must also check that the image actually aged.
- "Bigger model" isn't automatically "better": a larger model followed the prompt better but kept identity worse.
- Check automatic labels and outputs by eye before trusting them.
- An aged image can't contain *more* information about how someone really grew up than the original photo. Its value is helping *people* picture the child, which is why the app always recommends sharing the original too.

## What's next

- A small study with **people** (not just a face-matching model): can viewers pick the right adult more often with an aged image?
- Measure family-photo guidance using a dataset with children's photos over time *and* their parents.
- Try face-editing models designed to keep identity, and personalised fine-tuning from several photos of the same child.

## Built with

nextjs, typescript, tailwindcss, vercel, replicate, nano-banana-2, cloudflare-workers-ai, flux, gemma, python, insightface, arcface, matplotlib, fg-net

## AI assistance disclosure

Write this in your own words. For example: "I built this with significant help from Claude Code (Anthropic), which wrote most of the code and helped research models and privacy terms. I made the product and safety decisions, chose which experiments to run (including the distinguishing-features and model-comparison ideas), tested the app myself, and decided how to present the honest results. My decisions and lessons are logged in LEARNING.md."

## Links

- Live app: https://still-looking-one.vercel.app/
- Code: https://github.com/hehehehehee-dev/Still-looking
