import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync("app/shop-map/shop-map-client.tsx","utf8");
const route=readFileSync("app/api/shop-map/map/route.ts","utf8");
const shopPage=readFileSync("app/shop-map/page.tsx","utf8");
const css=readFileSync("app/shop-map/shop-map.css","utf8");
const nav=readFileSync("app/shop-map/shop-map-navigation.ts","utf8");
const commandWorkspace=readFileSync("app/command-workspace.css","utf8");
const currentSuite=readFileSync("app/current-suite.css","utf8");

test("Your Shop defaults to Overview and requests only the active tab",()=>{
  assert.match(nav,/return value==='money'\|\|value==='themes'\|\|value==='sold'\?value:'overview'/);
  assert.match(client,/useState<"overview" \| "themes" \| "sold" \| "money">\("overview"\)/);
  assert.match(client,/new URLSearchParams\(\{view:tab==="overview"\?"overview-purchases":tab\}\)/);
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

test("the Your Shop section switcher is a centered pink-and-white tab control",()=>{
  const final=css.slice(css.lastIndexOf("FINAL YOUR SHOP TABS"));
  assert.match(final,/\.shop-map-tabs\{[\s\S]*justify-content:center!important;[\s\S]*width:max-content!important;/);
  assert.match(final,/border:2px solid #000!important/);
  assert.match(final,/border-radius:14px!important/);
  assert.match(final,/button\{[\s\S]*background:#fff!important;[\s\S]*border:1\.5px solid #000!important;/);
  assert.match(final,/button\[aria-current=page\]\{[\s\S]*background:#ee6fc0!important;[\s\S]*box-shadow:2px 2px 0 #000!important;/);
});

test("Overview puts purchased products first and artwork patterns before review utilities",()=>{
  const overview=client.slice(client.indexOf('{tab === "overview"'),client.indexOf('{tab === "themes"'));
  assert.ok(overview.indexOf("PurchasePriorities")<overview.indexOf("WinningPatterns"));
  assert.ok(overview.indexOf("WinningPatterns")<overview.indexOf("ReviewThese"));
  assert.ok(overview.indexOf("WinningPatterns")<overview.indexOf("ArtworkRecommendations"));
  assert.match(overview,/shown\.patterns/);
  assert.doesNotMatch(overview,/AttentionEngine/);
  assert.doesNotMatch(overview,/shop-map-focus-panel|Revenue · 90 days|Units sold · 90 days/);
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


test("Overview merges deeper opportunity intelligence without blocking the first render",()=>{
  assert.match(client,/tab==="overview"\?"overview-purchases":tab/);
  assert.match(client,/setMap\(current=>\{if\(!current\)return current;[\s\S]*const merged=\{\.\.\.current,\.\.\.detail\}/);
  assert.match(client,/view=overview-support/);
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


test("Opportunity Engine uses a dedicated core request before optional support",()=>{
  assert.match(client,/tab==="overview"\?"overview-purchases":tab/);
  assert.match(client,/view=overview-support/);
  const core=route.indexOf('if(view==="overview-purchases")');
  const reviews=route.indexOf("/* ------------------------------------------------------- review evidence */");
  const finance=route.indexOf("/* --------------------------------------------------------- this month's money */");
  assert.ok(core>-1&&reviews>-1&&finance>-1&&core<reviews&&core<finance,
    "Opportunity Engine core must return before reviews and finance");
});


test("each purchased product keeps a direction and source evidence behind concise presentation",()=>{
  const card=readFileSync("app/shop-map/purchase-priorities.tsx","utf8");
  assert.match(client,/productDirections/);
  assert.match(client,/view=overview-insights&days=\$\{selectedDays\}/);
  assert.match(card,/NEXT PRODUCT TEST/);
  assert.match(card,/oe-lead-art/);
  assert.match(card,/fetchPriority="high"/);
  assert.match(card,/oe-detail/);
  assert.match(card,/Catalog check:/);
  assert.match(card,/Why now:/);
  assert.match(card,/oe-top-grid/);
  assert.doesNotMatch(card,/units purchased across.*recorded transactions in the/);
});
test("ties crossing the compact cutoff remain reachable at equal rank",()=>{
  const card=readFileSync("app/shop-map/purchase-priorities.tsx","utf8");
  assert.match(card,/tiedBeyondCutoff/);
  assert.match(card,/visiblePriorities\.map\(card\)/);
  assert.match(card,/aria-expanded=\{showTies\}/);
  assert.match(card,/row\.rank/);
  assert.match(card,/oe-top-card/);
});
test("Winner DNA keeps its exact subset denominator and source listings in detail",()=>{
  const review=readFileSync("app/shop-map-evidence-review.tsx","utf8");
  assert.match(review,/Purchased units among/);
  assert.match(review,/leading analyzed selling artworks/);
  assert.match(review,/row\.listingIds/);
  assert.match(review,/See trait sources and scope/);
  assert.doesNotMatch(review,/% of winning response/);
});
test("a selected product without a direction has an honest local state",()=>{
  const card=readFileSync("app/shop-map/purchase-priorities.tsx","utf8");
  assert.match(card,/analysisFailed/);
  assert.match(card,/Review this purchased product before choosing a new test/);
  assert.match(card,/Product analysis could not load/);
  assert.match(card,/Checking product imagery/);
  assert.match(client,/analysisFailed=\{insightsFailed\}/);
});
test("Your Shop reuses same-day cached data without leaking data between tabs",()=>{
  assert.match(client,/SHOP_MAP_CACHE_PREFIX/);
  assert.match(client,/sessionStorage\.getItem/);
  assert.match(client,/sessionStorage\.setItem/);
  assert.match(client,/const shown = mapKey===currentKey \? map : null/);
  assert.match(shopPage,/cacheScope = activeShop \? `\$\{user\.userId\}:\$\{activeShop\}` : null/);
  assert.match(client,/const storageKey=cacheScope\?`\$\{cacheScope\}:\$\{cacheKey\}`:null/);
  assert.match(client,/const cached=readShopMapCache\(storageKey\)/);
  assert.match(client,/cached\.shop\?\.shopId===activeShopId/);
});


test("global suite styles do not override the Your Shop tab control",()=>{
  assert.doesNotMatch(commandWorkspace,/YOUR SHOP PRIMARY NAV · EDITORIAL TEXT RAIL/);
  assert.doesNotMatch(commandWorkspace,/factory-work \.shop-map-tabs/);
  assert.doesNotMatch(currentSuite,/factory-work[^\n{]*shop-map-tabs/);
});

test("Opportunity Engine cache version changes when ranking semantics change",()=>{
  assert.match(client,/SHOP_MAP_CACHE_PREFIX="goldie:shop-map:v13:"/);
});


test("mobile Your Shop tabs fill the width without horizontal scrolling",()=>{
  const final=css.slice(css.lastIndexOf("FINAL YOUR SHOP TABS"));
  assert.match(final,/@media\(max-width:650px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(final,/overflow:visible!important/);
  assert.match(final,/button\{[\s\S]*width:100%!important;[\s\S]*white-space:normal!important/);
});


test("each Your Shop tab renders only its own response shape",()=>{
  assert.match(client,/const \[mapKey,setMapKey\]=useState\(""/);
  assert.match(client,/const currentKey=viewKey\(\)/);
  assert.match(client,/const shown = mapKey===currentKey \? map : null/);
  assert.match(client,/setMap\(null\)/);
});

test("Sold Listings cannot crash on an undefined sold collection",()=>{
  assert.match(client,/const sold = shown\.soldListings\?\.listings \?\? \[\]/);
  assert.match(client,/No sold listings in this period/);
});

test("purchase-led Opportunity Engine invalidates older cached responses",()=>{
  assert.match(client,/SHOP_MAP_CACHE_PREFIX="goldie:shop-map:v13:"/);
});


test("Sold Listings returns before timezone and full performance setup",()=>{
  const sold=route.indexOf('if(view==="sold")');
  const timezone=route.indexOf('timezone = await shopTimezone');
  const performance=route.indexOf('const performance = performanceFrom');
  assert.ok(sold>-1&&timezone>-1&&performance>-1&&sold<timezone&&sold<performance);
});

test("mobile tab panels always have visible loading or empty content",()=>{
  assert.match(client,/panelLoading/);
  assert.match(client,/shop-map-inline-state/);
  assert.match(css,/shop-map-tab-panel[\s\S]*visibility:visible!important/);
});


test("Product Themes returns before reviews and monthly finance",()=>{
  const themes=route.indexOf('if(view==="themes")');
  const reviews=route.indexOf("/* ------------------------------------------------------- review evidence */");
  const finance=route.indexOf("/* --------------------------------------------------------- this month's money */");
  assert.ok(themes>-1&&reviews>-1&&finance>-1&&themes<reviews&&themes<finance);
});

test("non-money tabs use a finite year start without requiring a shop month",()=>{
  assert.match(route,/const yearStart=month&&\/\^\\d\{4\}-\\d\{2\}\$\//);
  assert.match(route,/Date\.UTC\(new Date\(now\*1000\)\.getUTCFullYear\(\),0,1\)/);
});


test("each Your Shop tab validates its response before rendering",()=>{
  assert.match(client,/function validShopMapForTab/);
  assert.match(client,/tab==="sold".*soldListings/s);
  assert.match(client,/tab==="themes".*Array\.isArray\(data\.worlds\)/s);
  assert.match(client,/tab==="overview".*data\.purchasePriorities/s);
  assert.match(client,/!validShopMapForTab\(next,tab\)/);
  assert.match(client,/next\.shop\.shopId!==activeShopId/);
});

test("Product Themes has a visible empty state",()=>{
  assert.match(client,/No product themes are available yet/);
});

test("non-money Your Shop tabs do not depend on timezone reads",()=>{
  const themes=route.indexOf('if(view==="themes")');
  const support=route.indexOf('if(view==="overview-support")');
  const lastTimezoneRead=route.lastIndexOf('timezone = await shopTimezone');
  assert.ok(themes>-1&&support>-1&&lastTimezoneRead>themes&&lastTimezoneRead>support,
    "Timezone work must happen after Product Themes and Opportunity Engine support return");
});

test("Opportunity Engine withholds priorities when artwork evidence misses customer signal",()=>{
  assert.match(route,/const completeVisualSignal=visual\.basis===shopBasis&&visual\.totalSignal===shopSignalTotal/);
  assert.match(route,/patterns:completeVisualSignal[\s\S]*\? visual\.patterns\.map/);
  assert.match(route,/attentionPercent:shopSignalTotal\?Math\.round/);
});

test("Opportunity Engine top listings follow the same fallback evidence ladder as priorities",()=>{
  assert.match(route,/shopBasis==="sales-90"\?\(sales90\.get\(listingId\)\?\.sales\?\?0\)/);
  assert.match(route,/shopBasis==="sales-lifetime"\?Math\.max\(0,Number\(performance\.get\(listingId\)\?\.lifetimeUnits\?\?0\)\)/);
  assert.match(route,/shopBasis==="favorites"\?Math\.max\(0,Number\(row\.favorites\?\?0\)\):0/);
  assert.match(route,/\.sort\(\(a,b\)=>b\.signal-a\.signal/);
});


test("a failed refresh keeps a valid cached tab visible",()=>{
  assert.match(client,/const hasCached=Boolean\(cached&&cached\.shop\?\.shopId===activeShopId&&validShopMapForTab\(cached,tab\)\)/);
  assert.match(client,/!validShopMapForTab\(next,tab\)/);
  assert.match(client,/if\(!hasCached\)setMap\(null\)/);
  assert.match(client,/setFailed\(true\)/);
});
