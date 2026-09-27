// Step 2 of the eval: age-progress each young photo with the SAME code the app uses.
// It imports the app's own prompt builder and Cloudflare call, so what we measure is
// exactly what a family would get (3 variations per photo, same prompt, same model).
//
// Usage:  node --env-file=.env.local eval/generate.mjs [--limit 3] [--multi]
// Output: eval/outputs/images/<pair_id>_v<0-2>.jpg   (git-ignored: derived from FG-NET)
// It skips images that already exist, so it can be stopped and resumed (e.g. next day,
// when Cloudflare's free daily allowance resets at 00:00 UTC).
//
// --multi runs the "more photos of the child" experiment: for every pair where FG-NET has
// other childhood photos taken at the same age or YOUNGER (never older, that would be
// peeking at the future), up to 2 are added as extra inputs. Only variation 0 is made, with
// the same seed as the single-photo variation 0, so the two can be compared fairly.
// Output: eval/outputs/images_multi/<pair_id>_v0.jpg and eval/outputs/multi_inputs.csv
//
// --features runs the "distinguishing features" experiment: the vision model suggests features
// from the childhood photo (moles, scars, eye colour...) and they are added to the prompt.
// In the app a family checks these first; here NOBODY checks them, so this is the worst case.
// Also variation 0 only, same seed. Output: eval/outputs/images_features/, features.json

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildPrompt } from "../src/lib/prompt.ts";
import { generateImage } from "../src/lib/cloudflare.ts";
import { MAX_INPUT_SIDE } from "../src/lib/limits.ts";
import { suggestFeatures } from "../src/lib/features.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const FGNET = path.join(ROOT, "data", "FGNET", "images");
const MULTI = process.argv.includes("--multi");
const FEATURES = process.argv.includes("--features");
const VARIATIONS = MULTI || FEATURES ? 1 : 3;
const MAX_EXTRA_CHILD_PHOTOS = 2;
const OUT_DIR = path.join(ROOT, "eval", "outputs", MULTI ? "images_multi" : FEATURES ? "images_features" : "images");
const FEATURES_FILE = path.join(ROOT, "eval", "outputs", "features.json");
const featureCache = FEATURES && fs.existsSync(FEATURES_FILE) ? JSON.parse(fs.readFileSync(FEATURES_FILE, "utf8")) : {};
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// Read pairs.csv (simple comma-separated file with a header row)
const [header, ...lines] = fs.readFileSync(path.join(ROOT, "eval", "pairs.csv"), "utf8").trim().split(/\r?\n/);
const cols = header.split(",");
const pairs = lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i], v]))).slice(0, limit);

// FG-NET file names look like 001A05.JPG = person 001 at age 5
const allPhotos = fs.readdirSync(FGNET).flatMap((f) => {
  const m = f.match(/^(\d{3})A(\d{2})[a-z]?\.JPG$/i);
  return m ? [{ person: m[1], age: Number(m[2]), file: f }] : [];
});

/** Other childhood photos of the same person, same age or younger, most recent first. */
function extraChildPhotos(pair) {
  return allPhotos
    .filter((p) => p.person === pair.person && p.age <= Number(pair.young_age) && p.file !== pair.young_file)
    .sort((a, b) => b.age - a.age || a.file.localeCompare(b.file))
    .slice(0, MAX_EXTRA_CHILD_PHOTOS);
}

// Same preparation as the app: shrink to fit inside 500x500, JPEG
async function prepare(file) {
  const buf = await sharp(path.join(FGNET, file))
    .resize(MAX_INPUT_SIDE, MAX_INPUT_SIDE, { fit: "inside" })
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Blob([buf], { type: "image/jpeg" });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const multiLog = ["pair_id,extra_files,extra_ages"];
let made = 0;
let skipped = 0;

for (const [index, pair] of pairs.entries()) {
  const extras = MULTI ? extraChildPhotos(pair) : [];
  if (MULTI) {
    if (extras.length === 0) continue; // nothing extra to add for this person
    multiLog.push(`${pair.pair_id},${extras.map((e) => e.file).join(" ")},${extras.map((e) => e.age).join(" ")}`);
  }

  const todo = [...Array(VARIATIONS).keys()].filter(
    (v) => !fs.existsSync(path.join(OUT_DIR, `${pair.pair_id}_v${v}.jpg`)),
  );
  if (todo.length === 0) {
    skipped += VARIATIONS;
    continue;
  }

  const images = [await prepare(pair.young_file), ...(await Promise.all(extras.map((e) => prepare(e.file))))];

  let features = [];
  if (FEATURES) {
    try {
      featureCache[pair.pair_id] ??= await suggestFeatures(images[0]);
    } catch (err) {
      console.error(`${pair.pair_id} feature suggestion failed: ${err.message}`);
      if (/neuron|quota|allocation/i.test(err.message)) break;
      continue;
    }
    features = featureCache[pair.pair_id];
    fs.writeFileSync(FEATURES_FILE, JSON.stringify(featureCache, null, 2));
    if (features.length === 0) {
      // same prompt as the normal run, so an image would add nothing; save the quota
      console.log(`${pair.pair_id}  no clear features found, skipped`);
      continue;
    }
  }

  const prompt = buildPrompt({
    photoAge: Number(pair.young_age),
    targetAge: Number(pair.old_age),
    sex: pair.sex,
    family: [],
    extraChildAges: extras.map((e) => e.age),
    features,
  });

  try {
    await Promise.all(
      todo.map(async (v) => {
        // fixed seeds so the eval can be re-run and give the same images
        const base64 = await generateImage({ prompt, images, seed: 1000 * v + index });
        fs.writeFileSync(path.join(OUT_DIR, `${pair.pair_id}_v${v}.jpg`), Buffer.from(base64, "base64"));
        made++;
      }),
    );
    const extraNote = MULTI ? `  +${extras.length} childhood photo(s)` : FEATURES ? `  features: ${features.join("; ") || "(none)"}` : "";
    console.log(`${pair.pair_id}  person ${pair.person}  age ${pair.young_age} -> ${pair.old_age}${extraNote}  ok`);
  } catch (err) {
    console.error(`${pair.pair_id} failed: ${err.message}`);
    if (/neuron|quota|allocation/i.test(err.message)) {
      console.error("Looks like today's free allowance is used up. Re-run after 00:00 UTC to continue.");
      break;
    }
  }
}

if (MULTI) fs.writeFileSync(path.join(ROOT, "eval", "outputs", "multi_inputs.csv"), multiLog.join("\n") + "\n");
console.log(`Done. Generated ${made} new images, ${skipped} already existed.`);
