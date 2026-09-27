// Builds the instruction text sent to the image model.
// The eval uses this exact function too, so what we measure is what the app does.
//
// Lessons from testing (see LEARNING.md):
//  - v1 "show this person at 18" came back looking ~14.
//  - Calling them a "child" anchored the result to childhood.
//  - Negative wording ("no round cheeks") backfired: one result aged to ~55. Image models
//    don't handle "no" well, so every instruction here is positive.
//  - Naming a familiar life stage ("the age of a university student") made the age stable.

export type Sex = "boy" | "girl" | "unspecified";

export type FamilyRef = {
  relation: string; // e.g. "mother", "father", "brother"
  age: number; // approximate age in that photo
};

/** Who the person looks like at the target age, anchored to a familiar life stage. */
function lifeStage(age: number, sex: Sex): string {
  const pick = (boy: string, girl: string, any: string) => (sex === "boy" ? boy : sex === "girl" ? girl : any);
  if (age < 12) return `${age}-year-old ${pick("boy", "girl", "child")}, the age of a primary-school student`;
  if (age < 15) return `${age}-year-old ${pick("boy", "girl", "young teenager")} in early adolescence, the age of a middle-school student`;
  if (age < 18) return `${age}-year-old teenage ${pick("boy", "girl", "person")}, the age of a high-school student`;
  if (age < 23) return `${age}-year-old ${pick("young man", "young woman", "young adult")}, the age of a university student`;
  if (age < 30) return `${age}-year-old ${pick("man", "woman", "adult")} in their twenties`;
  return `${age}-year-old ${pick("man", "woman", "adult")} in their ${Math.floor(age / 10) * 10}s`;
}

/** Plain-language description of how the face has changed by the target age (positive wording only). */
function growthChanges(age: number, sex: Sex): string {
  if (age < 12) {
    return "a slightly longer face with less baby fat, a more defined nose and jaw, and the proportions of an older child";
  }
  if (age < 18) {
    const puberty = sex === "boy" ? "a stronger jaw and nose, thicker eyebrows" : sex === "girl" ? "more defined cheekbones and a slimmer jaw" : "a more defined jaw, nose and cheekbones";
    return `the face of a teenager: a longer, narrower face, ${puberty}, and teenage proportions`;
  }
  const adult = sex === "boy" ? "a longer, narrower face, a strong jaw and nose, thicker eyebrows, possibly light facial hair" : sex === "girl" ? "a longer, slimmer face, defined cheekbones and a slimmer jaw" : "a longer, narrower face with a defined jaw, nose and cheekbones";
  if (age < 30) return `the face of a young adult: ${adult}, adult proportions`;
  return `the face of an adult: ${adult}, with skin and features natural for their age`;
}

export function buildPrompt(opts: {
  photoAge: number;
  targetAge: number;
  sex: Sex;
  family: FamilyRef[];
  extraChildAges?: number[]; // ages in any extra photos of the same child (images 1..n)
  features?: string[]; // distinguishing features confirmed by the family
}): string {
  const { photoAge, targetAge, sex, family, extraChildAges = [], features = [] } = opts;
  const extras = extraChildAges.length;

  const parts = [
    `A realistic passport-style portrait photo of ${/^(8|11|18)/.test(String(targetAge)) ? "an" : "a"} ${lifeStage(targetAge, sex)}.`,
    `This is the same person as in image 0, who was ${photoAge} years old in that photo and has now grown up.`,
  ];
  if (extras > 0) {
    const list = extraChildAges.map((age, i) => `image ${i + 1} at age ${age}`).join(", ");
    parts.push(`More photos of this same person as a child: ${list}. Use all of them to understand their face.`);
  }
  parts.push(
    `Show ${growthChanges(targetAge, sex)}.`,
    `Keep their identity from ${extras > 0 ? `images 0 to ${extras}` : "image 0"}: eye shape, eyebrow shape, nose shape, ears, hairline and skin tone.`,
  );
  if (features.length > 0) {
    parts.push(`Keep these distinguishing features, adjusted naturally for growth: ${features.join("; ")}.`);
  }

  if (family.length > 0) {
    const refs = family
      .map((f, i) => `image ${extras + i + 1} is their biological ${f.relation} at about age ${f.age}`)
      .join("; ");
    parts.push(
      `For reference, ${refs}.`,
      "Use these family members only as a guide to inherited features that appear with age (face shape, nose, jaw, brow). " +
        "The result must still clearly be the person from image 0.",
    );
  }

  parts.push("Neutral expression, front-facing, plain light background, soft even lighting.");
  return parts.join(" ");
}
