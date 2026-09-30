import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client=readFileSync("app/shop-map/shop-map-client.tsx","utf8");

test("My Shop turns attention rankings into visible recommendations",()=>{
  assert.match(client,/WHAT TO DO NEXT/);
  assert.match(client,/Turn the ranking into action/);
  assert.match(client,/shown\.opportunities/);
  assert.match(client,/OpportunityRecommendations/);
});

test("MirrorBot handoffs carry the generated prompt instead of sending a blank research task",()=>{
  assert.match(client,/row\.mirrorBotPrompt/);
  assert.match(client,/navigator\.clipboard\.writeText\(row\.mirrorBotPrompt\)/);
  assert.match(client,/Go deeper with MirrorBot/);
  assert.match(client,/Open MirrorBot/);
});

test("overbuilt themes do not receive a MirrorBot research prompt in the opportunity model",()=>{
  const source=readFileSync("app/shop-map-opportunities.ts","utf8");
  assert.match(source,/state==="overbuilt"/);
  assert.match(source,/mirrorBotPrompt:null/);
});


test("My Shop turns the attention model into a priority order without prescribing listing counts",()=>{
  assert.match(client,/WHERE TO BUILD NEXT/);
  assert.match(client,/Your next design-and-list priorities start here/);
  assert.match(client,/shown\.nextBuild/);
  assert.match(client,/NextBuildAllocation/);
  assert.doesNotMatch(client,/If you make \{plan\.requestedListings\} listings next/);
  assert.doesNotMatch(client,/\{row\.recommendedListings\}/);
});


test("tracked market evidence appears only as supporting proof inside recommendations",()=>{
  assert.match(client,/MARKET RADAR SUPPORT/);
  assert.match(client,/shown\.marketCorroboration/);
  assert.match(client,/marketEvidence=\{shown\.marketCorroboration\?\?\[\]\}/);
  assert.match(client,/Open tracked keyword/);
  assert.match(client,/row\.state==="underbuilt"\?marketByWorld\.get/);
});


test("Opportunity Engine stays decision-first instead of repeating dashboard stats",()=>{
  assert.doesNotMatch(client,/LAST 90 DAYS[^\n]*Top sellers/);
  assert.doesNotMatch(client,/Revenue · 90 days/);
  assert.doesNotMatch(client,/WHERE TO FOCUS/);
  assert.match(client,/What is working, where your attention belongs, and what to build out next\./);
});


test("ranked priorities keep customer and catalog attention visually comparable",()=>{
  assert.match(client,/shop-map-attention-mini-compare/);
  assert.match(client,/>Customer<\/small>/);
  assert.match(client,/>Catalog<\/small>/);
  assert.match(client,/world\.catalogPercent/);
});
