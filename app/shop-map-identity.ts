/**
 * A WORLD IS A PERSON, NOT A PRODUCT.
 *
 * The first build produced "Women's Tees", "Sweaters & Hoodies", "Feminist
 * Mugs" and "For Her". Those are a garment, a garment, a theme split by
 * garment, and a gift-shop aisle. None of them describes somebody.
 *
 * The test every label has to pass: does this name a recognisable person,
 * identity, belief, community or occasion that several DIFFERENT products
 * could serve? "Feminist" passes — it can be a tee, a mug, a sticker.
 * "Feminist Mugs" fails, because the mug is the product, not the buyer.
 *
 * So the dimensions are kept apart and never concatenated:
 *
 *   world          the customer identity, belief or community
 *   subWorld       a narrower territory inside it
 *   productFamily  the physical item, an analysis dimension INSIDE a world
 *   messageTheme   the creative territory
 *   recipient      who it is bought for
 *   occasion       when it is bought
 *
 * World Builder, audited first, already defines a world this way: a customer
 * universe, not a product line. Shop Map now agrees with it.
 */
export type Dimensions = {
  listingId: number;
  world: string;
  subWorld: string;
  productFamily: string;
  messageTheme: string;
  recipient: string;
  occasion: string;
  evidence: string[];
};

/*
  Identity, belief and community signals. These are STRUCTURES that recur in
  print-on-demand, not a mapping invented for one shop: a shop with none of
  them simply classifies nothing, which is the correct outcome.
*/
const IDENTITY: Array<[string, string[]]> = [
  ["Feminist", ["feminist", "feminism", "smash the patriarchy", "patriarchy",
    "girl power", "womens rights", "women's rights", "equal rights", "equality",
    "pro choice", "pro-choice", "reproductive rights", "roe", "my body",
    "women are", "strong women", "nasty woman", "rbg", "suffragette"]],
  ["Political resistance", ["resist", "anti trump", "anti-trump", "fuck trump",
    "vote", "voting", "democracy", "protest", "activist", "activism",
    "human rights", "civil rights", "blm", "black lives"]],
  ["LGBTQ pride", ["pride", "lgbt", "lgbtq", "queer", "lesbian", "gay",
    "trans", "transgender", "nonbinary", "non binary", "genderfluid", "bisexual"]],
  ["Motherhood", ["mama", "mom", "mother", "motherhood", "mommy", "momlife",
    "mom life", "boy mom", "girl mom", "new mom", "pregnancy"]],
  ["Dog people", ["dog mom", "dog dad", "dachshund", "weiner dog", "wiener dog",
    "doxie", "puppy", "rescue dog", "dog lover", "corgi", "golden retriever"]],
  ["Cat people", ["cat mom", "cat dad", "cat lady", "kitten", "cat lover"]],
  ["Nurses", ["nurse", "nursing", "rn", "er nurse", "icu"]],
  ["Teachers", ["teacher", "teaching", "kindergarten", "classroom", "educator"]],
  ["Witchy", ["witch", "witchy", "coven", "tarot", "crystals", "moon phase",
    "astrology", "zodiac", "spooky", "occult"]],
  ["Book lovers", ["book lover", "bookish", "reader", "reading", "librarian",
    "bookworm", "smut", "romantasy"]],
  ["Horse girls", ["horse", "equestrian", "pony", "barrel racing", "rodeo"]],
  ["Grief and remembrance", ["memorial", "in memory", "remembrance", "grief",
    "angel wings", "heaven", "loss"]],
  ["Faith", ["jesus", "christian", "faith", "bible", "blessed", "god is",
    "prayer", "church"]],
  ["Mental health", ["anxiety", "therapy", "mental health", "self care",
    "selfcare", "burnout", "adhd", "neurodivergent"]],
  ["Plant people", ["plant mom", "plant lady", "houseplant", "gardening", "garden"]],
  ["Coffee culture", ["coffee", "espresso", "caffeine", "iced coffee", "latte"]],
];

const OCCASION: Array<[string, string[]]> = [
  ["Halloween", ["halloween", "spooky season", "summerween", "pumpkin", "ghost"]],
  ["Christmas", ["christmas", "xmas", "santa", "holiday", "festive"]],
  ["Bachelorette", ["bachelorette", "bride", "bridal", "bridesmaid", "hen party"]],
  ["Valentine's", ["valentine", "galentine"]],
  ["Graduation", ["graduation", "graduate", "class of"]],
  ["Birthday", ["birthday", "bday"]],
  ["Mother's Day", ["mothers day", "mother's day"]],
];

