// Calls Google's Nano Banana 2 through Replicate: the model that measurably kept identity best
// in our eval (see the Accuracy page). Paid per image (~$0.067), so the app falls back to the
// free FLUX model on Cloudflare whenever this fails or runs out of credit.
//
// Privacy: photos are uploaded to Replicate's temporary file store only for these predictions and
// deleted right after. Replicate deletes API prediction inputs and outputs after one hour.

const MODEL = "google/nano-banana-2";
export const NB2_LABEL = "Nano Banana 2 (Google)";

const API = "https://api.replicate.com/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function nb2Available(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function uploadFile(image: Blob, name: string): Promise<{ id: string; url: string }> {
  const form = new FormData();
  form.append("content", image, name);
  const res = await fetch(`${API}/files`, { method: "POST", headers: headers(false), body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.urls?.get) throw new Error(`Replicate upload failed (HTTP ${res.status})`);
  return { id: body.id, url: body.urls.get };
}

async function deleteFile(id: string) {
  await fetch(`${API}/files/${id}`, { method: "DELETE", headers: headers(false) }).catch(() => undefined);
}

/** Starts one prediction. Low-credit accounts may start ~1 every 10 s, so wait and retry on 429. */
async function start(input: Record<string, unknown>, deadline: number): Promise<string> {
  for (;;) {
    const res = await fetch(`${API}/models/${MODEL}/predictions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ input }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.id) return body.id;
    if (res.status === 429 && Date.now() < deadline) {
      await sleep(Math.max(1, Number(body?.retry_after) || 10) * 1000);
      continue;
    }
    throw new Error(`Replicate refused the request (HTTP ${res.status}): ${body?.detail ?? ""}`);
  }
}

async function finish(id: string, deadline: number): Promise<string> {
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/predictions/${id}`, { headers: headers(false) });
    const body = await res.json().catch(() => null);
    if (body?.status === "succeeded") {
      const url = Array.isArray(body.output) ? body.output.at(-1) : body.output;
      const img = await fetch(url);
      return Buffer.from(await img.arrayBuffer()).toString("base64");
    }
    if (body?.status === "failed" || body?.status === "canceled") throw new Error(`Nano Banana 2 failed: ${body?.error ?? body.status}`);
    await sleep(2000);
  }
  await fetch(`${API}/predictions/${id}/cancel`, { method: "POST", headers: headers(false) }).catch(() => undefined);
  throw new Error("Nano Banana 2 took too long");
}

/**
 * Makes `count` images with the same prompt and photos (image 0 = child, then family members).
 * Nano Banana 2 has no seed, so repeated runs naturally give different variations.
 * Returns one entry per image: the base64 image, or the Error for that slot.
 */
export async function generateNb2(opts: { prompt: string; images: Blob[]; count: number; timeoutMs: number }): Promise<(string | Error)[]> {
  const deadline = Date.now() + opts.timeoutMs;
  const files = await Promise.all(opts.images.map((img, i) => uploadFile(img, `image_${i}.jpg`)));
  try {
    const input = { prompt: opts.prompt, image_input: files.map((f) => f.url), resolution: "1K", output_format: "jpg" };
    const jobs: Promise<string>[] = [];
    for (let i = 0; i < opts.count; i++) {
      // start them one after another (rate limit), but let them run at the same time
      const id = await start(input, deadline).catch((e: Error) => e);
      jobs.push(id instanceof Error ? Promise.reject(id) : finish(id, deadline));
    }
    const settled = await Promise.allSettled(jobs);
    return settled.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as Error)));
  } finally {
    await Promise.all(files.map((f) => deleteFile(f.id)));
  }
}
