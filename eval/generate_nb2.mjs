// Eval experiment: Google Nano Banana 2 (via Replicate) with the app's exact prompt, one image per
// person, compared against our FLUX.2 klein variation 0. Chosen after the dev-set round: it was the
// only model that both aged faces convincingly and kept some identity. ~$0.067 per image.
// Nano Banana 2 has no seed option, so its result can differ run to run.
// Usage:  node --env-file=.env.local eval/generate_nb2.mjs [--limit 3]
// Output: eval/outputs/images_nb2/<pair_id>_v0.jpg  (git-ignored)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildPrompt } from "../src/lib/prompt.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "eval", "outputs", "images_nb2");
const TOKEN = process.env.REPLICATE_API_TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const api = (url, init = {}) =>
  fetch(`https://api.replicate.com/v1${url}`, { ...init, headers: { ...H, ...init.headers } })
    .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const [header, ...lines] = fs.readFileSync(path.join(ROOT, "eval", "pairs.csv"), "utf8").trim().split(/\r?\n/);
const cols = header.split(",");
const pairs = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]))).slice(0, limit);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const pair of pairs) {
  const out = path.join(OUT_DIR, `${pair.pair_id}_v0.jpg`);
  if (fs.existsSync(out)) continue;
  // same preparation as the app: fit inside 500x500
  const photo = await sharp(path.join(ROOT, "data", "FGNET", "images", pair.young_file))
    .resize(500, 500, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  const form = new FormData();
  form.append("content", new Blob([photo], { type: "image/jpeg" }), pair.young_file);
  const file = await fetch("https://api.replicate.com/v1/files", { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form }).then((r) => r.json());
  if (!file?.urls?.get) { console.error("upload failed", JSON.stringify(file).slice(0, 200)); break; }

  const prompt = buildPrompt({ photoAge: Number(pair.young_age), targetAge: Number(pair.old_age), sex: pair.sex, family: [] });
  let p;
  for (let attempt = 0; attempt < 6; attempt++) {
    p = await api("/models/google/nano-banana-2/predictions", {
      method: "POST", headers: { Prefer: "wait=60" },
      body: JSON.stringify({ input: { image_input: [file.urls.get], prompt, resolution: "1K", output_format: "jpg" } }),
    });
    if (p.status !== 429) break;
    await sleep(12_000);
  }
  while (p.ok && ["starting", "processing"].includes(p.body?.status)) { await sleep(2000); p = await api(`/predictions/${p.body.id}`); }
  await api(`/files/${file.id}`, { method: "DELETE" });
  if (!p.ok || p.body?.status !== "succeeded") {
    console.error(`${pair.pair_id} failed:`, p.status, p.body?.error ?? p.body?.detail ?? "");
    if (p.status === 402 || /credit|billing|payment/i.test(JSON.stringify(p.body))) break;
  } else {
    const url = Array.isArray(p.body.output) ? p.body.output.at(-1) : p.body.output;
    await sharp(Buffer.from(await fetch(url).then((r) => r.arrayBuffer()))).jpeg({ quality: 92 }).toFile(out);
    console.log(`${pair.pair_id}  age ${pair.young_age} -> ${pair.old_age}  ok`);
  }
  await sleep(11_000);
}
