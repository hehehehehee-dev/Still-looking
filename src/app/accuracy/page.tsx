import type { Metadata } from "next";

export const metadata: Metadata = { title: "Accuracy · Still Looking" };

// TODO(Day 3-4): fill in with the chart and table produced by /eval.
export default function AccuracyPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">How accurate is it?</h1>
      <p className="max-w-2xl leading-relaxed text-muted">
        We are testing the tool on FG-NET, a research dataset with photos of the same people at different
        ages. For each person we age a childhood photo and check, with a face-recognition model, whether the
        result looks more like their real later photo than the original childhood photo does. Results will
        appear here.
      </p>
    </div>
  );
}
