"""Experiment: is the face SHAPE ("skeleton") the part that goes wrong?

Idea (from the owner): read the child's facial structure, grow it into an adult structure,
then build the image from that. Before paying for any images, this script checks, for free:

  1. How much does face shape change from the childhood photo to the real later photo?
  2. Can an "average growth" model predict the later shape better than the child's shape?
  3. Do the AI images we already made (FLUX, Nano Banana 2) already have the right shape?

Shape = 68 face landmarks (jaw line, brows, eyes, nose, mouth) from InsightFace, used for every
image so all shapes come from the same detector. Two shapes are compared after removing position,
size and rotation (Procrustes alignment); "shape error" is the remaining average distance between
matching points, as a % of face size. Lower = closer to the real later face.

The growth model is learned ONLY from FG-NET people who are not in the 42-person test or the
5-person dev set: for each age, the average face shape; predicted shape = child's shape +
(average shape at target age - average shape at photo age).

Usage:  eval/.venv/Scripts/python eval/shape_check.py
Output: eval/outputs/shape_check.json, eval/outputs/landmarks.json (cache)
"""

import csv
import json
import re
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FGNET = ROOT / "data" / "FGNET" / "images"
OUT = ROOT / "eval" / "outputs"
CACHE = OUT / "landmarks.json"
DEV_PEOPLE = {"038", "049", "001", "036", "042"}


def load_detector():
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "landmark_3d_68"],
                       providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(320, 320))  # same as score.py: FG-NET faces are tightly cropped
    return app


def landmarks(app, cache, path: Path):
    key = str(path.relative_to(ROOT)).replace("\\", "/")
    if key not in cache:
        img = cv2.imread(str(path))
        faces = app.get(img) if img is not None else []
        if faces:
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            cache[key] = face.landmark_3d_68[:, :2].round(2).tolist()
        else:
            cache[key] = None
    return None if cache[key] is None else np.array(cache[key])


def normalise(shape):
    """Remove position and size: centre on 0, total size 1."""
    s = shape - shape.mean(axis=0)
    return s / np.linalg.norm(s)


def align(shape, target):
    """Rotate normalised `shape` to best match normalised `target` (no mirroring)."""
    u, _, vt = np.linalg.svd(shape.T @ target)
    d = np.sign(np.linalg.det(u @ vt))
    r = u @ np.diag([1, d]) @ vt
    return shape @ r


def shape_error(a, b):
    """Average point distance after alignment, as % of face size (lower = more alike)."""
    a, b = normalise(a), normalise(b)
    a = align(a, b)
    # scale so the error reads as % of the face's average distance from its centre
    return float(np.sqrt(((a - b) ** 2).sum(axis=1)).mean() / np.sqrt((b ** 2).sum(axis=1)).mean() * 100)


def growth_model(train):
    """train: list of (age, shape). Returns mean_shape(age) in a common aligned frame."""
    shapes = [normalise(s) for _, s in train]
    ages = np.array([a for a, _ in train])
    ref = shapes[0]
    for _ in range(5):  # generalised Procrustes: align everyone to the running mean
        aligned = np.array([align(s, ref) for s in shapes])
        ref = normalise(aligned.mean(axis=0))

    def mean_at(age):
        for width in (1, 2, 3, 5, 8, 12):
            pick = np.abs(ages - age) <= width
            if pick.sum() >= 15:
                break
        return aligned[pick].mean(axis=0)

    return ref, mean_at


def bootstrap_ci(diffs, n=5000, seed=0):
    rng = np.random.default_rng(seed)
    diffs = np.asarray(diffs)
    means = rng.choice(diffs, size=(n, len(diffs))).mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def main():
    app = load_detector()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    pairs = list(csv.DictReader(open(ROOT / "eval" / "pairs.csv", encoding="utf8")))
    test_people = {p["person"] for p in pairs}

    # 1. growth model from everyone else
    train = []
    for f in sorted(FGNET.iterdir()):
        m = re.match(r"^(\d{3})A(\d{2})", f.name, re.I)
        if not m or m.group(1) in test_people or m.group(1) in DEV_PEOPLE:
            continue
        s = landmarks(app, cache, f)
        if s is not None:
            train.append((int(m.group(2)), s))
    CACHE.write_text(json.dumps(cache))
    ref, mean_at = growth_model(train)
    all_people = {f.name[:3] for f in FGNET.iterdir() if re.match(r"^\d{3}A", f.name, re.I)}
    print(f"growth model learned from {len(train)} photos of {len(all_people - test_people - DEV_PEOPLE)} other people")

    def predict(child, photo_age, target_age):
        c = align(normalise(child), ref)
        return c + (mean_at(target_age) - mean_at(photo_age))

    # 2. compare, per test person
    rows = []
    for p in pairs:
        child = landmarks(app, cache, FGNET / p["young_file"])
        adult = landmarks(app, cache, FGNET / p["old_file"])
        flux = landmarks(app, cache, OUT / "images" / f"{p['pair_id']}_v0.jpg")
        nb2 = landmarks(app, cache, OUT / "images_nb2" / f"{p['pair_id']}_v0.jpg")
        if child is None or adult is None:
            continue
        ya, oa = int(p["young_age"]), int(p["old_age"])
        rows.append({
            "pair_id": p["pair_id"], "bucket": p["bucket"], "young_age": ya, "old_age": oa,
            "child_shape": shape_error(child, adult),
            "average_adult_shape": shape_error(mean_at(oa), adult),
            "grown_child_shape": shape_error(predict(child, ya, oa), adult),
            "flux": shape_error(flux, adult) if flux is not None else None,
            "nb2": shape_error(nb2, adult) if nb2 is not None else None,
        })
    CACHE.write_text(json.dumps(cache))

    def summary(key, base="child_shape"):
        r = [x for x in rows if x[key] is not None]
        d = [x[key] - x[base] for x in r]
        return {"n": len(r), "mean_error": round(float(np.mean([x[key] for x in r])), 2),
                f"change_vs_{base}": round(float(np.mean(d)), 2),
                "ci95": [round(v, 2) for v in bootstrap_ci(d)],
                "better_for": f"{sum(v < 0 for v in d)}/{len(d)}"}

    result = {
        "people": len(rows),
        "child_shape": summary("child_shape"),
        "average_adult_shape": summary("average_adult_shape"),
        "grown_child_shape": summary("grown_child_shape"),
        "flux": summary("flux"),
        "nb2": summary("nb2"),
        "nb2_vs_grown": summary("nb2", "grown_child_shape"),
        "rows": rows,
    }
    (OUT / "shape_check.json").write_text(json.dumps(result, indent=2))
    for k in ("child_shape", "average_adult_shape", "grown_child_shape", "flux", "nb2", "nb2_vs_grown"):
        print(k, json.dumps(result[k]))
    by = {}
    for x in rows:
        by.setdefault(x["bucket"], []).append(x)
    for b, xs in by.items():
        print(b, len(xs), {k: round(float(np.mean([x[k] for x in xs if x[k] is not None])), 2)
                           for k in ("child_shape", "average_adult_shape", "grown_child_shape", "flux", "nb2")})


if __name__ == "__main__":
    main()
