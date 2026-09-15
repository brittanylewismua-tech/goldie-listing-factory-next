import { productFactsFor } from "./product-facts.ts";

/**
 * WHAT A BATCH WILL COST, DECIDED BEFORE IT RUNS.
 *
 * The old flow made two vision calls per product with no plan at all — the
 * count was whatever the loop happened to do, which for one design across
 * twenty products was forty. Planning the calls first makes the number a
 * thing that can be asserted in a test rather than discovered on an invoice.
 *
 * Identity per layer:
 *   design      one per unique member artwork hash
 *   product     none, deterministic from the blueprint
 *   listingText one per design and product FAMILY, not per product
 *   mockup      one per source image, operation and configuration
 */
export const LISTING_FLOW_FLAG = "listingFactoryLayeredFlow";
export const KEYWORD_BANK_VERSION = 1;

export type BatchItem = { artworkHash: string; blueprintTitle: string };

export type CallPlan = {
  designCalls: string[];
  /* Design plus family. Twenty apparel products sharing one design need one
     blurb, because the requirements they must satisfy are identical. */
  listingTextCalls: string[];
  productCategorizationCalls: 0;
  unmappedBlueprints: string[];
  totalPaidCalls: number;
  /* What the same batch would have cost before, for comparison. */
  legacyPaidCalls: number;
};

export function planBatch(
  items: BatchItem[], { alreadyExtracted = new Set<string>() }: { alreadyExtracted?: Set<string> } = {},
): CallPlan {
  const designCalls = new Set<string>();
  const listingTextCalls = new Set<string>();
  const unmapped = new Set<string>();

  for (const item of items) {
    /* A design already understood at the current version costs nothing. */
    if (!alreadyExtracted.has(item.artworkHash)) designCalls.add(item.artworkHash);
    const facts = productFactsFor(item.blueprintTitle);
    if (!facts.mapped) { unmapped.add(item.blueprintTitle); continue; }
    listingTextCalls.add(`${item.artworkHash}:${facts.family}:${KEYWORD_BANK_VERSION}`);
  }

  return {
    designCalls: [...designCalls],
    listingTextCalls: [...listingTextCalls],
    /* Categories come from a table. This is zero by construction. */
    productCategorizationCalls: 0,
    unmappedBlueprints: [...unmapped],
    totalPaidCalls: designCalls.size + listingTextCalls.size,
    legacyPaidCalls: items.length * 2,
  };
}

/**
 * Titles and tags are composed, not generated.
 *
 * The wording is already transcribed and the keyword phrases already chosen
 * against a seller-approved bank; assembling them with the product noun is
 * string work. Only the blurb reads as prose a person wrote, so only the
 * blurb needs a model — and it needs no image, because everything it knows
 * about the artwork is in the stored design intelligence.
 */
export const deterministicOutputs = [
  "title", "tags", "category", "attributes", "requiredEtsyFields",
] as const;
export const modelOutputs = ["blurb", "optionalFields"] as const;
