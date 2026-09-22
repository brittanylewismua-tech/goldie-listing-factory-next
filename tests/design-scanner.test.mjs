/*
  The scanner has to be useful without being a copying machine, and honest
  about evidence it does not have.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  qualify, buildCohort, evidenceLine, EVIDENCE_FRESH_DAYS, SHOP_SHARE_CAP,
  NOT_ENOUGH_EVIDENCE,
} from "../app/momentum-cohort.ts";
import { compare, FORBIDDEN_ADVICE } from "../app/design-compare.ts";

const NOW = 1_800_000_000;
const candidate = (over = {}) => ({
  listingId: 1, shopId: 10, corroboratedIntervals: 2, attributedUnits: 3,
  attributionCapViolated: false, soldOutCorroborated: false,
  reviewsLinkedRecently: 0, lastMovementAt: NOW - 86_400, hasPrimaryImage: true, ...over });

/* --------------------------------------------------------------- cohort */

test("favourites and shop-level sales never qualify a listing", () => {
  /* Neither is listing-level evidence, so neither appears as a path in. */
  const module = readFileSync(new URL("../app/momentum-cohort.ts", import.meta.url), "utf8");
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /favorit|favourit/i);
  const bare = qualify(candidate({ corroboratedIntervals: 0, attributedUnits: 0,
    soldOutCorroborated: false, reviewsLinkedRecently: 0 }), NOW);
  assert.equal(bare.ok, false);
  assert.match(bare.because, /no listing-level movement/);
});

test("a review alone does not prove current momentum", () => {
  const reviewOnly = qualify(candidate({ corroboratedIntervals: 0, attributedUnits: 0,
    reviewsLinkedRecently: 5 }), NOW);
  assert.equal(reviewOnly.ok, false);
  /* It qualifies only alongside a movement signal. */
  const supported = qualify(candidate({ corroboratedIntervals: 1, attributedUnits: 0,
    reviewsLinkedRecently: 5 }), NOW);
  assert.equal(supported.ok, true);
  assert.equal(supported.reason, "movement-plus-review");
});

test("capped attribution disqualifies rather than counts", () => {
  /* A bulk edit can look exactly like twenty sales. */
  const capped = qualify(candidate({ attributionCapViolated: true }), NOW);
  assert.equal(capped.ok, false);
  assert.match(capped.because, /attribution cap/);
});

test("stale evidence is refused, never described as current", () => {
  const old = qualify(candidate({
    lastMovementAt: NOW - (EVIDENCE_FRESH_DAYS + 10) * 86_400 }), NOW);
  assert.equal(old.ok, false);
  assert.match(old.because, /days old/);
});

test("a listing with no usable image cannot be a visual reference", () => {
  assert.match(qualify(candidate({ hasPrimaryImage: false }), NOW).because, /primary image/);
});

test("one shop cannot dominate the cohort", () => {
  const candidates = [
    ...Array.from({ length: 30 }, (unused, index) =>
      candidate({ listingId: index + 1, shopId: 99 })),
    ...Array.from({ length: 10 }, (unused, index) =>
      candidate({ listingId: 100 + index, shopId: 200 + index })),
  ];
  const built = buildCohort(candidates, NOW);
  const fromBigShop = built.cohort.filter(row => row.shopId === 99).length;
  assert.ok(fromBigShop / built.cohort.length <= SHOP_SHARE_CAP + 0.01,
    `one shop holds ${fromBigShop} of ${built.cohort.length}`);
  assert.ok(built.cappedOut > 0);
  assert.equal(built.dominatedBy, null);
});

