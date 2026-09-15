/**
 * ONE CANONICAL LIST, THEN ASSIGNMENT AGAINST IT.
 *
 * Three independent batches asked "what niches are here?" would each invent
 * their own vocabulary, and the shop would end up with "Feminist",
 * "Feminism" and "Women's rights" as three categories holding a third of the
 * money each. So the vocabulary is decided ONCE, in one call, and the
 * assignment calls may only choose from it.
 *
 * Every label the model proposes still passes the same gate the deterministic
 * classifier uses. A model is not permitted to name a niche that a human
 * reviewer already decided is not a niche.
 */
import { rejectAsNiche } from "./shop-map-identity.ts";

/*
  The model already metered in this application. The Anthropic adapter is
  kept below, disabled, so it can be switched on without rebuilding anything.
*/
export const CLASSIFIER_MODEL = "google/gemini-2.5-flash";
export const ANTHROPIC_ADAPTER = { model: "claude-haiku-4-5-20251001", enabled: false };
export const MAX_CALLS_PER_BUILD = 4;
export const BATCH_SIZE = 100;
export const MEMBER_DAILY_BUILDS = 1;
export const MEMBER_DAILY_DOLLARS = 0.10;
export const GLOBAL_DAILY_DOLLARS = 1;

export type ListingInput = {
  listingId: number;
  title: string;
  tags: string[];
  shopSection: string;
  wording: string;
};

/** Compact, because the whole shop has to fit in one call. */
export const compact = (listing: ListingInput) =>
  [listing.listingId, listing.title.slice(0, 90),
    listing.tags.slice(0, 8).join(","), listing.shopSection]
    .filter(Boolean).join(" | ");

export const CANONICAL_PROMPT =
  "You are given every listing in one print-on-demand shop: id, title, tags, section.\n"
  + "Return the shop's canonical niche list as JSON: {\"niches\":[\"...\"]}.\n\n"
  + "A niche is the subject, message, interest, identity, occasion or market a group\n"
  + "of listings serves. Several different products can serve one niche.\n\n"
  + "Reject, and never return:\n"
  + "- product or garment types (tees, hoodies, mugs, phone cases, stickers)\n"
  + "- gendered garment groupings (Women's Tees, Men's Apparel)\n"
  + "- generic gift language (For Her, Gifts, Custom)\n"
  + "- incomplete phrase fragments (Women Are)\n"
  + "- duplicate synonyms: choose ONE label per idea\n"
  + "- a niche supported by only one unclear listing\n\n"
  + "Return between 3 and 20 niches, shortest useful label for each.";

export const ASSIGN_PROMPT = (niches: string[]) =>
  "Assign each listing to the shop's niche list. Choose ONLY from this list:\n"
  + niches.map(niche => `- ${niche}`).join("\n")
  + "\n\nReturn JSON: {\"assignments\":[{\"id\":123,\"primary\":\"...\",\"secondary\":\"...\"|null,"
  + "\"confidence\":\"high\"|\"medium\"|\"low\",\"evidence\":\"short quote from its title or tags\"}]}\n\n"
  + "Rules:\n"
  + "- exactly one primary per listing, or null when none of the list fits\n"
  + "- secondary only when the listing genuinely serves two niches\n"
  + "- evidence must be words that actually appear in the listing\n"
  + "- never invent a niche that is not in the list above";

export type CanonicalResult =
  | { ok: true; niches: string[]; rejected: Array<{ label: string; because: string }> }
  | { ok: false; why: string };

/**
 * Read the canonical list, applying the same gate as the deterministic path.
 *
 * A model that returns "Feminist Mugs" is refused exactly as the phrase
 * scanner was, and the refusal is reported rather than silently dropped.
 */
