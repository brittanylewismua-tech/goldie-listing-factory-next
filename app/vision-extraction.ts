/**
 * ONE VISION CALL PER SCAN. THE CODE, NOT THE INTENTION, ENFORCES IT.
 *
 * The cost model holds only while the fan-out stays at one. A pairwise pass
 * over the reference cohort would multiply the bill by the size of the cohort
 * and would not be noticed until the invoice arrived, so the single call is a
 * structural property of this module: nothing here accepts a reference image,
 * and the only repeat call allowed is a retry of a first response that was
 * unusable.
 *
 * Every call records what it was actually billed. Token formulas are an
 * estimate; the usage block returned by the provider is the fact.
 */
export const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

/* Anthropic's published rates, in dollars per million tokens. Batch halves
   both. Kept beside the arithmetic so a price change is one edit. */
export const RATES = { input: 1, output: 5, cacheWrite1h: 2, cacheRead: 0.1 } as const;

export type Usage = {
  input_tokens?: number; output_tokens?: number;
  cache_read_input_tokens?: number; cache_creation_input_tokens?: number;
};

/** What the provider says it billed, priced. */
export function costOf(usage: Usage, { batch = false }: { batch?: boolean } = {}): number {
  const discount = batch ? 0.5 : 1;
  const million = 1_000_000;
  return discount * (
    (usage.input_tokens ?? 0) * RATES.input / million
    + (usage.output_tokens ?? 0) * RATES.output / million
    + (usage.cache_read_input_tokens ?? 0) * RATES.cacheRead / million
    + (usage.cache_creation_input_tokens ?? 0) * RATES.cacheWrite1h / million
  );
}

export const CEILING_PER_SCAN = 0.01;

export type ExtractedDesign = {
  wording: string[];
  typographyCategory: string;
  layout: string;
  illustrationCategory: string;
  textToArtRatio: number;
  dominantColors: string[];
  compositionDensity: string;
  printAreaCoverage: number;
  thumbnailReadability: string;
};

const FIELDS: Array<keyof ExtractedDesign> = [
  "wording", "typographyCategory", "layout", "illustrationCategory", "textToArtRatio",
  "dominantColors", "compositionDensity", "printAreaCoverage", "thumbnailReadability",
];

/**
 * Accept only a response that carries every field in the right shape.
 *
 * A half-filled object is worse than no object: it would be stored, compared
 * against, and shown to a member as though it were measured.
 */
export function parseExtraction(text: string): { ok: true; design: ExtractedDesign } | { ok: false; why: string } {
  let parsed: unknown;
  /* Models sometimes wrap JSON in prose or a fence even when told not to. */
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, why: "no JSON object in the response" };
  try { parsed = JSON.parse(text.slice(start, end + 1)); }
  catch (error) { return { ok: false, why: `unparseable JSON: ${error instanceof Error ? error.message : "unknown"}` }; }
  if (typeof parsed !== "object" || !parsed) return { ok: false, why: "JSON was not an object" };
  const record = parsed as Record<string, unknown>;

  const missing = FIELDS.filter(field => record[field] === undefined || record[field] === null);
  if (missing.length) return { ok: false, why: `missing fields: ${missing.join(", ")}` };
  if (!Array.isArray(record.wording)) return { ok: false, why: "wording was not an array" };
  if (!Array.isArray(record.dominantColors)) return { ok: false, why: "dominantColors was not an array" };
  for (const field of ["textToArtRatio", "printAreaCoverage"] as const) {
    const value = Number(record[field]);
    if (!Number.isFinite(value) || value < 0 || value > 1)
      return { ok: false, why: `${field} was not a fraction between 0 and 1` };
  }

  return {
    ok: true,
    design: {
      wording: (record.wording as unknown[]).map(String),
      typographyCategory: String(record.typographyCategory),
      layout: String(record.layout),
      illustrationCategory: String(record.illustrationCategory),
      textToArtRatio: Number(record.textToArtRatio),
      dominantColors: (record.dominantColors as unknown[]).map(String),
      compositionDensity: String(record.compositionDensity),
      printAreaCoverage: Number(record.printAreaCoverage),
      thumbnailReadability: String(record.thumbnailReadability),
    },
  };
}

/**
 * THE ONLY REPEAT CALL THAT EXISTS.
 *
 * One retry, and only when the first response could not be parsed into a
 * complete record. Never a second opinion, never a harder look, never a
 * comparison against a reference — each of those is a per-reference call
 * wearing a different name.
 */
export const MAX_ATTEMPTS = 2;

export type CallOutcome = {
  attempts: number;
  billedCost: number;
  usage: Usage;
  milliseconds: number;
  validJson: boolean;
  design: ExtractedDesign | null;
  failure: string;
};

export type Caller = (attempt: number) => Promise<{ text: string; usage: Usage } | { error: string }>;

export async function extractOnce(call: Caller): Promise<CallOutcome> {
  const began = Date.now();
  const total: Usage = {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
  };
  let failure = "";
  let validJson = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const answer = await call(attempt);
    if ("error" in answer) { failure = answer.error; continue; }
    /* A retry is still billed, so both attempts are added up. */
    total.input_tokens = (total.input_tokens ?? 0) + (answer.usage.input_tokens ?? 0);
    total.output_tokens = (total.output_tokens ?? 0) + (answer.usage.output_tokens ?? 0);
    total.cache_read_input_tokens =
      (total.cache_read_input_tokens ?? 0) + (answer.usage.cache_read_input_tokens ?? 0);
    total.cache_creation_input_tokens =
      (total.cache_creation_input_tokens ?? 0) + (answer.usage.cache_creation_input_tokens ?? 0);

    const parsed = parseExtraction(answer.text);
    if (parsed.ok) {
      validJson = true;
      return {
        attempts: attempt, billedCost: costOf(total), usage: total,
        milliseconds: Date.now() - began, validJson, design: parsed.design, failure: "",
      };
    }
    failure = parsed.why;
  }

  return {
    attempts: MAX_ATTEMPTS, billedCost: costOf(total), usage: total,
    milliseconds: Date.now() - began, validJson, design: null, failure,
  };
}
