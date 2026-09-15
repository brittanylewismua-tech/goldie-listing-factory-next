import { productFamily } from "./product-type-utils.ts";

/**
 * THE PRODUCT IS NOT IN THE ARTWORK.
 *
 * The live details call sends the design image and then instructs the model
 * that the artwork "must never change the product category, age group,
 * garment type, or department" — it pays to look at a picture it has ruled
 * out of the answer. Category, department and physical attributes follow
 * from the Printify blueprint alone, which makes them a table.
 *
 * AN UNMAPPED BLUEPRINT SURFACES AS UNMAPPED. The failure this replaces was
 * a wrong-garment title, and a guess that looks like an answer is how that
 * happens. Nothing here invents a category it does not hold.
 */
export const PRODUCT_FACTS_VERSION = 1;

export type ProductFacts = {
  family: string;
  category: string;
  objectType: string;
  department: string;
  ageGroup: string | null;
  attributes: Record<string, string>;
  requiredEtsyFields: string[];
  mapped: true;
} | { family: ""; mapped: false; because: string };

const APPAREL_REQUIRED = ["Sleeve length", "Neckline", "Garment fit"];
const BASE_REQUIRED = ["Who made it", "What is it", "When was it made"];

const TABLE: Record<string, Omit<Extract<ProductFacts, { mapped: true }>, "family" | "mapped">> = {
  tee: { category: "Clothing > Unisex Adult Clothing > Tops & Tees > T-shirts",
    objectType: "t-shirt", department: "Unisex Adult", ageGroup: "Adult",
    attributes: { "Sleeve length": "Short sleeve", Neckline: "Crew neck" },
    requiredEtsyFields: [...BASE_REQUIRED, ...APPAREL_REQUIRED] },
  hoodie: { category: "Clothing > Unisex Adult Clothing > Hoodies & Sweatshirts",
    objectType: "hoodie", department: "Unisex Adult", ageGroup: "Adult",
    attributes: { "Sleeve length": "Long sleeve", Neckline: "Hooded" },
    requiredEtsyFields: [...BASE_REQUIRED, ...APPAREL_REQUIRED] },
  crewneck: { category: "Clothing > Unisex Adult Clothing > Hoodies & Sweatshirts",
    objectType: "sweatshirt", department: "Unisex Adult", ageGroup: "Adult",
    attributes: { "Sleeve length": "Long sleeve", Neckline: "Crew neck" },
    requiredEtsyFields: [...BASE_REQUIRED, ...APPAREL_REQUIRED] },
  tank: { category: "Clothing > Unisex Adult Clothing > Tops & Tees > Tanks",
    objectType: "tank top", department: "Unisex Adult", ageGroup: "Adult",
    attributes: { "Sleeve length": "Sleeveless", Neckline: "Scoop neck" },
    requiredEtsyFields: [...BASE_REQUIRED, ...APPAREL_REQUIRED] },
  longSleeve: { category: "Clothing > Unisex Adult Clothing > Tops & Tees > T-shirts",
    objectType: "long sleeve shirt", department: "Unisex Adult", ageGroup: "Adult",
    attributes: { "Sleeve length": "Long sleeve", Neckline: "Crew neck" },
    requiredEtsyFields: [...BASE_REQUIRED, ...APPAREL_REQUIRED] },
  mug: { category: "Home & Living > Kitchen & Dining > Drink & Barware > Mugs",
    objectType: "mug", department: "Home", ageGroup: null,
    attributes: { Material: "Ceramic", Capacity: "11 oz" },
    requiredEtsyFields: BASE_REQUIRED },
  tumbler: { category: "Home & Living > Kitchen & Dining > Drink & Barware > Tumblers",
    objectType: "tumbler", department: "Home", ageGroup: null,
    attributes: { Material: "Stainless steel" }, requiredEtsyFields: BASE_REQUIRED },
  tote: { category: "Bags & Purses > Totes", objectType: "tote bag",
    department: "Accessories", ageGroup: null,
    attributes: { Material: "Cotton canvas" }, requiredEtsyFields: BASE_REQUIRED },
  poster: { category: "Art & Collectibles > Prints", objectType: "poster",
    department: "Wall Decor", ageGroup: null,
    attributes: { Orientation: "Portrait" }, requiredEtsyFields: BASE_REQUIRED },
  sticker: { category: "Paper & Party Supplies > Paper > Stickers, Labels & Tags > Stickers",
    objectType: "sticker", department: "Paper Goods", ageGroup: null,
    attributes: { Material: "Vinyl" }, requiredEtsyFields: BASE_REQUIRED },
  blanket: { category: "Home & Living > Bedding > Blankets & Throws",
    objectType: "blanket", department: "Home", ageGroup: null,
    attributes: { Material: "Fleece" }, requiredEtsyFields: BASE_REQUIRED },
  koozie: { category: "Home & Living > Kitchen & Dining > Drink & Barware > Drink Sleeves",
    objectType: "can cooler", department: "Home", ageGroup: null,
    attributes: { Material: "Neoprene" }, requiredEtsyFields: BASE_REQUIRED },
  phoneCase: { category: "Electronics & Accessories > Phone Cases",
    objectType: "phone case", department: "Accessories", ageGroup: null,
    attributes: { Material: "Polycarbonate" }, requiredEtsyFields: BASE_REQUIRED },
};

export function productFactsFor(blueprintTitle: string): ProductFacts {
  const family = productFamily(blueprintTitle);
  const entry = family ? TABLE[family] : undefined;
  if (!entry)
    return { family: "", mapped: false,
      because: `No product mapping for "${blueprintTitle}". Add the blueprint before publishing; nothing here will guess a category.` };
  return { family, mapped: true, ...entry };
}

/** Which of the supported families still have no mapping. For the audit. */
export const mappedFamilies = () => Object.keys(TABLE);
