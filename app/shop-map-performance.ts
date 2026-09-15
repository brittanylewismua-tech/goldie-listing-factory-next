/**
 * PERFORMANCE COMES FROM TRANSACTIONS AND NOTHING ELSE.
 *
 * Kept free of any Cloudflare import so the arithmetic can be exercised
 * directly, and deliberately given no parameter for views, favourites or
 * reviews: they cannot reach this calculation even by mistake.
 */
export type Performance = {
  listingId: number;
  lifetimeOrders: number;
  lifetimeUnits: number;
  lifetimeRevenueMinor: number;
  yearOrders: number;
  yearRevenueMinor: number;
  monthOrders: number;
  monthRevenueMinor: number;
  last30Orders: number;
  last30RevenueMinor: number;
  last90Orders: number;
  last90RevenueMinor: number;
  refundedOrders: number;
  refundedMinor: number;
  largestOrderMinor: number;
};

/**
 * Performance from transactions only.
 *
 * Every figure here is a count or a sum of real Etsy transaction rows. There
 * is deliberately no parameter for views, favourites or reviews: they cannot
 * reach this calculation even by mistake.
 */
export function performanceFrom(
  sales: Array<{ listingId: number; quantity: number; priceMinor: number;
    soldAt: number; refunded: boolean }>,
  { now, monthFrom, monthTo, yearFrom }:
  { now: number; monthFrom: number; monthTo: number; yearFrom: number },
): Map<number, Performance> {
  const out = new Map<number, Performance>();
  const blank = (listingId: number): Performance => ({
    listingId, lifetimeOrders: 0, lifetimeUnits: 0, lifetimeRevenueMinor: 0,
    yearOrders: 0, yearRevenueMinor: 0, monthOrders: 0, monthRevenueMinor: 0,
    last30Orders: 0, last30RevenueMinor: 0, last90Orders: 0, last90RevenueMinor: 0,
    refundedOrders: 0, refundedMinor: 0, largestOrderMinor: 0,
  });

  for (const sale of sales) {
    const row = out.get(sale.listingId) ?? blank(sale.listingId);
    const amount = sale.priceMinor * Math.max(1, sale.quantity);
    row.lifetimeOrders += 1;
    row.lifetimeUnits += Math.max(1, sale.quantity);
    row.lifetimeRevenueMinor += amount;
    if (amount > row.largestOrderMinor) row.largestOrderMinor = amount;
    if (sale.refunded) { row.refundedOrders += 1; row.refundedMinor += amount; }
    if (sale.soldAt >= yearFrom) { row.yearOrders += 1; row.yearRevenueMinor += amount; }
    if (sale.soldAt >= monthFrom && sale.soldAt <= monthTo) {
      row.monthOrders += 1; row.monthRevenueMinor += amount;
    }
    if (sale.soldAt >= now - 30 * 86_400) { row.last30Orders += 1; row.last30RevenueMinor += amount; }
    if (sale.soldAt >= now - 90 * 86_400) { row.last90Orders += 1; row.last90RevenueMinor += amount; }
    out.set(sale.listingId, row);
  }
  return out;
}

/** Listing age in days, or null when Etsy did not give a creation date. */
export const listingAgeDays = (createdAt: number | null, now: number) =>
  createdAt ? Math.floor((now - createdAt) / 86_400) : null;
