import type { WorldPerformance } from "./shop-map-direction.ts";

/**
 * WHAT TO DO NEXT, AND WHY.
 *
 * Every instruction carries the arithmetic that produced it. A seller should
 * be able to disagree with the advice by disagreeing with the number, which
 * is only possible if the number is on the card.
 *
 * Goldie says where the evidence points. It does not invent a design, and it
 * does not pretend to know the right next product — the difference between
 * "this niche earns disproportionately" and "make a mug that says this" is
 * the difference between reading a shop and guessing at one.
 */
export type Guidance = {
  nicheId: string;
  label: string;
  headline: "Focus here" | "Expand this niche" | "Keep building" | "Emerging"
    | "Overbuilt" | "Weak profit" | "Needs more data" | "Reconsider this category";
  /* The instruction, in the seller's terms. */
  advice: string;
  /* The arithmetic behind it. Never omitted. */
  reason: string;
  rank: number;
};

const share = (value: number, total: number) => total > 0 ? value / total : 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export const MIN_ORDERS_TO_ADVISE = 5;

export type Standout = { hasStandout: boolean; headline: string; nextStep: string };

/**
 * Is anything actually outperforming its shelf space?
 *
 * Said plainly when nothing is, rather than dressed up as advice. The next
 * step then comes from the evidence that DOES exist - more data, a niche
 * with too little coverage to read, or an overbuilt one to pull back from.
 */
/*
  COVERAGE GATES THE RECOMMENDATION.

  A focus recommendation made while a third of the shop's revenue is
  unclassified is a statement about the part Goldie happens to understand,
  presented as a statement about the shop.
*/
export const COVERAGE_REQUIRED = {
  activeListings: 0.8, recentRevenue: 0.9, recentOrders: 0.9,
};

export type Coverage = {
  activeListings: number; recentRevenue: number; recentOrders: number;
};

export const coverageMet = (coverage: Coverage) =>
  coverage.activeListings >= COVERAGE_REQUIRED.activeListings
  && coverage.recentRevenue >= COVERAGE_REQUIRED.recentRevenue
  && coverage.recentOrders >= COVERAGE_REQUIRED.recentOrders;

export function standout(
  niches: WorldPerformance[], advice: Guidance[], coverage?: Coverage,
): Standout {
  /*
    A direction drawn from a handful of recent orders is noise wearing a
    percentage. With too few, the honest answer is that there is no
    defensible direction yet - not a weaker version of one.
  */
  const recentOrders = niches.reduce((sum, niche) => sum + niche.ordersLast90, 0);
  if (recentOrders < SHOP_MAP_MIN_RECENT_ORDERS)
    return {
      hasStandout: false,
      headline: "No clear direction yet.",
      nextStep: `Only ${recentOrders} order${recentOrders === 1 ? "" : "s"} in the last `
        + `${DIRECTION_WINDOW_DAYS} days across every niche — too few to say where the `
        + `shop is pointed. Lifetime figures are shown on each niche as history.`,
    };
  if (coverage && !coverageMet(coverage))
    return {
      hasStandout: false,
      headline: "Shop Map is still organizing enough of your shop to make a "
        + "reliable focus recommendation.",
      nextStep: `Classified so far: ${Math.round(coverage.activeListings * 100)}% of `
        + `active listings, ${Math.round(coverage.recentRevenue * 100)}% of recent revenue, `
        + `${Math.round(coverage.recentOrders * 100)}% of recent orders.`,
    };
  return standoutFrom(niches, advice);
}

function standoutFrom(niches: WorldPerformance[], advice: Guidance[]): Standout {
  const leveraged = advice.find(row =>
    row.headline === "Focus here" || row.headline === "Expand this niche");
  if (leveraged)
    return { hasStandout: true, headline: leveraged.advice, nextStep: leveraged.reason };

  const emerging = advice.find(row => row.headline === "Emerging");
  const overbuilt = advice.find(row =>
    row.headline === "Overbuilt" || row.headline === "Reconsider this category");
  const thin = advice.find(row => row.headline === "Needs more data");

  return {
    hasStandout: false,
    headline: "No standout opportunity yet. Your strongest niches are performing "
      + "roughly in proportion to how many listings they contain.",
    nextStep: emerging ? emerging.advice
      : overbuilt ? overbuilt.advice
      : thin ? thin.advice
      : "Maintain the current mix and collect more recent data before committing further.",
  };
}

