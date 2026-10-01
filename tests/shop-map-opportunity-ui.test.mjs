import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync("app/shop-map/shop-map-client.tsx","utf8");
const route=readFileSync("app/api/shop-map/map/route.ts","utf8");
const actions=readFileSync("app/shop-map-artwork-actions.tsx","utf8");
const overview=client.slice(client.indexOf('{tab === "overview"'),client.indexOf('{tab === "themes"'));

test("Opportunity Engine restores action sections from artwork patterns",()=>{
  assert.match(overview,/WinningPatterns/);
  assert.match(overview,/ArtworkNextBuild/);
  assert.match(overview,/ArtworkRecommendations/);
  assert.match(overview,/shown\.patterns\?\.patterns\?\.length/);
  assert.doesNotMatch(overview,/<AttentionEngine|<NextBuildAllocation|<OpportunityRecommendations/);
  assert.doesNotMatch(overview,/shown\.attention|shown\.nextBuild|shown\.opportunities/);
});

test("incomplete artwork evidence cannot generate action recommendations",()=>{
  assert.match(route,/const completeVisualSignal=/);
  assert.match(route,/patterns:completeVisualSignal/);
  assert.match(overview,/!!shown\.patterns\?\.patterns\?\.length&&<ArtworkRecommendations/);
  assert.match(actions,/map\.patterns\.slice\(0,4\)/);
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
  assert.match(client,/What is working, where your attention belongs, and what to build out next\./);
});

test("ranked priorities keep customer and active-design attention visually comparable",()=>{
  assert.match(client,/shop-map-attention-mini-compare/);
  assert.match(client,/>Customer<\/small>/);
  assert.match(client,/>Catalog<\/small>/);
  assert.match(client,/Active designs/);
});

test("Opportunity Engine can discover winning patterns without assuming a customer world exists",()=>{
  assert.match(client,/WinningPatterns/);
  assert.match(client,/Let&apos;s build out on what&apos;s already working\.\.\. here&apos;s the analysis today\.\.\./);
  assert.doesNotMatch(overview,/WHAT CUSTOMERS ARE VOTING FOR/);
  assert.doesNotMatch(overview,/Common shop-wide wording is discounted/);
  assert.doesNotMatch(overview,/It will not manufacture the rest of a top five/);
});

test("Opportunity Engine copy stays short",()=>{
  assert.doesNotMatch(overview,/This pattern appears in/);
  assert.doesNotMatch(overview,/It will not manufacture/);
  assert.match(client,/Focus here next/);
  assert.match(client,/Your top listings/);
});

test("Opportunity Engine does not include the generic listing keyword checker",()=>{
  assert.doesNotMatch(overview,/ListingCheckPanel/);
  assert.doesNotMatch(overview,/Compare a listing with search results/);
  assert.match(client,/Proven designs to expand/);
});

test("top listings still render when visual priority evidence is incomplete",()=>{
  assert.match(client,/if\(!lead&&map\.listings\.length\)/);
  assert.match(client,/shop-map-attention-listings-only/);
  assert.match(overview,/shown\.patterns\?<WinningPatterns map=\{shown\.patterns\}/);
});

test("MirrorBot handoffs use artwork concepts and never SEO titles",()=>{
  assert.match(actions,/actual artwork concept|proven artwork concept/);
  assert.match(actions,/Do not infer the artwork from SEO titles or tags/);
  assert.match(actions,/navigator\.clipboard\.writeText\(prompt\)/);
  assert.match(actions,/Open MirrorBot/);
  assert.match(actions,/PAUSE EXPANSION/);
});

test("tracked market proof must match the artwork phrase exactly and remains optional",()=>{
  const market=route.slice(route.indexOf('if(view==="overview-market")'),route.indexOf("NO FALLBACK TIMEZONE"));
  assert.match(market,/normalize\(watch\.phrase\)===patternKey/);
  assert.match(market,/normalize\(term\)===patternKey/);
  assert.doesNotMatch(market,/listingTitles|watchMatchesWorld|buildAttentionMap/);
  assert.match(actions,/proofByKey\.get\(row\.key\)/);
  assert.match(market,/productFamily\(String\(listing\.title\|\|""\)\)/);
  assert.match(actions,/Observed product types/);
});
