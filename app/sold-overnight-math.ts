/**
 * THE ONE SUBTRACTION THE WHOLE FEATURE RESTS ON.
 *
 * Kept in its own file, free of any Cloudflare import, so it can be tested for
 * real rather than checked by reading the source. Everything Sold Overnight
 * claims comes out of this function; if it is wrong, the page lies.
 */
export type Movement = {
  /** Units that left the shelf. Never negative, never invented. */
  units: number;
  /** Stock went UP: a restock or a new variant. Real, but not a purchase. */
  restocked: boolean;
  /** Stock reached zero having not been zero before. */
  soldOut: boolean;
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
    return { units: 0, restocked: false, soldOut: false, record: false };

  const delta = had - now;

  /*
    ONLY A FALL IS A SALE.

    Stock rising means the seller restocked or added a variant. Folding that in
    as a negative sale would let one restock erase real purchases from the
    day's total, and the total is the one figure on the page that is supposed
    to be beyond argument. It is recorded as its own thing instead.
  */
  const units = delta > 0 ? delta : 0;
  const restocked = delta < 0;
  const soldOut = now === 0 && had !== 0;

  return { units, restocked, soldOut, record: units > 0 || restocked || soldOut };
}
