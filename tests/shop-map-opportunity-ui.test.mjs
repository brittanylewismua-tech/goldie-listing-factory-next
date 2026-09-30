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


test("My Shop turns the attention model into a concrete next-build allocation",()=>{
  assert.match(client,/YOUR NEXT BUILD CYCLE/);
  assert.match(client,/If you make \{plan\.requestedListings\} listings next/);
  assert.match(client,/shown\.nextBuild/);
  assert.match(client,/NextBuildAllocation/);
  assert.match(client,/recommendedListings/);
});
