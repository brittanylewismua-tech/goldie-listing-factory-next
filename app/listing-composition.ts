/**
 * TITLES AND TAGS ARE COMPOSED, NOT GENERATED.
 *
 * The wording is already transcribed and the cues already extracted, so
 * assembling them with the product noun is string work: no model, no image,
 * no call, and the same input always gives the same output.
 *
 * THIS LIVED INSIDE THE DRY-RUN ROUTE. Which meant the production path would
 * have had to compose titles its own way — a second implementation of the
 * one thing the member reads first, free to drift from the version that was
 * audited. That is the same mistake as the two rails and the two `who_made`
 * answers, so it is one module before there is a second caller rather than
 * after.
 */

/** Etsy's hard limits, stated once. */
export const TITLE_LIMIT = 140;
export const TAG_LIMIT = 13;
export const TAG_CHARACTER_LIMIT = 20;

/**
 * "GIFT FOR NONE."
 *
 * A model asked for audience cues and finding none in the artwork answered
 * with the word "none" — which is a correct answer to the question and a
 * broken Etsy title. Every listing in the first real seven-product run read
 * "…, T-shirt, Gift for none".
 *
 * `filter(Boolean)` catches an empty string and nothing else. A cue that SAYS
 * it is empty is still a non-empty string, so the absence has to be spelled
 * out rather than assumed to arrive as "".
 */
const NON_VALUES = new Set([
  "none", "n/a", "na", "null", "nil", "unknown", "unspecified", "not applicable",
  "no audience", "general", "everyone", "anyone", "various", "n/a.", "-", "—",
]);

export const isRealValue = (value: string) => {
  const clean = String(value ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  return clean.length > 1 && !NON_VALUES.has(clean);
};

export function composeTitle(
  wording: string[], noun: string, audience: string[],
): string {
  const phrase = wording.filter(isRealValue).slice(0, 2).join(" ");
  const who = audience.filter(isRealValue)[0] ?? "";
  const parts = [phrase, noun ? `${noun[0].toUpperCase()}${noun.slice(1)}` : "",
    who ? `Gift for ${who}` : ""].filter(Boolean);
  return parts.join(", ").slice(0, TITLE_LIMIT);
}

export function composeTags(
  wording: string[], family: string, occasions: string[], recipients: string[],
): string[] {
  const raw = [...wording, family, ...occasions, ...recipients]
    .map(value => String(value ?? "").toLowerCase().trim())
    /* Same rule as the title: a tag that says "none" is not a tag. */
    .filter(value => isRealValue(value) && value.length <= TAG_CHARACTER_LIMIT);
  return [...new Set(raw)].slice(0, TAG_LIMIT);
}
