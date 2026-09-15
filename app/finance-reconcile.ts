/**
 * MATCHING ORDERS, AND REFUSING TO GUESS.
 *
 * One identifier does this honestly: Printify writes the Etsy receipt id into
 * metadata.shop_order_id. Everything else — SKU, title, timestamp, a price
 * that looks about right — is a coincidence generator. A shop selling the
 * same design on the same blank all month produces dozens of orders that look
 * identical on every field except the one that actually identifies them.
 *
 * So an order match requires the receipt id. Line pairing inside a matched
 * receipt may use weaker evidence, but only when that evidence is UNIQUE
 * within the receipt, because "unique within an already exact match" is a
 * different claim from "looks similar somewhere in the shop".
 */
export type EtsyLine = {
  transactionId: number; listingId: number | null; productId: string;
  variantId: number | null; quantity: number; sku: string;
};
export type PrintifyLine = {
  lineId: string; productId: string; blueprintId: number | null;
  variantId: number | null; quantity: number; sku: string;
};

export type LineMatch = {
  transactionId: number; lineId: string;
  method: "exact-line-id" | "unique-product" | "unique-variant" | "unique-quantity";
  safeForProfit: true;
};

export type LineRejection = {
  transactionId: number; candidates: number; reason: string; safeForProfit: false;
};

/**
 * Pair lines inside a receipt that already matched exactly.
 *
 * Each rule is applied only where it identifies exactly one candidate. Two
 * plausible candidates end as a rejection carrying the count, never as a
 * coin toss — an ambiguous pairing that resolves itself is indistinguishable
 * from a correct one afterwards.
 */
export function pairLines(etsy: EtsyLine[], printify: PrintifyLine[]) {
  const matches: LineMatch[] = [];
  const rejections: LineRejection[] = [];
  const takenLines = new Set<string>();
  const available = () => printify.filter(line => !takenLines.has(line.lineId));

  const claim = (transactionId: number, lineId: string, method: LineMatch["method"]) => {
    takenLines.add(lineId);
    matches.push({ transactionId, lineId, method, safeForProfit: true });
  };

  for (const line of etsy) {
    /* 2. A surviving exact line identifier. */
    const byId = available().filter(row => row.lineId && row.lineId === line.sku && line.sku);
    if (byId.length === 1) { claim(line.transactionId, byId[0].lineId, "exact-line-id"); continue; }

    /* 3. A unique product relationship inside this exact receipt match. */
    const byProduct = available().filter(row => row.productId && row.productId === line.productId);
    if (byProduct.length === 1) { claim(line.transactionId, byProduct[0].lineId, "unique-product"); continue; }

    const byVariant = available().filter(row =>
      row.variantId !== null && row.variantId === line.variantId);
    if (byVariant.length === 1) { claim(line.transactionId, byVariant[0].lineId, "unique-variant"); continue; }

    /* 4. A unique quantity relationship, and only inside the exact match. */
    const byQuantity = available().filter(row => row.quantity === line.quantity);
    if (byQuantity.length === 1) { claim(line.transactionId, byQuantity[0].lineId, "unique-quantity"); continue; }

    rejections.push({
      transactionId: line.transactionId,
      candidates: byProduct.length || byVariant.length || byQuantity.length || available().length,
      reason: byProduct.length > 1
        ? `${byProduct.length} Printify lines share this product inside the receipt.`
        : byQuantity.length > 1
          ? `${byQuantity.length} Printify lines share this quantity and nothing else distinguishes them.`
          : "No defensible pairing evidence inside this receipt.",
      safeForProfit: false,
    });
  }

  return { matches, rejections };
}

export type ReceiptStatus =
  | "fully-matched" | "partially-matched" | "unmatched" | "ambiguous"
  | "canceled" | "refunded";

export function classifyReceipt(
  { etsyLines, matched, rejected, canceled, refunded }:
  { etsyLines: number; matched: number; rejected: number;
    canceled: boolean; refunded: boolean },
): ReceiptStatus {
  /* A canceled or refunded receipt is reported as what it is, before any
     matching question, because its money moved regardless of fulfilment. */
  if (canceled) return "canceled";
  if (refunded) return "refunded";
  if (rejected > 0) return "ambiguous";
  if (matched === 0) return "unmatched";
  return matched === etsyLines ? "fully-matched" : "partially-matched";
}

/**
 * Printify orders with no Etsy receipt.
 *
 * A sample the seller ordered for themselves, or an order created through the
 * API for testing, is a real Printify charge that is NOT a cost of goods sold
 * on Etsy. Rolling it into Etsy costs would understate margin for a month in
 * which the seller simply bought themselves a shirt.
 */
export type OrphanKind = "api-sample" | "manual-order" | "missing-receipt";

export function classifyOrphan(
  { orderType, shopOrderId }: { orderType: string; shopOrderId: string },
): { kind: OrphanKind; countsAsEtsyCost: boolean; why: string } {
  const type = String(orderType ?? "").toLowerCase();
  if (type.includes("sample"))
    return { kind: "api-sample", countsAsEtsyCost: false,
      why: "A sample order. Never an Etsy cost of goods." };
  if (type.includes("manual") || (!shopOrderId && type.includes("api")))
    return { kind: "manual-order", countsAsEtsyCost: false,
      why: "Created directly, not from an Etsy sale." };
  return { kind: "missing-receipt", countsAsEtsyCost: false,
    why: "Carries no Etsy receipt id. Held for review rather than assigned to a month." };
}
