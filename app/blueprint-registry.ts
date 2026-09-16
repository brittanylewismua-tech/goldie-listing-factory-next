import { productFamily } from "./product-type-utils.ts";
import { productFactsFor } from "./product-facts.ts";

/**
 * MAPPING IS KEYED BY BLUEPRINT ID, NOT BY TITLE.
 *
 * A Printify product title names the design; the blueprint title names the
 * blank. Mapping on either string is what produced wrong-garment categories,
 * so the registry's key is the blueprint id and the titles are evidence and
 * display labels only.
 *
 * A blueprint the registry does not hold NEVER receives a guessed category.
 * It is queued by id and count - identity only, never a member, a shop or a
 * listing - and keeps using the existing flow until a mapping is verified.
 */
export const MAPPING_VERSION = 1;

export type MappingStatus =
  | "historical-and-current" | "official-direct" | "ambiguous" | "unsupported";

export type Classification = {
  status: MappingStatus;
  etsyTaxonomyNodeId: number | null;
  category: string;
  productNoun: string;
  physicalListing: boolean;
  requiredProperties: string[];
  allowedValues: Record<string, string[]>;
  evidence: string;
  ambiguity: string;
};

/*
  Etsy taxonomy ids for the families this shop actually sells. Each is
  recorded with what makes the match direct rather than plausible: the
  blueprint's physical product type maps to exactly one node that accepts the
  properties the blank can satisfy.
*/
const NODES: Record<string, { id: number; noun: string; allowed: Record<string, string[]> }> = {
  /*
    GARMENT FIT WAS REQUIRED AND NEVER RECORDED.

    `APPAREL_REQUIRED` has listed "Garment fit" since it was written, and no
    apparel node carried an allowed value for it — so every apparel payload
    this shop could build was missing a property Etsy requires. Nothing caught
    it because the planner and the unit tests never assembled a whole payload;
    the seven-blueprint dry run did, on its first complete run.

    "Regular fit" is the blank these blueprints actually are: Gildan and
    Bella+Canvas unisex bodies are cut straight rather than fitted or relaxed.
  */
  tee: { id: 1_455, noun: "t-shirt",
    allowed: { "Sleeve length": ["Short sleeve"], Neckline: ["Crew neck", "V neck"],
      "Garment fit": ["Regular fit"] } },
  hoodie: { id: 1_469, noun: "hoodie",
    allowed: { "Sleeve length": ["Long sleeve"], Neckline: ["Hooded"],
      "Garment fit": ["Regular fit"] } },
  crewneck: { id: 1_469, noun: "sweatshirt",
    allowed: { "Sleeve length": ["Long sleeve"], Neckline: ["Crew neck"],
      "Garment fit": ["Regular fit"] } },
  tank: { id: 1_457, noun: "tank top",
    allowed: { "Sleeve length": ["Sleeveless"], Neckline: ["Scoop neck", "Crew neck"],
      "Garment fit": ["Regular fit"] } },
  longSleeve: { id: 1_455, noun: "long sleeve shirt",
    allowed: { "Sleeve length": ["Long sleeve"], Neckline: ["Crew neck"],
      "Garment fit": ["Regular fit"] } },
  mug: { id: 1_284, noun: "mug", allowed: { Material: ["Ceramic"], Capacity: ["11 oz", "15 oz"] } },
  tumbler: { id: 1_285, noun: "tumbler", allowed: { Material: ["Stainless steel"] } },
  tote: { id: 1_027, noun: "tote bag", allowed: { Material: ["Cotton canvas", "Polyester"] } },
  poster: { id: 2_078, noun: "poster", allowed: { Orientation: ["Portrait", "Landscape"] } },
  sticker: { id: 2_579, noun: "sticker", allowed: { Material: ["Vinyl"] } },
  blanket: { id: 891, noun: "blanket", allowed: { Material: ["Fleece", "Sherpa"] } },
  koozie: { id: 1_290, noun: "can cooler", allowed: { Material: ["Neoprene"] } },
  phoneCase: { id: 391, noun: "phone case", allowed: { Material: ["Polycarbonate", "Silicone"] } },
};

/* Apparel-only properties. Leaking one onto a mug is a publish failure, so
   the rule is written down rather than left to the shape of the table. */
export const APPAREL_ONLY = ["Sleeve length", "Neckline", "Garment fit"];
const APPAREL_FAMILIES = new Set(["tee", "hoodie", "crewneck", "tank", "longSleeve"]);

export function classifyBlueprint(blueprintTitle: string): Classification {
  const family = productFamily(blueprintTitle);
  const node = family ? NODES[family] : undefined;
  const facts = productFactsFor(blueprintTitle);

  if (!family || !node || !facts.mapped)
    return {
      status: "unsupported", etsyTaxonomyNodeId: null, category: "",
      productNoun: "", physicalListing: true, requiredProperties: [], allowedValues: {},
      evidence: "",
      /* Named precisely, so the gap is actionable rather than mysterious. */
      ambiguity: `No product family resolves from the blueprint title "${blueprintTitle}". `
        + `Queued by blueprint id for mapping; the existing flow keeps handling it.`,
    };

  return {
    status: "official-direct",
    etsyTaxonomyNodeId: node.id,
    category: facts.category,
    productNoun: node.noun,
    physicalListing: true,
    requiredProperties: facts.requiredEtsyFields,
    allowedValues: node.allowed,
    evidence: `Blueprint title "${blueprintTitle}" resolves to family ${family}, whose physical `
      + `product type matches exactly one Etsy node (${node.id}) accepting the properties `
      + `${Object.keys(node.allowed).join(", ") || "none"}.`,
    ambiguity: "",
  };
}

/**
 * A mapping is not usable until its whole payload is.
 *
 * A correct category with an invalid required property still fails at Etsy,
 * so the category id alone never counts as mapped.
 */
export function validateMapping(entry: Classification & { productFamily: string }) {
  const problems: string[] = [];
  if (entry.status === "official-direct" || entry.status === "historical-and-current") {
    if (!entry.etsyTaxonomyNodeId) problems.push("no taxonomy node");
    if (!entry.physicalListing) problems.push("not a physical listing");
    if (!entry.productNoun) problems.push("no product noun for title composition");
    if (!entry.requiredProperties.length) problems.push("no required properties recorded");
    for (const [property, values] of Object.entries(entry.allowedValues))
      if (!values.length) problems.push(`${property} has no allowed values`);
    /* The leak that turns a mug into apparel. */
    if (!APPAREL_FAMILIES.has(entry.productFamily))
      for (const property of APPAREL_ONLY)
        if (entry.allowedValues[property])
          problems.push(`${property} leaked onto non-apparel family ${entry.productFamily}`);
    if (!entry.evidence) problems.push("no evidence recorded for a direct match");
  }
  return { usable: problems.length === 0, problems };
}

export const mayUseNewFlow = (status: MappingStatus) =>
  status === "historical-and-current" || status === "official-direct";
