/**
 * TYING AN ETSY SALE TO WHAT IT COST TO MAKE.
 *
 * Measured on this account before a line of this was written: Printify's
 * `external_id` and `shop_order_id` are populated on none of the twenty most
 * recent orders, so the two identifier paths that would settle a match exactly
 * do not exist here. That is not a reason to lower the bar quietly — it is a
 * reason to record which method was used for every single match and to refuse
 * to pick when more than one candidate fits.
 *
 * NOTHING IS EVER AUTO-MATCHED FROM AMBIGUITY. A wrong match does not produce
 * an obviously wrong number; it produces a plausible one, attached to the
 * wrong product, which is worse.
 */

export type MatchMethod =
  | "external_id"
  | "shop_order_id"
  | "transaction_id"
  | "sku_time_quantity"
  | "listing_variant_quantity"
  | "manual";

export type EtsyLine = {
  receiptId: number;
  transactionId: number;
  listingId: number;
  productId: number;
  sku: string;
  quantity: number;
  createdAt: number;
};

export type PrintifyLine = {
  orderId: string;
  appOrderId: string;
  externalId: string;
  shopOrderId: string;
  lineItemId: string;
  sku: string;
  variantId: number;
  productId: string;
  quantity: number;
  createdAt: number;
  status: string;
};

export type Outcome =
  | { state: "matched"; etsy: EtsyLine; printify: PrintifyLine; method: MatchMethod }
  | { state: "ambiguous"; etsy: EtsyLine; candidates: PrintifyLine[]; method: MatchMethod }
  | { state: "etsy_without_printify"; etsy: EtsyLine }
  | { state: "printify_without_etsy"; printify: PrintifyLine };

/** How far apart a purchase and its production order may sit and still be one event. */
export const WINDOW_SECONDS = 7 * 86_400;

const normalizeSku = (sku: string) => String(sku ?? "").trim().toUpperCase();

/**
 * Match one Etsy transaction against the Printify lines still unclaimed.
 *
 * Tried strongest first. Each method either produces exactly one candidate —
 * a match — or more than one, which is an answer of its own.
 */
function attempt(
  line: EtsyLine, available: PrintifyLine[],
): { method: MatchMethod; candidates: PrintifyLine[] } | null {
  /* 1 and 2: the identifiers that settle it outright, when they exist. */
  const byExternal = available.filter(row =>
    row.externalId && (row.externalId === String(line.receiptId) ||
      row.externalId === String(line.transactionId)));
  if (byExternal.length) return { method: "external_id", candidates: byExternal };

  const byShopOrder = available.filter(row =>
    row.shopOrderId && row.shopOrderId === String(line.receiptId));
  if (byShopOrder.length) return { method: "shop_order_id", candidates: byShopOrder };

  /* 3: the Etsy transaction id appearing anywhere Printify carries an id. */
  const byTransaction = available.filter(row =>
    row.lineItemId === String(line.transactionId) ||
    row.appOrderId === String(line.transactionId));
  if (byTransaction.length) return { method: "transaction_id", candidates: byTransaction };

  /* 4: SKU, with a compatible time and the same quantity. The SKU alone is
     not enough — the same product sells repeatedly, and every one of those
     sales has an identical SKU. */
  const sku = normalizeSku(line.sku);
  if (sku) {
    const bySku = available.filter(row =>
      normalizeSku(row.sku) === sku &&
      row.quantity === line.quantity &&
      Math.abs(row.createdAt - line.createdAt) <= WINDOW_SECONDS);
    if (bySku.length) return { method: "sku_time_quantity", candidates: bySku };
  }

  /* 5: the weakest path, and only when there is no SKU to work with. */
  const byVariant = available.filter(row =>
    row.quantity === line.quantity &&
    Math.abs(row.createdAt - line.createdAt) <= WINDOW_SECONDS &&
    row.productId === String(line.productId));
  if (byVariant.length) return { method: "listing_variant_quantity", candidates: byVariant };

  return null;
}

export function reconcile(
  etsyLines: EtsyLine[], printifyLines: PrintifyLine[],
): { outcomes: Outcome[]; byMethod: Record<string, number>; counts: Record<string, number> } {
  const outcomes: Outcome[] = [];
  const claimed = new Set<string>();
  const byMethod: Record<string, number> = {};

  /*
    Oldest first, so that when two identical sales sit inside one another's
    window the earlier Etsy line takes the earlier Printify line. Deterministic
    rather than arbitrary: the same inputs must always give the same answer.
  */
  const ordered = [...etsyLines].sort((a, b) =>
    a.createdAt - b.createdAt || a.transactionId - b.transactionId);

  for (const line of ordered) {
    const available = printifyLines
      .filter(row => !claimed.has(row.lineItemId))
      .sort((a, b) => a.createdAt - b.createdAt || a.lineItemId.localeCompare(b.lineItemId));
    const found = attempt(line, available);

    if (!found) { outcomes.push({ state: "etsy_without_printify", etsy: line }); continue; }
    if (found.candidates.length > 1) {
      /*
        MORE THAN ONE FITS, SO NONE IS CHOSEN.

        Picking the closest in time would be a guess wearing a rule's clothing,
        and the resulting cost would look entirely reasonable on the wrong
        product.
      */
      outcomes.push({ state: "ambiguous", etsy: line, candidates: found.candidates, method: found.method });
      continue;
    }
    const printify = found.candidates[0];
    claimed.add(printify.lineItemId);
    byMethod[found.method] = (byMethod[found.method] ?? 0) + 1;
    outcomes.push({ state: "matched", etsy: line, printify, method: found.method });
  }

  for (const row of printifyLines)
    if (!claimed.has(row.lineItemId))
      outcomes.push({ state: "printify_without_etsy", printify: row });

  const counts: Record<string, number> = {};
  for (const outcome of outcomes) counts[outcome.state] = (counts[outcome.state] ?? 0) + 1;
  return { outcomes, byMethod, counts };
}
