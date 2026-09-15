/*
  THE VOCABULARY IS DECIDED ONCE.

  Three independent batches each asked "what niches are here?" would invent
  their own words, and the shop would hold "Feminist", "Feminism" and
  "Women's rights" as three categories with a third of the money each.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCanonical, parseAssignments, estimateCost, compact,
  CANONICAL_PROMPT, ASSIGN_PROMPT, MAX_CALLS_PER_BUILD, MEMBER_DAILY_DOLLARS, collapseFacets,
} from "../app/niche-classifier.ts";

const inputs = new Map([
  [1, { listingId: 1, title: "Feminist Smash The Patriarchy Tee", tags: ["feminist"],
    shopSection: "", wording: "" }],
  [2, { listingId: 2, title: "Dachshund Dog Mom Shirt", tags: ["dog mom"],
    shopSection: "", wording: "" }],
]);

test("a full build fits inside the member's daily dollars", () => {
  const estimate = estimateCost(293);
  assert.ok(estimate.dollars < MEMBER_DAILY_DOLLARS,
    `${estimate.dollars} exceeds ${MEMBER_DAILY_DOLLARS}`);
  assert.ok(estimate.calls <= MAX_CALLS_PER_BUILD,
    `${estimate.calls} calls exceeds the ${MAX_CALLS_PER_BUILD} allowed`);
});

test("the model may not name something the gate already refuses", () => {
  const result = parseCanonical(JSON.stringify({ niches:
    ["Feminist", "Women's Tees", "Feminist Mugs", "For Her", "Women Are", "Horses"] }));
  assert.ok(result.ok);
  assert.deepEqual(result.niches, ["Feminist", "Horses"]);
  /* Refusals are reported, never silently dropped. */
  assert.equal(result.rejected.length, 4);
  assert.ok(result.rejected.some(row => /product/.test(row.because)));
});

test("a duplicate synonym is refused rather than becoming a second niche", () => {
  const result = parseCanonical(JSON.stringify({ niches: ["Feminist", "feminist", "Horses"] }));
  assert.ok(result.ok);
  assert.equal(result.niches.length, 2);
  assert.ok(result.rejected.some(row => row.because === "duplicate"));
});

test("too few usable niches is a failure, not a thin map", () => {
  const result = parseCanonical(JSON.stringify({ niches: ["Women's Tees", "Mugs"] }));
  assert.equal(result.ok, false);
  assert.match(result.why, /usable niches/);
});

test("an assignment outside the canonical list is dropped", () => {
  const { assigned, rejected } = parseAssignments(JSON.stringify({ assignments: [
    { id: 1, primary: "Feminist", confidence: "high", evidence: "Smash The Patriarchy" },
    { id: 2, primary: "Invented Niche", confidence: "high", evidence: "Dachshund" },
  ] }), ["Feminist", "Dog people"], inputs);
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].primary, "Feminist");
  assert.match(rejected[0].because, /not in the canonical list/);
});

test("invented evidence is refused", () => {
  /* A quote that is not in the listing is the clearest sign of a guess. */
  const { assigned, rejected } = parseAssignments(JSON.stringify({ assignments: [
    { id: 2, primary: "Dog people", confidence: "high", evidence: "Nurses appreciation week" },
  ] }), ["Dog people"], inputs);
  assert.equal(assigned.length, 0);
  assert.match(rejected[0].because, /evidence does not appear/);
});

test("a secondary equal to the primary is dropped", () => {
  const { assigned } = parseAssignments(JSON.stringify({ assignments: [
    { id: 1, primary: "Feminist", secondary: "Feminist", confidence: "high", evidence: "Feminist" },
  ] }), ["Feminist"], inputs);
  assert.equal(assigned[0].secondary, "");
});

test("the prompts forbid the categories the gate refuses", () => {
  for (const banned of ["garment", "gift", "fragment", "synonym"])
    assert.match(CANONICAL_PROMPT, new RegExp(banned, "i"), `the prompt allows ${banned}`);
  assert.match(ASSIGN_PROMPT(["Feminist"]), /never invent a niche/);
  assert.match(ASSIGN_PROMPT(["Feminist"]), /exactly one primary/);
});

test("listings are sent compactly, with no images", () => {
  assert.match(compact(inputs.get(1)), /Feminist Smash/);
  const module = compact(inputs.get(1));
  assert.doesNotMatch(module, /http|image|png|jpg/i);
});

test("nothing reaches the provider before the spend guard agrees", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  const reserveAt = route.indexOf("await reserveSpend(");
  const fetchAt = route.indexOf("https://fal.run/");
  assert.ok(reserveAt > 0 && reserveAt < fetchAt,
    "a provider call is made before the reservation");
  /* A half-finished build leaves a shop with half a vocabulary. */
  assert.match(route, /Reservation first/);
});

