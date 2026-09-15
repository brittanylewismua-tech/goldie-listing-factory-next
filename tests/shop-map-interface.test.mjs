/*
  The map is read on a phone, so these check the shape a phone needs rather
  than the pixels: one headline, no table, evidence on tap, and nothing that
  turns Needs Attention into an error log.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/shop-map/shop-map.css", import.meta.url), "utf8");

test("the four sections are there, in order", () => {
  const order = ["This month", "Your shop map", "Where to focus", "Needs attention"];
  let at = -1;
  for (const heading of order) {
    const next = client.indexOf(heading);
    assert.ok(next > at, `${heading} is missing or out of order`);
    at = next;
  }
});

test("one headline number, never two competing", () => {
  /* The figure is whatever profitState decided; estimated and verified are
     the same slot, not rival numbers. */
  const figures = client.match(/className="shop-map-figure"/g) ?? [];
  assert.equal(figures.length, 1, "more than one headline figure is rendered");
  assert.match(client, /\{month\?\.headline\}/);
  assert.match(client, /\{money\(month\?\.profitMinor\)\}/);
});

test("the accuracy line sits with the number", () => {
  assert.match(client, /shop-map-accuracy/);
  assert.match(client, /\{month\?\.accuracy\}/);
});

test("guidance is never shown without its reason", () => {
  const block = client.slice(client.indexOf("Where to focus"), client.indexOf("Needs attention"));
  assert.match(block, /row\.advice/);
  assert.match(block, /row\.reason/);
  /* Nothing to say is said, rather than left blank. */
  assert.match(block, /Not enough evidence to guide you yet/);
});

test("the map emphasises the strongest niches visually", () => {
  assert.match(client, /shop-map-world-strong/);
  assert.match(css, /\.shop-map-world-strong\{/);
  /* Product types show on the card as an attribute of the niche. */
  assert.match(client, /shop-map-families/);
});

test("worlds stack vertically and have large touch targets", () => {
  assert.match(css, /\.shop-map-worlds\{[^}]*display:grid/);
  assert.match(css, /\.shop-map-world\{[^}]*min-height:64px/);
  /* No spreadsheet on the primary screen. */
  assert.doesNotMatch(client, /<table|<thead|<tbody/);
});

test("evidence is behind a tap, not on the face of the card", () => {
  assert.match(client, /aria-expanded=\{open === world\.worldId\}/);
  assert.match(client, /open === world\.worldId\s*\n?\s*\? <div className="shop-map-evidence"/);
});

test("nothing overflows a phone sideways", () => {
  assert.match(css, /max-width:640px/);
  assert.doesNotMatch(css, /overflow-x:\s*scroll/);
  /* A breakpoint is not a layout constraint; only a min-width on an element
     can push the page wider than the screen. */
  const rules = css.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, "");
  assert.doesNotMatch(rules, /min-width:\s*[3-9]\d\d/);
});

test("needs attention stays actionable and says so when it is empty", () => {
  const block = client.slice(client.indexOf("Needs attention"));
  assert.match(block, /aren’t in a niche yet/);
  assert.match(block, /no production cost/);
  /* Counts read correctly at one as well as many. */
  assert.match(block, /"order has" : "orders have"/);
  assert.match(block, /Nothing needs your attention/);
  /* Not a technical error dashboard. */
  assert.doesNotMatch(block, /stack|exception|status code|endpoint/i);
});

test("the page shows no buyer information", () => {
  for (const forbidden of ["buyer", "email", "address", "customer name"])
    assert.doesNotMatch(client.replace(/signedInEmail/g, ""), new RegExp(forbidden, "i"),
      `the map renders ${forbidden}`);
});

test("the map makes no paid provider call", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/map/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /fal\.run|anthropic|openai/i);
  assert.match(route, /paidProviderCost: 0/);
});

test("corrections sit beside the imported data, never on top of it", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  /* Nothing here touches what Etsy or Printify said. */
  for (const table of ["shop_map_listings", "shop_map_listing_sales",
    "finance_receipts", "finance_production", "finance_ledger"])
    assert.doesNotMatch(route, new RegExp(`(UPDATE|DELETE FROM)\\\\s+${table}`),
      `a correction writes to the imported table ${table}`);
  assert.match(route, /shop_map_world_overrides/);
  assert.match(route, /shop_map_cost_rules/);
});

test("every correction the milestone asked for exists", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  for (const action of ["move-listing", "rename-world", "merge-worlds",
    "confirm-cost-rule", "reverse"])
    assert.match(route, new RegExp(`"${action}"`), `${action} is missing`);
});

test("a reversal is recorded rather than erased", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  assert.match(route, /reversed_at = \?/);
  assert.match(route, /not erased/);
});

test("a correction can only ever touch the caller's own shop", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  for (const statement of route.match(/(INSERT INTO|UPDATE|DELETE FROM)[\s\S]{0,400}?`/g) ?? [])
    assert.ok(/user_id/.test(statement), "a correction ran without scoping to the member");
});

test("no world figure is shown without its period", () => {
  /* The cards showed lifetime revenue under a heading that said This month,
     so $59,960 read as a monthly figure. */
  assert.match(client, /shop-map-period/);
  assert.match(client, /\{map\.worldsPeriod\}/);
  const route = readFileSync(new URL(
    "../app/api/shop-map/map/route.ts", import.meta.url), "utf8");
  assert.match(route, /worldsPeriod: recentEnough \? "Last 90 days" : "Lifetime"/);
  assert.match(route, /ONE PERIOD, SAID OUT LOUD/);
});

test("product families appear inside a world, never as one", () => {
  assert.match(client, /Products: \{world\.productFamilies/);

});

test("review evidence is shown as reviews, never as sales", () => {
  assert.match(client, /reviews in the last 90 days/);
  const block = client.slice(client.indexOf("world.reviews"));
  assert.doesNotMatch(block.slice(0, 300), /sale|sold/i);
});

test("no standout is stated before any per-niche advice", () => {
  const block = client.slice(client.indexOf("Where to focus"));
  assert.match(block, /shop-map-standout/);
  assert.match(block, /map\.standout && !map\.standout\.hasStandout/);
  /* It appears above the list, not buried under it. */
  assert.ok(block.indexOf("shop-map-standout") < block.indexOf("shop-map-focus"));
});

test("unclassified performance is shown, not just a count", () => {
  /* 132 listings holding 856 orders and ~$19,950 were reported as a bare
     number, which reads as tidying rather than as missing map. */
  const block = client.slice(client.indexOf("Needs attention"));
  assert.match(block, /unclassifiedPerformance/);
  assert.match(block, /lifetime orders/);
  assert.match(block, /still active/);
});

test("coverage is shown beside the map", () => {
  assert.match(client, /% of active listings organized/);
  assert.match(client, /map\.coverage/);
});
