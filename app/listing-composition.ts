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
  "none", "n/a", "na", "n a", "null", "nil", "nan", "undefined", "unknown",
  "unspecified", "not applicable", "not specified", "not available",
  "no audience", "no text", "no wording", "none found", "none visible",
  "not determined", "indeterminate", "general", "generic", "everyone",
  "anyone", "various", "miscellaneous", "other", "n/a.", "-", "--", "—", "–",
  "empty", "blank", "tbd", "todo", "no", "false", "not provided",
]);

/**
 * WHETHER A MODEL'S ANSWER IS AN ANSWER.
 *
 * "Gift for none" reached every title in the first real seven-product run: the
 * model, asked for audience cues and finding none in the artwork, answered
 * with the word "none". `filter(Boolean)` catches an empty string and nothing
 * else, and a cue that SAYS it is empty is still a non-empty string.
 *
 * That was one symptom of a general problem, so this is a general rule rather
 * than a patch on titles: a model asked for a field it cannot fill will say so
 * in words, and it will pick different words each time. Absence has to be
 * spelled out — including the bracketed and quoted shapes models reach for.
 */
export const isRealValue = (value: string) => {
  let text = String(value ?? "").trim().toLowerCase();
  /* "[none]", "(n/a)", "\"unknown\"" are the same answer wearing punctuation. */
  text = text.replace(/^[[({<"'`]+|[\])}>"'`]+$/g, "").trim();
  text = text.replace(/[.!?,;:]+$/, "").trim();
  if (!text || text.length < 2) return false;
  if (NON_VALUES.has(text)) return false;

  /*
    THE SAME REFUSAL WITH A TAIL ON IT: "none apparent", "unknown — the design
    carries no text", "not applicable to this design".

    Decided on the FIRST WORD, because a blanket prefix match cannot tell
    "none apparent" from "nostalgic" — an earlier version used one and threw
    both away.

    "no" is the careful case. "no text" is a refusal; "no worries club" is
    somebody's actual design. So a bare "no" only counts as a refusal in the
    exact phrases listed above, and otherwise the value is kept.
  */
  const firstWord = text.split(/[\s,;:]+/)[0];
  const REFUSAL_WORDS = new Set(["none", "na", "n/a", "null", "nil", "nan",
    "undefined", "unknown", "unspecified", "indeterminate", "tbd", "not"]);
  if (REFUSAL_WORDS.has(firstWord)) return false;

  /*
    "no occasion cues", "no readable text", "no recipient identified".

    A bare "no" cannot be judged on its own — "no worries club" is a real
    design — so it counts as a refusal only when what follows names the FIELD
    being asked about. A model declining a field talks about the field; a
    seller's design does not.
  */
  const SCHEMA_WORDS = /\b(cue|cues|text|wording|audience|occasion|occasions|recipient|recipients|subject|subjects|theme|themes|colour|colours|color|colors|typography|composition|tone|value|values|data|information|info|match|matches|result|results|personalization|personalisation|evidence)\b/;
  if (firstWord === "no" && SCHEMA_WORDS.test(text)) return false;
  return true;
};

/** Drop absence-like entries from a list of model-supplied values. */
export const realValues = (values: readonly string[]) =>
  values.filter(value => isRealValue(value)).map(value => String(value).trim());

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
