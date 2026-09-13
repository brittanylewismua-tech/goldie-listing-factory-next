/**
 * THE ONE SUBTRACTION THE WHOLE FEATURE RESTS ON.
 *
 * Kept in its own file, free of any Cloudflare import, so it can be tested for
 * real rather than checked by reading the source. Everything Sold Overnight
 * claims comes out of this function; if it is wrong, the page lies.
 */
/**
 * A DROP TOO BIG TO BE SHOPPING.
 *
 * The live board's top card read "2,997 sold" on a woven blanket. It had gone
 * from 5,994 to 2,997 — exactly half — which is a seller switching off half
 * their variants, or Printify re-syncing with a different variant count. A
 * phone case showed 1,984 the same way. Nobody sold two thousand blankets in
 * four hours, and a board that says they did is the same crime as "top seller":
 * a number presented as counted when it is nothing of the kind.
 *
 * This never appeared in testing because the probe watched for five minutes
 * and only ever saw drops of one. Inventory churn needs hours to show up.
 *
 * Two rules, and a listing has to pass both:
 *
 *   MAX_UNITS_PER_READ — no print-on-demand listing shifts a hundred units
 *   between two readings a few hours apart. Above that it is bookkeeping.
 *
 *   MAX_SHARE — a real run of sales is small against the stock behind it.
 *   Losing a quarter of the shelf at once is a variant going away. This one
 *   only applies to listings with real depth: a listing with four left that
 *   sells all four HAS sold out, and that is the single most useful thing this
 *   board can report, so small stock is exempt.
 *
 * Anything rejected is recorded as an inventory change rather than dropped, so
 * the rate is visible and these thresholds can be tuned against real numbers
 * instead of judgement.
 */
export const MAX_UNITS_PER_READ = 100;
export const SMALL_STOCK = 200;
export const MAX_SHARE = 0.25;

export type Movement = {
  /** Units that left the shelf. Never negative, never invented. */
  units: number;
  /** Stock went UP: a restock or a new variant. Real, but not a purchase. */
  restocked: boolean;
  /** Stock reached zero having not been zero before. */
  soldOut: boolean;
  /** The stock fell, but by too much to be shopping. Counted separately. */
  inventoryChange: boolean;
  /** Whether this night is worth a row at all. */
  record: boolean;
};

/**
 * @param had  last night's stock, or null if this listing had never been read
 * @param now  this morning's stock, or null if Etsy did not say
 */
export function movement(had: number | null, now: number | null): Movement {
  /*
    A FIRST READING CANNOT PRODUCE A SALE.

    There is nothing to subtract from on the night a listing joins the corpus.
    Treating a missing previous value as zero would score its entire stock as
    having sold overnight — a brand new watch on a 999-stock listing would post
    999 sales and top the board on its first morning. So: no previous reading,
    no claim.
  */
  if (had === null || now === null || !Number.isFinite(had) || !Number.isFinite(now))
    return { units: 0, restocked: false, soldOut: false, inventoryChange: false, record: false };

  const delta = had - now;

  /*
    ONLY A FALL IS A SALE.

    Stock rising means the seller restocked or added a variant. Folding that in
    as a negative sale would let one restock erase real purchases from the
    day's total, and the total is the one figure on the page that is supposed
    to be beyond argument. It is recorded as its own thing instead.
  */
  const restocked = delta < 0;
  const soldOut = now === 0 && had !== 0;

  /* Too big to be shopping — see the note above. */
  const implausible = delta > 0 && (
    delta > MAX_UNITS_PER_READ ||
    (had > SMALL_STOCK && delta > had * MAX_SHARE));

  const units = delta > 0 && !implausible ? delta : 0;

  return {
    units,
    restocked,
    /* A shelf emptied by bookkeeping did not sell out. */
    soldOut: soldOut && !implausible,
    inventoryChange: implausible,
    record: units > 0 || restocked || soldOut || implausible,
  };
}
