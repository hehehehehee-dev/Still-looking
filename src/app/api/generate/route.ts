// POST /api/generate
// Receives the photos as form data, asks for 3 variations, and returns them.
// Main model: Nano Banana 2 via Replicate (best identity in our eval). Any image it can't make
// (no credit, rate limit, error) is made by the free FLUX model on Cloudflare instead.
// Privacy: photos only ever exist in this request's memory. Nothing is written to disk,
// a database, or logs, and the images go straight back to the person who uploaded them.

import { planAges } from "@/lib/age";
import { buildPrompt, type FamilyRef, type Sex } from "@/lib/prompt";
import { DAILY_LIMIT_MESSAGE, DailyLimitError, FLUX_LABEL, generateImage } from "@/lib/cloudflare";
import { generateNb2, NB2_LABEL, nb2Available } from "@/lib/replicate";
import { MAX_INPUT_IMAGES } from "@/lib/limits";
import { cleanFeatures } from "@/lib/features";
import { aiMode } from "@/lib/aiMode";

export const maxDuration = 180; // seconds; Nano Banana 2 on a low-credit account starts ~1 image per 10 s

const VARIATIONS = 3;
const MAX_FILE_BYTES = 1_000_000; // the browser shrinks photos to ~100 KB, so this is generous
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SEXES: Sex[] = ["boy", "girl", "unspecified"];

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function isImage(value: FormDataEntryValue | null): value is File {
  return value instanceof File && ALLOWED_TYPES.includes(value.type) && value.size <= MAX_FILE_BYTES;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Could not read the upload.");
  }

  // 1. The child's photo and ages
  const child = form.get("childPhoto");
  if (!isImage(child)) return bad("Please add a JPG, PNG or WebP photo of the child (under 1 MB).");

  const ages = planAges(String(form.get("dateOfBirth")), String(form.get("photoDate")));
  if ("error" in ages) return bad(ages.error);

  const sexValue = String(form.get("sex") ?? "unspecified") as Sex;
  const sex = SEXES.includes(sexValue) ? sexValue : "unspecified";

  // 2. Optional family photos (up to 3, because the model takes 4 images in total)
  const family: FamilyRef[] = [];
  const images: Blob[] = [child];
  for (let i = 0; i < MAX_INPUT_IMAGES - 1; i++) {
    const photo = form.get(`familyPhoto${i}`);
    if (photo === null) continue;
    if (!isImage(photo)) return bad(`Family photo ${i + 1} must be a JPG, PNG or WebP under 1 MB.`);
    const relation = String(form.get(`familyRelation${i}`) ?? "").trim().slice(0, 40);
    const age = Number(form.get(`familyAge${i}`));
    if (!relation) return bad(`Please say who is in family photo ${i + 1}.`);
    if (!Number.isFinite(age) || age < 1 || age > 100) return bad(`Please give an approximate age for family photo ${i + 1}.`);
    family.push({ relation, age: Math.round(age) });
    images.push(photo);
  }

  // 3. Distinguishing features the family confirmed (optional, checked and shortened)
  const features = cleanFeatures(form.getAll("feature"));

  // 4. Same instructions, different random seed each time = 3 different variations
  const prompt = buildPrompt({ ...ages, sex, family, features });
  const mode = aiMode();
  if (mode === "mock") {
    // Developer test mode: no AI call, send the uploaded photo back 3 times
    const echo = Buffer.from(await child.arrayBuffer()).toString("base64");
    return Response.json({ images: [echo, echo, echo], ...ages, familyCount: family.length, featureCount: features.length, mock: true });
  }
  const count = mode === "cheap" ? 1 : VARIATIONS;
  const made: { image: string; model: string }[] = [];

  // 4a. Main model (full mode only, when a Replicate token is configured)
  if (mode === "full" && nb2Available()) {
    try {
      const nb2 = await generateNb2({ prompt, images, count, timeoutMs: 150_000 });
      for (const r of nb2) {
        if (typeof r === "string") made.push({ image: r, model: NB2_LABEL });
        else console.error("Nano Banana 2 image failed, using FLUX instead:", r.message);
      }
    } catch (err) {
      console.error("Nano Banana 2 unavailable, using FLUX instead:", err instanceof Error ? err.message : err);
    }
  }

  // 4b. Free backup model for any image still missing
  const results = await Promise.allSettled(
    Array.from({ length: count - made.length }, () =>
      generateImage({ prompt, images, seed: Math.floor(Math.random() * 1_000_000), size: mode === "cheap" ? 512 : 768 }),
    ),
  );
  for (const r of results) if (r.status === "fulfilled") made.push({ image: r.value, model: FLUX_LABEL });

  if (made.length === 0) {
    const first = results.find((r) => r.status === "rejected");
    if (first?.status === "rejected" && first.reason instanceof DailyLimitError) {
      return bad(DAILY_LIMIT_MESSAGE, 429);
    }
    console.error("All generations failed:", first?.status === "rejected" ? first.reason?.message : "");
    return bad("The image model could not create a result right now. Please try again in a minute.", 502);
  }

  return Response.json({
    images: made.map((m) => m.image),
    models: made.map((m) => m.model), // which model made each image, shown to the family
    ...ages,
    familyCount: family.length,
    featureCount: features.length,
  });
}
