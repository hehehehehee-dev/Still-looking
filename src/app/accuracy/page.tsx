import type { Metadata } from "next";
import summary from "@/data/eval-summary.json";
import SimilarityChart, { type ChartGroup } from "./SimilarityChart";

export const metadata: Metadata = { title: "Accuracy · Still Looking" };

// All numbers on this page come from eval/outputs/summary.json (copied to src/data by score.py),
// so re-running the eval updates the page. Nothing here is typed in by hand.

type Stats = {
  label?: string;
  pairs: number;
  baseline_mean: number;
  aged_mean: number;
  aged_to_strangers_mean: number;
  beat_baseline_pct: number;
  aged_closer_than_strangers_pct: number;
  aged_top1_pct: number;
  baseline_top1_pct: number;
};
type Experiment = {
  pairs: number;
  single_photo_mean: number;
  multi_photo_mean: number;
  baseline_mean?: number;
  improvement_mean: number;
  improvement_ci95: [number, number];
  multi_better_pct: number;
  single_top1_pct: number;
  multi_top1_pct: number;
  people_with_no_features_found?: number;
} | null;

const s = summary as unknown as {
  date: string;
  model: string;
  pairs_scored: number;
  overall: Stats;
  buckets: Record<string, Stats>;
  multi_photo?: Experiment;
  distinguishing_features?: Experiment;
  sam_editing_model?: Experiment;
  nano_banana_2?: Experiment;
};

const beatCount = Math.round((s.overall.beat_baseline_pct / 100) * s.overall.pairs);

/** "+0.02", "-0.02", or "0.00" (never "-0.00") */
function signed(n: number): string {
  const text = n.toFixed(2);
  return Number(text) === 0 ? "0.00" : Number(text) > 0 ? `+${text}` : text;
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted">{note}</div>
    </div>
  );
}

