"use client";

// Lets the family frame the child's face. Why: the model only receives a ~500px image, so in a
// wide or group photo the face would be tiny and lose detail. It also lets them pick the right
// child in a photo with several people. Runs entirely in the browser.

import { useState } from "react";
import Cropper from "react-easy-crop";
import type { CropArea } from "@/lib/resize";

export default function FaceCropper({ imageUrl, onChange }: { imageUrl: string; onChange: (area: CropArea) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-background">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          maxZoom={6}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => onChange(pixels)}
        />
      </div>
      <label className="flex items-center gap-3 text-xs text-muted">
        Zoom
        <input type="range" min={1} max={6} step={0.05} value={zoom} className="w-full accent-accent"
          onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
      </label>
      <p className="text-xs text-muted">Drag and zoom so the child&apos;s face, hair and ears fill the square.</p>
    </div>
  );
}
