import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home=readFileSync("app/home-preview/preview-client.tsx","utf8");
const shop=readFileSync("app/shop-map/shop-map-client.tsx","utf8");
const research=readFileSync("app/market-watch/research/research-client.tsx","utf8");
const hot=readFileSync("app/hot-list/page.tsx","utf8");
const watch=readFileSync("app/market-watch/market-watch-client.tsx","utf8");

test("redesigned suite surfaces use literal member-facing copy",()=>{
  assert.ok(home.includes("Goldie Suite"));
  assert.ok(home.includes("Certainty, direction, opportunities."));
  assert.ok(home.includes("Build and publish at scale."));
  assert.ok(shop.includes("Turn the ranking into action"));
  assert.ok(research.includes("See all buyer findings →"));
  assert.ok(hot.includes("Loading sales and stock changes…"));
  assert.ok(hot.includes("RESULTS IN THIS PERIOD FOR"));
  assert.ok(watch.includes("Review themes"));
  assert.ok(watch.includes("Sale-linked changes observed on"));
});

test("known vague phrases stay out of member-facing redesigned copy",()=>{
  const combined=[home,shop,research,hot,watch].join("\n");
  assert.doesNotMatch(combined,/moved again|showing momentum|gaining sales activity|Buyer signals|Loading shop insights/i);
});
