/**
 * WHAT EACH MONEY ROW ACTUALLY IS.
 *
 * The single most expensive mistake available here is calling something
 * revenue that is not. `grandtotal` is what the buyer's card was charged: it
 * contains sales tax Etsy collects and remits on the seller's behalf, and
 * treating it as revenue overstates every month and every margin built on it.
 *
 * So nothing is revenue by default. Each row is classified explicitly, and a
 * row nobody has classified is `neither` — counted in no total until somebody
 * decides what it is.
 */
export type Bucket = "revenue" | "cost" | "tax" | "payout" | "neither";
export type Attribution = "receipt" | "transaction" | "listing" | "shop";

export type Classified = {
  normalized: string;
  bucket: Bucket;
  attribution: Attribution;
  /* Whether this row may take part in a profit figure. Payouts never can:
     moving money to a bank is not an expense. */
  profitRelevant: boolean;
  why: string;
};

/*
  Etsy's ledger types, mapped to what they mean for a seller's operating
  profit. The raw string is always retained beside this, so a future Etsy
  rename shows up as an unmapped type rather than as a silent zero.
*/
const LEDGER: Record<string, Classified> = {
  sale: { normalized: "product-revenue", bucket: "revenue", attribution: "receipt",
    profitRelevant: true, why: "Goods sold." },
  shipping_label: { normalized: "shipping-label", bucket: "cost", attribution: "receipt",
    profitRelevant: true, why: "Postage the seller bought. A real cost of the sale." },
  shipping: { normalized: "shipping-collected", bucket: "revenue", attribution: "receipt",
    profitRelevant: true, why: "Shipping the buyer paid is money the seller received." },
  tax: { normalized: "marketplace-tax", bucket: "tax", attribution: "receipt",
    profitRelevant: false,
    why: "Collected and remitted by Etsy. Never seller revenue." },
  vat: { normalized: "marketplace-tax", bucket: "tax", attribution: "receipt",
    profitRelevant: false, why: "Collected and remitted by Etsy." },
  fee: { normalized: "etsy-transaction-fee", bucket: "cost", attribution: "transaction",
    profitRelevant: true, why: "Charged per sale." },
  transaction_fee: { normalized: "etsy-transaction-fee", bucket: "cost",
    attribution: "transaction", profitRelevant: true, why: "Charged per sale." },
  processing_fee: { normalized: "etsy-processing-fee", bucket: "cost",
    attribution: "receipt", profitRelevant: true, why: "Payment processing." },
  payment_processing_fee: { normalized: "etsy-processing-fee", bucket: "cost",
    attribution: "receipt", profitRelevant: true, why: "Payment processing." },
  listing_fee: { normalized: "etsy-listing-fee", bucket: "cost", attribution: "listing",
    profitRelevant: true, why: "Charged to list." },
  renewal_fee: { normalized: "etsy-renewal-fee", bucket: "cost", attribution: "listing",
    profitRelevant: true, why: "Charged to renew." },
  listing: { normalized: "etsy-listing-fee", bucket: "cost", attribution: "listing",
    profitRelevant: true, why: "Charged to list." },
  marketing: { normalized: "etsy-advertising-fee", bucket: "cost", attribution: "shop",
    profitRelevant: true, why: "Etsy Ads." },
  advertising: { normalized: "etsy-advertising-fee", bucket: "cost", attribution: "shop",
    profitRelevant: true, why: "Etsy Ads." },
  offsite_ads: { normalized: "etsy-offsite-ads-fee", bucket: "cost", attribution: "receipt",
    profitRelevant: true, why: "Offsite Ads, charged against a specific order." },
  operating_fee: { normalized: "etsy-operating-fee", bucket: "cost", attribution: "shop",
    profitRelevant: true, why: "Regulatory operating fee." },
  regulatory_operating_fee: { normalized: "etsy-operating-fee", bucket: "cost",
    attribution: "shop", profitRelevant: true, why: "Regulatory operating fee." },
  refund: { normalized: "refund", bucket: "revenue", attribution: "receipt",
    profitRelevant: true, why: "Reduces revenue; sign is carried by the amount." },
  /*
    A payout is money moving from Etsy to a bank. It is not income and not an
    expense, and counting it would double every figure in the month.
  */
  deposit: { normalized: "payout", bucket: "payout", attribution: "shop",
    profitRelevant: false, why: "Money moved to the bank. Not operating profit." },
  payment: { normalized: "payout", bucket: "payout", attribution: "shop",
    profitRelevant: false, why: "Money moved to the bank. Not operating profit." },
  credit: { normalized: "fee-credit", bucket: "cost", attribution: "shop",
    profitRelevant: true, why: "A credit or fee reversal, reducing cost." },
};

