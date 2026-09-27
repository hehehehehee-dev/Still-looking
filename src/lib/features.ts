// Asks a vision model (Gemma 4 on Cloudflare Workers AI) to SUGGEST long-lasting distinguishing
// features it can see in the child's photo: moles, scars, birthmarks, eye colour, and so on.
// Forensic missing-child posters list "distinguishing marks" for the same reason.
//
// These are only suggestions. The family must check them before they are used, because the
// model can mistake dust or blur on an old photo for a mole, and families know marks a photo
// doesn't show. We deliberately do NOT ask for race or ethnicity: guessing it from a face is
// unreliable and sensitive, and skin tone already comes from the photo itself.

// ".ts" extension so the eval scripts can also run this file directly with Node
import { MAX_FEATURE_LENGTH, MAX_FEATURES } from "./limits.ts";
import { DailyLimitError, isDailyLimit } from "./cloudflare.ts";

const VISION_MODEL = "@cf/google/gemma-4-26b-a4b-it";

const INSTRUCTIONS = `You help families of missing children describe a child's photo for a forensic age progression.
List only distinguishing facial features that are clearly visible in this photo AND usually stay for life:
moles, birthmarks, scars, eye colour, unusual ear shape, dimples, eyebrow shape, a cleft chin.
Skip anything that changes as a child grows, such as baby teeth or gaps between them.
Do NOT mention race, ethnicity, nationality, attractiveness, emotions, clothing, background, or hairstyle.
Do not guess: if a mark could be dust, blur or a shadow, leave it out. Give its position from the person's own point of view (their left / right).
Reply with JSON only, like {"features": ["small mole under the left eye", "brown eyes"]}. At most ${MAX_FEATURES} short items. Use {"features": []} if nothing is clear.`;

export async function suggestFeatures(photo: Blob): Promise<string[]> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Server is missing Cloudflare credentials.");

  const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${VISION_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTIONS },
            { type: "image_url", image_url: { url: `data:${photo.type || "image/jpeg"};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.2,
    }),
  });
  const body = await res.json().catch(() => null);
  const text: unknown = body?.result?.choices?.[0]?.message?.content ?? body?.result?.response;
  if (!res.ok || typeof text !== "string") {
    const reason: string = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (isDailyLimit(reason)) throw new DailyLimitError(reason);
    throw new Error(`Vision model error: ${reason}`);
  }
  return parseFeatures(text);
}

/** Pulls the list out of the model's reply, even if it wrapped the JSON in extra text. */
export function parseFeatures(text: string): string[] {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  try {
    const list: unknown = JSON.parse(json).features;
    return cleanFeatures(Array.isArray(list) ? list : []);
  } catch {
    return [];
  }
}

/** Keeps the list short and safe to put into the image prompt. */
export function cleanFeatures(list: unknown[]): string[] {
  return list
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.replace(/[\r\n"]+/g, " ").trim().slice(0, MAX_FEATURE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_FEATURES);
}