test("a thin niche says so rather than filling up with ordinary listings", () => {
  const built = buildCohort([candidate()], NOW, { minimum: 12 });
  assert.equal(built.enough, false);
  assert.match(NOT_ENOUGH_EVIDENCE, /isn't enough verified evidence/);
});

test("the evidence line never says bestseller", () => {
  const line = evidenceLine([{ listingId: 1, shopId: 2, reason: "attributed-units",
    evidenceAt: NOW, repeated: true }], 1);
  assert.match(line, /verified momentum/);
  for (const banned of ["bestseller", "best seller", "top seller"])
    assert.ok(!line.toLowerCase().includes(banned));
});

/* ----------------------------------------------------------- comparison */

const ingredients = (over = {}) => ({
  wordCount: 4, typography: "bold sans", textHierarchy: "single line",
  layout: "centered", illustration: "none", textToArt: 0.9,
  colorStrategy: "two colour", contrast: "high", thumbnailReadability: "readable",
  density: "medium", printCoverage: 0.45, mechanism: "bold slogan", ...over });

const cohort = (count, over = {}) =>
  Array.from({ length: count }, () => ingredients(over));

test("a thin cohort refuses to give a read", () => {
  const result = compare(ingredients(), cohort(5));
  assert.equal(result.overall, "Not enough verified evidence");
  assert.equal(result.working.length, 0);
});

test("an aligned design reads as aligned", () => {
  const result = compare(ingredients(), cohort(20));
  assert.equal(result.overall, "Strong visual-pattern alignment");
  assert.ok(result.working.length >= 2);
  assert.ok(result.working.length <= 3, "more than three things to celebrate");
});

test("thumbnail trouble outranks everything else", () => {
  const result = compare(ingredients({ thumbnailReadability: "crowded" }), cohort(20));
  assert.equal(result.overall, "Moderate visual-pattern alignment");
  assert.match(result.opportunity, /thumbnail size/);
});

test("exactly one opportunity is given", () => {
  const result = compare(
    ingredients({ thumbnailReadability: "crowded", wordCount: 14, printCoverage: 0.1 }),
    cohort(20));
  assert.equal(typeof result.opportunity, "string");
  assert.ok(!result.opportunity.includes("\n"), "the opportunity is a list");
});

test("nothing it says tells the member to copy", () => {
  const results = [
    compare(ingredients(), cohort(20)),
    compare(ingredients({ mechanism: "minimal icon" }), cohort(20)),
    compare(ingredients({ thumbnailReadability: "crowded", wordCount: 18 }), cohort(20)),
  ];
  for (const result of results) {
    const text = `${result.overall} ${result.working.join(" ")} ${result.opportunity}`.toLowerCase();
    for (const banned of FORBIDDEN_ADVICE)
      assert.ok(!text.includes(banned), `the result said "${banned}"`);
    /* And never quotes a phrase to print. */
    assert.doesNotMatch(text, /"[^"]{8,}"/);
  }
});

test("the comparison reads strategy, never a reference's content", () => {
  const module = readFileSync(new URL("../app/design-compare.ts", import.meta.url), "utf8");
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "");
  /* There is no field here that could carry a reference's wording. */
  assert.doesNotMatch(code, /\.wording|\.phrase|\.text\b|listingId/);
});

test("the same inputs always give the same result", () => {
  const design = ingredients({ wordCount: 9 });
  const references = cohort(20);
  assert.deepEqual(compare(design, references), compare(design, references));
});

/* ------------------------------------------------------- corpus measurement */
import { measure, readiness } from "../app/corpus-measure.ts";

const row = (over = {}) => ({ listingId: 1, shopId: 1, taxonomyId: 1633, units: 1,
  reason: "quantity_fell", observedAt: NOW - 86_400, intervals: 1,
  reviewsRecently: 0, imageHash: "abc", ...over });

test("the measurement says plainly that no image is actually held", () => {
  const m = measure([row()], NOW);
  assert.equal(m.withUsableImage, 1);
  assert.ok(m.notes.some(note => /not an image or a URL/.test(note)),
    "reported a usable image without saying we cannot fetch it");
});

test("taxonomy is never presented as a niche", () => {
  const m = measure([row()], NOW);
  assert.ok(m.notes.some(note => /NOT a customer niche/.test(note)));
});

test("domination is reported rather than smoothed over", () => {
  const rows = Array.from({ length: 10 }, (unused, index) =>
    row({ listingId: index, shopId: index < 8 ? 1 : 2 }));
  const m = measure(rows, NOW);
  assert.equal(m.dominated, true);
  assert.equal(readiness(m).ready, false);
});

test("a corpus that cannot support the feature says so", () => {
  const m = measure([row()], NOW);
  assert.equal(readiness(m).ready, false);
  assert.match(readiness(m).blocking[0], /smallest cohort/);
});

test("stale evidence is not counted as current", () => {
  const m = measure([row({ observedAt: NOW - 90 * 86_400 })], NOW);
  assert.equal(m.withinFreshWindow, 0);
  assert.ok(m.oldestEvidenceDays > 60);
});

