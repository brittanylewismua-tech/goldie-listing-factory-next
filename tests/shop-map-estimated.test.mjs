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

test("The route labels profit verified only when the complete financial reader returned it",()=>{
  const route=readFileSync(new URL("../app/api/shop-map/map/route.ts",import.meta.url),"utf8");
  assert.match(route,/profit = financial\?\.knownOperatingProfitMinor \?\? null/);
  assert.match(route,/label: profit === null \? "unavailable" : "verified"/);
});
test("Cached estimates and missing labels cannot display profit",()=>{
  const client=readFileSync(new URL("../app/shop-map/shop-map-client.tsx",import.meta.url),"utf8");
  assert.match(client,/return month\?\.label === "verified" \? "verified" : "unavailable"/);
  assert.match(client,/monthBasis\(month\)==="unavailable"\|\|month\?\.profitMinor == null \? "Profit not worked out yet"/);
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
