/**
 * WHAT A REFERENCE DESIGN IS MADE OF — NEVER WHAT IT SAYS.
 *
 * This is the only place a reference image is looked at, and the schema below
 * is the whole of what may survive the looking. There is no field for wording,
 * slogan, phrase, character or motif, because a comparison that could reach
 * those could recommend them, and "here is what the listing that outsold you
 * says on it" is the feature this product must never become.
 *
 * So the model is asked for STRATEGY: how loud the type is, how the frame is
 * used, whether it survives a thumbnail. Those describe how a design works
 * without describing what it is of.
 *
 * ONE ANALYSIS PER IMAGE IDENTITY PER VERSION. Keyed on the Etsy image id and
 * the analysis version, never on the listing — a listing that swaps its photo
 * is a new image and a new analysis; a version bump writes a new row and keeps
 * the old one so an earlier comparison stays explainable.
 */
export const ANALYSIS_VERSION = 1;
export const ANALYSIS_MODEL = "google/gemini-2.5-flash";

export const INGREDIENT_FIELDS = [
  "typography", "textHierarchy", "composition", "illustration", "textToArt",
  "colorStrategy", "contrast", "density", "printCoverage",
  "thumbnailReadability", "mechanism", "wordCount",
] as const;

export const ANALYSIS_PROMPT = `You are describing the CONSTRUCTION of a print-on-demand design.

Return ONLY a JSON object with exactly these keys:
{"typography":"","textHierarchy":"","composition":"","illustration":"","textToArt":0,
 "colorStrategy":"","contrast":"","density":"","printCoverage":0,
 "thumbnailReadability":"","mechanism":"","wordCount":0}

typography: one of bold sans, condensed sans, script, serif, handwritten, distressed, mixed, none
textHierarchy: one of single line, stacked emphasis, headline and subline, wrapped block, none
composition: one of centered, stacked, circular, arched, asymmetric, full bleed
illustration: one of none, icon, line art, filled shape, detailed illustration, photographic
textToArt: number 0 to 1, share of the design that is type rather than art
colorStrategy: one of one colour, two colour, limited palette, full colour, gradient
contrast: one of high, medium, low
density: one of sparse, medium, dense
printCoverage: number 0 to 1, share of the printable area the design occupies
thumbnailReadability: one of readable, tight, crowded, illegible
mechanism: one of bold slogan, emblem, mascot, distressed type, minimal icon, illustrated scene, pattern
wordCount: how many words of text appear, as a number

RULES:
- Do NOT return the words, phrases, names or subject matter of the design.
- wordCount is a COUNT. Never include the words themselves.
- Describe only how it is built.
- Return the JSON object and nothing else.`;

export type Ingredients = {
  typography: string; textHierarchy: string; composition: string;
  illustration: string; textToArt: number; colorStrategy: string;
  contrast: string; density: string; printCoverage: number;
  thumbnailReadability: string; mechanism: string; wordCount: number;
};

/*
  Anything that would carry content rather than construction. A model that
  volunteers a slogan under a key we did not ask for must not have it stored,
  so parsing keeps ONLY the declared fields and drops everything else.
*/
const NUMERIC = new Set(["textToArt", "printCoverage", "wordCount"]);

export function parseAnalysis(
  text: string,
): { ok: true; ingredients: Ingredients } | { ok: false; why: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, why: "no JSON object in the response" };
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; }
  catch { return { ok: false, why: "the JSON object did not parse" }; }

  const ingredients = {} as Record<string, string | number>;
  for (const field of INGREDIENT_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null)
      return { ok: false, why: `missing field: ${field}` };
    if (NUMERIC.has(field)) {
      const number = Number(value);
      if (!Number.isFinite(number)) return { ok: false, why: `${field} is not a number` };
      ingredients[field] = field === "wordCount"
        ? Math.max(0, Math.round(number))
        : Math.min(1, Math.max(0, number));
    } else {
      const word = String(value).toLowerCase().trim();
      if (!word) return { ok: false, why: `${field} is empty` };
      /* A descriptor long enough to be a sentence is a description of the
         picture, not a category. */
      if (word.length > 40) return { ok: false, why: `${field} is prose, not a category` };
      ingredients[field] = word;
    }
  }
  return { ok: true, ingredients: ingredients as unknown as Ingredients };
}

/** Per-image ceiling for the reference workload, from the approved registry. */
export const REFERENCE_DAILY_IMAGES = 100;
export const REFERENCE_DAILY_DOLLARS = 0.25;
