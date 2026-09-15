/**
 * DOES THIS CAPTURED DESIGN BELONG TO A KNOWN ETSY LISTING?
 *
 * Forty-four designs are stored with no listing id, because they came from a
 * shop backfill where none was in hand. A link would turn each one from "a
 * design this shop has" into "the design behind these sales" — which is the
 * whole difference between captured and sales-backed.
 *
 * SO THE BAR IS HIGH AND THE EVIDENCE IS RECORDED. Every attempt stores how
 * it was decided, what it looked at, how many candidates it found and why the
 * rest were rejected. Anything with more than one candidate stays unlinked:
 * a wrong link does not look wrong, it looks like a design that sold.
 *
 * Title similarity never creates a stored relationship. SKUs were measured
 * differing between the two systems on this very shop, so a SKU match is only
 * trusted when both sides carry the identical string.
 */

export type LinkMethod =
  | "printify-metadata-listing-id"
  | "external-id"
  | "order-receipt-relationship"
  | "identical-sku"
  | "identity-and-timestamp";

export type Confidence = "exact" | "strong" | "weak";

export type LinkAttempt = {
  productId: string;
  listingId: number | null;
  method: LinkMethod | null;
  confidence: Confidence | null;
  evidence: string[];
  candidates: number;
  rejected: string | null;
  /* Only exact links may support a claim about what sold. */
  safeForSalesBackedUse: boolean;
};

export type PrintifyCandidate = {
  productId: string;
  /* Anything in the product or its metadata that looks like an id. */
  metadataListingId?: number | null;
  externalId?: string;
  skus: string[];
  title: string;
  createdAt: number;
  variantCount: number;
};

export type EtsyCandidate = {
  listingId: number;
  skus: string[];
  title: string;
  createdAt: number;
  /* Present when a receipt for this listing named a Printify order that
     named this product — the strongest relationship available here. */
  productIdsFromOrders: string[];
};

const normalizeSku = (sku: string) => String(sku ?? "").trim().toUpperCase();

/**
 * One product against every known listing, strongest evidence first.
 *
 * Returns the attempt whether or not it succeeded, because a rejection with
 * its reason is as much a result as a link.
 */
export function attemptLink(
  product: PrintifyCandidate, listings: EtsyCandidate[],
): LinkAttempt {
  const base: LinkAttempt = {
    productId: product.productId, listingId: null, method: null, confidence: null,
    evidence: [], candidates: 0, rejected: null, safeForSalesBackedUse: false,
  };

  /* 1. Printify was told the listing id outright. */
  if (product.metadataListingId) {
    const found = listings.filter(row => row.listingId === product.metadataListingId);
    if (found.length === 1)
      return {
        ...base, listingId: found[0].listingId, method: "printify-metadata-listing-id",
        confidence: "exact", evidence: ["metadata.listing_id"], candidates: 1,
        safeForSalesBackedUse: true,
      };
  }

  /* 2. An external id naming the listing. */
  if (product.externalId) {
    const found = listings.filter(row => String(row.listingId) === product.externalId);
    if (found.length === 1)
      return {
        ...base, listingId: found[0].listingId, method: "external-id",
        confidence: "exact", evidence: ["external_id"], candidates: 1,
        safeForSalesBackedUse: true,
      };
  }

  /* 3. An order for this product was matched to a receipt for this listing.
        Transitive, but every hop in it was an exact identifier match. */
  const throughOrders = listings.filter(row =>
    row.productIdsFromOrders.includes(product.productId));
  if (throughOrders.length === 1)
    return {
      ...base, listingId: throughOrders[0].listingId, method: "order-receipt-relationship",
      confidence: "exact", evidence: ["printify order → metadata.shop_order_id → etsy receipt"],
      candidates: 1, safeForSalesBackedUse: true,
    };
  if (throughOrders.length > 1)
    return {
      ...base, method: "order-receipt-relationship", candidates: throughOrders.length,
      rejected: "One product appears under several listings' orders.",
      evidence: ["printify order → etsy receipt"],
    };

  /* 4. Identical SKUs on both sides. Measured on this shop: Etsy SKU
        1088299889 against Printify 13857878400887176023 — they routinely
        differ, so this only fires on an exact string match. */
  const productSkus = new Set(product.skus.map(normalizeSku).filter(Boolean));
  if (productSkus.size) {
    const found = listings.filter(row =>
      row.skus.map(normalizeSku).some(sku => sku && productSkus.has(sku)));
    if (found.length === 1)
      return {
        ...base, listingId: found[0].listingId, method: "identical-sku",
        confidence: "strong", evidence: ["sku"], candidates: 1,
        /* Strong, not exact: two products can legitimately carry one SKU. */
        safeForSalesBackedUse: false,
      };
    if (found.length > 1)
      return {
        ...base, method: "identical-sku", candidates: found.length,
        rejected: "The same SKU appears on more than one listing.", evidence: ["sku"],
      };
  }

  /*
    5. Structure and timing. Deliberately last, deliberately never safe for a
       sales-backed claim, and it requires a single candidate within a day —
       anything looser is a guess with a method name attached.
  */
  const sameDay = listings.filter(row =>
    Math.abs(row.createdAt - product.createdAt) <= 86_400);
  if (sameDay.length === 1)
    return {
      ...base, listingId: sameDay[0].listingId, method: "identity-and-timestamp",
      confidence: "weak", evidence: ["created within 24h"], candidates: 1,
      safeForSalesBackedUse: false,
    };

  return {
    ...base,
    candidates: sameDay.length,
    rejected: sameDay.length > 1
      ? "Several listings were created in the same window."
      : "No exact identifier, SKU or timing evidence connects this product to a listing.",
  };
}

/** What a run of attempts amounts to, for the report. */
export function summarise(attempts: LinkAttempt[]) {
  const byMethod: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  for (const attempt of attempts) {
    if (attempt.method) byMethod[attempt.method] = (byMethod[attempt.method] ?? 0) + 1;
    if (attempt.confidence)
      byConfidence[attempt.confidence] = (byConfidence[attempt.confidence] ?? 0) + 1;
  }
  return {
    attempted: attempts.length,
    linked: attempts.filter(row => row.listingId !== null).length,
    safeForSalesBackedUse: attempts.filter(row => row.safeForSalesBackedUse).length,
    unlinked: attempts.filter(row => row.listingId === null).length,
    ambiguous: attempts.filter(row => row.listingId === null && row.candidates > 1).length,
    byMethod, byConfidence,
  };
}
