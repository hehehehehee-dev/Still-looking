// The confidence note shown with results. It is NOT a per-image score (the model gives none).
// It reports how the pipeline did in our offline test (see /eval) for a similar age gap.
// TODO(Day 3): replace the placeholder numbers with the real eval results.

export type GapBucket = "under5" | "5to10" | "over10";

export function bucketFor(gapYears: number): GapBucket {
  if (gapYears < 5) return "under5";
  if (gapYears <= 10) return "5to10";
  return "over10";
}

type BucketResult = { label: string; pairs: number; beatBaselinePct: number | null };

export const EVAL_RESULTS: Record<GapBucket, BucketResult> = {
  under5: { label: "less than 5 years", pairs: 0, beatBaselinePct: null },
  "5to10": { label: "5 to 10 years", pairs: 0, beatBaselinePct: null },
  over10: { label: "more than 10 years", pairs: 0, beatBaselinePct: null },
};

export function confidenceNote(gapYears: number, familyCount: number): string {
  const r = EVAL_RESULTS[bucketFor(gapYears)];
  const measured =
    r.beatBaselinePct === null
      ? `We are still measuring accuracy for age gaps of ${r.label}.`
      : `In our test on ${r.pairs} real people with an age gap of ${r.label}, the aged image was closer to the ` +
        `person's real later photo than the original photo was in ${r.beatBaselinePct}% of cases.`;
  const family =
    familyCount > 0
      ? " Family photos were used as a guide, but we have not been able to measure whether they improve accuracy."
      : "";
  const gap = gapYears > 10 ? " Longer gaps are harder: treat these images as a rough guide only." : "";
  return measured + family + gap;
}