/*
  THE DENOMINATOR IS THE WHOLE SHOP.

  Shares were being taken across the classified niches alone, so a niche
  holding 44% of classified revenue was reported as 44% of the shop while
  $19,950 and 856 orders sat outside the map entirely. Every share now
  divides by the shop's own totals, and unclassified performance is part of
  that denominator rather than quietly excluded from it.
*/
export type ShopTotals = {
  revenueMinor: number; activeListings: number; ordersLast90: number; orders: number;
  revenueLast90Minor?: number;
};

/*
  COMPATIBLE PERIODS, OR NO RECOMMENDATION.

  The page said "Girl Power generated 35% of revenue from 19% of active
  listings". The 35% was LIFETIME revenue and the 19% was the catalog as it
  stands today - two different periods presented as one ratio. A shop can
  earn a third of its lifetime money from listings it has since deactivated,
  and that sentence would still read as a reason to build more of them.

  What the signal actually compares is recent 90-day performance against the
  shop's CURRENT active catalog. Those are not the same window and saying
  they are would be its own small untruth: a listing published last week has
  not had ninety days to earn, so its niche's revenue-per-listing reads low.
  The limitation travels with the formula wherever it is explained.
*/
export const DIRECTION_WINDOW_DAYS = 90;
export const DIRECTION_BASIS =
  "Recent 90-day performance compared with the shop's current active catalog.";

/*
  A BETA THRESHOLD, NOT A LAW.

  Twenty is where this beta draws the line, chosen so a handful of orders
  cannot produce a confident percentage. It is not a measured Etsy standard
  and nothing here should imply that it is, so it lives in one named place
  that can be changed rather than inside the arithmetic.

  This shop would have no clear direction without it either: Feminist has 12
  recent orders across 53 active listings and Girl Power 3 across 16, so
  neither shows a convincing recent advantage per active listing.
*/
export const SHOP_MAP_MIN_RECENT_ORDERS = Number(
  (globalThis as { SHOP_MAP_MIN_RECENT_ORDERS?: string }).SHOP_MAP_MIN_RECENT_ORDERS
  ?? (typeof process !== "undefined" ? process.env?.SHOP_MAP_MIN_RECENT_ORDERS : undefined)
  ?? 20) || 20;

