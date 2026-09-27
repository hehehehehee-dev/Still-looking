"use client";

import { confidenceNote } from "@/lib/confidence";
import { toDataUrl } from "@/lib/resize";

export type ResultData = {
  images: string[]; // base64 from the model
  photoAge: number;
  targetAge: number;
  gapYears: number;
  familyCount: number;
  originalUrl: string;
};

export default function Results({ data, onStartOver }: { data: ResultData; onStartOver: () => void }) {
  const urls = data.images.map(toDataUrl);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Possible appearance at age {data.targetAge}</h1>
        <p className="mt-2 text-muted">
          {urls.length} variations from a photo at age {data.photoAge}
          {data.familyCount > 0 ? `, guided by ${data.familyCount} family photo${data.familyCount > 1 ? "s" : ""}` : ""}.
          They differ on purpose: no one can know exactly how a face will change.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.originalUrl} alt={`Original photo at age ${data.photoAge}`}
            className="aspect-square w-full rounded-lg border border-border object-cover" />
          <figcaption className="text-sm text-muted">Original, age {data.photoAge}</figcaption>
        </figure>
        {urls.map((url, i) => (
          <figure key={i} className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Variation ${i + 1}, estimated appearance at age ${data.targetAge}`}
              className="aspect-square w-full rounded-lg border border-border object-cover" />
            <figcaption className="flex items-center justify-between text-sm">
              <span className="text-muted">Variation {i + 1}</span>
              <a href={url} download={`still-looking-age-${data.targetAge}-v${i + 1}.jpg`}
                className="text-accent underline">Download</a>
            </figcaption>
          </figure>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">How confident is this?</h2>
        <p className="mt-2 text-sm leading-relaxed">{confidenceNote(data.gapYears, data.familyCount)}</p>
        <a href="/accuracy" className="mt-2 inline-block text-sm text-accent underline">See how we measured accuracy</a>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">How to use these images</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Share them with the police officer or case manager handling the case, together with the original photo.</li>
          <li>In the US, contact NCMEC (1-800-THE-LOST). Their forensic artists can create a professional age progression.</li>
          <li>Treat all three as possibilities, not a single answer. Hair, weight and style can change a lot.</li>
          <li>Please don&apos;t post them publicly as &ldquo;what this child looks like now&rdquo;: an estimate can mislead people.</li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button onClick={onStartOver} className="rounded-lg border border-border px-5 py-2 hover:border-accent">
          Start over
        </button>
        <p className="text-sm text-muted">Nothing was saved. Leaving or refreshing this page deletes these images.</p>
      </div>
    </div>
  );
}
