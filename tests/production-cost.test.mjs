/*
  An incomplete profit must never look complete, and a cost must never change
  basis by being used.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPLANATION, actionsFor, verdictFor, currencyCheck, ruleFor, ADJUSTMENT_KINDS,
} from "../app/production-cost.ts";

const cost = (over = {}) => ({ receiptId: 1, basis: "printify-verified",
  costMinor: 1_200, currency: "USD", ...over });

test("every unmatched reason has a member-readable explanation", () => {
  for (const [reason, text] of Object.entries(EXPLANATION)) {
    assert.ok(text.length > 30, `${reason} has no explanation`);
    /* Written for a seller, not an engineer. */
    for (const jargon of ["null", "NULL", "foreign key", "join", "metadata field",
      "nested", "API"])
      assert.ok(!text.includes(jargon), `${reason} explains with "${jargon}"`);
  }
});

test("linking is offered only when exactly one candidate is supported", () => {
  assert.ok(actionsFor("absent-from-printify",
    { exactCandidates: 1, hasFamilyRule: false }).includes("link-printify-order"));
  for (const count of [0, 2, 5])
    assert.ok(!actionsFor("absent-from-printify",
      { exactCandidates: count, hasFamilyRule: false }).includes("link-printify-order"),
      `linking was offered with ${count} candidates`);
});

test("a cancelled order offers nothing to correct", () => {
  assert.deepEqual(actionsFor("canceled", { exactCandidates: 1, hasFamilyRule: true }),
    ["leave"]);
});

test("leaving it unresolved is always an option", () => {
  for (const reason of Object.keys(EXPLANATION))
    assert.ok(actionsFor(reason, { exactCandidates: 0, hasFamilyRule: false })
      .includes("leave"));
});

test("one missing cost makes the whole month unavailable", () => {
  const verdict = verdictFor([cost(), cost({ receiptId: 2, basis: "unavailable", costMinor: null })]);
  assert.equal(verdict.label, "unavailable");
  assert.equal(verdict.profitAvailable, false);
  assert.match(verdict.accuracy, /missing for 1 of 2 orders/);
});

test("one estimate makes the whole month estimated, and says so", () => {
  const verdict = verdictFor([cost(), cost({ receiptId: 2, basis: "estimated" })]);
  assert.equal(verdict.label, "estimated");
  assert.equal(verdict.headline, "Estimated profit");
  assert.match(verdict.accuracy, /saved estimates/);
  /* And it never claims to be verified. */
  assert.ok(!verdict.headline.toLowerCase().includes("verified"));
});

test("a manually confirmed cost is never relabelled as Printify verified", () => {
  const verdict = verdictFor([cost({ basis: "manually-confirmed" })]);
  assert.match(verdict.accuracy, /entered by you/);
  /* "the rest came from Printify" is true and necessary; what must not appear
     is a claim that the member's own figure did. */
  assert.doesNotMatch(verdict.accuracy, /^Every production cost came from Printify/);
  assert.match(verdict.accuracy, /1 of 1 production costs were entered by you/);
});

test("a fully Printify month is the only one called simply verified", () => {
  const verdict = verdictFor([cost(), cost({ receiptId: 2 })]);
  assert.equal(verdict.label, "verified");
  assert.match(verdict.accuracy, /Every production cost came from Printify/);
});

test("currencies are never added together", () => {
  const mixed = currencyCheck([cost(), cost({ receiptId: 2, currency: "GBP" })]);
  assert.equal(mixed.ok, false);
  assert.match(mixed.because, /will not add them together/);
  assert.equal(currencyCheck([cost(), cost({ receiptId: 2 })]).ok, true);
});

test("a later rule never rewrites an earlier month", () => {
  const rules = [
    { family: "tee", baseCostMinor: 900, shippingMinor: 400, currency: "USD", effectiveFrom: 1_000 },
    { family: "tee", baseCostMinor: 1_100, shippingMinor: 450, currency: "USD", effectiveFrom: 5_000 },
  ];
  assert.equal(ruleFor(rules, "tee", 3_000).baseCostMinor, 900);
  assert.equal(ruleFor(rules, "tee", 9_000).baseCostMinor, 1_100);
  assert.equal(ruleFor(rules, "tee", 500), null, "a rule applied before it existed");
  assert.equal(ruleFor(rules, "hoodie", 9_000), null);
});

test("an adjustment is recorded as its own kind, never as Printify evidence", () => {
  const kinds = Object.values(ADJUSTMENT_KINDS);
  assert.equal(new Set(kinds).size, kinds.length);
  for (const kind of kinds) assert.ok(!kind.includes("verified"));
});

test("no basis can be promoted by code that uses it", () => {
  const source = readFileSync(new URL("../app/production-cost.ts", import.meta.url), "utf8");
  assert.match(source, /A COST NEVER CHANGES BASIS BY BEING\s*\n?\s*\* USED/);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  /* Nothing assigns printify-verified to anything. It comes only from a match. */
  assert.doesNotMatch(code, /basis\s*[:=]\s*"printify-verified"/);
});

test("the correction view returns no buyer information", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/production-cost/route.ts", import.meta.url), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const leak of ["buyer", "name", "email", "address", "first_line",
    "city", "zip", "postal", "phone"])
    assert.doesNotMatch(code, new RegExp(`\\b${leak}\\b`, "i"),
      `the correction view reads ${leak}`);
  assert.match(route, /NO BUYER INFORMATION/);
});

test("a link is only offered against one unambiguous candidate", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/production-cost/route.ts", import.meta.url), "utf8");
  assert.match(route, /candidates\.length === 1/);
  /* And only from Printify orders attached to nothing else. */
  assert.match(route, /receipt_id IS NULL OR receipt_id = 0/);
  /* Currency has to agree, or the "cost" is a different unit. */
  assert.match(route, /order\.currency === row\.currency/);
});

test("the diagnosis is evidence-led and admits when it does not know", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/production-cost/route.ts", import.meta.url), "utf8");
  const diagnose = route.slice(route.indexOf("const diagnose ="),
    route.indexOf("const orders ="));
  assert.match(diagnose, /return "unknown";/);
  /* Each branch checks a specific fact rather than guessing. */
  for (const check of ["canceled", "receiptId", "printifyOrderId", "window"])
    assert.ok(diagnose.includes(check), `the diagnosis never looks at ${check}`);
});

test("the route enforces the Shop Map entitlement", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/production-cost/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireFeatureApi\("shopMap"\)/);
});
