"""Step 3 of the eval: score every aged image with face-recognition and age models.

For each test pair we compare faces using ArcFace (InsightFace's buffalo_l model).
ArcFace turns a face into 512 numbers; two photos of the same person give similar
numbers. "Similarity" below is the cosine similarity of those numbers (higher = more alike).

The key question: does our aging beat doing nothing?
  baseline = similarity(young photo,  real later photo)   <- just use the old photo as-is
  aged     = similarity(aged image,   real later photo)   <- what Still Looking gives you
If aged > baseline, the progression moved the face closer to the real person's later face.

We also estimate the apparent age of each aged image (InsightFace's age model) to check
the model hit the target age, because in testing it sometimes under- or over-aged faces.
The age model is itself imperfect, so we also run it on the REAL later photos to see its bias.

Usage:  eval/.venv/Scripts/python eval/score.py
Output: eval/outputs/results.csv, eval/outputs/summary.json, eval/outputs/*.png,
        and a copy of summary.json at src/data/eval-summary.json for the website.
"""

import csv
import json
import shutil
from datetime import date
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FGNET = ROOT / "data" / "FGNET" / "images"
OUT = ROOT / "eval" / "outputs"
GENERATED = OUT / "images"
GENERATED_MULTI = OUT / "images_multi"
GENERATED_FEATURES = OUT / "images_features"
VARIATIONS = 3
BUCKETS = {"under5": "Under 5 years", "5to10": "5 to 10 years", "over10": "Over 10 years"}

# Reference data-viz palette (validated for colour-blind separation): slot 1 blue, slot 2 orange
AGED_COLOR, BASELINE_COLOR, STRANGER_COLOR = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e2dd"


def load_models():
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition", "genderage"],
                       providers=["CPUExecutionProvider"])
    # FG-NET photos are tightly cropped faces; at 640px the enlarged face was too big to detect
    app.prepare(ctx_id=-1, det_size=(320, 320))
    return app


def analyse(app, path: Path):
    """Returns (embedding, estimated age) for the largest face, or (None, None) if no face is found."""
    img = cv2.imread(str(path))
    if img is None:
        return None, None
    faces = app.get(img)
    if not faces:
        return None, None
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face.normed_embedding, float(face.age)


def cos(a, b) -> float:
    return float(np.dot(a, b))  # embeddings are already length 1, so the dot product is the cosine


def bootstrap_ci(diffs, n=5000, seed=0):
    """95% range for the average improvement, by re-sampling the pairs many times."""
    rng = np.random.default_rng(seed)
    diffs = np.asarray(diffs)
    means = [rng.choice(diffs, len(diffs)).mean() for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 3), round(float(np.percentile(means, 97.5)), 3)]


def add_stranger_and_rank_scores(rows):
    """A fairer second test. "Worse than doing nothing" could still mean "better than chance".
    For each person we also compare their aged images with the later photos of everyone ELSE
    (strangers), and rank all later photos by similarity to see where the right person lands.
    This is only a measurement inside the eval; the app never searches or matches faces."""
    olds = np.stack([r["_old"] for r in rows])
    for i, r in enumerate(rows):
        aged_scores = np.mean([olds @ e for e in r["_aged"]], axis=0)  # similarity to every later photo
        young_scores = olds @ r["_young"]
        others = np.delete(aged_scores, i)
        r["aged_to_strangers"] = round(float(others.mean()), 4)
        r["aged_rank"] = int((aged_scores > aged_scores[i]).sum()) + 1  # 1 = right person ranked first
        r["baseline_rank"] = int((young_scores > young_scores[i]).sum()) + 1


