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

export function composeTitle(
  wording: string[], noun: string, audience: string[],
): string {
  const phrase = wording.filter(Boolean).slice(0, 2).join(" ");
  const who = audience.filter(Boolean)[0] ?? "";
  const parts = [phrase, noun ? `${noun[0].toUpperCase()}${noun.slice(1)}` : "",
    who ? `Gift for ${who}` : ""].filter(Boolean);
  return parts.join(", ").slice(0, TITLE_LIMIT);
}

export function composeTags(
  wording: string[], family: string, occasions: string[], recipients: string[],
): string[] {
  const raw = [...wording, family, ...occasions, ...recipients]
    .map(value => String(value ?? "").toLowerCase().trim())
    .filter(value => value.length > 1 && value.length <= TAG_CHARACTER_LIMIT);
  return [...new Set(raw)].slice(0, TAG_LIMIT);
}
