/**
 * IS THIS SOMETHING A PRINT-ON-DEMAND SELLER COULD ACTUALLY MAKE?
 *
 * Etsy's taxonomy files a $212 genuine leather shoulder bag under Bags &
 * Purses and a merino wool tank top under Tops, exactly where a printed tote
 * and a printed tank live. Both reached the live board. Neither is a thing
 * anybody reading this page can act on: the shelf is right and the product is
 * unreachable.
 *
 * This is a corpus-quality problem rather than a display one — a slot spent
 * watching a leather handbag is a slot not spent on something printable — so
 * the rule is applied when a listing is taken in as well as when the board is
 * read.
 *
 * TWO TESTS, BOTH DELIBERATELY BLUNT.
 *
 * A CEILING PER SHELF. Print-on-demand has a price ceiling set by the blank
 * plus the print, and it is not close to the ceiling of the same shelf in
 * general. A t-shirt above sixty dollars is not a printed t-shirt. This
 * catches the expensive imposters without needing to know what they are.
 *
 * MATERIALS THAT CANNOT BE PRINTED. Leather, merino, cashmere, silk, suede.
 * A phrase in a title is weak evidence for most things, but these words are
 * load-bearing in a product title — nobody writes "genuine leather" about a
 * printed tote — and they are the exact words that carried the imposters onto
 * the board.
 *
 * Both are deliberately generous. The cost of wrongly excluding a printable
 * listing is one missing row on a board of hundreds; the cost of including a
 * leather handbag is a seller concluding the whole page is not for them.
 */

/** The most a printed version of each shelf plausibly sells for, in USD. */
const CEILING: Record<string, number> = {
  "T-shirts": 60,
  "Sweatshirts & Hoodies": 95,
  "Tanks": 55,
  "Baby Bodysuits": 55,
  "Hats": 60,
  "Tote Bags": 65,
  "Mugs": 50,
  "Blankets": 160,
  "Baby Blankets": 120,
  "Throw Pillows": 95,
  "Wall Art": 130,
  "Stickers": 30,
  "Phone Cases": 65,
};

/** A shelf nobody has priced yet should not be silently excluded. */
const DEFAULT_CEILING = 200;

/**
 * Words that mean the product is the material, not the print on it.
 *
 * Whole-word matched, because substring matching has already cost this
 * codebase a seller: "vin-TAG-e" contains "tag", and a rule that flags "silk"
 * inside "silky" would start deleting real printed listings.
 */
const NOT_PRINTED = [
  "genuine leather", "real leather", "leather", "suede", "merino", "cashmere",
  "alpaca", "mohair", "sterling silver", "solid gold", "14k", "18k",
  "hand knitted", "hand knit", "crocheted", "hand woven", "handwoven",
  "quilted by hand", "upcycled", "antique", "vintage 19", "deadstock",
];

const NOT_PRINTED_RE = new RegExp(
  `\\b(${NOT_PRINTED.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

export type Candidate = { title: string; product?: string | null; price?: number | null };

export function madeOfSomethingElse(title: string) {
  return NOT_PRINTED_RE.test(String(title ?? ""));
}

export function abovePrintableCeiling(product: string | null | undefined, price: number | null | undefined) {
  if (price == null || !Number.isFinite(Number(price))) return false;
  const ceiling = (product ? CEILING[product] : undefined) ?? DEFAULT_CEILING;
  return Number(price) > ceiling;
}

/** True when a print-on-demand seller could plausibly make this. */
export function printable(candidate: Candidate) {
  if (madeOfSomethingElse(candidate.title)) return false;
  if (abovePrintableCeiling(candidate.product, candidate.price)) return false;
  return true;
}