export function parseCanonical(text: string): CanonicalResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, why: "no JSON object" };
  let parsed: { niches?: unknown };
  try { parsed = JSON.parse(text.slice(start, end + 1)) as { niches?: unknown }; }
  catch (error) {
    return { ok: false, why: `unparseable: ${error instanceof Error ? error.message : "unknown"}` };
  }
  if (!Array.isArray(parsed.niches)) return { ok: false, why: "no niches array" };

  const kept: string[] = [];
  const rejected: Array<{ label: string; because: string }> = [];
  const seen = new Set<string>();
  for (const raw of parsed.niches) {
    const label = String(raw ?? "").trim();
    if (!label) continue;
    const because = rejectAsNiche(label);
    if (because) { rejected.push({ label, because }); continue; }
    const key = label.toLowerCase();
    if (seen.has(key)) { rejected.push({ label, because: "duplicate" }); continue; }
    seen.add(key);
    kept.push(label);
  }
  if (kept.length < 2) return { ok: false, why: `only ${kept.length} usable niches` };
  return { ok: true, niches: kept.slice(0, 20), rejected };
}

export type Assigned = {
  listingId: number;
  primary: string;
  secondary: string;
  confidence: string;
  evidence: string;
};

/**
 * Read one assignment batch.
 *
 * A label outside the canonical list is dropped, not adopted: that is the
 * whole point of fixing the vocabulary first. A listing whose evidence does
 * not appear in its own text is dropped too, because an invented quote is
 * the clearest sign the model guessed.
 */
export function parseAssignments(
  text: string, allowed: string[], inputs: Map<number, ListingInput>,
): { assigned: Assigned[]; rejected: Array<{ listingId: number; because: string }> } {
  const assigned: Assigned[] = [];
  const rejected: Array<{ listingId: number; because: string }> = [];
  const permitted = new Map(allowed.map(niche => [niche.toLowerCase(), niche]));

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { assigned, rejected };
  let parsed: { assignments?: unknown };
  try { parsed = JSON.parse(text.slice(start, end + 1)) as { assignments?: unknown }; }
  catch { return { assigned, rejected }; }
  if (!Array.isArray(parsed.assignments)) return { assigned, rejected };

  for (const row of parsed.assignments as Array<Record<string, unknown>>) {
    const listingId = Number(row.id ?? 0);
    if (!listingId) continue;
    const primary = permitted.get(String(row.primary ?? "").trim().toLowerCase()) ?? "";
    if (!primary) { rejected.push({ listingId, because: "primary not in the canonical list" }); continue; }
    const secondaryRaw = String(row.secondary ?? "").trim().toLowerCase();
    const secondary = secondaryRaw && secondaryRaw !== primary.toLowerCase()
      ? permitted.get(secondaryRaw) ?? "" : "";

    const evidence = String(row.evidence ?? "").trim();
    const input = inputs.get(listingId);
    const haystack = input
      ? `${input.title} ${input.tags.join(" ")} ${input.shopSection} ${input.wording}`.toLowerCase()
      : "";
    /* An invented quote is the clearest sign the model guessed. */
    const firstWord = evidence.toLowerCase().split(/\s+/)[0] ?? "";
    if (evidence && firstWord && haystack && !haystack.includes(firstWord)) {
      rejected.push({ listingId, because: "evidence does not appear in the listing" });
      continue;
    }

    assigned.push({ listingId, primary, secondary,
      confidence: String(row.confidence ?? "").toLowerCase() || "unknown", evidence });
  }
  return { assigned, rejected };
}

/*
  RESERVE THE WHOLE MEMBER CEILING UNTIL GEMINI IS MEASURED.

  fal reports its charge after the fact, so the honest reservation before a
  first run is the most it could cost: the entire $0.10. It is reconciled
  against the provider's own figure the moment the build finishes, and the
  estimate below only decides whether a build is worth starting.
*/
export const CONSERVATIVE_RESERVATION = MEMBER_DAILY_DOLLARS;

/** Tokens in, tokens out. Sized on Haiku rates as an upper bound. */
export function estimateCost(listings: number) {
  const perListing = 22;
  const canonicalIn = 700 + listings * perListing;
  const canonicalOut = 200;
  const batches = Math.ceil(listings / BATCH_SIZE);
  const assignIn = batches * (400 + BATCH_SIZE * perListing);
  const assignOut = batches * BATCH_SIZE * 28;
  const dollars = (input: number, output: number) => input / 1e6 + output * 5 / 1e6;
  return {
    calls: 1 + batches,
    inputTokens: canonicalIn + assignIn,
    outputTokens: canonicalOut + assignOut,
    dollars: Number((dollars(canonicalIn, canonicalOut) + dollars(assignIn, assignOut)).toFixed(4)),
  };
}
