// Calls FLUX.2 [klein] 4B on Cloudflare Workers AI.
// Cloudflare states it does not keep or train on inputs/outputs; we don't store them either.

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

/** Cloudflare's free plan allows 10,000 "neurons" of AI use per day, reset at 00:00 UTC. */
export class DailyLimitError extends Error {}
export const DAILY_LIMIT_MESSAGE =
  "Still Looking runs on a free daily allowance, and today's has been used up. " +
  "It resets every day at 00:00 UTC (8 PM US Eastern time). Please try again after that.";

export function isDailyLimit(reason: string): boolean {
  return /daily free allocation|neurons/i.test(reason);
}

export async function generateImage(opts: {
  prompt: string;
  images: Blob[]; // image 0 = child, then family members
  seed: number;
  size?: number;
  model?: string; // defaults to FLUX.2 [klein] 4B; the eval can try other models
}): Promise<string> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Server is missing Cloudflare credentials.");

  const size = String(opts.size ?? 768);
  const form = new FormData();
  form.append("prompt", opts.prompt);
  opts.images.forEach((img, i) => form.append(`input_image_${i}`, img, `image_${i}.jpg`));
  form.append("width", size);
  form.append("height", size);
  form.append("seed", String(opts.seed));

  // Cloudflare sometimes answers "Capacity temporarily exceeded" or "Request timeout" when busy;
  // wait and retry (up to 3 attempts in total).
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${opts.model ?? MODEL}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    );
    const body = await res.json().catch(() => null);
    const image: unknown = body?.result?.image;
    if (res.ok && typeof image === "string") return image; // base64-encoded image

    const reason: string = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (attempt < 3 && /capacity|timeout/i.test(reason)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (isDailyLimit(reason)) throw new DailyLimitError(reason);
    throw new Error(`Image model error: ${reason}`);
  }
}
