/* ============================================================================
 * A DESIGN THAT SOLD, ON EXACTLY ONE PRODUCT.
 *
 * Shop Map could say what sold and never what to do about it, which is the
 * difference between a report and a tool. For a print-on-demand seller the
 * clearest revenue action there is is a design that has already proven itself
 * and exists on one blank: the artwork is drawn, the market has answered, and
 * putting it on a second product is an afternoon of work against a question
 * that has already been settled.
 *
 * The hard part is deciding that two listings carry the SAME design, because
 * Etsy has no field for it. Titles are what there is, and a print-on-demand
 * title is the design's words followed by the product's words and a tail of
 * search terms - "Mom I Am A Rich Man Feminist Shirt Girl Power Shirt Boss
 * Shirt Anti Trump Feminist T Shirt". Strip the product and the filler and
 * what is left is the design.
 *
 * WHERE THIS IS DELIBERATELY CONSERVATIVE. A wrong grouping tells a seller
 * they already sell something on a hoodie when they do not, which is worse
 * than staying quiet: they skip a product that would have earned. So the key
 * is the first few distinctive words only, a group needs a real sale before
 * it is mentioned at all, and anything that reduces to nothing is dropped
 * rather than lumped together with every other title that also reduced to
 * nothing.
 * ==========================================================================*/

export type ReachListing = {
  listingId: number; title: string; family: string;
  sold90: number; favorites: number | null; imageUrl?: string;
};

/* Product words, because they are what distinguishes the listings we are
   trying to group TOGETHER. Plus the ordinary tail of an Etsy title. */
const NOISE = new Set([
  "shirt","shirts","tshirt","tshirts","tee","tees","t","sweatshirt","sweatshirts",
  "hoodie","hoodies","crewneck","crewnecks","sweater","tank","tanks","top","tops",
  "mug","mugs","tumbler","tote","totes","bag","bags","hat","hats","cap","sticker",
  "stickers","pillow","blanket","poster","print","prints","case","phone",
  "unisex","womens","women","mens","men","ladies","kids","youth","baby","toddler",
  "gift","gifts","for","her","him","the","and","with","a","an","of","to","in","on",
  "cute","funny","cool","best","new","vintage","retro","graphic","aesthetic",
  "trendy","oversized","soft","comfy","plus","size","clothing","apparel",
]);

const words = (title: string) =>
  title.toLocaleLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)
    .filter(word => word.length > 1 && !NOISE.has(word));

/** Four words is enough to separate two designs and short enough that a
 *  longer search tail on one listing does not split it from its twin. */
export function designKey(title: string) {
  return words(title).slice(0, 4).join(" ");
}

/*
  THE DATABASE'S WORD FOR A PRODUCT IS NOT THE SELLER'S.

  `product_family` is stored as an internal key - "tee", "phoneCase",
  "longSleeve" - and it leaked straight onto the page as "only on tee". These
  are the words a seller uses. An unmapped key is title-cased rather than
  hidden, so a new family added later reads as clumsy instead of vanishing.
*/
const FAMILY_LABELS: Record<string, string> = {
  tee: "a T-shirt", crewneck: "a crewneck", hoodie: "a hoodie", tank: "a tank",
  longSleeve: "a long sleeve", sweatshirt: "a sweatshirt", mug: "a mug",
  tote: "a tote bag", phoneCase: "a phone case", sticker: "stickers",
  poster: "a poster", pillow: "a pillow", blanket: "a blanket", hat: "a hat",
};

export function familyLabel(family: string) {
  if (FAMILY_LABELS[family]) return FAMILY_LABELS[family];
  const spaced = family.replace(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase().trim();
  return spaced ? `a ${spaced}` : "one product";
}

/*
  AN ETSY TITLE IS NOT A NAME.

  "Feminist Shirt Girl Power Shirt Girl Boss Shirt Feminist Gifts Anti Trump
  Feminist T Shirt Womens Clothing Feminism Shirt" is a search surface, and
  four listings written that way are indistinguishable in a list - every one
  of them opens with the same three words. Repeated words are dropped and the
  first eight kept, which is enough to tell one design from another without
  reading a paragraph. The photograph does the rest.
*/
export function shortLabel(title: string) {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const word of title.split(/\s+/)) {
    const key = word.toLocaleLowerCase().replace(/[^a-z0-9']/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(word);
    if (kept.length === 8) break;
  }
  const label = kept.join(" ");
  return label.length > 54 ? `${label.slice(0, 54).trimEnd()}…` : label;
}

export type Reach = {
  key: string; title: string; listingId: number; imageUrl?: string;
  sold90: number; favorites: number | null;
  families: string[];
};

/**
 * Designs that sold in the window and appear on exactly one product family,
 * best sellers first. A design with no family recorded is left out: "on one
 * product" would be a claim about data we do not have.
 */
export function designsOnOneProduct(listings: ReachListing[]): Reach[] {
  const groups = new Map<string, ReachListing[]>();
  for (const listing of listings) {
    const key = designKey(listing.title);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  }
  const out: Reach[] = [];
  for (const [key, members] of groups) {
    const families = [...new Set(members.map(row => row.family).filter(Boolean))];
    if (families.length !== 1) continue;
    const sold90 = members.reduce((total, row) => total + (row.sold90 || 0), 0);
    if (sold90 < 1) continue;
    /* The best-performing listing represents the group: it is the one whose
       photograph and title the seller will recognise. */
    const lead = [...members].sort((a, b) => b.sold90 - a.sold90)[0];
    out.push({
      key, title: lead.title, listingId: lead.listingId, imageUrl: lead.imageUrl,
      sold90, favorites: lead.favorites ?? null, families,
    });
  }
  return out.sort((a, b) => b.sold90 - a.sold90);
}
