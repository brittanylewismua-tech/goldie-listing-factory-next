/*
  AN ESTIMATE MUST NEVER READ AS A VERIFIED FIGURE.

  The page could only tell the two apart by the word "Estimated" inside
  `headline`. That makes the difference between a number a member can bank on
  and one they cannot a matter of copy — one reworded string away from an
  estimate reading as fact. `verdictFor` already computes a label; the route
  simply never sent it.

  verdictFor is deliberately pessimistic: one unavailable cost makes the
  month unavailable, one estimate makes it estimated, and a month is verified
  only when every figure came from an exact record.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verdictFor } from "../app/production-cost.ts";
import { fixtureFor } from "../app/state-fixtures.ts";

const cost = (basis) => ({ basis, costMinor: 100, currency: "USD" });

test("one estimate makes the whole month an estimate", () => {
  const verdict = verdictFor([cost("printify"), cost("printify"), cost("estimated")]);
  assert.equal(verdict.label, "estimated");
  assert.equal(verdict.headline, "Estimated profit");
  assert.equal(verdict.profitAvailable, true);
  assert.match(verdict.accuracy, /1 of 3 production costs come from your saved estimates/);
});

test("one missing cost outranks any number of estimates", () => {
  const verdict = verdictFor([cost("estimated"), cost("unavailable")]);
  assert.equal(verdict.label, "unavailable");
  assert.equal(verdict.profitAvailable, false);
});

test("costs entered by hand are verified, not estimates", () => {
  const verdict = verdictFor([cost("manually-confirmed"), cost("printify")]);
  assert.equal(verdict.label, "verified");
  assert.equal(verdict.headline, "Profit");
  assert.match(verdict.accuracy, /entered by you; the rest came from Printify/);
});

test("the route sends the label, not only the sentence", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/map/route.ts", import.meta.url), "utf8");
  assert.match(route, /label: state\.label/);
});

test("the estimate is marked on the figure itself", () => {
  const client = readFileSync(new URL(
    "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
  assert.match(client, /data-basis=\{monthBasis\(month\)\}/);
  assert.match(client, /monthBasis\(month\) === "estimated" &&/);
  assert.match(client, /shop-map-basis-chip">Estimate</);
  /* The label decides; coverage is the fallback for a response cached before
     the label existed, so an old month still cannot pass as verified. */
  assert.match(client, /if \(month\.label === "estimated"\) return "estimated"/);
  assert.match(client, /if \(\(month\.coverage\?\.estimated \?\? 0\) > 0\) return "estimated"/);
});

test("a month with no label and an estimated cost is still an estimate", () => {
  /* The fallback, as arithmetic rather than as a promise. */
  const client = readFileSync(new URL(
    "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
  const fn = client.slice(client.indexOf("function monthBasis"),
    client.indexOf("const money ="));
  assert.ok(fn.indexOf('coverage?.unavailable') < fn.indexOf('coverage?.estimated'),
    "unavailable must be checked before estimated, as verdictFor does");
});

test("the fixture matches what the server actually emits, and its arithmetic holds", () => {
  const estimated = fixtureFor("shop-map-estimated");
  assert.ok(estimated, "the estimated-cost state is missing");
  const month = estimated.replies[0].body.thisMonth;
  assert.equal(month.label, "estimated");
  assert.equal(month.headline, "Estimated profit");

  /* The sentence is verdictFor's own, for the same counts. */
  const real = verdictFor([
    ...Array.from({ length: 35 }, () => cost("printify")),
    ...Array.from({ length: 12 }, () => cost("estimated")),
  ]);
  assert.equal(month.accuracy, real.accuracy);
  assert.equal(month.headline, real.headline);
  assert.equal(month.label, real.label);

  /* Revenue less fees less production is the profit shown. Fees arrive
     negative, which is why this adds them. */
  assert.equal(month.revenueMinor + month.etsyFeesMinor - month.productionCostMinor,
    month.profitMinor, "the fixture's own figures do not add up");
  /* Coverage accounts for every order. */
  const { verified, estimated: est, unavailable } = month.coverage;
  assert.equal(verified + est + unavailable, month.orders,
    "coverage must account for every order in the month");
  assert.ok(est > 0, "an estimated month needs at least one estimated cost");
});

test("the verified-mixed fixture carries no estimate", () => {
  const mixed = fixtureFor("shop-map-verified-mixed");
  const month = mixed.replies[0].body.thisMonth;
  assert.equal(month.label, "verified");
  assert.equal(month.coverage.estimated, 0);
  assert.equal(month.revenueMinor + month.etsyFeesMinor - month.productionCostMinor,
    month.profitMinor);
  assert.equal(month.coverage.verified, month.orders);
});
