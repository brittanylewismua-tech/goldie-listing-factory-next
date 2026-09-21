import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/professional-redesign.css", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/shop-map/map/route.ts", import.meta.url), "utf8");

test("the redesigned map has four clear sections", () => {
  for (const label of ["Overview", "Product themes", "Sold listings", "Your numbers"])
    assert.ok(client.includes(label), `${label} is missing`);
  assert.match(client, /aria-current=\{tab === key \? 'page'/);
});

test("overview leads with sold listings and plain timing", () => {
  assert.match(client, /Top 3 listings in the last 90 days/);
  assert.match(client, /LAST 90 DAYS/);
  assert.match(client, /shown.topListings\?\?sold.slice\(0,3\)/);
  assert.match(client, /listing\.sales\} sold/);
});

test("sold listings show the fields a seller asked for", () => {
  for (const label of ["Listing", "Sold", "Favorites", "Revenue"])
    assert.ok(client.includes(label), `${label} is missing`);
  assert.match(route, /soldListings: \{ period: `Last \$\{soldDays\} days`, days:soldDays, listings: soldListings \}/);
  assert.match(route, /refunded/);
});

test("product themes remain evidence-backed and expandable", () => {
  assert.match(client, /aria-expanded=\{open === niche\.worldId\}/);
  assert.match(client, /niche\.evidence/);
  assert.match(client, /niche\.memberListings/);
  assert.match(client, /niche\.lifetimeRevenueMinor/);
});

test("money keeps unknown costs unknown and marks estimates", () => {
  assert.match(client, /Profit unavailable/);
  assert.match(client, /data-basis=\{monthBasis\(month\)\}/);
  assert.doesNotMatch(client, /shop-map-basis-chip">Estimate/);
  assert.match(client, /Add production costs/);
});

test("the page handles loading, failure, empty sales and timezone setup", () => {
  assert.match(client, /Organizing your shop/);
  assert.match(client, /Showing your last saved results/);
  assert.match(client, /No sales in the last 90 days/);
  assert.match(client, /My shop runs on \$\{detected\}/);
});

test("the map remains responsive without a desktop-only table", () => {
  assert.match(css, /\.shop-map-leader-grid/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /\.shop-map-sold-table article\{grid-template-columns/);
  assert.doesNotMatch(client, /<table|<thead|<tbody/);
});

test("the map makes no paid provider call and corrections remain member-scoped", () => {
  assert.doesNotMatch(route, /fal\.run|anthropic|openai/i);
  assert.match(route, /paidProviderCost: 0/);
  const correction = readFileSync(new URL("../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  for (const statement of correction.match(/(INSERT INTO|UPDATE|DELETE FROM)[\s\S]{0,400}?`/g) ?? [])
    assert.ok(/user_id/.test(statement), "a correction ran without member scope");
});
