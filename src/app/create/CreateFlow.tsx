"use client";

// The upload form and the results view live in one component on purpose:
// the generated images only ever exist in this page's memory (React state).
// They are never put in a URL, browser storage, or a server, so closing
// or refreshing the page deletes them.

import { useEffect, useState } from "react";
import { planAges, type AgePlan } from "@/lib/age";
import { MAX_FEATURES, MAX_INPUT_IMAGES } from "@/lib/limits";
import { shrinkPhoto } from "@/lib/resize";
import type { Sex } from "@/lib/prompt";
import Results, { type ResultData } from "./Results";

type FamilyEntry = { id: number; file: File | null; relation: string; age: string };

const RELATIONS = ["mother", "father", "sister", "brother"];
const MAX_FAMILY = MAX_INPUT_IMAGES - 1;

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const labelClass = "block text-sm font-medium mb-1";

export default function CreateFlow() {
  const [childFile, setChildFile] = useState<File | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [photoDate, setPhotoDate] = useState("");
  const [sex, setSex] = useState<Sex>("unspecified");
  const [family, setFamily] = useState<FamilyEntry[]>([]);
  const [understood, setUnderstood] = useState(false);
  const [featuresText, setFeaturesText] = useState(""); // one distinguishing feature per line
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState("");

  const [status, setStatus] = useState<"form" | "loading" | "done">("form");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultData | null>(null);

  // Preview of the child photo: a temporary in-browser link to the file on this device
  const [childPreview, setChildPreview] = useState("");
  function chooseChildPhoto(file: File | null) {
    setChildFile(file);
    setChildPreview(file ? URL.createObjectURL(file) : "");
  }
  // Release the old link when the photo changes or the page closes
  useEffect(() => () => {
    if (childPreview) URL.revokeObjectURL(childPreview);
  }, [childPreview]);

  const ages: AgePlan | { error: string } | null =
    dateOfBirth && photoDate ? planAges(dateOfBirth, photoDate) : null;

  function updateFamily(id: number, patch: Partial<FamilyEntry>) {
    setFamily((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  // Ask the vision model for suggestions; they go into the text box for the family to check
  async function suggestFeatures() {
    if (!childFile) return setSuggestNote("Choose the child's photo first.");
    setSuggesting(true);
    setSuggestNote("");
    try {
      const form = new FormData();
      form.append("childPhoto", await shrinkPhoto(childFile), "child.jpg");
      const res = await fetch("/api/features", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.features)) throw new Error(data?.error ?? "Could not suggest features.");
      if (data.features.length === 0) {
        setSuggestNote("No clear distinguishing features were found in this photo. You can still add your own.");
      } else {
        const existing = featuresText.trim();
        setFeaturesText((existing ? existing + "\n" : "") + data.features.join("\n"));
        setSuggestNote("Suggestions added. Please check each line and delete anything that isn't right.");
      }
    } catch (err) {
      setSuggestNote(err instanceof Error ? err.message : "Could not suggest features.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!childFile) return setError("Please add a photo of the child.");
    if (!ages || "error" in ages) return setError(ages?.error ?? "Please enter both dates.");
    const filledFamily = family.filter((f) => f.file);
    if (filledFamily.some((f) => !f.age)) return setError("Please give an approximate age for each family photo.");

    setStatus("loading");
    try {
      const form = new FormData();
      form.append("childPhoto", await shrinkPhoto(childFile), "child.jpg");
      form.append("dateOfBirth", dateOfBirth);
      form.append("photoDate", photoDate);
      form.append("sex", sex);
      for (const line of featuresText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, MAX_FEATURES)) {
        form.append("feature", line);
      }
      for (const [i, f] of filledFamily.entries()) {
        form.append(`familyPhoto${i}`, await shrinkPhoto(f.file!), `family${i}.jpg`);
        form.append(`familyRelation${i}`, f.relation);
        form.append(`familyAge${i}`, f.age);
      }

      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.images) throw new Error(data?.error ?? "Something went wrong. Please try again.");

      setResult({ ...data, originalUrl: childPreview });
      setStatus("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("form");
    }
  }

  function startOver() {
    setResult(null);
    setStatus("form");
    window.scrollTo({ top: 0 });
  }

  if (status === "done" && result) return <Results data={result} onStartOver={startOver} />;

  const loading = status === "loading";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
        <strong>Your photos are never saved.</strong> They are shrunk on your device, used once to create
        the images, and discarded. Nothing is stored on our side.
      </div>

      {/* Step 1: the child */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold">1. The child</h2>

        <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
          <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-center text-sm text-muted hover:border-accent">
            {childPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={childPreview} alt="Selected photo of the child" className="h-full w-full object-cover" />
            ) : (
              <span className="px-3">Choose a clear, front-facing photo</span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => chooseChildPhoto(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="dob" className={labelClass}>Date of birth</label>
                <input id="dob" type="date" className={inputClass} value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="photoDate" className={labelClass}>When was the photo taken? (approx.)</label>
                <input id="photoDate" type="date" className={inputClass} value={photoDate}
                  onChange={(e) => setPhotoDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <label htmlFor="sex" className={labelClass}>Sex (optional, but in our tests it made the age much more accurate)</label>
              <select id="sex" className={inputClass} value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                <option value="unspecified">Prefer not to say</option>
                <option value="boy">Boy</option>
                <option value="girl">Girl</option>
              </select>
            </div>
            {ages && (
              <p className={`text-sm ${"error" in ages ? "text-danger" : "text-muted"}`}>
                {"error" in ages
                  ? ages.error
                  : `Age in photo: ${ages.photoAge} → age today: ${ages.targetAge} (${ages.gapYears} years of aging)`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Step 2: distinguishing features (optional) */}
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-xl font-semibold">2. Distinguishing features <span className="text-base font-normal text-muted">(optional)</span></h2>
          <p className="mt-1 text-sm text-muted">
            Marks that usually last for life, such as moles, scars, birthmarks or an unusual ear shape, one per line.
            You know your child best: add marks the photo doesn&apos;t show. Eye colour can still change in the first
            few years, and some birthmarks fade.
          </p>
        </div>
        <textarea rows={4} className={inputClass} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)}
          placeholder={"small mole under the left eye\nscar on the chin"} aria-label="Distinguishing features, one per line" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={suggestFeatures} disabled={suggesting || loading}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent disabled:opacity-50">
            {suggesting ? "Looking at the photo…" : "Suggest from the photo (AI)"}
          </button>
          <span className="text-xs text-muted">
            AI suggestions can be wrong (for example, dust on an old photo). They are only used after you check them.
          </span>
        </div>
        {suggestNote && <p className="text-sm text-muted" role="status">{suggestNote}</p>}
      </section>

      {/* Step 3: optional family photos */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h2 className="text-xl font-semibold">3. Family photos <span className="text-base font-normal text-muted">(optional)</span></h2>
          <p className="mt-1 text-sm text-muted">
            Forensic artists use photos of biological parents and siblings to see which features run in the family.
            Photos taken when they were about{" "}
            {ages && !("error" in ages) ? `${ages.targetAge}` : "the child's current age"} work best. Up to {MAX_FAMILY}.
          </p>
        </div>

        {family.map((f) => (
          <div key={f.id} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_140px_100px_auto]">
            <div>
              <label className={labelClass}>Photo</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="w-full text-sm"
                onChange={(e) => updateFamily(f.id, { file: e.target.files?.[0] ?? null })} />
            </div>
            <div>
              <label className={labelClass}>Relation</label>
              <select className={inputClass} value={f.relation} onChange={(e) => updateFamily(f.id, { relation: e.target.value })}>
                {RELATIONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Age in photo</label>
              <input type="number" min={1} max={100} className={inputClass} value={f.age}
                onChange={(e) => updateFamily(f.id, { age: e.target.value })} />
            </div>
            <button type="button" className="text-sm text-muted underline hover:text-foreground"
              onClick={() => setFamily((list) => list.filter((x) => x.id !== f.id))}>
              Remove
            </button>
          </div>
        ))}

        {family.length < MAX_FAMILY && (
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
            onClick={() => setFamily((list) => [...list, { id: Date.now(), file: null, relation: "mother", age: "" }])}>
            + Add a family photo
          </button>
        )}
      </section>

      {/* Step 4: acknowledgement + submit */}
      <section className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)} />
          <span>
            I understand these images are <strong>estimates, not identification</strong>, and I will share them
            only with police or a missing-children organisation such as NCMEC.
          </span>
        </label>

        {error && <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning" role="alert">{error}</p>}

        <button type="submit" disabled={!understood || loading}
          className="rounded-lg bg-accent px-6 py-3 font-medium text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Creating 3 variations… (usually 10–30 seconds)" : "Create age-progressed images"}
        </button>
      </section>
    </form>
  );
}
