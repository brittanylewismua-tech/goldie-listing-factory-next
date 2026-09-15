/**
 * ONE TEXT CALL FOR EVERY FAMILY AT ONCE.
 *
 * Five families meant five calls, which is five prompts carrying the same
 * design intelligence and five sets of output tokens to say much the same
 * thing in five product nouns. The design is identical in all of them, so
 * the model is asked once and answers per family.
 *
 * NO PER-FAMILY RETRY. Retrying one family individually would quietly
 * reintroduce the fan-out this exists to remove — five failures would become
 * five extra calls. A family missing from the response falls back to
 * deterministic copy and the failure is recorded.
 */
export const COPY_PROMPT_VERSION = 1;
export const COPY_MODEL_VERSION = "google/gemini-2.5-flash";

export type FamilyCopy = { blurb: string; optionalFields: Record<string, string> };
export type CopyResult = {
  copy: Record<string, FamilyCopy>;
  fellBack: string[];
  invalid: string[];
};

/**
 * The cache identity.
 *
 * Sorted, because a set of families has no order and {tee,mug} must not be a
 * different cache entry from {mug,tee}. Carries the design-intelligence
 * version, so re-extracting a design invalidates its copy rather than
 * leaving new facts described by old wording.
 */
export function familyCopyKey(
  { userId, artworkHash, designVersion, families }:
  { userId: string; artworkHash: string; designVersion: string; families: string[] },
) {
  return [userId, artworkHash, designVersion, [...families].sort().join("+"),
    `copy${COPY_PROMPT_VERSION}`, COPY_MODEL_VERSION].join("|");
}

/**
 * Ask only for what is missing.
 *
 * Three families cached and two new ones appearing later is one call for the
 * two, not a fresh call for all five.
 */
export const missingFamilies = (wanted: string[], cached: Iterable<string>) => {
  const held = new Set(cached);
  return [...new Set(wanted)].filter(family => !held.has(family)).sort();
};

/* Deterministic copy, used when the model omits a family or returns rubbish
   for it. Plain, correct, and never a guess about the product. */
export function fallbackCopy(
  family: string, objectType: string, wording: string[],
): FamilyCopy {
  const line = wording.find(entry => entry.trim().length > 0) ?? "";
  const blurb = line
    ? `${line} printed on a ${objectType}. Made to order.`
    : `Original design printed on a ${objectType}. Made to order.`;
  /* No optional fields invented: an empty set is honest, a guessed holiday
     is not. */
  return { blurb, optionalFields: {} };
}

/**
 * Read a batched response keyed by family.
 *
 * Each family is validated on its own, so one bad entry costs that family
 * its copy rather than costing the whole batch.
 */
export function parseFamilyCopy(
  text: string, wanted: string[],
  fallback: (family: string) => FamilyCopy,
): CopyResult {
  const copy: Record<string, FamilyCopy> = {};
  const fellBack: string[] = [];
  const invalid: string[] = [];

  let parsed: Record<string, unknown> = {};
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; }
    catch { /* every family falls back below */ }
  }

  for (const family of wanted) {
    const entry = parsed[family] as { blurb?: unknown; optionalFields?: unknown } | undefined;
    const blurb = typeof entry?.blurb === "string" ? entry.blurb.trim() : "";
    if (!blurb) {
      if (entry !== undefined) invalid.push(family);
      fellBack.push(family);
      copy[family] = fallback(family);
      continue;
    }
    const optional = entry?.optionalFields;
    copy[family] = {
      blurb,
      optionalFields: optional && typeof optional === "object" && !Array.isArray(optional)
        ? Object.fromEntries(Object.entries(optional as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([key, value]) => [key, String(value).trim()]))
        : {},
    };
  }

  return { copy, fellBack, invalid };
}
