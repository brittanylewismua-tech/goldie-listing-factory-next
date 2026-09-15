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
