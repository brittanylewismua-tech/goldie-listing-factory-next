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
  assert.equal(result.overall, "Not enough verified niche evidence yet");
  assert.equal(result.working.length, 0);
});

test("an aligned design reads as aligned", () => {
  const result = compare(ingredients(), cohort(20));
  assert.equal(result.overall, "Strong alignment");
  assert.ok(result.working.length >= 2);
  assert.ok(result.working.length <= 3, "more than three things to celebrate");
});

test("thumbnail trouble outranks everything else", () => {
  const result = compare(ingredients({ thumbnailReadability: "crowded" }), cohort(20));
  assert.equal(result.overall, "Promising, but unclear at thumbnail size");
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

test("a multi-word niche needs more than one of its words", () => {
  const terms = normalizeNiche("dog mom").terms;
  assert.equal(relates(listing(), terms).ok, true);
  const justDog = listing({ title: "Dog Bandana", tags: ["dog"] });
  assert.equal(relates(justDog, terms).ok, false);
  assert.match(relates(justDog, terms).because, /only "dog"/);
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
