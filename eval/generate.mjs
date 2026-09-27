// Step 2 of the eval: age-progress each young photo with the SAME code the app uses.
// It imports the app's own prompt builder and Cloudflare call, so what we measure is
// exactly what a family would get (3 variations per photo, same prompt, same model).
//
// Usage:  node --env-file=.env.local eval/generate.mjs [--limit 3]
// Output: eval/outputs/images/<pair_id>_v<0-2>.jpg   (git-ignored: derived from FG-NET)
// It skips images that already exist, so it can be stopped and resumed (e.g. next day,
// when Cloudflare's free daily allowance resets at 00:00 UTC).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildPrompt } from "../src/lib/prompt.ts";
import { generateImage } from "../src/lib/cloudflare.ts";
import { MAX_INPUT_SIDE } from "../src/lib/limits.ts";

const VARIATIONS = 3;
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "eval", "outputs", "images");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// Read pairs.csv (simple comma-separated file with a header row)
const [header, ...lines] = fs.readFileSync(path.join(ROOT, "eval", "pairs.csv"), "utf8").trim().split(/\r?\n/);
const cols = header.split(",");
const pairs = lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i], v]))).slice(0, limit);

fs.mkdirSync(OUT_DIR, { recursive: true });
let made = 0;
let skipped = 0;

for (const [index, pair] of pairs.entries()) {
  const todo = [...Array(VARIATIONS).keys()].filter(
    (v) => !fs.existsSync(path.join(OUT_DIR, `${pair.pair_id}_v${v}.jpg`)),
  );
  if (todo.length === 0) {
    skipped += VARIATIONS;
    continue;
  }

  // Same preparation as the app: shrink to fit inside 500x500, JPEG
  const photo = await sharp(path.join(ROOT, "data", "FGNET", "images", pair.young_file))
    .resize(MAX_INPUT_SIDE, MAX_INPUT_SIDE, { fit: "inside" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const prompt = buildPrompt({
    photoAge: Number(pair.young_age),
    targetAge: Number(pair.old_age),
    sex: pair.sex,
    family: [],
  });

  try {
    await Promise.all(
      todo.map(async (v) => {
        // fixed seeds so the eval can be re-run and give the same images
        const base64 = await generateImage({ prompt, images: [new Blob([photo], { type: "image/jpeg" })], seed: 1000 * v + index });
        fs.writeFileSync(path.join(OUT_DIR, `${pair.pair_id}_v${v}.jpg`), Buffer.from(base64, "base64"));
        made++;
      }),
    );
    console.log(`${pair.pair_id}  person ${pair.person}  age ${pair.young_age} -> ${pair.old_age}  ok`);
  } catch (err) {
    console.error(`${pair.pair_id} failed: ${err.message}`);
    if (/neuron|quota|limit/i.test(err.message)) {
      console.error("Looks like today's free allowance is used up. Re-run after 00:00 UTC to continue.");
      break;
    }
  }
}

console.log(`Done. Generated ${made} new images, ${skipped} already existed.`);
