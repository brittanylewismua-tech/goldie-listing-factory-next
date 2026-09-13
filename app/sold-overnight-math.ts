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
/*
  A HUNDRED WAS TOO GENEROUS AND LET INVENTORY WORK THROUGH.

  It was set to separate a 2,997 halving from real shopping, which it did. But
  a seller trimming stock from 999 to 950 between two readings is 49, and that
  passed as forty-nine purchases. Over a four-hour gap twenty units is already
  a brisk listing — a hundred and twenty a day — and drops above it are far
  more likely to be somebody editing their shop than a queue of buyers.

  This deliberately under-counts the genuinely explosive listing. Given the
  choice, the board should miss a real sale rather than print one that did not
  happen, because a number nobody can trust is worth less than a smaller one
  they can.
*/
export const MAX_UNITS_PER_READ = 20;
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

/**
 * PRICES IN ONE CURRENCY, DONE HERE BECAUSE ETSY WOULD NOT DO IT.
 *
 * `listings/batch` documents a `currency` parameter — "the ISO 4217 alphabetic
 * currency code for price conversion" — so the sweep asked for USD. It made no
 * difference: after a full re-read of all 14,868 watched listings, 149 of the
 * top 400 still came back in GBP, EUR, CAD and nine others. The parameter is
 * accepted and ignored. Documentation is not evidence, and this is what it
 * cost to find that out.
 *
 * So the conversion happens here, against a table. The board's price column
 * answers "what does this kind of thing sell for" — the difference between a
 * $15 product and a $40 one — and for that a rate a few percent stale is
 * perfectly good. It does not need to be a live feed, and a live feed would be
 * a second thing to keep running for no gain in the only question being asked.
 *
 * A currency missing from this table returns null rather than a guess, and a
 * listing with no comparable price is left off the board rather than shown
 * with a number nobody can read against the others.
 *
 * Rates are approximate, September 2026, units of currency per 1 USD. If the
 * column starts looking wrong, this constant is the whole fix.
 */
export const PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52, NZD: 1.64,
  CHF: 0.88, SEK: 10.5, NOK: 10.7, DKK: 6.9, PLN: 3.9, CZK: 23,
  JPY: 149, CNY: 7.2, HKD: 7.8, SGD: 1.34, INR: 84, IDR: 15800,
  PHP: 58, MYR: 4.5, THB: 34, TRY: 34, MXN: 18.5, BRL: 5.5,
  ZAR: 18, ILS: 3.7, AED: 3.67, KRW: 1350, TWD: 32, RON: 4.6,
  HUF: 365, BGN: 1.8, HRK: 6.9, ISK: 138, UAH: 41,
};

/** Cents in the listing's own currency to whole USD, or null if unconvertible. */
export function usdFromCents(cents: number | null, currency: string | null): number | null {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  const rate = PER_USD[String(currency || "USD").toUpperCase()];
  if (!rate) return null;
  return Math.round((Number(cents) / 100 / rate) * 100) / 100;
}

/**
 * SOMEBODY ELSE'S TRADEMARK IS NOT A DESIGN IDEA.
 *
 * The board was telling print-on-demand sellers to make Backstreet Boys tour
 * shirts, SpongeBob family sets, Gatorade cosplay tees and Elden Ring stickers.
 * Measured across a live week: 12% of the whole board, 32% of the T-shirts
 * shelf, and 8 of the top 20 rows — worst exactly where people look.
 *
 * It is not a bug in the counting. Those listings are real and they really
 * sold. It is a bug in what the board is FOR. Licensed and tour merchandise is
 * printed in finite runs and sells hard around a date, so its stock moves fast
 * and a board built on stock movement finds it first. A seller who copies one
 * loses their shop, and Etsy's original-design rule makes that worse, not
 * better. Surfacing it as "what's selling" without a word of warning is the
 * single most expensive thing this page could do to somebody.
 *
 * Hidden by default and shown behind a toggle, the same as made to order,
 * because knowing what is moving is legitimate even when copying it is not.
 *
 * This list is deliberately incomplete — it cannot be otherwise. It catches
 * what actually reached the board plus the obvious neighbours, and is meant to
 * be added to whenever something slips through. A miss shows a seller one row
 * they should not copy; a false positive hides one row they could have. The
 * first is worse, so the list errs wide.
 */
const RIGHTS = [
  // music acts whose tour merch reached the board
  "backstreet boys", "bsb", "westlife", "harry styles", "dolly parton",
  "taylor swift", "swiftie", "eras tour", "oasis", "coldplay", "bts",
  "blackpink", "beyonce", "sabrina carpenter", "chappell roan", "olivia rodrigo",
  // screen, game and publishing properties
  "spongebob", "disney", "pixar", "marvel", "star wars", "harry potter",
  "pokemon", "nintendo", "mario", "zelda", "elden ring", "final fantasy",
  "souls borne", "soulsborne", "dark souls", "minecraft", "roblox", "fortnite",
  "sanrio", "hello kitty", "bluey", "stitch", "grinch", "barbie",
  "stranger things", "bridgerton", "wednesday addams", "squid game",
  "acotar", "throne of glass", "crescent city", "dungeon crawler carl",
  "sarah j maas", "colleen hoover", "taylor jenkins reid",
  // consumer brands
  "gatorade", "coca cola", "coca-cola", "pepsi", "starbucks", "stanley cup",
  "nike", "adidas", "lululemon", "john deere", "jeep", "harley davidson",
  // leagues
  "nfl", "nba", "mlb", "nhl", "formula 1", "super bowl",
  // and anything that says so itself
  "officially licensed", "official merch",
];

const RIGHTS_RE = new RegExp(
  `\\b(${RIGHTS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

/* A dated tour shirt is unusable even when the act is not on the list above:
   nobody can ride "Düsseldorf 2026" a week later, and printing it is somebody
   else's trademark anyway. */
const TOUR_RE = /\b(tour|concert|konzert|tickets?)\b[^.]{0,40}\b20\d{2}\b|\b20\d{2}\b[^.]{0,40}\b(tour|concert|konzert)\b|world tour/i;

/** True when a title leans on a trademark, a licence, or a dated tour. */
export function tradesOnRights(title: string): boolean {
  const text = String(title || "");
  return RIGHTS_RE.test(text) || TOUR_RE.test(text);
}