export function guidance(
  niches: WorldPerformance[],
  { period = "the last 90 days", shop }:
  { period?: string; shop?: ShopTotals } = {},
): Guidance[] {
  const totals = shop ? {
    /* Recent on both sides. Lifetime is context, never the signal. */
    revenue: shop.revenueLast90Minor ?? shop.revenueMinor,
    listings: shop.activeListings,
    recent: shop.ordersLast90, orders: shop.ordersLast90,
  } : {
    /* Recent on both sides here too: a recent numerator over a lifetime
       denominator is the very mismatch this change exists to remove. */
    revenue: niches.reduce((sum, niche) => sum + niche.revenueLast90Minor, 0),
    listings: niches.reduce((sum, niche) => sum + niche.activeListings, 0),
    recent: niches.reduce((sum, niche) => sum + niche.ordersLast90, 0),
    orders: niches.reduce((sum, niche) => sum + niche.ordersLast90, 0),
  };

  const out: Guidance[] = [];
  for (const niche of niches) {
    /* Every figure below is the last 90 days. */
    const recentRevenue = niche.revenueLast90Minor;
    const revenueShare = share(recentRevenue, totals.revenue);
    const listingShare = share(niche.activeListings, totals.listings);
    const recentShare = share(niche.ordersLast90, totals.recent);
    const perListing = niche.activeListings
      ? recentRevenue / niche.activeListings : 0;
    const averagePerListing = totals.listings ? totals.revenue / totals.listings : 0;

    /* Too little RECENT trade to advise on. Said plainly rather than skipped. */
    if (niche.ordersLast90 < MIN_ORDERS_TO_ADVISE) {
      out.push({ nicheId: niche.worldId, label: niche.label, headline: "Needs more data",
        advice: `Collect more data before committing further to ${niche.label}.`,
        reason: `${niche.ordersLast90} order${niche.ordersLast90 === 1 ? "" : "s"} in `
          + `${period} — too few to read a pattern.`, rank: 90 });
      continue;
    }

    /* Earning far above its shelf space. The strongest thing a shop can know. */
    if (revenueShare >= 0.15 && listingShare > 0 && revenueShare > listingShare * 1.5) {
      const headline = listingShare < 0.1 ? "Expand this niche" : "Focus here";
      out.push({ nicheId: niche.worldId, label: niche.label, headline,
        advice: headline === "Expand this niche"
          ? `Add listings in ${niche.label}, and try it on product types it is not on yet.`
          : `Give ${niche.label} more of your shop.`,
        reason: `${niche.label} generated ${percent(revenueShare)} of revenue in `
          + `${period} from ${percent(listingShare)} of active listings.`, rank: 10 });
      continue;
    }

    /*
      Lots of shelf space, little response — checked BEFORE emerging.

      A niche holding most of the shop's listings can show a high recent
      share simply because it holds most of the listings. Calling that
      "emerging" would tell a seller to lean further into the thing already
      absorbing their effort for the least return.
    */
    if (listingShare >= 0.15 && revenueShare < listingShare / 2) {
      const severe = revenueShare < listingShare / 4;
      out.push({ nicheId: niche.worldId, label: niche.label,
        headline: severe ? "Reconsider this category" : "Overbuilt",
        advice: severe
          ? `${niche.label} is taking real effort for little response. Consider whether it earns its place.`
          : `Stop giving ${niche.label} so much of the shop.`,
        reason: `${percent(listingShare)} of active listings and `
          + `${percent(revenueShare)} of revenue in ${period}.`, rank: severe ? 30 : 40 });
      continue;
    }

    /* Recent trade outrunning its lifetime share. */
    if (recentShare > revenueShare * 1.3 && niche.ordersLast90 >= MIN_ORDERS_TO_ADVISE) {
      out.push({ nicheId: niche.worldId, label: niche.label, headline: "Emerging",
        advice: `Watch ${niche.label} — it is growing faster than its history suggests.`,
        reason: `${percent(recentShare)} of orders in ${period}, against `
          + `${percent(revenueShare)} of revenue in the same window.`, rank: 20 });
      continue;
    }

    if (niche.verifiedProfitMinor !== null && niche.verifiedProfitMinor <= 0
      && niche.revenueMinor > 0) {
      out.push({ nicheId: niche.worldId, label: niche.label, headline: "Weak profit",
        advice: `${niche.label} sells but does not keep much. Check its pricing and costs.`,
        reason: `Revenue is present and known profit is not positive.`, rank: 25 });
      continue;
    }

    /*
      "Keep building" was being said whenever a niche's revenue share merely
      resembled its listing share. That is not evidence of anything - it is
      the absence of evidence, and it reads as encouragement to make more of
      something that has shown no leverage at all.
    */
    out.push({ nicheId: niche.worldId, label: niche.label, headline: "Keep building",
      advice: `Maintain ${niche.label} at its current mix.`,
      reason: `${percent(revenueShare)} of revenue in ${period} from `
        + `${percent(listingShare)} of active listings — in proportion, so there is `
        + `no leverage to act on`
        + `${averagePerListing > 0 && perListing > averagePerListing
          ? ", though it earns slightly above the shop average per listing" : ""}.`,
      rank: 50 });
  }

  return out.sort((a, b) => a.rank - b.rank
    || (niches.find(niche => niche.worldId === b.nicheId)?.revenueMinor ?? 0)
     - (niches.find(niche => niche.worldId === a.nicheId)?.revenueMinor ?? 0));
}
