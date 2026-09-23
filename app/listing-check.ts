/* ============================================================================
 * GRADE A DRAFT AGAINST THE LISTINGS THAT ARE WINNING ITS PHRASE.
 *
 * eRank sells a Listing Audit for six dollars a month: it grades a title, tag
 * count, images, attributes and materials against general rules. General rules
 * are the weak part. "Use all 13 tags" is true everywhere and therefore tells
 * a seller nothing about the phrase they are actually entering.
 *
 * This grades against the live top of the seller's own search instead. Not
 * "titles should be descriptive" but "eleven of the fifty listings beating you
 * for this phrase say 'desert', and yours does not". The benchmark is the
 * market as it stands this morning, which is the thing a general rule cannot
 * be.
 *
 * NOTHING HERE IS A PREDICTION.
 *
 * A finding says what is different between this draft and the listings above
 * it. It does not say the draft will sell if the difference is closed, because
 * Etsy ranks its own search partly on titles and tags, and a correlation
 * inside a ranked result set cannot be told apart from the ranking. Every
 * sentence is written so a seller can weigh it, and none is written as advice.
 * ==========================================================================*/
import type { Profile } from "./keyword-profile.ts";
import { usdFromCents } from "./sold-overnight-math.ts";

export type Draft = {
  title: string;
  tags: string[];
  priceCents: number | null;
  currency: string;
  personalizable: boolean | null;
};

export type Finding = {
  key: string;
  /* `gap` is a real difference from the winners. `ok` is a match worth
     confirming so the panel is not only ever a list of failures. */
  kind: "gap" | "ok";
  label: string;
  detail: string;
};

/** Etsy allows thirteen. Unused ones are the cheapest thing on this page. */
export const TAG_LIMIT = 13;
/** Etsy truncates in search results long before its own 140 character cap. */
const TITLE_FRONT = 60;

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const words = (text: string) =>
  text.toLocaleLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

export function checkListing(draft: Draft, profile: Profile): Finding[] {
  const findings: Finding[] = [];
  const tags = draft.tags.map(tag => tag.trim()).filter(Boolean);

  /* ------------------------------------------------------------ the tags */
  if (tags.length < TAG_LIMIT)
    findings.push({
      key: "tag-count", kind: "gap", label: `${TAG_LIMIT - tags.length} tag slots empty`,
      detail: `Using ${tags.length} of ${TAG_LIMIT}.`,
    });
  const tooLong = tags.filter(tag => tag.length > 20);
  if (tooLong.length)
    findings.push({
      key: "tag-length", kind: "gap", label: `${tooLong.length} tag${tooLong.length === 1 ? "" : "s"} over 20 characters`,
      detail: `Etsy caps tags at 20 characters: ${tooLong.slice(0, 3).join(", ")}.`,
    });

  /* ----------------------------------------------------------- the title */
  const front = draft.title.slice(0, TITLE_FRONT);
  const missing = profile.subjects
    .filter(subject => !words(draft.title).includes(subject.word) && !tags.some(tag => tag.toLocaleLowerCase().includes(subject.word)))
    .slice(0, 6);
  if (missing.length)
    findings.push({
      key: "subjects", kind: "gap",
      label: `Missing words the top ${profile.sampleSize} use`,
      detail: missing.map(subject => `${subject.word} (${subject.winners})`).join(", "),
    });
  if (draft.title.trim().length < 40)
    findings.push({
      key: "title-short", kind: "gap", label: "Short title",
      detail: `${draft.title.trim().length} of 140 characters.`,
    });
  else findings.push({
    key: "title-front", kind: "ok", label: "What a buyer reads first",
    detail: `“${front}${draft.title.length > TITLE_FRONT ? "…" : ""}”`,
  });

  /* ----------------------------------------------------------- the price */
  /* The band is in USD, so the draft is converted to meet it rather than
     being skipped for being priced in anything else. */
  const draftUsd = (() => {
    const dollars = usdFromCents(draft.priceCents, draft.currency);
    return dollars == null ? null : Math.round(dollars * 100);
  })();
  if (draftUsd != null && profile.priceBand) {
    const { low, high } = profile.priceBand;
    if (draftUsd < low)
      findings.push({
        key: "price-low", kind: "gap", label: `Priced under the winners`,
        detail: `${money(draftUsd)} against a ${money(low)}–${money(high)} band.`,
      });
    else if (draftUsd > high)
      findings.push({
        key: "price-high", kind: "gap", label: "Priced above the winners",
        detail: `${money(draftUsd)} against a ${money(low)}–${money(high)} band.`,
      });
    else findings.push({
      key: "price-ok", kind: "ok", label: "Price sits with the winners",
      detail: `${money(draftUsd)}, inside the ${money(low)}–${money(high)} band.`,
    });
  }

  /* -------------------------------------------------- the personalisation */
  if (profile.personalisedShare != null && profile.personalisedShare >= 0.4 && draft.personalizable === false)
    findings.push({
      key: "personalisation", kind: "gap", label: "Most of the winners take a personalisation",
      detail: `${Math.round(profile.personalisedShare * 100)}% of the top ${profile.sampleSize} do. This does not.`,
    });

  return findings;
}
