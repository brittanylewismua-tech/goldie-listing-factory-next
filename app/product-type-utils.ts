const PRODUCT_NOUN_GROUPS = {
  tee: ["t shirt", "tshirt", "tee", "shirt", "short sleeve"],
  hoodie: ["hoodie", "hooded sweatshirt"],
  crewneck: ["crewneck", "crew neck", "sweatshirt", "sweater"],
  tank: ["tank top", "tank"],
  longSleeve: ["long sleeve", "long sleeved", "longsleeve"],
  koozie: ["koozie", "coozie", "can cooler"], mug: ["mug", "cup"], tumbler: ["tumbler"],
  tote: ["tote", "bag"], poster: ["poster", "print", "wall art"], sticker: ["sticker"],
  blanket: ["blanket"], banner: ["banner"], sash: ["sash"], decor: ["decor", "decoration", "decorations"],
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

export function namesExcludedProduct(phrase: string, excluded: string[]) {
  const normalized = ` ${normalizeProductText(phrase)} `;
  return excluded.some((noun) => normalized.includes(` ${noun} `));
}
