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

test("the per-niche guidance is rendered", () => {
  assert.match(client, /<h2>Where to focus<\/h2>/);
  assert.match(client, /\{focus\.label\} · \{focus\.headline\}/);
  assert.match(client, /\{focus\.reason\}/);
  assert.match(client, /\{focus\.advice\}/);
});

test("the thin niches are grouped, not given a card each", () => {
  /* Four identical "needs more data" cards is how a real finding gets lost
     among them. */
  assert.match(client, /filter\(focus => !\/needs more data\/i\.test\(focus\.headline\)\)/);
  assert.match(client, /Not enough recent orders to read a pattern in/);
  assert.match(client, /They stay on the map\s*\n?\s*with their lifetime figures/);
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
  assert.match(client, /\(shown\.whereToFocus \?\? \[\]\)\.length > 0 &&/);
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
