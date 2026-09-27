"""Step 1 of the eval: choose test pairs from FG-NET.

A "pair" is one person's childhood photo (age 12 or under) plus a later photo of the
same person. We ask the app's pipeline to age the young photo to the later age, then
check how close the result is to the real later photo.

Rules (so the test is fair and repeatable):
- one pair per person, so no single face counts twice
- an equal number of pairs in each age-gap group: under 5, 5-10, over 10 years
  (same groups as the app's confidence note, see src/lib/confidence.ts)
- a fixed random seed, so running this again picks the same pairs

Sex: FG-NET has no sex labels, but the app asks for it (families know it). We estimate it
with InsightFace's gender model on the person's LATER photo, where it is most reliable.

Usage:  eval/.venv/Scripts/python eval/select_pairs.py
Output: eval/pairs.csv
"""

import csv
import random
import re
from collections import defaultdict
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "data" / "FGNET" / "images"
OUT = ROOT / "eval" / "pairs.csv"

PAIRS_PER_BUCKET = 14  # 3 buckets x 14 = 42 pairs
MAX_CHILD_AGE = 12
SEED = 42


def bucket(gap: int) -> str:
    if gap < 5:
        return "under5"
    if gap <= 10:
        return "5to10"
    return "over10"


def load_photos() -> dict[str, list[tuple[int, str]]]:
    """FG-NET file names look like 001A05.JPG = person 001 at age 5 (sometimes 043A43a.JPG)."""
    people = defaultdict(list)
    for f in sorted(IMAGES.iterdir()):
        m = re.match(r"(\d{3})A(\d{2})[a-z]?\.JPG$", f.name, re.IGNORECASE)
        if m:
            people[m.group(1)].append((int(m.group(2)), f.name))
    return people


def main() -> None:
    rng = random.Random(SEED)
    people = load_photos()
    ids = sorted(people)
    rng.shuffle(ids)

    counts = {"under5": 0, "5to10": 0, "over10": 0}
    chosen = []
    for pid in ids:
        photos = people[pid]
        # every (young, later) combination this person could provide, grouped by gap
        options = defaultdict(list)
        for young_age, young_file in photos:
            if young_age > MAX_CHILD_AGE:
                continue
            for old_age, old_file in photos:
                if old_age > young_age:
                    options[bucket(old_age - young_age)].append((young_age, young_file, old_age, old_file))
        # give this person to the emptiest group they can fill
        open_buckets = [b for b in options if counts[b] < PAIRS_PER_BUCKET]
        if not open_buckets:
            continue
        b = min(open_buckets, key=lambda k: (counts[k], k))
        young_age, young_file, old_age, old_file = rng.choice(sorted(options[b]))
        chosen.append({"person": pid, "bucket": b, "young_age": young_age, "young_file": young_file,
                       "old_age": old_age, "old_file": old_file, "gap": old_age - young_age})
        counts[b] += 1

    # estimate sex from the later photo
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "genderage"], providers=["CPUExecutionProvider"])
    # FG-NET photos are tightly cropped faces; at 640px the enlarged face was too big to detect
    app.prepare(ctx_id=-1, det_size=(320, 320))
    for row in chosen:
        faces = app.get(cv2.imread(str(IMAGES / row["old_file"])))
        if faces:
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            row["sex"] = "boy" if face.sex == "M" else "girl"
        else:
            row["sex"] = "unspecified"

    chosen.sort(key=lambda r: (r["bucket"], r["person"]))
    for i, row in enumerate(chosen):
        row["pair_id"] = f"p{i:02d}"
    fields = ["pair_id", "person", "bucket", "gap", "young_age", "young_file", "old_age", "old_file", "sex"]
    with OUT.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(chosen)

    print(f"Wrote {len(chosen)} pairs to {OUT.relative_to(ROOT)}: {counts}")


if __name__ == "__main__":
    main()