/*
  MEASURED: ETSY'S LEDGER HAS NO TYPE FIELD.

  The first pass read entry_type and ledger_entry_type; neither exists, so
  every one of 3,856 rows classified as unmapped with an empty type and every
  revenue and fee total came out as zero. Etsy carries the kind of entry in
  the human-readable `description` - "Transaction fee: ...", "Listing fee",
  "Sale", "Refund", "Deposit" - so that is what has to be read.

  Matching is on whole phrases anchored to the start where possible, because
  a description contains the listing title too, and a shirt called "Deposit
  Day" must not be classified as a bank transfer.
*/
const DESCRIPTION_PATTERNS: Array<[RegExp, string]> = [
  [/^offsite ads?\b|offsite ad fee/i, "offsite_ads"],
  [/^etsy ads?\b|^advertising\b/i, "advertising"],
  [/^transaction fee/i, "transaction_fee"],
  [/^processing fee|^payment processing/i, "processing_fee"],
  [/^listing fee/i, "listing_fee"],
  [/^(auto[- ]?)?renew(al)? (fee|sold)/i, "renewal_fee"],
  [/^regulatory operating fee|^operating fee/i, "regulatory_operating_fee"],
  [/^shipping label|^postage/i, "shipping_label"],
  [/^refund/i, "refund"],
  [/^credit\b|fee refund|fee reversal/i, "credit"],
  [/^deposit\b|^payout\b/i, "deposit"],
  [/^tax\b|sales tax|^vat\b/i, "tax"],
  [/^shipping\b/i, "shipping"],
  [/^sale\b|^order\b/i, "sale"],
];

export function classifyLedgerType(rawType: string): Classified {
  const text = String(rawType ?? "").trim();
  const key = text.toLowerCase().replace(/[\s-]+/g, "_");
  const found = LEDGER[key];
  if (found) return found;

  /* Fall back to Etsy's description wording. */
  for (const [pattern, mapped] of DESCRIPTION_PATTERNS)
    if (pattern.test(text)) {
      const entry = LEDGER[mapped];
      if (entry) return entry;
    }
  /*
    AN UNKNOWN TYPE IS NOT A ZERO.

    Dropping it would quietly understate costs; guessing it would quietly
    misstate them. It is carried as `neither` and surfaced for review, which
    is the only option that cannot produce a wrong number.
  */
  return {
    normalized: `unmapped:${key || "empty"}`,
    bucket: "neither", attribution: "shop", profitRelevant: false,
    why: `Etsy ledger type "${rawType}" is not mapped. Excluded from every total until it is.`,
  };
}

export const isUnmapped = (entry: Classified) => entry.normalized.startsWith("unmapped:");

/**
 * Seller revenue from a receipt's own components.
 *
 * NOT grandtotal. Revenue is what the seller sold plus the shipping they were
 * paid, less seller-funded discounts. Tax is excluded because it was never
 * the seller's, and a marketplace-funded discount is excluded because Etsy,
 * not the seller, paid for it.
 */
export type ReceiptComponents = {
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  /* Negative or positive, treated as a reduction either way. */
  sellerDiscountMinor: number;
  marketplaceDiscountMinor: number;
  grandTotalMinor: number;
};

export function sellerRevenueMinor(parts: ReceiptComponents): number {
  return parts.subtotalMinor
    + parts.shippingMinor
    - Math.abs(parts.sellerDiscountMinor);
}

/**
 * Does the receipt's own arithmetic agree with itself?
 *
 * When components do not reconstruct the grand total, something is present
 * that this code does not model, and that is worth saying out loud rather
 * than absorbing into a revenue figure.
 */
export function receiptArithmetic(parts: ReceiptComponents) {
  const rebuilt = parts.subtotalMinor + parts.shippingMinor + parts.taxMinor
    - Math.abs(parts.sellerDiscountMinor) - Math.abs(parts.marketplaceDiscountMinor);
  const differenceMinor = parts.grandTotalMinor - rebuilt;
  return {
    rebuiltMinor: rebuilt,
    differenceMinor,
    agrees: differenceMinor === 0,
    sellerRevenueMinor: sellerRevenueMinor(parts),
    taxExcludedMinor: parts.taxMinor,
  };
}
