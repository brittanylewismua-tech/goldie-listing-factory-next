/*
  COMPUTED ON EVERY RESPONSE, RENDERED NOWHERE.

  /api/shop-map/map returns `whereToFocus` — a per-niche recommendation with
  a headline, a reason and advice — and `classifier`, which records which raw
  groupings were collapsed into which and why. Measured on the live shop:
  five focus entries and eight collapse decisions, none of them on screen.

  `whereToFocus` was even declared in the client's own type and never used.

  The classifier's record matters most. A member counting five niches against
  a shop that suggested thirteen has no way to know that "Feminist Slogans",
  "Feminist Activism" and "Feminist Icons" were folded into "Feminist"
  because they are a design format rather than a different buyer — and that
  is exactly the judgement they would want to check.

  Third instance of this shape: the scanner's readability measurement
  (D1626), the unsupported-blueprint confidence (D1660), and this.
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

test("the classifier's collapse decisions are shown with their reasons", () => {
  assert.match(client, /<h2>How these niches were worked out<\/h2>/);
  assert.match(client, /classifier\?\.collapsed/);
  assert.match(client, /became part of/);
  assert.match(client, /was left out/);
  assert.match(client, /\{entry\.because\}/);
  /* The count reconciles the two numbers a member would compare. */
  assert.match(client, /rawNiches \?\? \[\]\)\.length\} groupings were found/);
  assert.match(client, /usedNiches \?\? \[\]\)\.length\}/);
});

test("both sections stay absent when there is nothing to say", () => {
  assert.match(client, /\(shown\.whereToFocus \?\? \[\]\)\.length > 0 &&/);
  assert.match(client, /\(shown\.classifier\?\.collapsed \?\? \[\]\)\.length > 0 &&/);
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