/* -------------------------------------------------------- image recovery */
import { classify, account, recoveryRate } from "../app/reference-recovery.ts";
import { isFresh, DISPLAY_FRESHNESS_SECONDS } from "../app/reference-images.ts";

const etsyRow = (over = {}) => ({ listing_id: 5, shop_id: 9, state: "active",
  quantity: 3, images: [{ url_570xN: "https://i.etsystatic.com/x.jpg", listing_image_id: 77 }],
  ...over });

test("every requested listing leaves with an outcome", () => {
  const { rows, totals } = account([1, 2, 3],
    [classify(etsyRow({ listing_id: 1 }))], [3]);
  assert.equal(rows.length, 3);
  assert.equal(totals.requested, 3);
  assert.equal(totals.accounted, 3);
  assert.equal(totals.recovered, 1);
  assert.equal(totals.unavailable, 1, "a listing Etsy omitted");
  assert.equal(totals.failed, 1, "a listing whose call failed");
});

test("a listing Etsy omitted is not the same as a call that failed", () => {
  const omitted = account([1], [], []).totals;
  const broke = account([1], [], [1]).totals;
  assert.equal(omitted.unavailable, 1);
  assert.equal(broke.failed, 1);
});

test("no recovery rate is reported until the accounting balances", () => {
  const { totals } = account([1, 2], [classify(etsyRow({ listing_id: 1 }))], []);
  assert.equal(recoveryRate(totals), 0.5);
  assert.equal(recoveryRate({ ...totals, requested: 99 }), null,
    "reported a rate over an accounting that does not add up");
});

test("a sold-out listing with an image is still a usable reference", () => {
  /* Selling out is evidence, not a loss. */
  assert.equal(classify(etsyRow({ state: "sold_out" })).outcome, "recovered");
  assert.equal(classify(etsyRow({ state: "sold_out", images: [] })).outcome, "sold-out");
});

test("a removed listing is recorded as deleted, not merely inactive", () => {
  assert.equal(classify(etsyRow({ state: "removed" })).outcome, "deleted");
  assert.equal(classify(etsyRow({ state: "draft" })).outcome, "inactive");
  assert.equal(classify(etsyRow({ images: [] })).outcome, "no-image");
});

test("an image older than Etsy's six-hour rule is not fresh", () => {
  const now = 1_000_000;
  assert.equal(isFresh(now - 3_600, now), true);
  assert.equal(isFresh(now - DISPLAY_FRESHNESS_SECONDS - 1, now), false);
});

test("an Etsy image id is never called a content hash", () => {
  const text = readFileSync(new URL("../app/reference-images.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text.replace(/NOT a hash[\s\S]*?content hash\./g, ""),
    /image[_ ]?id[^\n]*content hash/i);
  assert.ok(/is NOT a hash of\s*\n?\s*\* the image's contents/.test(text)
    || /NOT a hash of the image's contents/.test(text.replace(/\n \* /g, " ")),
    "the file does not state what the image id is not");
});

test("image bytes are never stored", () => {
  const text = readFileSync(new URL("../app/reference-images.ts", import.meta.url), "utf8");
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /image_bytes|blob|ARTWORK|R2/i);
});

/* ---------------------------------------------------------- niche cohort */
import { normalizeNiche, relates, intersect, COHORT_CLAIM } from "../app/niche-cohort.ts";

const listing = (over = {}) => ({ listingId: 1, shopId: 2,
  title: "Dog Mom Shirt for Her", tags: ["dog mom", "dog lover"], ...over });

test("plurals and punctuation do not change the niche", () => {
  assert.deepEqual(normalizeNiche("Dog Moms!").terms, normalizeNiche("dog mom").terms);
  assert.deepEqual(normalizeNiche("Girl Power").terms, ["girl", "power"]);
});

test("product words are not treated as the niche", () => {
  /* "feminist shirt" is the feminist niche; the shirt is the product. */
  assert.deepEqual(normalizeNiche("feminist shirt").terms, ["feminist"]);
});

