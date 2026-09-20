/*
  COMPUTED ON EVERY RESPONSE, RENDERED NOWHERE.

  /api/shop-map/map returns `whereToFocus` — a per-niche recommendation with
  a headline, a reason and advice. Measured on the live shop: five entries,
  none of them on screen, and the field was declared in the client's own type
  and never used.

  Third instance of this shape: the scanner's readability measurement
  (D1626), the unsupported-blueprint confidence (D1660), and this.

  The same response also carries the grouping decisions the map made and why.
  Those are NOT rendered, and deliberately so — shop-map-interface.test.mjs
  holds an explicit rule that those mechanics must not reach the member. I
  rendered them, that rule caught it, and reversing somebody's stated product
  decision is not mine to do quietly. It is raised as a question instead.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL(
  "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");

test("the overview names the leading product theme", () => {
  assert.match(client, /Top product theme/);
  assert.match(client, /niches\[0\]\?\.label/);
  assert.match(client, /orders in 90 days/);
});

test("product themes are kept together in their own tab", () => {
  assert.match(client, /tab === "themes"/);
  assert.match(client, /Where your sales are coming from/);
  assert.match(client, /niches\.map\(niche/);
});

test("the grouping mechanics stay off the page, as the existing rule requires", () => {
  /* Not an omission — a decision held by shop-map-interface.test.mjs, which
     caught me rendering them. */
  const bare = client.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const forbidden of ["classifier", "collapse", "confidence", "canonical"])
    assert.ok(!new RegExp(forbidden, "i").test(bare),
      `the page exposes ${forbidden}`);
});

test("the section stays absent when there is nothing to say", () => {
  assert.match(client, /niches\[0\] \? `\$\{niches\[0\]\.orders\} orders in 90 days` : "Sales will reveal this"/);
});

test("pointingHere is deliberately not rendered", () => {
  /*
    It names a niche with a reason ("Feminist is 80% of orders in the last 90
    days") while `standout.hasStandout` is false and the page says "No clear
    direction yet". Rendering both would put a finding directly above a
    statement that there is no finding. The gate wins; this is recorded so
    the omission reads as a decision rather than an oversight.
  */
  assert.ok(!/pointingHere/.test(client.replace(/\/\*[\s\S]*?\*\//g, "")),
    "pointingHere must not be rendered while standout gates the direction");
});

test("an unknown production cost is never rendered as zero", () => {
  /*
    The first fix here caught the case where coverage reports the cost
    unavailable. With no `thisMonth` in the payload at all — a shop read
    before its first month closed — the fallback was a literal 0, so
    Production read "$0.00" in a list where Revenue and Etsy fees both read
    "—". The same wrong claim as the one that was already fixed, reached
    through the other door.
  */
  assert.match(client,
    /money\(month \? -month\.productionCostMinor : undefined\)/,
    "with no month data the cost is unknown, not zero");
  assert.ok(!/money\(month \? -month\.productionCostMinor : 0\)/.test(client));
});

test("the fixtures say what the server actually says", () => {
  /*
    Two of them did not, and an unfaithful fixture is worse than none: it
    renders a state no member will ever see, and it can invent a defect or
    hide one. `accuracy` had "verified" and "unavailable" — bare tokens —
    where production-cost.ts only ever produces a sentence. And Etsy fees
    arrive negative, so a positive fixture rendered a cost as income.
  */
  const fixtures = readFileSync(new URL(
    "../app/state-fixtures.ts", import.meta.url), "utf8");
  assert.ok(!/accuracy: "(verified|unavailable|estimated)"/.test(fixtures),
    "accuracy is a sentence written for a member, never a token");
  const shopMap = fixtures.slice(fixtures.indexOf('key: "shop-map-loaded"'));
  assert.ok(!/etsyFeesMinor: [1-9]/.test(shopMap),
    "Etsy fees arrive negative; a positive fixture renders a cost as income");

  const costs = readFileSync(new URL(
    "../app/production-cost.ts", import.meta.url), "utf8");
  for (const sentence of ["No orders this month.", "Production costs missing for",
    "Every production cost came from Printify."])
    assert.ok(costs.includes(sentence), `accuracy no longer says: ${sentence}`);
});