def compare_arm(rows, key, only_ids=None):
    """A/B experiments from generate.mjs (--multi, --features).
    Compares variation 0 made the normal way with variation 0 made with the extra input
    (same photo, same seed), so the only difference is the thing being tested."""
    olds = np.stack([r["_old"] for r in rows])
    both = [(i, r) for i, r in enumerate(rows)
            if r["_v0"] is not None and r[key] is not None and (only_ids is None or r["pair_id"] in only_ids)]
    if not both:
        return None
    single = [cos(r["_v0"], r["_old"]) for _, r in both]
    multi = [cos(r[key], r["_old"]) for _, r in both]
    diffs = [m - s for m, s in zip(multi, single)]

    def top1(emb, i):
        scores = olds @ emb
        return int((scores > scores[i]).sum()) == 0

    return {
        "pairs": len(both),
        "single_photo_mean": round(float(np.mean(single)), 3),
        "multi_photo_mean": round(float(np.mean(multi)), 3),
        "baseline_mean": round(float(np.mean([r["baseline"] for _, r in both])), 3),
        "improvement_mean": round(float(np.mean(diffs)), 3),
        "improvement_ci95": bootstrap_ci(diffs),
        "multi_better_pct": round(100 * np.mean([d > 0 for d in diffs])),
        "multi_beat_baseline_pct": round(100 * np.mean([m > r["baseline"] for m, (_, r) in zip(multi, both)])),
        "single_top1_pct": round(100 * np.mean([top1(r["_v0"], i) for i, r in both])),
        "multi_top1_pct": round(100 * np.mean([top1(r[key], i) for i, r in both])),
    }


def summarise(rows):
    diffs = [r["aged_mean"] - r["baseline"] for r in rows]
    return {
        "pairs": len(rows),
        "baseline_mean": round(float(np.mean([r["baseline"] for r in rows])), 3),
        "aged_mean": round(float(np.mean([r["aged_mean"] for r in rows])), 3),
        "improvement_mean": round(float(np.mean(diffs)), 3),
        "improvement_ci95": bootstrap_ci(diffs),
        "beat_baseline_pct": round(100 * np.mean([r["aged_mean"] > r["baseline"] for r in rows])),
        "best_of_3_beat_baseline_pct": round(100 * np.mean([r["aged_best"] > r["baseline"] for r in rows])),
        "aged_to_strangers_mean": round(float(np.mean([r["aged_to_strangers"] for r in rows])), 3),
        "aged_closer_than_strangers_pct": round(100 * np.mean([r["aged_mean"] > r["aged_to_strangers"] for r in rows])),
        "aged_top1_pct": round(100 * np.mean([r["aged_rank"] == 1 for r in rows])),
        "baseline_top1_pct": round(100 * np.mean([r["baseline_rank"] == 1 for r in rows])),
        "aged_top5_pct": round(100 * np.mean([r["aged_rank"] <= 5 for r in rows])),
        "baseline_top5_pct": round(100 * np.mean([r["baseline_rank"] <= 5 for r in rows])),
        "target_age_mean": round(float(np.mean([r["old_age"] for r in rows])), 1),
        "aged_est_age_mean": round(float(np.mean([r["aged_est_age"] for r in rows])), 1),
        "real_est_age_mean": round(float(np.mean([r["real_old_est_age"] for r in rows])), 1),
        "aged_age_error_mean": round(float(np.mean([abs(r["aged_est_age"] - r["old_age"]) for r in rows])), 1),
    }


