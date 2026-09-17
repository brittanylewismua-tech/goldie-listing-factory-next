/**
 * ONE DAILY UPDATE, AND ONLY WHEN THERE IS SOMETHING IN IT.
 *
 * The failure mode this exists to prevent: a cron fires, a page appears, and
 * it says a listing was edited and somebody favourited something. A member who
 * reads two of those stops reading the third, and then misses the one that
 * mattered.
 *
 * So an update is built from four questions and nothing else, and an update
 * with no answers is not produced at all.
 *
 * Deterministic. No model, no paid call.
 */
export type NicheChange = {
  phrase: string;
  newlyMoving: number;
  newlyRepeated: number;
  moving: number;
  shops: number;
};

export type ShopChange = {
  shopName: string;
  shopId: number;
  headline: string;
  support: number;
};

export type Update = {
  empty: boolean;
  niches: NicheChange[];
  shops: ShopChange[];
  lines: string[];
};

/* Things that are true, and not worth waking anybody for. */
export const NOISE = [
  "one new favorite", "one new favourite", "inventory increased",
  "a listing was edited", "listing updated", "total changed",
  "one new review",
];

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function buildUpdate(
  niches: NicheChange[], shops: ShopChange[], { minimumShopSupport = 3 } = {},
): Update {
  /* A niche earns a line only when something NEW qualified. An unchanged
     niche is not news, however healthy it is. */
  const movedNiches = niches.filter(niche =>
    niche.newlyMoving > 0 || niche.newlyRepeated > 0);

  /* A shop pattern earns a line only when enough reviews stand behind it.
     One review is an anecdote. */
  const realShops = shops.filter(shop => shop.support >= minimumShopSupport);

  const lines: string[] = [];
  for (const niche of movedNiches) {
    const parts: string[] = [];
    if (niche.newlyMoving)
      parts.push(`${plural(niche.newlyMoving, "listing")} newly showing momentum`);
    if (niche.newlyRepeated)
      parts.push(`${plural(niche.newlyRepeated, "listing")} now showing repeated momentum`);
    lines.push(`${niche.phrase}: ${parts.join(", ")}.`);
  }
  for (const shop of realShops)
    lines.push(`${shop.shopName}: ${shop.headline}`);

  return {
    empty: lines.length === 0,
    niches: movedNiches, shops: realShops, lines,
  };
}

/** What the member sees when there is genuinely nothing. Not an empty page. */
export const NOTHING_NEW =
  "Nothing new in your watches since yesterday. Market Watch is still watching.";
