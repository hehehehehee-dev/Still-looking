// Calls FLUX.2 [klein] 4B on Cloudflare Workers AI.
// Cloudflare states it does not keep or train on inputs/outputs; we don't store them either.

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

export async function generateImage(opts: {
  prompt: string;
  images: Blob[]; // image 0 = child, then family members
  seed: number;
  size?: number;
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

  // Cloudflare sometimes answers "Capacity temporarily exceeded" when busy; wait and retry once.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    );
    const body = await res.json().catch(() => null);
    const image: unknown = body?.result?.image;
    if (res.ok && typeof image === "string") return image; // base64-encoded image

    const reason: string = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (attempt < 2 && /capacity/i.test(reason)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    throw new Error(`Image model error: ${reason}`);
  }
}
