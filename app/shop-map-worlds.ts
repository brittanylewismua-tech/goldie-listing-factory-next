import { dimensionsFor, worldFor, rejectAsWorld } from "./shop-map-identity.ts";
/**
 * GROUPING A SHOP'S LISTINGS FROM WHAT IT ALREADY SAYS.
 *
 * No model call. The evidence is language the seller wrote and structure they
 * already made: shop sections, repeated multi-word phrases, tags, and the
 * product family. All of it is deterministic, which matters here because a
 * member has to be able to disagree with a grouping and see exactly why it
 * happened.
 *
 * A listing is left UNCLASSIFIED when nothing repeats. "Miscellaneous" is not
 * an answer, it is a bin with a friendly name, and it makes a map look
 * complete while telling the member nothing.
 */
/**
 * Etsy returns HTML entities in titles and section names.
 *
 * A world labelled "Women&#39;s Tees" is not a cosmetic problem: it is what
 * the member reads, and it makes Goldie look like it cannot handle their own
 * shop's words.
 */
export function decodeEntities(text: string): string {
  return String(text ?? "")
    .replace(/&#(\d+);/g, (whole, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (whole, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export type Listing = {
  listingId: number;
  title: string;
  tags: string[];
  shopSection: string;
  productFamily: string;
};

export type Assignment = {
  listingId: number;
  worldIds: string[];
  evidence: string[];
  unclassified: boolean;
};

export type World = {
  id: string;
  label: string;
  /* Always the customer. A product family can never be the basis. */
  basis: "customer-identity";
  evidence: string;
  listingIds: number[];
  subWorlds: Array<{ label: string; listings: number }>;
  /* Counted inside the world, as supporting evidence. */
  productFamilies: Array<{ family: string; listings: number }>;
};

/* Words that repeat across any shop and describe nothing about it. */
/*
  GARMENT WORDS DESCRIBE THE BLANK, NOT THE CUSTOMER.

  The first live run produced worlds called "Unisex Heavy Cotton", "Hooded
  Sweatshirt", "Short Sleeve Unisex" and "One Piece Swimsuit". Those are
  product descriptions. A seller reading them learns nothing about who buys
  from her, and they crowd out the worlds that mean something.

  A phrase is only a world when it survives with a non-garment word in it.
*/
const GARMENT = new Set(["unisex", "heavy", "cotton", "blend", "hooded", "hoodie",
  "sweatshirt", "crewneck", "sleeve", "sleeves", "short", "long", "piece",
  "swimsuit", "tank", "top", "tops", "case", "cases", "iphone", "samsung",
  "mug", "tumbler", "sticker", "stickers", "tote", "bag", "poster", "blanket",
  "shirt", "shirts", "tee", "tees", "garment", "dyed", "jersey", "premium",
  "classic", "soft", "style", "fit", "colors", "color", "colour"]);

const STOP = new Set(["the", "and", "for", "with", "you", "your", "our", "this",
  "that", "from", "shirt", "tee", "t", "gift", "gifts", "women", "womens", "men",
  "mens", "unisex", "funny", "cute", "best", "new", "custom", "personalized",
  "day", "mug", "hoodie", "sweatshirt", "sticker", "tote", "poster", "top",
  "tops", "size", "plus", "a", "an", "of", "in", "on", "to", "is", "it"]);

const words = (text: string) =>
  text.toLocaleLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

/** Repeated two- and three-word phrases, which carry meaning single words do not. */
export function repeatedPhrases(listings: Listing[], minimumListings = 3) {
  const seen = new Map<string, Set<number>>();
  for (const listing of listings) {
    const parts = words(listing.title);
    const local = new Set<string>();
    for (let size = 2; size <= 3; size += 1)
      for (let index = 0; index + size <= parts.length; index += 1) {
        const phrase = parts.slice(index, index + size);
        /* A phrase made only of filler is filler. */
        if (phrase.every(word => STOP.has(word))) continue;
        /* Every word describing the blank means the phrase describes the blank. */
        if (phrase.every(word => GARMENT.has(word) || STOP.has(word))) continue;
        if (phrase.some(word => word.length < 2)) continue;
        local.add(phrase.join(" "));
      }
    for (const phrase of local) {
      const held = seen.get(phrase) ?? new Set<number>();
      held.add(listing.listingId);
      seen.set(phrase, held);
    }
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.size >= minimumListings)
    .map(([phrase, ids]) => ({ phrase, listingIds: [...ids] }))
    /* Longer phrases first: "trail running" beats "running". */
    .sort((a, b) => b.listingIds.length - a.listingIds.length
      || b.phrase.length - a.phrase.length);
}

const titleCase = (text: string) =>
  text.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

/**
 * BUILD WORLDS BOTTOM UP, FROM CUSTOMER LOGIC.
 *
 * 1. Read each listing's dimensions: identity, occasion, recipient, product.
 * 2. Group by the customer identity, never by the product.
 * 3. Sub-worlds are narrower territories INSIDE a world.
 * 4. Product families are counted within a world, never promoted to one.
 * 5. A listing whose customer logic is unclear stays unclassified.
 *
 * Coverage is deliberately not the goal. A smaller accurate map beats a full
 * one made of product names, because a seller acts on what it says.
 */
export function buildWorlds(
  listings: Listing[],
  { minimumListings = 3, overrides = new Map<number, string[]>() }:
  { minimumListings?: number; overrides?: Map<number, string[]> } = {},
): { worlds: World[]; assignments: Assignment[] } {
  const read = listings.map(listing => ({
    listing,
    dimensions: dimensionsFor({
      listingId: listing.listingId, title: listing.title, tags: listing.tags,
      shopSection: listing.shopSection, productFamily: listing.productFamily }),
  }));

  /* Group by customer identity. Product family rides along as evidence. */
  const grouped = new Map<string, typeof read>();
  for (const row of read) {
    const label = worldFor(row.dimensions);
    if (!label) continue;
    /* The gate applies to automatic labels too, not only to the output. */
    if (rejectAsWorld(label)) continue;
    grouped.set(label, [...(grouped.get(label) ?? []), row]);
  }

  const worlds: World[] = [];
  const claimed = new Map<number, { ids: string[]; evidence: string[] }>();

  for (const [label, rows] of [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)) {
    if (rows.length < minimumListings) continue;
    const id = `world:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    /* Which product families carry this world - evidence, not identity. */
    const families = new Map<string, number>();
    for (const row of rows)
      if (row.listing.productFamily)
        families.set(row.listing.productFamily,
          (families.get(row.listing.productFamily) ?? 0) + 1);
    const familyNote = [...families.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([family, count]) => `${family} ${count}`)
      .join(", ");

    /* Sub-worlds: narrower territories that recur inside this world. */
    const subCounts = new Map<string, number>();
    for (const row of rows)
      if (row.dimensions.subWorld)
        subCounts.set(row.dimensions.subWorld, (subCounts.get(row.dimensions.subWorld) ?? 0) + 1);
    const subWorlds = [...subCounts.entries()]
      .filter(([, count]) => count >= minimumListings)
      .map(([name, count]) => ({ label: name, listings: count }));

    worlds.push({
      id, label, basis: "customer-identity",
      evidence: `${rows.length} listings share this customer${familyNote ? ` · across ${familyNote}` : ""}`,
      listingIds: rows.map(row => row.listing.listingId),
      subWorlds,
      productFamilies: [...families.entries()].map(([family, listings]) => ({ family, listings })),
    });
    for (const row of rows)
      claim(claimed, row.listing.listingId, id,
        row.dimensions.evidence[0] ?? `customer identity "${label}"`);
  }

  /* A member's own move outranks every rule above. */
  for (const [listingId, worldIds] of overrides)
    claimed.set(listingId, { ids: [...worldIds], evidence: ["moved here by you"] });

  const assignments: Assignment[] = listings.map(listing => {
    const held = claimed.get(listing.listingId);
    return {
      listingId: listing.listingId,
      worldIds: held?.ids ?? [],
      evidence: held?.evidence ?? [],
      /* Said plainly rather than filed under a friendly-sounding bin. */
      unclassified: !held || held.ids.length === 0,
    };
  });

  for (const world of worlds)
    world.listingIds = assignments
      .filter(row => row.worldIds.includes(world.id))
      .map(row => row.listingId);

  return { worlds: worlds.filter(world => world.listingIds.length > 0), assignments };
}

function claim(
  into: Map<number, { ids: string[]; evidence: string[] }>,
  listingId: number, worldId: string, why: string,
) {
  const held = into.get(listingId) ?? { ids: [], evidence: [] };
  if (!held.ids.includes(worldId)) { held.ids.push(worldId); held.evidence.push(why); }
  into.set(listingId, held);
}

/** Member controls, applied over the automatic grouping without touching source data. */
export function renameWorld(worlds: World[], worldId: string, label: string) {
  return worlds.map(world => world.id === worldId
    ? { ...world, label, evidence: `${world.evidence} · renamed by you` } : world);
}

export function mergeWorlds(worlds: World[], keepId: string, absorbId: string) {
  const absorb = worlds.find(world => world.id === absorbId);
  if (!absorb) return worlds;
  return worlds
    .map(world => world.id === keepId
      ? { ...world, listingIds: [...new Set([...world.listingIds, ...absorb.listingIds])],
          evidence: `${world.evidence} · merged with ${absorb.label}` }
      : world)
    .filter(world => world.id !== absorbId);
}

export function splitListings(worlds: World[], worldId: string, listingIds: number[]) {
  const moving = new Set(listingIds);
  return worlds.map(world => world.id === worldId
    ? { ...world, listingIds: world.listingIds.filter(id => !moving.has(id)) } : world);
}