test("a multi-word niche needs every one of its words", () => {
  const terms = normalizeNiche("dog mom").terms;
  assert.equal(relates(listing(), terms).ok, true);
  const justDog = listing({ title: "Dog Bandana", tags: ["dog"] });
  assert.equal(relates(justDog, terms).ok, false);
  assert.match(relates(justDog, terms).because, /only "dog"/);

  /* And a long phrase must not become LOOSER than a short one: every term
     counts, so a three-term niche needs all three. */
  const three = normalizeNiche("bachelorette party weekend").terms;
  assert.equal(three.length, 3);
  assert.equal(relates(listing({ title: "Bachelorette Weekend Tote",
    tags: ["bachelorette", "weekend"] }), three).ok, false);
  assert.equal(relates(listing({ title: "Bachelorette Party Weekend Tote",
    tags: ["bachelorette party", "weekend trip"] }), three).ok, true);
});

test("the cohort is the overlap, and says why each listing entered", () => {
  const qualified = new Set([1, 2]);
  const result = intersect(
    [listing({ listingId: 1 }), listing({ listingId: 2 }), listing({ listingId: 3 })],
    qualified, normalizeNiche("dog mom").terms,
    { savedDiscovery: new Set([2]) });
  assert.equal(result.members.length, 2);
  assert.equal(result.members.find(m => m.listingId === 1).entry, "search-match");
  assert.equal(result.members.find(m => m.listingId === 2).entry, "saved-niche-discovery");
  assert.equal(result.searched, 3);
  assert.equal(result.withMomentum, 2, "a listing with no evidence is not in the cohort");
});

test("an unrelated search result is rejected with its reason", () => {
  const result = intersect(
    [listing({ listingId: 1, title: "Cat Mug", tags: ["cat"] })],
    new Set([1]), normalizeNiche("dog mom").terms);
  assert.equal(result.members.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].because, /none of the niche terms/);
});

test("the cohort claim never says the marketplace has been classified", () => {
  assert.match(COHORT_CLAIM, /own title and tags match this niche/);
  for (const banned of ["classified", "all listings", "every listing", "marketplace"])
    assert.ok(!COHORT_CLAIM.toLowerCase().includes(banned));
});

