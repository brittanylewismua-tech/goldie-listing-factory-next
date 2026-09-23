/* ============================================================================
 * WHAT THE WINNERS IN THIS PHRASE HAVE IN COMMON.
 *
 * The listings are already ranked. This describes the top of that ranking so
 * the seller does not have to open fifty tabs and hold the pattern in their
 * head: what the winners charge, how old they are, how many are personalised,
 * what they are made of, and which words keep turning up in their titles.
 *
 * EVERY LINE HERE IS A DESCRIPTION, NOT A CAUSE.
 *
 * "The top fifty sit between $32 and $48" is a fact about fifty listings.
 * "Charge $40 and you will sell" is a claim this data cannot support, and the
 * wording never crosses that line. Etsy ranks its own search partly on tags
 * and titles, so a word appearing among the winners may be telling you about
 * Etsy's ranking rather than about buyers - which is exactly why the words are
 * offered as subject matter to consider and never as instructions to copy.
 *
 * Favorites are the ranking because a favorite is a real thing a real buyer
 * did, it is public, and etsy.com will not sort by it for anyone - seller or
 * buyer. That is the reason this page exists.
 * ==========================================================================*/

import { usdFromCents } from "./sold-overnight-math.ts";

export type ProfileRow = {
  priceCents: number | null;
  currency: string;
  favorites: number | null;
  ageDays: number | null;
  title: string;
  tags?: string[];
  isPersonalizable?: boolean | null;
  materials?: string[];
  shopSold?: number | null;
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

/** The middle half, which describes a band far better than a min and a max:
 *  one listing priced at $4 should not widen "what winners charge". */
const band = (values: number[]) => {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { low: sorted[Math.floor(sorted.length * 0.25)], high: sorted[Math.floor(sorted.length * 0.75)] };
};

/* Words that appear in almost every title in a search for that phrase carry no
   information about which listings did well - "shirt" in a shirt search. The
   phrase's own words are removed for the same reason, along with the ordinary
   scaffolding of an Etsy title. */
const STOP = new Set(["the","and","for","with","your","you","our","from","that","this",
  "gift","gifts","shirt","shirts","tee","tees","tshirt","t","sweatshirt","sweatshirts",
  "hoodie","hoodies","crewneck","women","womens","men","mens","unisex","custom","personalized",
  "cute","funny","new","best","top","quality","soft","comfy","size","plus","print","printed",
  "design","style","trendy","aesthetic","vintage","retro","graphic","apparel","clothing","shop"]);

const words = (title: string) =>
  title.toLocaleLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)
    .filter(word => word.length > 2 && !STOP.has(word));

export type Profile = {
  phrase?: string;
  sampleSize: number;
  /** Always "USD": every price is converted before the band is taken. */
  currency: string | null;
  priceBand: { low: number; high: number } | null;
  priceMedian: number | null;
  fieldPriceMedian: number | null;
  ageMedianDays: number | null;
  personalisedShare: number | null;
  provenShopShare: number | null;
  subjects: Array<{ word: string; winners: number; field: number }>;
};

/**
 * @param top   the head of the ranking - the listings being described
 * @param field everything scanned, used only to say what is ordinary
 */
export function profileWinners(top: ProfileRow[], field: ProfileRow[], phrase = ""): Profile {
  /*
    EVERY PRICE IN USD, RATHER THAN NO PRICE AT ALL.

    This used to refuse to state a band unless the whole top fifty shared one
    currency - which sounds careful and, measured on "auntie shirt", produced
    a null band and no price finding at all, silently, on a real search. Etsy
    sells worldwide; a top fifty in one currency is the rare case, so the
    careful version was the broken one.

    Etsy accepts a currency conversion parameter and ignores it - that was
    found the hard way by an earlier feature on this codebase - so the
    conversion happens here, through the rate table that already exists for
    the same reason. A listing in a currency the table does not carry is left
    out of the band rather than counted at face value.
  */
  const usd = (row: ProfileRow) => {
    const dollars = usdFromCents(row.priceCents, row.currency);
    return dollars == null ? null : Math.round(dollars * 100);
  };
  const currency = "USD";
  const prices = top.flatMap(row => { const cents = usd(row); return cents == null ? [] : [cents]; });
  const fieldPrices = field.flatMap(row => { const cents = usd(row); return cents == null ? [] : [cents]; });

  const ages = top.flatMap(row => row.ageDays != null ? [row.ageDays] : []);
  const personalisedKnown = top.filter(row => row.isPersonalizable != null);
  const soldKnown = top.filter(row => row.shopSold != null);

  /*
    THE SEARCH'S OWN WORDS ARE NOT A FINDING.

    Measured live on "bookish sweatshirt": the panel reported "bookish - 50 of
    the top 50", which is true, useless, and the single most prominent row on
    the page. Every listing returned for a phrase contains that phrase; saying
    so tells a seller nothing about which of them did well. The generic STOP
    list could never have caught it, because the offending word is different
    for every search.
  */
  const asked = new Set(words(phrase));
  const count = (rows: ProfileRow[], word: string) =>
    rows.filter(row => words(row.title).includes(word)).length;
  const universe = [...new Set(top.flatMap(row => words(row.title)))]
    .filter(word => !asked.has(word));
  const subjects = universe
    .map(word => ({ word, winners: count(top, word), field: count(field, word) }))
    /* Four of fifty is the floor for calling something recurring. Below that a
       "pattern" is two listings by the same shop. */
    .filter(entry => entry.winners >= 4)
    .sort((a, b) =>
      (b.winners / Math.max(1, top.length)) - (b.field / Math.max(1, field.length))
      - ((a.winners / Math.max(1, top.length)) - (a.field / Math.max(1, field.length))))
    .slice(0, 12);

  return {
    sampleSize: top.length,
    currency,
    priceBand: band(prices),
    priceMedian: median(prices),
    fieldPriceMedian: median(fieldPrices),
    ageMedianDays: median(ages),
    personalisedShare: personalisedKnown.length >= 10
      ? personalisedKnown.filter(row => row.isPersonalizable).length / personalisedKnown.length : null,
    /* A shop with real trade behind it, not a listing that got lucky. */
    provenShopShare: soldKnown.length >= 10
      ? soldKnown.filter(row => (row.shopSold ?? 0) >= 1000).length / soldKnown.length : null,
    subjects,
  };
}
