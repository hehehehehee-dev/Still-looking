// Runs in the browser. Shrinks a photo before upload because:
//  1. the model only accepts images smaller than 512x512, and
//  2. hosting platforms reject large uploads (Vercel: 4.5 MB per request).
// The original file never leaves the user's device, only this small copy does.

import { MAX_INPUT_SIDE } from "./limits";

/** A rectangle in the original photo's pixels (what the cropper reports). */
export type CropArea = { x: number; y: number; width: number; height: number };

/**
 * Optionally cuts out `crop` (e.g. just the child's face), then scales it to fit inside
 * 500x500. Cropping first means the face fills the small image the model receives,
 * instead of being a few hundred pixels inside a wide family photo.
 */
export async function shrinkPhoto(file: File, crop?: CropArea): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // respects phone photo rotation (EXIF)
  const src = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, src.x, src.y, src.width, src.height, 0, 0, width, height);
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
