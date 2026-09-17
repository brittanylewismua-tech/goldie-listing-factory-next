/**
 * WHY ONE LISTING SITS WHERE IT SITS.
 *
 * A member can already correct a placement. Correcting something you cannot
 * see the reason for is guesswork, so this turns the stored reason into a
 * sentence a shop owner would write — and refuses to pass anything through
 * that reads like machinery.
 *
 * The reason is model prose. It is stored to explain an assignment, not to be
 * read by the person who owns the shop, so its wording is not under our
 * control: it can arrive as a confidence note, as JSON, as a list of raw
 * labels, or as a sentence about tokens. None of that may reach the page.
 *
 * So the rule here is one-way. Prose that passes every check is shown as
 * written, because a real reason is more use than a generic one. Anything
 * else is replaced — never edited, never partially quoted, never summarised.
 * A rewritten reason would be our sentence presented as the reason the
 * listing was placed, which is worse than saying plainly how placement works.
 */

/** Words that only appear when the machinery is showing through. */
const MACHINERY = [
  "classif", "confidence", "canonical", "primary_niche", "secondary",
  "model", "prompt", "token", "json", "schema", "vector", "embedding",
  "score", "probability", "weight", "threshold", "heuristic", "regex",
  "llm", "gpt", "openai", "openrouter", "anthropic", "claude", "vision",
  "assistant", "inference", "training", "dataset", "output",
  "batch", "parse", "null", "undefined", "api",
];

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/**
 * The stored reason is a QUOTE, not a sentence.
 *
 * D1682 tested it for the shape of prose — four words, a full stop — and
 * replaced all 256 of them, so every member got the general explanation and
 * nobody ever saw a real reason. The classifier is asked for "a short quote
 * from its title or tags", and a fragment like "feminist slogan tee" is
 * exactly what it stores. The earlier check was measuring the wrong thing.
 *
 * So the test is the one the quote can actually fail: are these the member's
 * own words? Every word must appear in the listing's own title or tags. A
 * quote that passes carries no machinery by construction — it is the
 * member's writing handed back to them — and one that does not is a
 * paraphrase or an invention, which is worth nothing as a reason.
 */
export function quoteIsFromTheListing(
  quote: string, title: string, tags: string,
): boolean {
  const quoted = words(quote);
  if (!quoted.length || quoted.length > 12) return false;
  if (quote.trim().length > 120) return false;
  const lower = quote.toLowerCase();
  if (MACHINERY.some(word => lower.includes(word))) return false;
  const own = new Set(words(`${title} ${tags}`));
  return quoted.every(word => own.has(word));
}

/**
 * The sentence shown when the stored reason cannot be shown. It describes how
 * placement happens rather than claiming a reason for this listing, because
 * the reason for this listing is exactly what we do not have in usable form.
 */
export const GENERIC_REASON =
  "This listing was placed automatically from its own title, tags and "
  + "description. If that is wrong, move it below — nothing else about the "
  + "listing changes.";

/** The quote is the member's own words; the sentence around it is ours. */
export const reasonFromQuote = (quote: string, nicheLabel: string) =>
  `Placed in ${nicheLabel} because its listing says “${quote.trim()}”.`;

export const CORRECTED_REASON =
  "You moved this listing here yourself, so it stays where you put it. "
  + "Rebuilding the map will not move it back.";

export const UNPLACED_REASON =
  "This listing is not in a niche yet. That happens when its title, tags and "
  + "description do not clearly match one of your niches. Putting it in the "
  + "right one below will fold its orders and revenue into that niche.";

export type Placement = {
  listingId: number;
  title: string;
  nicheId: string;
  nicheLabel: string;
  corrected: boolean;
  why: string;
};

export function describePlacement(
  { listingId, title, tags, nicheId, nicheLabel, corrected, storedReason }: {
    listingId: number; title: string; tags?: string; nicheId: string;
    nicheLabel: string; corrected: boolean; storedReason: string;
  },
): Placement {
  const placed = Boolean(nicheId) && nicheId !== "unclassified";
  const why = corrected ? CORRECTED_REASON
    : !placed ? UNPLACED_REASON
    : quoteIsFromTheListing(storedReason, title, tags ?? "")
      ? reasonFromQuote(storedReason, nicheLabel)
    : GENERIC_REASON;
  return {
    listingId, title,
    nicheId: placed ? nicheId : "unclassified",
    nicheLabel: placed ? nicheLabel : "Unclassified",
    corrected, why,
  };
}
