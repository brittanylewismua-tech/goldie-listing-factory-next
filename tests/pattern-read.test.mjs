import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { rising, phraseSales, shelfShift, priceBands, readPatterns: readAll } =
  await import("../app/pattern-read.ts");

const listing = (id, title, product, price, sold) =>
  ({ listingId: id, title, product, price, sold });

test("phrases are credited with units sold, never with listing counts", () => {
  /* The discipline the whole feature rests on. Counting listings measures what
     other sellers guessed; counting units measures what people paid for. */
  const { units } = phraseSales([
    listing(1, "retro country music tee", "T-shirts", 20, 40),
    listing(2, "retro country music shirt", "T-shirts", 20, 2),
  ]);
  assert.equal(units.get("retro country"), 42);
});

test("a keyword-stuffed title cannot invent a trend by repeating itself", () => {
  /* Etsy titles say the same thing three ways. Counting each repetition would
     let one listing manufacture a movement. */
  const { units } = phraseSales([
    listing(1, "groovy mama groovy mama groovy mama era", "T-shirts", 20, 5),
  ]);
  assert.equal(units.get("groovy mama"), 5);
});

test("product nouns and shop-speak never surface as trends", () => {
  /* Left in, every "trend" comes back as "shirt for women". */
  const { units } = phraseSales([
    listing(1, "custom personalized unisex comfort colors shirt for women", "T-shirts", 20, 99),
  ]);
  assert.equal([...units.keys()].length, 0);
});

test("style words are kept, because they are the answer", () => {
  /* "Retro", "distressed", "coquette" are the design direction a seller is
     asking for. Stripping them would leave only the subject. */
  const { units } = phraseSales([
    listing(1, "distressed retro sunset design", "T-shirts", 20, 10),
  ]);
  assert.ok([...units.keys()].some(p => p.includes("distressed")));
});

test("one shop's good week is not a movement", () => {
  /* A phrase carried by a single listing is that listing's story. */
  const now = [listing(1, "pickleball grandma champion", "T-shirts", 20, 60)];
  const before = [];
  assert.deepEqual(rising(now, before), []);

  const shared = [
    listing(1, "pickleball grandma champion", "T-shirts", 20, 30),
    listing(2, "pickleball grandma club", "T-shirts", 20, 30),
  ];
  assert.ok(rising(shared, before).some(r => r.phrase === "pickleball grandma"));
});

test("rising is ranked by growth, not by size", () => {
  /* The biggest phrases are always evergreen — a seller already knows people
     buy mama shirts. What they cannot see is what moved this week. */
  const before = [
    listing(1, "mama era vibes", "T-shirts", 20, 500),
    listing(2, "mama era forever", "T-shirts", 20, 500),
    listing(3, "cowboy christmas rodeo", "T-shirts", 20, 1),
    listing(4, "cowboy christmas party", "T-shirts", 20, 1),
  ];
  const now = [
    listing(1, "mama era vibes", "T-shirts", 20, 520),
    listing(2, "mama era forever", "T-shirts", 20, 520),
    listing(3, "cowboy christmas rodeo", "T-shirts", 20, 200),
    listing(4, "cowboy christmas party", "T-shirts", 20, 200),
  ];
  const ranked = rising(now, before);
  assert.equal(ranked[0].phrase.includes("cowboy christmas"), true,
    "the phrase that grew leads, even though mama sells more");
});

test("a phrase that shrank is not rising", () => {
  const before = [
    listing(1, "santa coquette bow", "T-shirts", 20, 90),
    listing(2, "santa coquette pink", "T-shirts", 20, 90),
  ];
  const now = [
    listing(1, "santa coquette bow", "T-shirts", 20, 10),
    listing(2, "santa coquette pink", "T-shirts", 20, 10),
  ];
  assert.deepEqual(rising(now, before).filter(r => r.phrase === "santa coquette"), []);
});

test("crowding is reported beside the sales", () => {
  /* Thirty units across two listings and thirty across nine hundred are
     opposite situations, and supply is the only way to tell them apart. */
  const now = [
    listing(1, "banjo cat rodeo", "T-shirts", 20, 10),
    listing(2, "banjo cat parade", "T-shirts", 20, 10),
    listing(3, "banjo cat club", "T-shirts", 20, 10),
  ];
  const hit = rising(now, []).find(r => r.phrase === "banjo cat");
  assert.equal(hit.listings, 3);
});

test("price bands describe what buyers paid, not what sellers listed", () => {
  /* Weighted by units: one $200 outlier that sold once must not move the band
     a hundred people actually bought inside. */
  const rows = [
    listing(1, "a", "T-shirts", 22, 20),
    listing(2, "b", "T-shirts", 24, 20),
    listing(3, "c", "T-shirts", 200, 1),
  ];
  const band = priceBands(rows).find(b => b.product === "T-shirts");
  assert.ok(band.high <= 24, `outlier moved the band to ${band.high}`);
});

test("shelves are ranked by what gained", () => {
  const before = [listing(1, "x", "Mugs", 15, 100), listing(2, "y", "T-shirts", 20, 10)];
  const now = [listing(1, "x", "Mugs", 15, 100), listing(2, "y", "T-shirts", 20, 90)];
  assert.equal(shelfShift(now, before)[0].product, "T-shirts");
});

test("too little data reports itself as thin instead of inventing a story", () => {
  /* Dressing three sales up as a movement is the failure this feature exists
     to avoid. */
  const tiny = [listing(1, "one small thing", "Mugs", 12, 2)];
  assert.equal(readAll(tiny, []).thin, true);
});

test("no figure on this page is ever produced by a model", () => {
  /* The arithmetic is done here, tested, and handed over as finished facts.
     The writer turns a table into sentences and nothing else. */
  const source = strip(read("pattern-read.ts"));
  assert.doesNotMatch(source, /askAI|anthropic|openai|fetch\(/i);
});