function ExperimentResult({ title, exp, what }: { title: string; exp: Experiment | undefined; what: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{what}</p>
      {exp ? (
        <p className="mt-2 text-sm leading-relaxed">
          Tested on {exp.pairs} people. Similarity to the real later photo went from{" "}
          <strong>{exp.single_photo_mean.toFixed(2)}</strong> to <strong>{exp.multi_photo_mean.toFixed(2)}</strong>{" "}
          ({signed(exp.improvement_mean)}; 95% range{" "}
          {exp.improvement_ci95[0].toFixed(2)} to {exp.improvement_ci95[1].toFixed(2)}), better for{" "}
          {exp.multi_better_pct}% of people. Right person picked first: {exp.single_top1_pct}% → {exp.multi_top1_pct}%.{" "}
          {exp.improvement_ci95[0] > 0
            ? "The whole range is above zero, so this helped."
            : exp.improvement_ci95[1] < 0
              ? "The whole range is below zero, so this made things worse."
              : "The range includes zero, so we can't say it made a real difference."}
          {exp.people_with_no_features_found ? ` (${exp.people_with_no_features_found} people had no clear features and were left out.)` : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">Results pending.</p>
      )}
    </div>
  );
}

export default function AccuracyPage() {
  const groups: ChartGroup[] = Object.values(s.buckets).map((b) => ({
    label: b.label ?? "",
    pairs: b.pairs,
    baseline: b.baseline_mean,
    aged: b.aged_mean,
    strangers: b.aged_to_strangers_mean,
  }));
  const o = s.overall;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">How accurate is it?</h1>
        <div className="rounded-xl border border-accent/30 bg-accent-soft p-5 leading-relaxed">
          <strong>The short answer.</strong> Our aged images look older and keep some of the child&apos;s features,
          but in our test a face-recognition model matched the <em>original</em> childhood photo to the grown-up
          person better than any aged image. Use the images to picture how a child may have grown,
          and <strong>always share the original photo too</strong>.
        </div>
        {s.nano_banana_2 && (
          <div className="rounded-xl border border-border bg-surface p-5 text-sm leading-relaxed">
            <strong>Which model the app uses, and why.</strong> We tested seven approaches on the same people. The
            app now uses <strong>Google&apos;s Nano Banana 2</strong> (via Replicate), the only one that measurably
            beat our first, free model: similarity to the real later photo{" "}
            {s.nano_banana_2.single_photo_mean.toFixed(2)} → <strong>{s.nano_banana_2.multi_photo_mean.toFixed(2)}</strong>{" "}
            (95% range of the change {signed(s.nano_banana_2.improvement_ci95[0])} to {signed(s.nano_banana_2.improvement_ci95[1])}),
            and it keeps the requested age and sex more reliably. It is still well below the original photo
            ({(s.nano_banana_2.baseline_mean ?? s.overall.baseline_mean).toFixed(2)}). If it is unavailable, the app falls back to the free model.
            The detailed results below are for the free model (3 images per person); Nano Banana 2 is in
            &ldquo;Can it be improved?&rdquo;.
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Closer to the right person than to strangers" value={`${o.aged_closer_than_strangers_pct}%`}
          note={`The aged image kept enough of the child's face to be nearer the real person than ${o.pairs - 1} other people.`} />
        <Tile label="Right person picked first, out of all test people" value={`${o.aged_top1_pct}% vs ${o.baseline_top1_pct}%`}
          note="Aged image vs. the unchanged original photo. The original photo did better." />
        <Tile label="Aged image beat the original photo" value={`${beatCount} of ${o.pairs}`}
          note="Measured by similarity to each person's real later photo." />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Results by age gap</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <SimilarityChart groups={groups} />
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="p-3 font-medium">Age gap</th>
                <th className="p-3 font-medium">People</th>
                <th className="p-3 font-medium">Original photo</th>
                <th className="p-3 font-medium">Aged image</th>
                <th className="p-3 font-medium">Other people</th>
                <th className="p-3 font-medium">Right person first (original / aged)</th>
              </tr>
            </thead>
            <tbody>
              {[...Object.values(s.buckets), { ...o, label: "All" }].map((b) => (
                <tr key={b.label} className="border-b border-border last:border-0">
                  <td className="p-3">{b.label}</td>
                  <td className="p-3">{b.pairs}</td>
                  <td className="p-3">{b.baseline_mean.toFixed(2)}</td>
                  <td className="p-3">{b.aged_mean.toFixed(2)}</td>
                  <td className="p-3">{b.aged_to_strangers_mean.toFixed(2)}</td>
                  <td className="p-3">{b.baseline_top1_pct}% / {b.aged_top1_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">What we did</h2>
        <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
          <li>
            We used <strong>FG-NET</strong>, a research dataset with photos of the same people at different ages, and
            picked {s.pairs_scored} people with a childhood photo (age 12 or under) and a later photo.
          </li>
          <li>
            We aged each childhood photo to the age in the later photo using <strong>exactly the same code as this
            website</strong> (same instructions, same AI model, 3 variations).
          </li>
          <li>
            A face-recognition model (ArcFace) scored how similar each image is to the person&apos;s real later photo.
            We compared that with doing nothing (the unchanged childhood photo) and with other people&apos;s photos.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Can it be improved?</h2>
        <p className="leading-relaxed text-muted">
          Experiments on the same people, each changing only one thing and compared with our normal result.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ExperimentResult title="More photos of the child" exp={s.multi_photo}
            what="Up to 2 extra childhood photos, taken at the same age or younger, added next to the main photo." />
          <ExperimentResult title="Distinguishing features" exp={s.distinguishing_features}
            what="An AI model listed visible lasting marks (moles, scars, eye colour) that were added to the instructions. In the app, families check this list first; in this test nobody did, so it is the worst case." />
          <ExperimentResult title="Nano Banana 2 instead (now used by the app)" exp={s.nano_banana_2}
            what="A newer image model from Google, given exactly the same instructions and photo as our free model. It is paid (about $0.07 per image) and has no random seed, so each run differs." />
          <ExperimentResult title="An editing model instead (SAM)" exp={s.sam_editing_model}
            what="Our model redraws a new face. SAM, a research face-aging model, edits the existing face instead and is trained to keep identity. It takes one photo only (no family photos or instructions)." />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Where it falls short</h2>
        <ul className="list-disc space-y-2 pl-5 leading-relaxed">
          <li>
            <strong>The AI &ldquo;beautifies&rdquo; faces.</strong> Results tend to look smooth and symmetrical, like
            stock photos, which removes some of what makes a face unique.
          </li>
          <li><strong>Longer gaps are much harder.</strong> Accuracy drops clearly when more than 10 years have passed.</li>
          <li>
            <strong>We could not check the age.</strong> The age-estimation model we tried guessed most children
            as adults, even in real photos, so we can&apos;t claim the images show exactly the right age.
          </li>
          <li>
            <strong>Family photos are not measured.</strong> No public dataset has a child&apos;s photos over time
            together with their parents&apos; photos, so we can&apos;t yet say whether family photos help.
          </li>
          <li>
            <strong>Small, old dataset.</strong> FG-NET has 82 people, mostly scanned prints, and does not
            represent every ethnicity or age group. Results may differ for other children.
          </li>
          <li>
            <strong>A machine&apos;s view.</strong> Face-recognition similarity is a stand-in for &ldquo;does this
            look like them?&rdquo; We have not tested whether people recognise the aged images better.
          </li>
        </ul>
      </section>

      <p className="text-xs text-muted">
        Test run {s.date} · image model: {s.model} · face model: InsightFace buffalo_l (research use) · FG-NET photos
        are not shown or published here because their licence allows research use only.
      </p>
    </div>
  );
}
