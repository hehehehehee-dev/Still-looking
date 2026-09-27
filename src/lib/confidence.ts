// The confidence note shown with results. It is NOT a per-image score (the model gives none).
// It reports how the same pipeline did in our offline test (see /eval and the Accuracy page)
// for a similar age gap. Numbers come straight from the eval's summary file.

import summary from "@/data/eval-summary.json";

export type GapBucket = "under5" | "5to10" | "over10";

type BucketStats = {
  label: string;
  pairs: number;
  aged_top1_pct: number;
  baseline_top1_pct: number;
  aged_closer_than_strangers_pct: number;
};
const buckets = summary.buckets as unknown as Partial<Record<GapBucket, BucketStats>>;
const totalPeople = summary.pairs_scored;

export function bucketFor(gapYears: number): GapBucket {
  if (gapYears < 5) return "under5";
  if (gapYears <= 10) return "5to10";
  return "over10";
}

export function confidenceNote(gapYears: number, familyCount: number, featureCount = 0): string[] {
  const b = buckets[bucketFor(gapYears)];
  const notes: string[] = [];
  if (b) {
    notes.push(
      `In our test on ${b.pairs} real people with an age gap of ${b.label.toLowerCase()}, a face-recognition model ` +
        `picked out the right person (among ${totalPeople}) from the aged image ${b.aged_top1_pct}% of the time, ` +
        `and from the original childhood photo ${b.baseline_top1_pct}% of the time.`,
      "So these images can help you picture how a child may have grown, but they are not a better match than " +
        "the original photo. Always share the original photo as well.",
    );
  } else {
    notes.push("We have not yet measured accuracy for this age gap.");
  }
  if (gapYears > 10) notes.push("Longer gaps are much harder: treat these images as a rough guide only.");
  if (familyCount > 0) {
    notes.push("Family photos were used as a guide, but we have not been able to measure whether they improve accuracy.");
  }
  if (featureCount > 0) {
    notes.push("The model was asked to keep the distinguishing features you confirmed; check that they appear as you expect.");
  }
  return notes;
}
