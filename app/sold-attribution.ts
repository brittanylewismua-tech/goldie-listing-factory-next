/**
 * WHAT A LISTING IS ALLOWED TO CLAIM IT SOLD.
 *
 * Etsy gives two signals and neither is sufficient alone.
 *
 * A listing's `quantity` is the only figure with listing-level resolution, and
 * it is unreliable: it is summed across variants, Printify resets it on
 * republish, and a seller trimming stock is indistinguishable from a customer
 * buying.
 *
 * A shop's `transaction_sold_count` is exact and real, and it is the wrong
 * shape — it belongs to the shop, and includes listings nobody here watches.
 * Dividing it across watched listings by favourites, or by any other ratio,
 * would put an invented number on the page. That is the thing this whole
 * feature exists not to do.
 *
 * So the shop count is not the source. It is the CHECK.
 *
 *   THE GATE — a quantity drop only counts if the shop actually sold something
 *   in the same window. A drop in a shop that sold nothing is a restock, a
 *   variant edit, or somebody tidying their inventory.
 *
 *   THE CAP — the drops attributed to one shop may never sum to more than that
 *   shop really sold. Applied before ranking, because a bogus figure capped
 *   after ranking has already taken the top of the board.
 *
 * Every surviving number is still the listing's own observed drop. Nothing is
 * calculated, apportioned or estimated; rows that cannot be supported are
 * dropped rather than guessed at.
 *
 * HOW GOOD THE CHECK IS VARIES, AND THE ROW SAYS SO. `listing_active_count`
 * tells us whether the cap is tight or merely generous, and that is recorded
 * on every row rather than averaged away.
 *
 * No Cloudflare import: this is the part that has to be right.
 */

export type Attribution = "exact" | "bounded" | "corroborated";

export type Candidate = {
  listingId: number;
  shopId: number | null;
  /** The listing's own observed quantity drop. */
  sold: number;
};

export type ShopFacts = {
  /** transaction_sold_count(latest) - transaction_sold_count(earliest). */
  soldDelta: number;
  /** How many listings the shop has live, if Etsy said. */
  activeCount: number | null;
  /** How many of them we watch. */
  watchedCount: number;
};

export type Attributed = Candidate & { sold: number; attribution: Attribution };

/**
 * @param candidates every listing whose stock fell, with its own drop
 * @param shops      what each shop actually sold over the same window
 */
export function attribute(
  candidates: Candidate[],
  shops: Map<number, ShopFacts>,
): Attributed[] {
  /* Group by shop, because both the gate and the cap are shop-level. */
  const byShop = new Map<number, Candidate[]>();
  for (const candidate of candidates) {
    if (candidate.shopId == null) continue; /* cannot be checked, so not shown */
    const list = byShop.get(candidate.shopId) ?? [];
    list.push(candidate);
    byShop.set(candidate.shopId, list);
  }

  const out: Attributed[] = [];

  for (const [shopId, listings] of byShop) {
    const facts = shops.get(shopId);
    /* THE GATE. No shop reading, or the shop sold nothing: nothing here is a
       sale, whatever the stock did. */
    if (!facts || facts.soldDelta <= 0) continue;

    /*
      HOW MUCH THE CAP IS WORTH.

      exact — the shop has one live listing, so its sales ARE that listing's.
              No inference of any kind, and the shop count beats the quantity
              drop where they disagree, because one of them is Etsy's own
              ledger and the other is arithmetic on stock levels.

      bounded — we watch everything the shop has live, so none of its sales can
              have gone to a listing outside this set. The cap really binds.

      corroborated — the shop sells things we do not watch, so some of its
              total belongs elsewhere and the cap is a ceiling that will rarely
              bite. The gate still holds; this is the weakest class and is
              labelled as such rather than quietly mixed in.
    */
    const attribution: Attribution =
      facts.activeCount === 1 ? "exact"
      : facts.activeCount != null && facts.watchedCount >= facts.activeCount ? "bounded"
      : "corroborated";

    if (attribution === "exact") {
      /* One listing, and Etsy has already counted it. */
      const only = listings[0];
      if (only) out.push({ ...only, sold: facts.soldDelta, attribution });
      continue;
    }

    /*
      THE CAP, APPLIED BEFORE RANKING.

      Deterministic order so the same data always produces the same board:
      biggest drop first, then lowest listing id. Fill until the shop's real
      total is exhausted; a listing that would take more than remains is
      trimmed to what is left, and one that gets nothing is dropped from the
      window rather than shown as a zero.
    */
    let remaining = facts.soldDelta;
    const ordered = [...listings].sort(
      (a, b) => b.sold - a.sold || a.listingId - b.listingId);

    for (const listing of ordered) {
      if (remaining <= 0) break;
      const sold = Math.min(listing.sold, remaining);
      if (sold <= 0) continue;
      remaining -= sold;
      out.push({ ...listing, sold, attribution });
    }
  }

  return out;
}

/** Shop totals from two observations of Etsy's cumulative count. */
export function shopDelta(earliest: number, latest: number) {
  const delta = latest - earliest;
  /* Etsy revises occasionally; a negative is a correction, not a refund. */
  return delta > 0 ? delta : 0;
}
