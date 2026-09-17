import { wordsOf } from "./niche-cohort.ts";

/**
 * IS THIS DESIGN EVEN ABOUT THIS NICHE?
 *
 * Measured against production: a design reading "Vintage Tractor Parts Since
 * 1947", scanned against "bachelorette", produced output byte-for-byte
 * identical to a design reading "Bride Squad Bachelorette Party" — the same
 * verdict, the same scope sentence, the same supporting points.
 *
 * Nothing was malfunctioning. The scanner compares how a design is BUILT:
 * bold slogan, thumbnail readability, contrast against the listings with
 * verified momentum. Both of those designs are built identically, so both
 * genuinely do align. The comparison was correct and the CONCLUSION a member
 * would draw from it was not, because the page says the design "shares
 * several visual construction patterns with listings currently showing
 * verified momentum in this niche" — which reads as "this fits the niche".
 *
 * A seller does not scan a design to learn about typography. They scan it to
 * find out whether it will sell into that niche, and a confident-sounding
 * answer to a question that was never asked is worse than no answer.
 *
 * So subject is checked separately from construction, and the two are never
 * allowed to be mistaken for each other.
 */
export type Relevance =
  | { verdict: "on-subject"; matched: string[]; because: string }
  | { verdict: "off-subject"; matched: string[]; because: string }
  | { verdict: "unreadable"; matched: never[]; because: string };

/**
 * Compare the design's own words against the niche's.
 *
 * Deliberately generous: ANY niche term appearing in the design's wording is
 * enough. This is not the cohort-building rule, which requires every term —
 * that one decides which listings to compare against and has to be strict.
 * This one only asks whether the member's design is plausibly about the
 * subject at all, and calling a real design off-subject is the expensive
 * mistake here.
 */
export function relevanceOf(
  visibleWording: string, nicheTerms: string[],
): Relevance {
  const text = String(visibleWording ?? "").trim();
  if (!text)
    return { verdict: "unreadable", matched: [],
      because: "This design has no readable words, so there is no way to tell "
        + "from the artwork alone whether it is about this niche." };
  if (!nicheTerms.length)
    return { verdict: "unreadable", matched: [],
      because: "This niche phrase carried no usable terms to check against." };

  const words = wordsOf(text);
  const matched = nicheTerms.filter(term => words.has(term));
  if (matched.length)
    return { verdict: "on-subject", matched,
      because: `The design's own wording mentions ${matched.map(term => `"${term}"`).join(", ")}.` };
  return { verdict: "off-subject", matched: [],
    because: "None of the words in this design mention this niche." };
}

/**
 * What the member is told first.
 *
 * An off-subject design gets the plain fact before anything else, and the
 * visual verdict is explicitly re-scoped so it cannot be read as niche fit.
 */
export function relevanceNotice(relevance: Relevance, niche: string) {
  if (relevance.verdict === "on-subject") return "";
  if (relevance.verdict === "unreadable")
    return `This design has no readable text, so Design Scanner cannot tell whether it is `
      + `about ${niche}. Everything below compares how the design is BUILT — its layout, `
      + `contrast and readability — against listings that are moving. It is not a judgement `
      + `about whether the subject fits.`;
  return `This design does not appear to be about ${niche}. Everything below compares how it `
    + `is BUILT — its layout, contrast and readability — against listings that are moving in `
    + `that niche. A design can match every one of those patterns and still not belong in the `
    + `niche, so read the comparison as being about construction, not about fit.`;
}
