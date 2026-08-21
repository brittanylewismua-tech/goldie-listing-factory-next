const PRODUCT_NOUN_GROUPS = {
  tee: ["t shirt", "tshirt", "tee", "shirt", "short sleeve"],
  hoodie: ["hoodie", "hooded sweatshirt"],
  crewneck: ["crewneck", "crew neck", "sweatshirt", "sweater"],
  tank: ["tank top", "tank"],
  longSleeve: ["long sleeve", "long sleeved", "longsleeve"],
  koozie: ["koozie", "coozie", "can cooler"], mug: ["mug", "cup"], tumbler: ["tumbler"],
  tote: ["tote", "bag"], poster: ["poster", "print", "wall art"], sticker: ["sticker"],
  blanket: ["blanket"], banner: ["banner"], sash: ["sash"], decor: ["decor", "decoration"],
  // Party goods that share bachelorette/bridal keyword banks with apparel. These
  // are the nouns that produced the original wrong-garment titles.
  accessory: ["sunglass", "sunglasses", "tattoo", "tapestry", "keychain", "key chain",
    "pin", "patch", "magnet", "coaster", "napkin", "balloon", "garland", "backdrop",
    "candle", "invitation", "veil", "fan", "cup"],
} as const;

const normalizeProductText = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function productFamily(blueprintTitle: string) {
  const title = normalizeProductText(blueprintTitle);
  if (/hoodie|hooded sweatshirt/.test(title)) return "hoodie";
  if (/crewneck|crew neck|sweatshirt|sweater/.test(title)) return "crewneck";
  if (/tank top|\btank\b/.test(title)) return "tank";
  if (/long sleeve|longsleeve/.test(title)) return "longSleeve";
  if (/t shirt|tshirt|\btee\b|\bshirt\b/.test(title)) return "tee";
  if (/koozie|coozie|can cooler/.test(title)) return "koozie";
  if (/tumbler/.test(title)) return "tumbler";
  if (/\bmug\b|\bcup\b/.test(title)) return "mug";
  if (/\btote\b|\bbag\b/.test(title)) return "tote";
  if (/poster|\bprint\b|wall art/.test(title)) return "poster";
  if (/sticker/.test(title)) return "sticker";
  if (/blanket/.test(title)) return "blanket";
  return "";
}

export function excludedProductNouns(blueprintTitle: string) {
  const family = productFamily(blueprintTitle);
  return [...new Set(Object.entries(PRODUCT_NOUN_GROUPS).filter(([name]) => name !== family).flatMap(([, nouns]) => nouns))];
}

/* Every written form of a product noun.
 *
 * The first version of this matched whole words only, so "koozie" was blocked
 * but "koozies" and "coozies" walked straight into a tee title — which is the
 * exact defect this file was created to stop (D74). Sellers write keyword banks
 * in the plural far more often than the singular, so plurals are the common
 * case, not the edge case. */
function nounForms(noun: string): string[] {
  const forms = new Set([noun]);
  if (noun.endsWith("y")) forms.add(`${noun.slice(0, -1)}ies`);
  else if (/(s|x|z|ch|sh)$/.test(noun)) forms.add(`${noun}es`);
  else forms.add(`${noun}s`);
  if (noun.endsWith("s")) forms.add(noun.slice(0, -1));
  return [...forms];
}

export function namesExcludedProduct(phrase: string, excluded: string[]) {
  const normalized = ` ${normalizeProductText(phrase)} `;
  return excluded.some((noun) => nounForms(noun).some((form) => normalized.includes(` ${form} `)));
}
