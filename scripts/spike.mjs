// Day 1 spike: can FLUX.2 [klein] 4B (via Cloudflare Workers AI) age-progress a child
// photo while keeping the same face? Or is the result a random person / blocked?
//
// Usage:  node --env-file=.env.local scripts/spike.mjs
// Uses FG-NET subject 001 at age 5 and asks for age 18 (FG-NET also has the real
// age-18 photo, so we can eyeball how close it gets).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
if (!account || !token) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env.local");
  process.exit(1);
}

// The model only accepts input images smaller than 512x512, so shrink the photo first.
const photo = await sharp("data/FGNET/images/001A05.JPG")
  .resize(500, 500, { fit: "inside" })
  .jpeg({ quality: 92 })
  .toBuffer();

const prompt =
  "The person in image 0 is a child at age 5. Show how this same person would most likely look at age 18. " +
  "Keep their identity: the same face shape, eye shape, nose, skin tone and hair colour, changed only by " +
  "natural growth and aging. Neutral expression, plain background, front-facing, realistic photo.";

// The API expects multipart form data, with images named input_image_0, input_image_1, ...
const form = new FormData();
form.append("prompt", prompt);
form.append("input_image_0", new Blob([photo], { type: "image/jpeg" }), "child.jpg");
form.append("width", "768");
form.append("height", "768");

console.log("Sending request...");
const started = Date.now();
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
  { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const body = await res.json().catch(() => null);

const image = body?.result?.image;
if (!res.ok || !image) {
  console.error(`FAILED (HTTP ${res.status}) after ${seconds}s:`);
  console.error(JSON.stringify(body?.errors ?? body, null, 2));
  process.exit(1);
}

fs.mkdirSync("scratch", { recursive: true });
const outPath = path.join("scratch", "spike_001_age18.jpg");
fs.writeFileSync(outPath, Buffer.from(image, "base64"));
console.log(`OK in ${seconds}s -> ${outPath}`);
console.log("Compare with the real photo: data/FGNET/images/001A18.JPG");
