/**
 * WHERE THE SHOP IS ACTUALLY POINTED.
 *
 * The temptation is to name a winner from whichever number is biggest.
 * That is how a shop gets told to lean into a world that led on revenue
 * because of one large order, or led on listing count because the seller
 * uploaded a lot and sold none.
 *
 * So a world is only called the direction when several independent measures
 * agree, the sample is large enough to mean something, and one anomalous
 * order is not carrying the result. When they disagree, the honest output is
 * that there is no clear direction yet.
 */
export type WorldPerformance = {
  worldId: string;
  label: string;
  activeListings: number;
  orders: number;
  units: number;
  revenueMinor: number;
  verifiedProfitMinor: number | null;
  reviews: number;
  ordersLast30: number;
  ordersLast90: number;
  revenueLast90Minor: number;
  /* The single biggest order, used to see whether one sale is the story. */
  largestOrderMinor: number;
  refundedOrders: number;
};

export const MIN_ORDERS_FOR_DIRECTION = 8;
export const MIN_LEADING_MEASURES = 2;
/* Above this, one order IS the world's revenue and cannot support a claim. */
export const ANOMALY_SHARE = 0.6;

export type Finding =
  | "strongest-world" | "emerging-world" | "profitable-but-few-listings"
  | "overbuilt-weak-response" | "carried-by-one-order"
  | "strong-revenue-weak-profit" | "insufficient-evidence" | "no-clear-direction";

export type DirectionResult = {
  finding: Finding;
  worldId: string | null;
  label: string;
  /* Always shown to the member. A claim without its reason is a guess. */
  reason: string;
  leadingMeasures: string[];
  blockedBy: string[];
};

const share = (value: number, total: number) => total > 0 ? value / total : 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function direction(worlds: WorldPerformance[]): DirectionResult {
  const none: DirectionResult = {
    finding: "no-clear-direction", worldId: null, label: "",
    reason: "", leadingMeasures: [], blockedBy: [],
  };
  if (!worlds.length)
    return { ...none, finding: "insufficient-evidence",
      reason: "No worlds have been built yet." };

  const totals = {
    orders: worlds.reduce((sum, world) => sum + world.orders, 0),
    units: worlds.reduce((sum, world) => sum + world.units, 0),
    revenue: worlds.reduce((sum, world) => sum + world.revenueMinor, 0),
    listings: worlds.reduce((sum, world) => sum + world.activeListings, 0),
    reviews: worlds.reduce((sum, world) => sum + world.reviews, 0),
    last90: worlds.reduce((sum, world) => sum + world.ordersLast90, 0),
  };

  /* Which world leads each measure, counted independently. */
  const leaderOf = (pick: (world: WorldPerformance) => number) =>
    [...worlds].sort((a, b) => pick(b) - pick(a))[0];
  const measures: Array<[string, WorldPerformance]> = [
    ["orders", leaderOf(world => world.orders)],
    ["units", leaderOf(world => world.units)],
    ["revenue", leaderOf(world => world.revenueMinor)],
    ["reviews", leaderOf(world => world.reviews)],
    ["recent 90 days", leaderOf(world => world.ordersLast90)],
    ["revenue per active listing",
      leaderOf(world => world.activeListings ? world.revenueMinor / world.activeListings : 0)],
  ];

  const leadCounts = new Map<string, string[]>();
  for (const [name, world] of measures)
    if (world) leadCounts.set(world.worldId, [...(leadCounts.get(world.worldId) ?? []), name]);

  const candidateId = [...leadCounts.entries()]
    .sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const candidate = worlds.find(world => world.worldId === candidateId) ?? null;
  const leading = candidateId ? leadCounts.get(candidateId) ?? [] : [];

  if (!candidate) return none;

  const blockedBy: string[] = [];
  if (candidate.orders < MIN_ORDERS_FOR_DIRECTION)
    blockedBy.push(`only ${candidate.orders} orders — not enough to be sure`);
  if (leading.length < MIN_LEADING_MEASURES)
    blockedBy.push("leads on only one measure");
  /* One order carrying a world is not a direction. */
  const anomaly = share(candidate.largestOrderMinor, candidate.revenueMinor);
  if (anomaly > ANOMALY_SHARE)
    blockedBy.push(`${percent(anomaly)} of its revenue is a single order`);

  const revenueShare = share(candidate.revenueMinor, totals.revenue);
  const listingShare = share(candidate.activeListings, totals.listings);
  const recentShare = share(candidate.ordersLast90, totals.last90);

  if (blockedBy.length)
    return {
      finding: candidate.orders < MIN_ORDERS_FOR_DIRECTION
        ? "insufficient-evidence"
        : anomaly > ANOMALY_SHARE ? "carried-by-one-order" : "no-clear-direction",
      worldId: candidate.worldId, label: candidate.label,
      reason: `${candidate.label} looks strongest, but ${blockedBy[0]}.`,
      leadingMeasures: leading, blockedBy,
    };

  /* A real result. Which kind depends on how the shares sit against each other. */
  const finding: Finding =
    revenueShare > 0.25 && listingShare > 0 && revenueShare > listingShare * 2
      ? "profitable-but-few-listings"
      : recentShare > revenueShare * 1.3 ? "emerging-world"
      : candidate.verifiedProfitMinor !== null && candidate.verifiedProfitMinor <= 0
        && candidate.revenueMinor > 0 ? "strong-revenue-weak-profit"
      : "strongest-world";

  const reason = finding === "profitable-but-few-listings"
    ? `${candidate.label} produced ${percent(revenueShare)} of revenue from `
      + `${percent(listingShare)} of active listings.`
    : finding === "emerging-world"
      ? `${candidate.label} is ${percent(recentShare)} of orders in the last 90 days, `
        + `against ${percent(revenueShare)} of revenue all time.`
      : finding === "strong-revenue-weak-profit"
        ? `${candidate.label} leads on revenue but its known profit is not positive.`
        : `${candidate.label} leads on ${leading.join(", ")} — `
          + `${percent(revenueShare)} of revenue from ${percent(listingShare)} of active listings.`;

  return { finding, worldId: candidate.worldId, label: candidate.label,
    reason, leadingMeasures: leading, blockedBy: [] };
}

/**
 * Worlds carrying more listings than their results justify.
 *
 * Reported separately from the direction, because "stop building here" and
 * "build more here" are different statements and should not be merged.
 */
export function overbuilt(worlds: WorldPerformance[]) {
  const totalListings = worlds.reduce((sum, world) => sum + world.activeListings, 0);
  const totalRevenue = worlds.reduce((sum, world) => sum + world.revenueMinor, 0);
  return worlds
    .filter(world => world.activeListings >= 5
      && share(world.activeListings, totalListings) > 0.2
      && share(world.revenueMinor, totalRevenue) < share(world.activeListings, totalListings) / 2)
    .map(world => ({
      worldId: world.worldId, label: world.label,
      reason: `${world.label} is ${percent(share(world.activeListings, totalListings))} of `
        + `active listings and ${percent(share(world.revenueMinor, totalRevenue))} of revenue.`,
    }));
}