test("taxonomy is not used to build a cohort", () => {
  const code = readFileSync(new URL("../app/niche-cohort.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /taxonom/i);
});

/* -------------------------------------------------------- evidence window */
import { describeWindow, evidenceLine as windowLine } from "../app/evidence-window.ts";

test("the evidence line states the window we actually have", () => {
  const line = windowLine({ earliest: 0, latest: 0, seconds: 29 * 3_600,
    repeatedMovement: 4, attributedUnits: 9, shops: 12, withImage: 18,
    withReview: 0, listings: 18 });
  assert.equal(line,
    "Compared with 18 listings showing verified momentum across 12 shops during "
    + "29 hours of monitoring.");
  assert.ok(!line.includes("60 days"));
});

test("sixty days is never claimed before sixty days exist", () => {
  assert.match(describeWindow(29 * 3_600), /29 hours/);
  assert.match(describeWindow(60 * 86_400), /60 days/);
  assert.match(describeWindow(45 * 60), /45 minutes/);
});

test("the fixed sixty-day line is gone from the cohort module", () => {
  const code = readFileSync(new URL("../app/momentum-cohort.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code.split("EVIDENCE_FRESH_DAYS")[0], /in the last \$\{/);
});

/* ----------------------------------------------------- reference analysis */
import { parseAnalysis, ANALYSIS_PROMPT, INGREDIENT_FIELDS } from "../app/reference-analysis.ts";

const good = JSON.stringify({ typography: "bold sans", textHierarchy: "single line",
  composition: "centered", illustration: "none", textToArt: 0.9,
  colorStrategy: "two colour", contrast: "high", density: "medium",
  printCoverage: 0.45, thumbnailReadability: "readable", mechanism: "bold slogan",
  wordCount: 4 });

test("the prompt forbids returning the design's words", () => {
  assert.match(ANALYSIS_PROMPT, /Do NOT return the words, phrases, names or subject matter/);
  assert.match(ANALYSIS_PROMPT, /wordCount is a COUNT/);
});

test("nothing outside the declared fields is ever stored", () => {
  const smuggled = JSON.parse(good);
  smuggled.slogan = "The Future Is Female";
  smuggled.subject = "a cat wearing sunglasses";
  const parsed = parseAnalysis(JSON.stringify(smuggled));
  assert.equal(parsed.ok, true);
  const stored = JSON.stringify(parsed.ingredients).toLowerCase();
  assert.ok(!stored.includes("female"), "a slogan survived into storage");
  assert.ok(!stored.includes("cat"), "subject matter survived into storage");
  assert.deepEqual(Object.keys(parsed.ingredients).sort(), [...INGREDIENT_FIELDS].sort());
});

test("a prose answer is refused rather than stored as a category", () => {
  const prose = JSON.parse(good);
  prose.mechanism = "a bold slogan reading The Future Is Female across the chest";
  const parsed = parseAnalysis(JSON.stringify(prose));
  assert.equal(parsed.ok, false);
  assert.match(parsed.why, /prose, not a category/);
});

test("a missing field fails the analysis rather than defaulting it", () => {
  const short = JSON.parse(good);
  delete short.thumbnailReadability;
  assert.equal(parseAnalysis(JSON.stringify(short)).ok, false);
});

test("word count is a number, never words", () => {
  const parsed = parseAnalysis(good);
  assert.equal(typeof parsed.ingredients.wordCount, "number");
  assert.equal(parsed.ingredients.wordCount, 4);
});

test("no field in the schema can carry content", () => {
  for (const field of INGREDIENT_FIELDS)
    assert.ok(!/word(ing)?$|phrase|slogan|text$|subject|motif|character/i.test(field)
      || field === "wordCount",
      `${field} could carry the design's content`);
});

/* -------------------------------------------------- upload and threshold */
import { constructionOnly, meetsThreshold, THRESHOLD } from "../app/scan-record.ts";

const upload = (over = {}) => ({ typography: "bold sans", textHierarchy: "single line",
  composition: "centered", illustration: "none", textToArt: 0.9,
  colorStrategy: "two colour", contrast: "high", density: "medium",
  printCoverage: 0.45, thumbnailReadability: "readable", mechanism: "bold slogan",
  wordCount: 4, visibleWording: "BRIDE SQUAD", ...over });

test("the member's wording never reaches the comparison layer", () => {
  const forComparison = constructionOnly(upload());
  assert.ok(!("visibleWording" in forComparison));
  assert.ok(!JSON.stringify(forComparison).toLowerCase().includes("bride"));
});

test("the comparison function has no field that can carry wording", () => {
  const code = readFileSync(new URL("../app/design-compare.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  /* It never reads a wording field off either side. "bold slogan" is a
     construction CATEGORY and "your wording is about as long" is a length
     remark, so the ban is on the access, not on the English word. */
  assert.doesNotMatch(code, /\.\s*(visibleWording|wording|slogan|phrase|subject|title)\b/);
  assert.doesNotMatch(code, /visibleWording/);
  /* And the Ingredients type it accepts declares no such field. */
  const shape = code.slice(code.indexOf("export type Ingredients"),
    code.indexOf("export type Alignment"));
  assert.doesNotMatch(shape, /wording|slogan|phrase|subject|title|text:/i);
});

const shape = (over = {}) => ({ listings: 45, shops: 41, repeatedMovement: 24,
  withUsableImage: 44, ...over });

test("a cohort that clears every gate is allowed", () => {
  assert.equal(meetsThreshold(shape()).ok, true);
});

test("each gate refuses with its own reason, in the member's language", () => {
  const small = meetsThreshold(shape({ listings: 6, shops: 6, repeatedMovement: 1, withUsableImage: 6 }));
  assert.equal(small.refusal.kind, "cohort-too-small");
  assert.match(small.refusal.because, /Not enough buyer activity/);

  const narrow = meetsThreshold(shape({ listings: 20, shops: 3, withUsableImage: 20 }));
  assert.equal(narrow.refusal.kind, "no-shop-diversity");
  assert.match(narrow.refusal.because, /only 3 shops/);

  const once = meetsThreshold(shape({ repeatedMovement: 2 }));
  assert.equal(once.refusal.kind, "no-repeated-movement");
  assert.match(once.refusal.because, /not yet a pattern/);

  const blind = meetsThreshold(shape({ withUsableImage: 10 }));
  assert.equal(blind.refusal.kind, "images-unusable");
});

test("no refusal promises sales or blames the member's design", () => {
  for (const bad of [shape({ listings: 3 }), shape({ shops: 2 }),
    shape({ repeatedMovement: 0 }), shape({ withUsableImage: 1 })]) {
    const verdict = meetsThreshold(bad);
    const text = verdict.refusal.because.toLowerCase();
    for (const banned of ["your design", "will sell", "bestseller", "bad", "poor"])
      assert.ok(!text.includes(banned), `a refusal said "${banned}"`);
  }
});

test("the threshold is documented as a beta rule, not a standard", () => {
  const text = readFileSync(new URL("../app/scan-record.ts", import.meta.url), "utf8");
  assert.match(text, /INTERNAL BETA RULE, NOT A STATISTICAL STANDARD/);
  assert.deepEqual({ ...THRESHOLD },
    { listings: 12, shops: 8, repeatedMovement: 5, usableImageShare: 0.8 });
});

/* ------------------------------------------------------------- interface */
const CLIENT = readFileSync(
  new URL("../app/design-scanner/design-scanner-client.tsx", import.meta.url), "utf8");
const STYLE = readFileSync(
  new URL("../app/design-scanner/design-scanner.css", import.meta.url), "utf8");
const bare = CLIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the animation never holds a finished result back", () => {
  /* No minimum duration, no sleep, no waiting on the beam before showing. */
  assert.doesNotMatch(bare, /MIN_(DURATION|ANIMATION)|minimumDuration|await sleep|setTimeout\([^)]*resolve/);
  /* The scan's finally block stops the timers and clears the scanning flag. */
  const finallyBlock = bare.slice(bare.indexOf("} finally {"), bare.indexOf("setScanning(false);") + 30);
  assert.match(finallyBlock, /clearTimeout/);
  assert.match(finallyBlock, /setScanning\(false\)/);
});

test("no touch target is under 40 CSS pixels", () => {
  const targets = [...STYLE.matchAll(/min-height:\s*(\d+)px/g)].map(match => Number(match[1]));
  assert.ok(targets.length >= 4, "the interactive elements do not state a height");
  for (const height of targets) assert.ok(height >= 40, `a ${height}px touch target`);
});

test("nothing can force the page wider than the phone", () => {
  assert.doesNotMatch(STYLE, /min-width:\s*(4[5-9]\d|[5-9]\d\d|\d{4,})px/);
  assert.match(STYLE, /max-width:\s*560px/);
  assert.match(STYLE, /\.stage img\s*\{[^}]*max-width:\s*100%/);
  /* 16px inputs, or iOS zooms the whole page on focus. */
  assert.match(STYLE, /font-size:\s*16px/);
});

test("the result shows no score, metric or internal number", () => {
  const view = bare.slice(bare.indexOf("function ScanResult"));
  assert.doesNotMatch(view, /score|percent|%|confidence|rank|\bindex\b/i);
});

test("no reference listing, shop or image is ever rendered", () => {
  for (const banned of ["listingId", "shopId", "imageUrl", "competitor", "title"])
    assert.ok(!bare.includes(banned), `the interface renders ${banned}`);
});

test("trademark stays visually separate from the design read", () => {
  assert.match(STYLE, /\.tm\s*\{/);
  assert.match(CLIENT, /<h2(?: className="utility-heading")?>Trademark<\/h2>/);
  /* And an incomplete register always says so. */
  assert.match(CLIENT, /registerReady/);
  assert.match(CLIENT.replace(/\s+/g, " "), /The trademark search is incomplete/);
});

test("the remaining daily scans are shown", () => {
  assert.match(CLIENT, /scan\{left === 1 \? "" : "s"\} left today/);
});

test("reopening a saved scan costs nothing", () => {
  /* History rows set state from what is already loaded; no fetch on click. */
  const historyBlock = bare.slice(bare.indexOf('className="history"'));
  assert.doesNotMatch(historyBlock.slice(0, 600), /fetch\(/);
});

test("reduced motion is respected", () => {
  assert.match(STYLE, /prefers-reduced-motion[\s\S]*?\.beam\s*\{\s*animation:\s*none/);
});

test("a shipping upgrade is never a design reference", () => {
  /* Measured: 2 of 44 in the bachelorette cohort. They carry the shop's whole
     tag set and they sell constantly, so they match perfectly and mean nothing. */
  const terms = normalizeNiche("bachelorette").terms;
  for (const title of ["Express Shipping Upgrade", "Add on Item",
    "Rush Order Fee", "Upgrade - faster processing", "Shipping upgrade"]) {
    const verdict = relates(listing({ title, tags: ["bachelorette party", "bachelorette"] }), terms);
    assert.equal(verdict.ok, false, `"${title}" entered the cohort`);
    assert.match(verdict.because, /not a design/);
  }
});

test("a real design mentioning shipping in passing still qualifies", () => {
  const terms = normalizeNiche("bachelorette").terms;
  const real = listing({ title: "Bachelorette Party Tote — free shipping",
    tags: ["bachelorette", "bachelorette party"] });
  assert.equal(relates(real, terms).ok, true);
});

test("the opportunity is never blank, and never invents a criticism", () => {
  /*
    D1751 · "Everything matched" now requires a measurement to say so. Without
    one, the honest top line is that readability could not be measured — which
    is a fact about the file, not a criticism of the design. The measured-pass
    case is what this test was always describing.
  */
  const measured = { contrast: "pass", tonalRange: "pass", sharpness: "pass",
    thumbnailReadable: "pass", emptiness: "pass", notes: [],
    mayClaimReadable: true, mayClaimHighContrast: true };
  const perfect = compare(ingredients(), cohort(20), { measured });
  assert.ok(perfect.opportunity.length > 0, "an empty opportunity block");
  assert.match(perfect.opportunity, /No clear visual-construction issue surfaced/);
  for (const banned of ["will sell", "bestseller", "guaranteed"])
    assert.ok(!perfect.opportunity.toLowerCase().includes(banned));

  /* Unmeasured: still not blank, still not a criticism, and truthful. */
  const unmeasured = compare(ingredients(), cohort(20));
  assert.ok(unmeasured.opportunity.length > 0);
  assert.match(unmeasured.opportunity, /could not be measured/);
  for (const banned of ["will sell", "bestseller", "guaranteed"])
    assert.ok(!unmeasured.opportunity.toLowerCase().includes(banned));
});

test("the article agrees with the word after it", () => {
  const withVowel = compare(ingredients({ mechanism: "bold slogan" }),
    cohort(20, { mechanism: "illustrated scene" }));
  assert.match(withVowel.opportunity, /with an illustrated scene/);
  assert.doesNotMatch(withVowel.opportunity, /\ba (illustrated|emblem|icon)/);
  const withConsonant = compare(ingredients({ mechanism: "minimal icon" }),
    cohort(20, { mechanism: "bold slogan" }));
  assert.match(withConsonant.opportunity, /with a bold slogan/);
});

/* ------------------------------------------------- claim scope and trademark */
import { check as tmCheck, withRegister as tmWithRegister } from "../app/trademark-check.ts";

/* D1705 · withRegister takes the size object, not a boolean. LOADED is a
   register that finished with nothing left out; LOADING has files waiting. */
const LOADED = { marks: 201000, files: [{ state: "done", count: 118 }] };
const LOADING = { marks: 201000, files: [{ state: "done", count: 49 },
  { state: "waiting", count: 69 }] };
const PARKED = { marks: 201000, files: [{ state: "done", count: 115 },
  { state: "skipped", count: 3 }] };


test("no label claims more than construction was compared", () => {
  for (const design of [ingredients(), ingredients({ mechanism: "minimal icon" }),
    ingredients({ thumbnailReadability: "crowded" })]) {
    const result = compare(design, cohort(20));
    assert.match(result.overall, /visual-pattern alignment|Not enough verified evidence/);
    /* The old labels asserted fit with the niche itself, which is the one
       thing a content-free comparison cannot see. */
    for (const banned of ["strong alignment", "weak niche alignment",
      "nothing is holding", "what is left is reach", "the only thing left"])
      assert.ok(!`${result.overall} ${result.opportunity}`.toLowerCase().includes(banned),
        `a result said "${banned}"`);
  }
});

test("the result says in one line what was compared", () => {
  const result = compare(ingredients(), cohort(20));
  assert.match(result.scope,
    /shares several visual construction patterns with listings currently showing verified momentum/);
});

test("an incomplete register can never read as a clean result", () => {
  const loading = tmWithRegister(tmCheck("Bride Tribe"), [], LOADING);
  assert.equal(loading.registerReady, false);
  assert.match(loading.summary, /records currently loaded/);
  /* It must not assert anything about brands, characters or franchises.
     "legal clearance" is the disclaimer, so it is removed before the check
     rather than allowed to satisfy a ban on the word "clear". */
  const claimed = loading.summary.toLowerCase()
    .replace("screening information, not legal clearance", "");
  for (const banned of ["no known brands", "character", "franchise",
    "clear", "safe", "no trademark"])
    assert.ok(!claimed.includes(banned), `a loading register claimed "${banned}"`);
  assert.match(loading.summary, /screening information, not legal clearance/);
});

test("a complete register describes exactly what was searched", () => {
  const ready = tmWithRegister(tmCheck("Bride Tribe"), [], LOADED);
  assert.equal(ready.registerReady, true);
  /* D1734 · It describes the records we hold. It no longer claims to be the
     federal register, which it never was — nine classes of forty-five. */
  assert.match(ready.summary,
    /No exact or contained match was found in the trademark records available here, or the curated risk list/);
  assert.ok(!/current federal/.test(ready.summary));
  assert.match(ready.summary, /screening information, not legal clearance/);
  assert.ok(!ready.summary.toLowerCase().includes("character"));
});

test("the checker never claims to have checked characters or franchises", () => {
  const text = readFileSync(new URL("../app/trademark-check.ts", import.meta.url), "utf8");
  const strings = text.replace(/\/\*[\s\S]*?\*\//g, "").match(/"[^"]{20,}"|`[^`]{20,}`/g) ?? [];
  for (const line of strings)
    if (/no /i.test(line))
      assert.ok(!/character|franchise|copyright/i.test(line),
        `a summary claims to have checked: ${line}`);
});

test("a real risk still reports as a risk whatever the register state", () => {
  const known = tmCheck("Mickey Mouse");
  if (known.risk === "high") {
    const loading = tmWithRegister(known, [], LOADING);
    assert.equal(loading.risk, "high");
    assert.equal(loading.summary, known.summary);
  }
});

test("a curated high-risk match never asserts legal ownership", () => {
  /* The checker matches a list of names that get listings removed. It does
     not determine who owns what, and saying "owned by" is a legal claim it
     cannot stand behind. A federal REGISTRATION is different: that is a
     recorded fact, and naming its registrant is reporting the register. */
  const known = tmCheck("Mickey Mouse");
  if (known.risk === "high") {
    assert.match(known.summary, /is associated with .+ and presents a high intellectual-property risk/);
    assert.match(known.summary, /screening information, not legal clearance/);
    assert.doesNotMatch(known.summary, /uses property owned by/);
  }
});

test("the register-backed wording still reports what the register says", () => {
  const text = readFileSync(new URL("../app/trademark-check.ts", import.meta.url), "utf8");
  /* Reporting a registration and its registrant is reporting a record. */
  assert.match(text, /is a live registered trademark/);
  /* But the curated list never claims ownership. */
  /* And the curated summary never claims ownership. Comments explaining the
     old wording are stripped so the check reads code, not history. */
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const curated = code.slice(code.indexOf("const owners ="),
    code.indexOf("export function mentionsAMark"));
  assert.doesNotMatch(curated, /property owned by/);
});

test("a retired label is never shown to a member again", () => {
  /* Scans saved before the wording correction carry "Strong alignment" — a
     claim about niche fit a construction-only comparison cannot make. */
  const client = readFileSync(new URL(
    "../app/design-scanner/design-scanner-client.tsx", import.meta.url), "utf8");
  assert.match(client, /LABELS THIS PRODUCT NO LONGER STANDS BEHIND/);
  for (const retired of ["Strong alignment",
    "Visually strong, weak niche alignment", "Not enough verified niche evidence yet"])
    assert.ok(client.includes(`"${retired}":`), `${retired} is not mapped`);
  /* Every render goes through the mapping. */
  assert.match(client, /\{currentLabel\(result\.overall\)\}/);
  assert.ok(!client.includes("{result.overall}"), "a raw stored label still renders");
});

test("the stored record is not rewritten", () => {
  const client = readFileSync(new URL(
    "../app/design-scanner/design-scanner-client.tsx", import.meta.url), "utf8");
  assert.match(client, /rewriting history is worse/);
  /* Mapping happens at display; nothing writes back. */
  const block = client.slice(client.indexOf("RETIRED_LABELS"), client.indexOf("const STAGES"));
  assert.ok(!/fetch\(|PUT|PATCH/.test(block));
});

test("scan history says what each scan found", () => {
  const client = readFileSync(new URL(
    "../app/design-scanner/design-scanner-client.tsx", import.meta.url), "utf8");
  assert.match(client, /className="verdict-line"/);
  assert.match(client, /row\.result\?\.overall/);
});
