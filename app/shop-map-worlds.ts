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
  basis: "shop-section" | "phrase" | "tag" | "product-family";
  evidence: string;
  listingIds: number[];
};

/* Words that repeat across any shop and describe nothing about it. */
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
 * Build worlds, strongest evidence first.
 *
 * Shop sections win when they exist: the seller made them deliberately, which
 * is better evidence than anything inferred from wording.
 */
export function buildWorlds(
  listings: Listing[],
  { minimumListings = 3, overrides = new Map<number, string[]>() }:
  { minimumListings?: number; overrides?: Map<number, string[]> } = {},
): { worlds: World[]; assignments: Assignment[] } {
  const worlds: World[] = [];
  const claimed = new Map<number, { ids: string[]; evidence: string[] }>();

  const claim = (listingId: number, worldId: string, why: string) => {
    const held = claimed.get(listingId) ?? { ids: [], evidence: [] };
    if (!held.ids.includes(worldId)) { held.ids.push(worldId); held.evidence.push(why); }
    claimed.set(listingId, held);
  };

  /* 1. Shop sections. */
  const sections = new Map<string, number[]>();
  for (const listing of listings)
    if (listing.shopSection.trim()) {
      const key = listing.shopSection.trim();
      sections.set(key, [...(sections.get(key) ?? []), listing.listingId]);
    }
  for (const [section, ids] of sections)
    if (ids.length >= minimumListings) {
      const id = `section:${section.toLowerCase().replace(/\s+/g, "-")}`;
      worlds.push({ id, label: section, basis: "shop-section",
        evidence: `${ids.length} listings in the shop section "${section}"`, listingIds: ids });
      for (const listingId of ids) claim(listingId, id, `shop section "${section}"`);
    }

  /* 2. Repeated title phrases, for whatever a section did not already cover. */
  for (const { phrase, listingIds } of repeatedPhrases(listings, minimumListings)) {
    const loose = listingIds.filter(id => !claimed.has(id));
    if (loose.length < minimumListings) continue;
    const id = `phrase:${phrase.replace(/\s+/g, "-")}`;
    if (worlds.some(world => world.id === id)) continue;
    worlds.push({ id, label: titleCase(phrase), basis: "phrase",
      evidence: `"${phrase}" appears in ${loose.length} listing titles`, listingIds: loose });
    for (const listingId of loose) claim(listingId, id, `repeated phrase "${phrase}"`);
  }

  /* 3. Repeated tags. */
  const tagCounts = new Map<string, number[]>();
  for (const listing of listings)
    for (const tag of new Set(listing.tags.map(value => value.trim().toLowerCase())))
      if (tag && !STOP.has(tag))
        tagCounts.set(tag, [...(tagCounts.get(tag) ?? []), listing.listingId]);
  for (const [tag, ids] of [...tagCounts.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const loose = ids.filter(id => !claimed.has(id));
    if (loose.length < minimumListings) continue;
    const id = `tag:${tag.replace(/\s+/g, "-")}`;
    worlds.push({ id, label: titleCase(tag), basis: "tag",
      evidence: `tagged "${tag}" on ${loose.length} listings`, listingIds: loose });
    for (const listingId of loose) claim(listingId, id, `tag "${tag}"`);
  }

  /* A member's own correction outranks every rule above. */
  for (const [listingId, worldIds] of overrides)
    claimed.set(listingId, { ids: [...worldIds],
      evidence: ["moved here by you"] });

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

  /* Rebuild membership so overrides are reflected in the worlds themselves. */
  for (const world of worlds)
    world.listingIds = assignments
      .filter(row => row.worldIds.includes(world.id))
      .map(row => row.listingId);

  return { worlds: worlds.filter(world => world.listingIds.length > 0), assignments };
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