def plot_similarity(summary, path):
    import matplotlib.pyplot as plt
    keys = [k for k in BUCKETS if k in summary["buckets"]]
    x = np.arange(len(keys))
    w, gap = 0.26, 0.015
    series = [
        ("baseline_mean", BASELINE_COLOR, "Original childhood photo, unchanged (baseline)"),
        ("aged_mean", AGED_COLOR, "Aged by Still Looking"),
        ("aged_to_strangers_mean", STRANGER_COLOR, "Aged image vs. other people (chance level)"),
    ]
    fig, ax = plt.subplots(figsize=(8.5, 4.8), dpi=160)
    top = 0
    for j, (field, color, label) in enumerate(series):
        vals = [summary["buckets"][k][field] for k in keys]
        pos = x + (j - 1) * (w + gap)
        ax.bar(pos, vals, w, color=color, label=label)
        for xi, v in zip(pos, vals):
            ax.text(xi, v + 0.008, f"{v:.2f}", ha="center", fontsize=8.5, color=INK)
        top = max(top, *vals)
    for i, k in enumerate(keys):
        b = summary["buckets"][k]
        ax.text(x[i], -0.075, f"{b['pairs']} people", ha="center", fontsize=8.5, color=MUTED,
                transform=ax.get_xaxis_transform())
    ax.set_xticks(x, [BUCKETS[k] for k in keys])
    ax.set_ylabel("Face similarity to the real later photo\n(ArcFace cosine, higher = more alike)", color=MUTED)
    ax.set_title("Aged images keep some identity, but the original photo matches better", loc="left", fontsize=12, color=INK)
    ax.set_ylim(0, top * 1.35)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED, length=0)
    ax.legend(frameon=False, loc="upper right", fontsize=8.5, labelcolor=INK)
    ax.set_xlabel("Years between the childhood photo and the later photo", color=MUTED, labelpad=22)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def plot_ages(rows, path):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6, 5), dpi=160)
    target = [r["old_age"] for r in rows]
    lim = max(target + [r["aged_est_age"] for r in rows] + [r["real_old_est_age"] for r in rows]) + 5
    ax.plot([0, lim], [0, lim], color=GRID, linewidth=1.5, zorder=1)
    ax.text(lim * 0.97, lim * 0.93, "perfect match", ha="right", fontsize=8, color=MUTED, rotation=38)
    ax.scatter(target, [r["real_old_est_age"] for r in rows], s=34, color=BASELINE_COLOR,
               edgecolor="white", linewidth=1.5, label="Real later photo (age model's own error)", zorder=2)
    ax.scatter(target, [r["aged_est_age"] for r in rows], s=34, color=AGED_COLOR,
               edgecolor="white", linewidth=1.5, label="Aged image (average of 3)", zorder=3)
    ax.set_xlim(0, lim)
    ax.set_ylim(0, lim)
    ax.set_xlabel("Real age in the later photo", color=MUTED)
    ax.set_ylabel("Age estimated by InsightFace", color=MUTED)
    ax.set_title("Did the aged images reach the right age?", loc="left", fontsize=12, color=INK)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, length=0)
    ax.legend(frameon=False, loc="upper left", fontsize=8.5, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main() -> None:
    with (ROOT / "eval" / "pairs.csv").open() as f:
        pairs = list(csv.DictReader(f))

    app = load_models()
    rows, excluded, not_generated, no_face_generated, missing = [], [], [], 0, 0

    for p in pairs:
        young_emb, _ = analyse(app, FGNET / p["young_file"])
        old_emb, old_est_age = analyse(app, FGNET / p["old_file"])
        if young_emb is None or old_emb is None:
            excluded.append(p["pair_id"])
            continue

        sims, sims_to_young, ages, aged_embs = [], [], [], []
        for v in range(VARIATIONS):
            path = GENERATED / f"{p['pair_id']}_v{v}.jpg"
            if not path.exists():
                missing += 1
                continue
            emb, est_age = analyse(app, path)
            if emb is None:
                no_face_generated += 1
                continue
            sims.append(cos(emb, old_emb))
            aged_embs.append(emb)
            sims_to_young.append(cos(emb, young_emb))
            ages.append(est_age)
        if not sims:
            not_generated.append(p["pair_id"])  # no aged images yet (e.g. daily quota ran out)
            continue

        rows.append({
            "pair_id": p["pair_id"], "person": p["person"], "bucket": p["bucket"], "sex": p["sex"],
            "young_age": int(p["young_age"]), "old_age": int(p["old_age"]), "gap": int(p["gap"]),
            "baseline": round(cos(young_emb, old_emb), 4),
            "aged_mean": round(float(np.mean(sims)), 4),
            "aged_best": round(float(np.max(sims)), 4),
            "aged_to_young": round(float(np.mean(sims_to_young)), 4),
            "aged_est_age": round(float(np.mean(ages)), 1),
            "real_old_est_age": round(old_est_age, 1),
            "variations_scored": len(sims),
            "_young": young_emb, "_old": old_emb, "_aged": aged_embs,  # kept in memory only
            "_v0": analyse(app, GENERATED / f"{p['pair_id']}_v0.jpg")[0] if (GENERATED / f"{p['pair_id']}_v0.jpg").exists() else None,
            "_multi": analyse(app, GENERATED_MULTI / f"{p['pair_id']}_v0.jpg")[0] if (GENERATED_MULTI / f"{p['pair_id']}_v0.jpg").exists() else None,
            "_features": analyse(app, GENERATED_FEATURES / f"{p['pair_id']}_v0.jpg")[0] if (GENERATED_FEATURES / f"{p['pair_id']}_v0.jpg").exists() else None,
        })

    add_stranger_and_rank_scores(rows)
    multi_photo = compare_arm(rows, "_multi")
    features_file = OUT / "features.json"
    suggested = json.loads(features_file.read_text()) if features_file.exists() else {}
    with_features = {pid for pid, f in suggested.items() if f}  # only people who got at least one feature
    features_arm = compare_arm(rows, "_features", with_features)
    if features_arm:
        features_arm["people_with_no_features_found"] = len(suggested) - len(with_features)
    for r in rows:
        for k in ("_young", "_old", "_aged", "_v0", "_multi", "_features"):
            del r[k]

    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "results.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "date": date.today().isoformat(),
        "dataset": "FG-NET",
        "model": "FLUX.2 [klein] 4B on Cloudflare Workers AI",
        "face_model": "InsightFace buffalo_l (ArcFace similarity, age estimate)",
        "variations_per_pair": VARIATIONS,
        "pairs_selected": len(pairs),
        "pairs_scored": len(rows),
        "pairs_excluded_no_face": excluded,
        "pairs_not_generated_yet": not_generated,
        "generated_images_missing": missing,
        "generated_images_no_face": no_face_generated,
        "overall": summarise(rows),
        "multi_photo": multi_photo,
        "distinguishing_features": features_arm,
        "buckets": {k: {"label": BUCKETS[k], **summarise([r for r in rows if r["bucket"] == k])}
                    for k in BUCKETS if any(r["bucket"] == k for r in rows)},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    (ROOT / "src" / "data").mkdir(exist_ok=True)
    shutil.copy(OUT / "summary.json", ROOT / "src" / "data" / "eval-summary.json")

    plot_similarity(summary, OUT / "similarity_by_gap.png")
    plot_ages(rows, OUT / "age_check.png")

    # A results table ready to paste into the README / demo
    lines = ["| Age gap | People | Baseline similarity | Aged similarity | Aged beat baseline | Best of 3 beat baseline | Target age (avg) | Aged image looks (avg) |",
             "|---|---|---|---|---|---|---|---|"]
    for k, b in summary["buckets"].items():
        lines.append(f"| {b['label']} | {b['pairs']} | {b['baseline_mean']:.2f} | {b['aged_mean']:.2f} | "
                     f"{b['beat_baseline_pct']}% | {b['best_of_3_beat_baseline_pct']}% | {b['target_age_mean']} | {b['aged_est_age_mean']} |")
    o = summary["overall"]
    lines.append(f"| **All** | **{o['pairs']}** | **{o['baseline_mean']:.2f}** | **{o['aged_mean']:.2f}** | "
                 f"**{o['beat_baseline_pct']}%** | **{o['best_of_3_beat_baseline_pct']}%** | **{o['target_age_mean']}** | **{o['aged_est_age_mean']}** |")
    (OUT / "results_table.md").write_text("\n".join(lines) + "\n")

    print("\n".join(lines))
    for name, m in (("More photos of the child", multi_photo), ("AI-suggested features, unchecked", features_arm)):
        if m:
            print(f"\n{name} ({m['pairs']} people): similarity {m['single_photo_mean']} normal -> "
                  f"{m['multi_photo_mean']} with it (change {m['improvement_mean']:+}, 95% range {m['improvement_ci95']}); "
                  f"better for {m['multi_better_pct']}% of people; right person first "
                  f"{m['single_top1_pct']}% -> {m['multi_top1_pct']}%")
    print(f"\nScored {len(rows)} pairs. Excluded (no face found in FG-NET photo): {excluded}. "
          f"Pairs not generated yet: {len(not_generated)}. Aged images with no detectable face: {no_face_generated}. Missing images: {missing}.")


if __name__ == "__main__":
    main()
