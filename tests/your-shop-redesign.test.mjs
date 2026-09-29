import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync("app/shop-map/shop-map-client.tsx","utf8");
const route=readFileSync("app/api/shop-map/map/route.ts","utf8");
const css=readFileSync("app/shop-map/shop-map.css","utf8");
const nav=readFileSync("app/shop-map/shop-map-navigation.ts","utf8");

test("Your Shop defaults to Overview and requests only the active tab",()=>{
  assert.match(nav,/return value==='money'\|\|value==='themes'\|\|value==='sold'\?value:'overview'/);
  assert.match(client,/useState<"overview" \| "themes" \| "sold" \| "money">\("overview"\)/);
  assert.match(client,/new URLSearchParams\(\{view:tab\}\)/);
});

test("Your Numbers, Sold Listings, and the first Overview render return before world building",()=>{
  const sold=route.indexOf('if(view==="sold")');
  const money=route.indexOf('if(view==="money")');
  const overview=route.indexOf('if(view==="overview")');
  const listings=route.indexOf("/* ------------------------------------------------------------- listings */");
  const worlds=route.indexOf("/* --------------------------------------------------------------- worlds */");
  assert.ok(money>-1&&money<listings,"Your Numbers is scanning the listing catalog again");
  assert.ok(sold>-1&&overview>-1&&worlds>-1&&sold<worlds&&overview<worlds);
});

test("tab reads do not block on live Etsy display refreshes",()=>{
  assert.match(route,/if\(!view&&\(selectedIds\.some/);
});

test("the Your Shop rail is an unboxed editorial text rail",()=>{
  const final=css.slice(css.lastIndexOf("FINAL YOUR SHOP RAIL OVERRIDE"));
  assert.match(final,/\.shop-map-tabs\{[\s\S]*width:100%!important;[\s\S]*border-bottom:1px solid/);
  assert.match(final,/gap:30px!important/);
  assert.match(final,/font-size:11px!important/);
  assert.match(final,/text-transform:uppercase!important/);
  assert.match(final,/button\[aria-current=page\]\{[\s\S]*background:transparent!important;[\s\S]*box-shadow:none!important;/);
  assert.match(final,/button\[aria-current=page\]::before\{[\s\S]*background:#ee6fc0!important;/);
});

test("Overview puts performance and focus before utilities",()=>{
  const overview=client.slice(client.indexOf('{tab === "overview"'),client.indexOf('{tab === "themes"'));
  assert.ok(overview.indexOf("shop-map-leaders")<overview.indexOf("shop-map-opportunities"));
  assert.match(overview,/shop-map-focus-panel/);
  assert.match(overview,/Revenue · 90 days/);
  assert.match(overview,/Units sold · 90 days/);
});

test("Product Themes is visual and keeps Unclassified separate",()=>{
  const themes=client.slice(client.indexOf('{tab === "themes"'),client.indexOf('{tab === "sold"'));
  assert.match(themes,/shop-map-world-thumbs/);
  assert.match(themes,/% of 90-day revenue/);
  assert.match(themes,/Lifetime:/);
  assert.match(themes,/shop-map-unclassified/);
});

test("Sold Listings uses one toolbar and image-led rows",()=>{
  const sold=client.slice(client.indexOf('{tab === "sold"'),client.indexOf('{tab === "money"'));
  assert.match(sold,/shop-map-sold-toolbar/);
  assert.match(sold,/shop-map-sold-grid/);
  assert.match(sold,/width=\{84\} height=\{84\}/);
});


test("Overview renders its scorecard before deeper insights finish",()=>{
  assert.match(client,/view=overview-insights/);
  assert.match(client,/Loading where to focus/);
  assert.match(client,/setMap\(current=>current\?\{\.\.\.current,\.\.\.detail\}:detail\)/);
});


test("Monthly Numbers exposes the full operating breakdown",()=>{
  const money=client.slice(client.indexOf('{tab === "money"'));
  for(const label of ["Product sales","Shipping collected","Transaction fees","Processing fees",
    "Listing + renewal fees","Advertising fees","Marketplace tax","Production shipping",
    "Cost coverage","Average order","Profit margin"])
    assert.ok(money.includes(label), `Monthly Numbers is missing ${label}`);
  for(const field of ["productRevenueMinor","shippingCollectedMinor","etsyTransactionFeesMinor",
    "etsyProcessingFeesMinor","etsyListingFeesMinor","etsyAdvertisingFeesMinor",
    "marketplaceTaxMinor","productionShippingMinor","profitMarginPercent"])
    assert.ok(route.includes(field), `API does not expose ${field}`);
});
