import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/professional-redesign.css", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/shop-map/map/route.ts", import.meta.url), "utf8");

test("the redesigned map has four clear sections", () => {
  for (const label of ["Opportunity Engine", "Product themes", "Sold listings", "Your numbers"])
    assert.ok(client.includes(label), `${label} is missing`);
  assert.match(client, /aria-current=\{tab === key \? 'page'/);
});

test("Opportunity Engine leads with the attention map before sold listings", () => {
  assert.match(client, /ATTENTION MAP/);
  assert.match(client, /Put your attention where customers already put theirs/);
  assert.match(client, /YOUR #1 PRIORITY/);
  assert.match(client, /STRONGEST LISTINGS/);
  assert.ok(client.indexOf("ATTENTION MAP") < client.indexOf("STRONGEST LISTINGS"));
  assert.match(client, /THEN FOLLOW THE RANKING/);
  assert.doesNotMatch(client, /<h2>Top sellers<\/h2>/);
});

test("sold listings keep every metric within the selected sales period", () => {
  const sold=client.slice(client.indexOf('{tab === "sold"'),client.indexOf('{tab === "money"'));
  assert.match(sold,/Sold listings · last/);
  assert.match(sold,/unit\{listing\.sales===1\?"":"s"\} sold/);
  assert.match(sold,/money\(listing\.revenueMinor\)/);
  // Lifetime totals must not masquerade as favorites earned in the sales period.
  assert.doesNotMatch(sold,/listing.favorites|value="favorites"/);
  assert.match(sold,/shown.soldListings\?\.days\?\?90/);
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
  assert.match(client, /Revenue this month/);
  assert.match(client, /data-basis="unavailable"/);
  assert.match(client, /data-basis=\{monthBasis\(month\)\}/);
  assert.doesNotMatch(client, /shop-map-basis-chip">Estimate/);
  assert.match(client, /Add production costs/);
});

test("the page handles loading, failure, empty sales and timezone setup", () => {
  assert.match(client, /Loading your shop/);
  assert.match(client, /Showing your last saved results/);
  assert.match(client, /Sold listings · last/);
  assert.match(client, /My shop runs on \$\{detected\}/);
});

test("the map remains responsive without a desktop-only table", () => {
  const routeCss=readFileSync(new URL("../app/shop-map/shop-map.css", import.meta.url), "utf8");
  assert.match(routeCss, /\.shop-map-attention/);
  assert.match(routeCss, /@media\(max-width:650px\)/);
  assert.match(routeCss, /\.shop-map-sold-grid article/);
  assert.doesNotMatch(client, /<table|<thead|<tbody/);
});

test("the map makes no paid provider call and corrections remain member-scoped", () => {
  assert.doesNotMatch(route, /fal\.run|anthropic|openai/i);
  assert.match(route, /paidProviderCost: 0/);
  const correction = readFileSync(new URL("../app/api/shop-map/correct/route.ts", import.meta.url), "utf8");
  for (const statement of correction.match(/(INSERT INTO|UPDATE|DELETE FROM)[\s\S]{0,400}?`/g) ?? [])
    assert.ok(/user_id/.test(statement), "a correction ran without member scope");
});


test("the attention engine is based on a strict evidence ladder",()=>{
  const attention=readFileSync(new URL("../app/shop-map-attention.ts",import.meta.url),"utf8");
  assert.match(attention,/recentSales>0\?"sales-90"/);
  assert.match(attention,/lifetimeSales>0\?"sales-lifetime"/);
  assert.match(attention,/favorites>0\?"favorites"/);
  assert.match(attention,/buildGap=attentionShare-catalogShare/);
  assert.match(route,/attention,/);
});
