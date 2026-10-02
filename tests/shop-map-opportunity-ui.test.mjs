import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync("app/shop-map/shop-map-client.tsx","utf8");
const route=readFileSync("app/api/shop-map/map/route.ts","utf8");
const actions=readFileSync("app/shop-map-artwork-actions.tsx","utf8");
const review=readFileSync("app/shop-map-evidence-review.tsx","utf8");
const workspace=readFileSync("app/shop-map/opportunity-workspace.tsx","utf8");
const overview=client.slice(client.indexOf('{tab === "overview"'),client.indexOf('{tab === "themes"'));

test("Opportunity Engine keeps analysis, reviews and deeper actions in order",()=>{
  assert.match(overview,/WinningPatterns/);
  assert.match(overview,/ReviewThese/);
  assert.match(overview,/ArtworkRecommendations/);
  assert.ok(overview.indexOf("WinningPatterns")<overview.indexOf("ReviewThese"));
  assert.ok(overview.indexOf("ReviewThese")<overview.indexOf("ArtworkRecommendations"));
  assert.match(overview,/shown\.patterns\?\.patterns\?\.length/);
  assert.doesNotMatch(overview,/<AttentionEngine|<NextBuildAllocation|<OpportunityRecommendations/);
  assert.doesNotMatch(overview,/shown\.attention|shown\.nextBuild|shown\.opportunities/);
});

test("incomplete artwork evidence cannot generate action recommendations",()=>{
  assert.match(route,/const completeVisualSignal=/);
  assert.match(route,/patterns:completeVisualSignal/);
  assert.match(overview,/!!shown\.patterns\?\.patterns\?\.length&&<ArtworkRecommendations/);
  assert.match(actions,/purchasedPatternSupport\(map,purchasePriorities\)/);
  assert.doesNotMatch(overview,/shown\.attention|shown\.nextBuild|shown\.opportunities/);
});

test("Opportunity support returns before world classification and only supplies sales review actions",()=>{
  const support=route.indexOf('if(view==="overview-support")');
  const worlds=route.indexOf("/* --------------------------------------------------------------- worlds */");
  assert.ok(support>-1&&worlds>-1&&support<worlds);
  const supportBlock=route.slice(support,worlds);
  assert.match(supportBlock,/catalogActions\(rows,saleRows\.results\?\?\[\],now\)/);
  assert.doesNotMatch(supportBlock,/buildAttentionMap|buildPlan|watchesFor|readNiche|opportunitiesFromAttention/);
});

test("Opportunity Engine stays decision-first instead of repeating dashboard stats",()=>{
  assert.doesNotMatch(overview,/LAST 90 DAYS[^\n]*Top sellers/);
  assert.doesNotMatch(overview,/Revenue · 90 days/);
  assert.doesNotMatch(overview,/WHERE TO FOCUS/);
  assert.match(client,/tab==="overview"\?"Opportunity Engine":"My Shop"/);
  assert.match(overview,/OpportunityWorkspace/);
  assert.match(workspace,/Top listings in your shop/);
  assert.match(workspace,/Ideas and checks/);
  assert.doesNotMatch(workspace,/Product details need review before Goldie can suggest a specific build/);
  assert.doesNotMatch(workspace,/other purchased unit.*remain beyond/i);
});

test("ranked priorities keep customer and active-design attention visually comparable",()=>{
  assert.match(client,/className="oe-pattern"/);
  assert.match(client,/pattern.customerPercent\+"% of "\+map.basisLabel/);
  assert.match(client,/oe-pattern-metrics/);
  assert.match(client,/active analyzed designs/);
});

test("Opportunity Engine can discover winning patterns without assuming a customer world exists",()=>{
  assert.match(client,/WinningPatterns/);
  assert.match(client,/OpportunityWorkspace map=\{shown\.purchasePriorities\}/);
  assert.doesNotMatch(overview,/WHAT CUSTOMERS ARE VOTING FOR/);
  assert.doesNotMatch(overview,/Common shop-wide wording is discounted/);
  assert.doesNotMatch(overview,/It will not manufacture the rest of a top five/);
});

test("Opportunity Engine copy stays short",()=>{
  assert.doesNotMatch(overview,/This pattern appears in/);
  assert.doesNotMatch(overview,/It will not manufacture/);
  assert.match(workspace,/What customers are choosing/);
  assert.match(workspace,/Review these/);
  assert.match(workspace,/Go deeper/);
  assert.match(overview,/sourceAnalysis=\{shown\.patterns/);
  assert.match(workspace,/sourceAnalysis\?<details className=\{styles\.sourceDetails\} data-preview-source-details>/);
  assert.doesNotMatch(overview,/Explore source analysis/);
});

test("Opportunity Engine does not include the generic listing keyword checker",()=>{
  assert.doesNotMatch(overview,/ListingCheckPanel/);
  assert.doesNotMatch(overview,/Compare a listing with search results/);
  assert.match(review,/className="oe-review-card oe-expansion"/);
  assert.match(review,/oe-expansion-pair/);
  assert.match(review,/peerListingId/);
  assert.match(review,/oe-comparison-grid/);
  assert.match(review,/Compare related products/);
  assert.doesNotMatch(review,/Why compare these/);
});

test("top listings still render when visual priority evidence is incomplete",()=>{
  assert.match(client,/No shared pattern in the available analysis/);
  assert.match(client,/oe-source-gallery/);
  assert.match(overview,/selectedDays===90\?<WinningPatterns map=\{shown\.patterns\}/);
});

test("MirrorBot handoffs use artwork concepts and never SEO titles",()=>{
  assert.match(actions,/Purchased listing #/);
  assert.match(actions,/Do not infer artwork from SEO titles or tags/);
  assert.match(actions,/navigator\.clipboard\.writeText\(prompt\)/);
  assert.match(actions,/Open MirrorBot/);
  assert.match(actions,/Opening MirrorBot does not transfer this context/);
  assert.match(actions,/Copy failed/);
  assert.match(actions,/View full prompt/);
});

test("tracked market proof must match the artwork phrase exactly and remains optional",()=>{
  const market=route.slice(route.indexOf('if(view==="overview-market")'),route.indexOf("NO FALLBACK TIMEZONE"));
  assert.match(market,/normalize\(watch\.phrase\)===patternKey/);
  assert.match(market,/normalize\(term\)===patternKey/);
  assert.doesNotMatch(market,/listingTitles|watchMatchesWorld|buildAttentionMap/);
  assert.match(actions,/proofByKey\.get\(row\.key\)/);
  assert.match(market,/productFamily\(String\(listing\.title\|\|""\)\)/);
  assert.match(actions,/Observed product types/);
  assert.match(actions,/observed stock decreases/);
});

test("Review these uses shared artwork traits, portfolio imbalance and proven product peers",()=>{
  assert.match(review,/Winner DNA/);
  assert.match(review,/map\.overbuilt/);
  assert.match(review,/designsOnOneProduct/);
  assert.match(review,/pattern\.listingIds\.includes/);
  assert.match(review,/peer\?\.sold90\?\?market!/);
  assert.doesNotMatch(review,/missing prints|missing stickers|keyword stuffing/i);
});