test("an unchanged listing is never sent", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /cached\.get\(listing\.listingId\) !== hashOf\(listing\)/);
  assert.match(route, /Every listing is already classified/);
});

test("the call budget is enforced inside the loop, not just planned", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(calls >= MAX_CALLS_PER_BUILD\) throw new Error/);
  assert.match(route, /if \(calls >= MAX_CALLS_PER_BUILD\) break;/);
});

test("a billed failure pays the ledger and keeps the member's build", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /await failSpend\(reservation\.id, \{ billed \}\)/);
  assert.match(route, /the member keeps their build/);
});

test("no image is ever sent", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  /* The comment says so; the code must not contradict it. */
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /image|media_type|base64/i);
  assert.match(route, /TEXT ONLY/);
});

test("a missing key stops before any spend", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  const keyAt = route.indexOf("No provider key is configured");
  const reserveAt = route.indexOf("await reserveSpend(");
  assert.ok(keyAt > 0 && keyAt < reserveAt);
});

test("the classifier uses the provider already configured", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /process\.env\.FAL_KEY/);
  assert.match(route, /fal\.run/);
  /* And carries no image_urls, which is what makes it text-only. */
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /image_urls/);
});

test("the Anthropic adapter stays available but disabled", () => {
  const module = readFileSync(new URL("../app/niche-classifier.ts", import.meta.url), "utf8");
  assert.match(module, /ANTHROPIC_ADAPTER = \{ model: "claude-haiku-4-5-20251001", enabled: false \}/);
});

test("the whole member ceiling is reserved until the cost is measured", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /CONSERVATIVE_RESERVATION/);
  const module = readFileSync(new URL("../app/niche-classifier.ts", import.meta.url), "utf8");
  assert.match(module, /CONSERVATIVE_RESERVATION = MEMBER_DAILY_DOLLARS/);
});

test("a failed build stores no partial niche vocabulary", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  /* The list is written only after assignment produced something. */
  const storeAt = route.indexOf("INSERT INTO shop_map_niche_list");
  const guardAt = route.indexOf("if (!stored) {");
  assert.ok(guardAt > 0 && guardAt < storeAt,
    "the niche list is stored before assignment is known to have worked");
  assert.match(route, /NO PARTIAL VOCABULARY/);
});

test("the provider's own reported charge is what gets settled", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/classify/route.ts", import.meta.url), "utf8");
  assert.match(route, /billed \+= Number\(usage\.cost \?\? 0\)/);
  assert.match(route, /await settleSpend\(reservation\.id, billed\)/);
});

test("one subject split by design format collapses to the subject", () => {
  /* The first live build returned five Feminist categories. */
  const counts = new Map([["Feminist Slogans", 70], ["Girl Power", 36],
    ["Feminist Activism", 6], ["Feminist Icons", 3], ["Feminist Identity", 1],
    ["Feminist for Men", 6], ["Political Protest", 19]]);
  const { kept, merged } = collapseFacets([...counts.keys()], counts);
  assert.ok(kept.includes("Feminist"), "the shared subject was not kept");
  for (const facet of ["Feminist Slogans", "Feminist Icons", "Feminist Activism"])
    assert.ok(!kept.includes(facet), `${facet} survived as its own niche`);
  assert.ok(merged.some(row => /design format/.test(row.because)));
});

test("a recipient split collapses too", () => {
  const { kept } = collapseFacets(["Feminist", "Feminist for Men"],
    new Map([["Feminist", 70], ["Feminist for Men", 6]]));
  assert.deepEqual(kept, ["Feminist"]);
});

test("a category resting on one listing is dropped", () => {
  const { kept, merged } = collapseFacets(["Horses", "Nurses"],
    new Map([["Horses", 20], ["Nurses", 1]]));
  assert.deepEqual(kept, ["Horses"]);
  assert.ok(merged.some(row => /only 1 listings/.test(row.because)));
});

test("genuinely different subjects are left alone", () => {
  const counts = new Map([["Feminist", 70], ["Girl Power", 36], ["Political Protest", 19]]);
  const { kept } = collapseFacets([...counts.keys()], counts);
  assert.equal(kept.length, 3);
});

test("the prompt now forbids format and recipient splits", () => {
  assert.match(CANONICAL_PROMPT, /split by design format/);
  assert.match(CANONICAL_PROMPT, /split by who it is for/);
  assert.match(CANONICAL_PROMPT, /return only the shared subject/i);
});
