// Eval experiment: an EDITING face-aging model (SAM, "Only a Matter of Style", SIGGRAPH 2021)
// instead of our REDRAWING image model (FLUX.2 klein). SAM encodes the face into StyleGAN's
// latent space and moves it toward the target age, trained with an identity-preservation loss.
// It takes one photo and a target age: no prompt, no family photos.
//
// Runs on Replicate (paid per run, ~$0.004 each; API inputs/outputs deleted after 1 hour).
// FG-NET research photos only; never used on the families' photos without disclosure.
//
// Usage:  node --env-file=.env.local eval/generate_sam.mjs [--limit 3]
// Output: eval/outputs/images_sam/<pair_id>_v0.jpg  (git-ignored)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "eval", "outputs", "images_sam");
const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error("Missing REPLICATE_API_TOKEN in .env.local");
  process.exit(1);
}
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const api = (url, init = {}) =>
  fetch(`https://api.replicate.com/v1${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init.headers },
  }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

// 1. Read the model's real input fields instead of guessing them
const model = await api("/models/yuval-alaluf/sam");
if (!model.ok) {
  console.error("Could not read the model:", model.status, JSON.stringify(model.body));
  process.exit(1);
}
const version = model.body.latest_version;
const inputs = version.openapi_schema.components.schemas.Input.properties;
console.log("SAM inputs:", Object.entries(inputs).map(([k, v]) => `${k} (${v.type ?? "enum"}, default ${JSON.stringify(v.default)})`).join(", "));
const imageField = Object.keys(inputs).find((k) => /image/i.test(k));
const ageField = Object.keys(inputs).find((k) => /age/i.test(k));
if (!imageField || !ageField) {
  console.error("Unexpected inputs; stopping so nothing is wasted.");
  process.exit(1);
}

// 2. Pairs from the main eval
const [header, ...lines] = fs.readFileSync(path.join(ROOT, "eval", "pairs.csv"), "utf8").trim().split(/\r?\n/);
const cols = header.split(",");
const pairs = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]))).slice(0, limit);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const pair of pairs) {
  const out = path.join(OUT_DIR, `${pair.pair_id}_v0.jpg`);
  if (fs.existsSync(out)) continue;
  const photo = fs.readFileSync(path.join(ROOT, "data", "FGNET", "images", pair.young_file));
  const ageValue = inputs[ageField].type === "integer" ? Number(pair.old_age) : String(pair.old_age);

  const started = Date.now();
  let pred = await api("/predictions", {
    method: "POST",
    headers: { Prefer: "wait=60" },
    body: JSON.stringify({ version: version.id, input: { [imageField]: `data:image/jpeg;base64,${photo.toString("base64")}`, [ageField]: ageValue } }),
  });
  // poll until finished if it didn't finish within the wait
  while (pred.ok && ["starting", "processing"].includes(pred.body?.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    pred = await api(`/predictions/${pred.body.id}`);
  }
  if (!pred.ok || pred.body?.status !== "succeeded") {
    console.error(`${pair.pair_id} failed:`, pred.status, pred.body?.error ?? pred.body?.detail ?? JSON.stringify(pred.body).slice(0, 300));
    if (pred.status === 402 || /credit|billing|payment/i.test(JSON.stringify(pred.body))) break;
    continue;
  }
  const url = Array.isArray(pred.body.output) ? pred.body.output.at(-1) : pred.body.output;
  const img = await fetch(url).then((r) => r.arrayBuffer());
  fs.writeFileSync(out, Buffer.from(img));
  console.log(`${pair.pair_id}  age ${pair.young_age} -> ${pair.old_age}  ok in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
