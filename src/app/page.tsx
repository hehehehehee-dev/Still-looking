import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-6">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          For families whose child has been missing for years.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          When a child has been missing for a long time, the only photo a family has may show a face that no
          longer exists. Forensic artists age those photos using pictures of the child&apos;s parents and
          siblings, but families often wait a long time for one. Still Looking, inspired by that method, gives
          families an early way to picture how their child may have grown: from the child&apos;s photo, guided by
          their family if they wish, with measured and clearly stated limits.
        </p>
        <Link href="/create"
          className="inline-block rounded-lg bg-accent px-6 py-3 font-medium text-accent-contrast">
          Create an age-progressed estimate
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["1. Add photos", "A photo of the child, their date of birth, and optional photos of parents or siblings."],
          ["2. We estimate", "An AI image model ages the photo to the child's age today, in 3 different variations."],
          ["3. Share with authorities", "Take the images to the police or NCMEC. They are estimates, never identification."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-accent/30 bg-accent-soft p-5 text-sm leading-relaxed">
        <strong>Your photos are never saved.</strong> There are no accounts, no database and no gallery. Photos
        are processed in memory, the results are shown only to you, and everything is gone when you close the
        page. We also publish how accurate the tool is, including where it fails:{" "}
        <Link href="/accuracy" className="text-accent underline">see the accuracy results</Link>.
      </section>
    </div>
  );
}