const RECIPIENT: Array<[string, string[]]> = [
  ["For a mom", ["for mom", "mom gift", "gift for mom", "for mother"]],
  ["For a daughter", ["daughter"]],
  ["For a sister", ["sister"]],
  ["For a friend", ["best friend", "bestie", "friend gift"]],
  ["For a teacher", ["teacher gift", "for teacher"]],
  ["For a wife", ["wife", "girlfriend"]],
];

/*
  Labels that can never be a world.

  Generic merchandising language ("for her", "gift for") names an aisle.
  Garment and object names name the product. An incomplete phrase ("women
  are", "custom order for") names nothing at all — it is a fragment the
  n-gram scanner happened to cut.
*/
const GENERIC_GIFT = ["for her", "for him", "for them", "gift", "gifts",
  "gift idea", "gift ideas", "present", "novelty", "funny", "cute", "custom",
  "custom order", "personalized", "personalised", "unique", "best seller"];

const PRODUCT_WORDS = ["tee", "tees", "shirt", "shirts", "tshirt", "t shirt",
  "hoodie", "hoodies", "sweatshirt", "sweatshirts", "crewneck", "sweater",
  "sweaters", "mug", "mugs", "tumbler", "sticker", "stickers", "tote", "bag",
  "poster", "print", "blanket", "case", "cases", "phone case", "koozie",
  "apparel", "clothing", "accessories", "swimsuit", "tank", "top", "tops"];

/* A phrase ending on a word that needs something after it is a fragment. */
const DANGLING = new Set(["are", "is", "was", "for", "of", "and", "the", "a",
  "an", "to", "with", "my", "your", "in", "on", "that", "this", "it", "be"]);

const normalise = (text: string) =>
  ` ${String(text ?? "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()} `;

/** Does this label name a person, or a thing? */
export function rejectAsWorld(label: string): string {
  const clean = String(label ?? "").trim();
  if (!clean) return "empty label";
  const words = clean.toLowerCase().split(/\s+/);
  if (/&#\d|&[a-z]+;/i.test(clean)) return "contains an HTML entity";
  if (DANGLING.has(words[words.length - 1])) return "incomplete phrase";
  if (words.every(word => PRODUCT_WORDS.includes(word)
    || ["women", "womens", "women's", "men", "mens", "men's", "unisex", "kids", "&", "and"].includes(word)))
    return "names a product, not a person";
  if (GENERIC_GIFT.includes(clean.toLowerCase())) return "generic gift language";
  /* "Feminist Mugs" — a real identity welded to a product. The identity is
     the world; the mug belongs inside it. */
  if (words.length > 1 && PRODUCT_WORDS.includes(words[words.length - 1]))
    return "an identity split by product type";
  return "";
}

const matchFrom = (source: Array<[string, string[]]>, haystack: string) => {
  for (const [label, terms] of source)
    for (const term of terms)
      if (haystack.includes(` ${term} `) || haystack.includes(` ${term}s `))
        return { label, term };
  return null;
};

/**
 * Read one listing's dimensions.
 *
 * Title and tags are evidence; the shop section is evidence too, but only as
 * a hint — it is where the SELLER filed it, which is usually by product.
 */
export function dimensionsFor(
  { listingId, title, tags, shopSection, productFamily }:
  { listingId: number; title: string; tags: string[]; shopSection: string;
    productFamily: string },
): Dimensions {
  const haystack = normalise(`${title} ${tags.join(" ")} ${shopSection}`);
  const evidence: string[] = [];

  const identity = matchFrom(IDENTITY, haystack);
  if (identity) evidence.push(`"${identity.term}" in the listing`);
  const occasion = matchFrom(OCCASION, haystack);
  if (occasion) evidence.push(`occasion "${occasion.term}"`);
  const recipient = matchFrom(RECIPIENT, haystack);
  if (recipient) evidence.push(`bought for "${recipient.term}"`);

  return {
    listingId,
    world: identity?.label ?? "",
    /* An occasion inside an identity is a sub-world; an occasion alone is
       a world in its own right, because the buyer is defined by the moment. */
    subWorld: identity && occasion ? occasion.label : "",
    productFamily,
    messageTheme: identity?.term ?? occasion?.term ?? "",
    recipient: recipient?.label ?? "",
    occasion: occasion?.label ?? "",
    evidence,
  };
}

/** An occasion with no identity still describes a buyer at a moment. */
export function worldFor(dimensions: Dimensions): string {
  if (dimensions.world) return dimensions.world;
  if (dimensions.occasion) return dimensions.occasion;
  return "";
}
