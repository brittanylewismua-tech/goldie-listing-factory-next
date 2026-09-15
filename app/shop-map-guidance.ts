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
export function standout(niches: WorldPerformance[], advice: Guidance[]): Standout {
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

export function guidance(
  niches: WorldPerformance[], { period = "the last 90 days" }: { period?: string } = {},
): Guidance[] {
  const totals = {
    revenue: niches.reduce((sum, niche) => sum + niche.revenueMinor, 0),
    listings: niches.reduce((sum, niche) => sum + niche.activeListings, 0),
    recent: niches.reduce((sum, niche) => sum + niche.ordersLast90, 0),
    orders: niches.reduce((sum, niche) => sum + niche.orders, 0),
  };

  const out: Guidance[] = [];
  for (const niche of niches) {
    const revenueShare = share(niche.revenueMinor, totals.revenue);
    const listingShare = share(niche.activeListings, totals.listings);
    const recentShare = share(niche.ordersLast90, totals.recent);
    const perListing = niche.activeListings
      ? niche.revenueMinor / niche.activeListings : 0;
    const averagePerListing = totals.listings ? totals.revenue / totals.listings : 0;

    /* Too little trade to advise on. Said plainly rather than skipped. */
    if (niche.orders < MIN_ORDERS_TO_ADVISE) {
      out.push({ nicheId: niche.worldId, label: niche.label, headline: "Needs more data",
        advice: `Collect more data before committing further to ${niche.label}.`,
        reason: `${niche.orders} order${niche.orders === 1 ? "" : "s"} so far — `
          + `too few to read a pattern.`, rank: 90 });
      continue;
    }

    /* Earning far above its shelf space. The strongest thing a shop can know. */
    if (revenueShare >= 0.15 && listingShare > 0 && revenueShare > listingShare * 1.5) {
      const headline = listingShare < 0.1 ? "Expand this niche" : "Focus here";
      out.push({ nicheId: niche.worldId, label: niche.label, headline,
        advice: headline === "Expand this niche"
          ? `Add listings in ${niche.label}, and try it on product types it is not on yet.`
          : `Give ${niche.label} more of your shop.`,
        reason: `${niche.label} generated ${percent(revenueShare)} of revenue from `
          + `${percent(listingShare)} of active listings.`, rank: 10 });
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
          + `${percent(revenueShare)} of revenue.`, rank: severe ? 30 : 40 });
      continue;
    }

    /* Recent trade outrunning its lifetime share. */
    if (recentShare > revenueShare * 1.3 && niche.ordersLast90 >= MIN_ORDERS_TO_ADVISE) {
      out.push({ nicheId: niche.worldId, label: niche.label, headline: "Emerging",
        advice: `Watch ${niche.label} — it is growing faster than its history suggests.`,
        reason: `${percent(recentShare)} of orders in ${period}, against `
          + `${percent(revenueShare)} of revenue all time.`, rank: 20 });
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
      reason: `${percent(revenueShare)} of revenue from ${percent(listingShare)} of `
        + `active listings — in proportion, so there is no leverage to act on`
        + `${averagePerListing > 0 && perListing > averagePerListing
          ? ", though it earns slightly above the shop average per listing" : ""}.`,
      rank: 50 });
  }

  return out.sort((a, b) => a.rank - b.rank
    || (niches.find(niche => niche.worldId === b.nicheId)?.revenueMinor ?? 0)
     - (niches.find(niche => niche.worldId === a.nicheId)?.revenueMinor ?? 0));
}
