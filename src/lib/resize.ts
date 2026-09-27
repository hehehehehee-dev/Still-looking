// Runs in the browser. Shrinks a photo before upload because:
//  1. the model only accepts images smaller than 512x512, and
//  2. hosting platforms reject large uploads (Vercel: 4.5 MB per request).
// The original file never leaves the user's device, only this small copy does.

import { MAX_INPUT_SIDE } from "./limits";

export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // respects phone photo rotation (EXIF)
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read this photo."))), "image/jpeg", 0.9),
  );
}

/** Turns the model's base64 output into something an <img> can show. */
export function toDataUrl(base64: string): string {
  const type = base64.startsWith("iVBOR") ? "image/png" : base64.startsWith("UklGR") ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${base64}`;
}
