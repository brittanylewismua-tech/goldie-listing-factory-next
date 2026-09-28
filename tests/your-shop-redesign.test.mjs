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

test("the Your Shop rail is centered and no longer an underline strip",()=>{
  assert.match(css,/\.shop-map-tabs\{[\s\S]*width:max-content!important;[\s\S]*margin:0 auto 42px!important;/);
  assert.match(css,/border-radius:999px!important/);
  assert.match(css,/\.shop-map-tabs button\[aria-current=page\]\{[\s\S]*background:#000!important;/);
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
