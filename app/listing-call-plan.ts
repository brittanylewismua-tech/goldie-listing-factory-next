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

export type CanaryDecision = {
  useNewFlow: boolean;
  unmappedBehaviour: "legacy" | "stop";
  because: string;
};

/**
 * An unsupported blueprint never receives a guessed taxonomy.
 *
 * It either goes down the existing production path, which has been choosing
 * categories for these products all along, or it stops with a status a person
 * can read. Those are the only two options; inventing a category is not one.
 */
export function routeUnmapped(decision: CanaryDecision, blueprintTitle: string) {
  return decision.unmappedBehaviour === "stop"
    ? { publish: false as const,
        status: `${blueprintTitle} has no product mapping yet. Held rather than published with a guessed category.` }
    : { publish: true as const, via: "legacy" as const };
}

export const KEYWORD_BANK_VERSION = 1;

export type BatchItem = { artworkHash: string; blueprintTitle: string };

export type CallPlan = {
  designCalls: string[];
  /*
    ONE text call per design, covering every family it needs at once.
    Previously one per family, which was five prompts carrying the same
    design intelligence to say much the same thing five ways.
  */
  familyCopyCalls: Array<{ artworkHash: string; families: string[] }>;
  productCategorizationCalls: 0;
  unmappedBlueprints: string[];
  totalPaidCalls: number;
  /* What the same batch would have cost before, for comparison. */
  legacyPaidCalls: number;
};

export function planBatch(
  items: BatchItem[],
  { alreadyExtracted = new Set<string>(), cachedCopy = new Set<string>() }:
    { alreadyExtracted?: Set<string>; cachedCopy?: Set<string> } = {},
): CallPlan {
  const designCalls = new Set<string>();
  const familiesByDesign = new Map<string, Set<string>>();
  const unmapped = new Set<string>();

  for (const item of items) {
    /* A design already understood at the current version costs nothing. */
    if (!alreadyExtracted.has(item.artworkHash)) designCalls.add(item.artworkHash);
    const facts = productFactsFor(item.blueprintTitle);
    if (!facts.mapped) { unmapped.add(item.blueprintTitle); continue; }
    const held = familiesByDesign.get(item.artworkHash) ?? new Set<string>();
    held.add(facts.family);
    familiesByDesign.set(item.artworkHash, held);
  }

  /* Families already described at this version cost nothing; a design only
     needs a call when something is still missing. */
  const familyCopyCalls = [...familiesByDesign.entries()]
    .map(([artworkHash, families]) => ({
      artworkHash,
      families: [...families].filter(family =>
        !cachedCopy.has(`${artworkHash}:${family}`)).sort(),
    }))
    .filter(entry => entry.families.length > 0);

  return {
    designCalls: [...designCalls],
    familyCopyCalls,
    /* Categories come from a table. This is zero by construction. */
    productCategorizationCalls: 0,
    unmappedBlueprints: [...unmapped],
    totalPaidCalls: designCalls.size + familyCopyCalls.length,
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
