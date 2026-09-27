// Lets developers test without spending the free daily AI allowance. Set AI_MODE in .env.local:
//   AI_MODE=mock   no AI calls at all: returns the uploaded photo as the "result" (0 neurons)
//   AI_MODE=cheap  real AI, but 1 variation at 512px instead of 3 at 768px (~7x less)
//   (unset)        full mode: what families and judges get
export type AiMode = "mock" | "cheap" | "full";

export function aiMode(): AiMode {
  const mode = process.env.AI_MODE;
  return mode === "mock" || mode === "cheap" ? mode : "full";
}
