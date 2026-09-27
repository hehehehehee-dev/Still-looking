// POST /api/features
// Suggests distinguishing features from the child's photo for the family to check.
// Same privacy rules as /api/generate: the photo lives only in this request's memory.

import { DAILY_LIMIT_MESSAGE, DailyLimitError } from "@/lib/cloudflare";
import { suggestFeatures } from "@/lib/features";

export const maxDuration = 30;

const MAX_FILE_BYTES = 1_000_000;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  let photo: FormDataEntryValue | null;
  try {
    photo = (await request.formData()).get("childPhoto");
  } catch {
    return Response.json({ error: "Could not read the upload." }, { status: 400 });
  }
  if (!(photo instanceof File) || !ALLOWED_TYPES.includes(photo.type) || photo.size > MAX_FILE_BYTES) {
    return Response.json({ error: "Please add a JPG, PNG or WebP photo of the child (under 1 MB)." }, { status: 400 });
  }

  try {
    return Response.json({ features: await suggestFeatures(photo) });
  } catch (err) {
    if (err instanceof DailyLimitError) return Response.json({ error: DAILY_LIMIT_MESSAGE }, { status: 429 });
    console.error("Feature suggestion failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not suggest features right now. You can still type them yourself." }, { status: 502 });
  }
}
