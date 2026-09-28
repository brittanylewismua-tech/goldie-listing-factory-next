import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home=readFileSync("app/home-preview/preview-client.tsx","utf8");
const api=readFileSync("app/api/home/route.ts","utf8");
const css=readFileSync("app/home-preview/preview.css","utf8");

test("Daily Updates ranks stories by strength instead of fixed category order",()=>{
  assert.match(home,/strength:top30\.sales\/Math\.max\(1,total30Units\)/);
  assert.match(home,/strength:moved\[0\]\.newly\/12/);
  assert.match(home,/strength:topHotProduct\.sold\/Math\.max\(1,hot\?\.totalSold\?\?0\)/);
  assert.match(home,/\.sort\(\(a,b\)=>\(b as DailyStory\)\.strength-\(a as DailyStory\)\.strength\)/);
});

test("Research lead visual comes from Research evidence when fresh",()=>{
  assert.match(api,/readNiche\(user\.userId,strongest\.terms,strongest\.key,now\)/);
  assert.match(api,/listing\.startedSince && listing\.displayFresh && listing\.imageUrl/);
  assert.match(home,/image:moved\[0\]\.imageUrl\|\|null/);
});

test("Research has an evidence graphic fallback instead of an unrelated image",()=>{
  assert.match(home,/graphic:num\(moved\[0\]\.newly\)/);
  assert.match(home,/graphicLabel:"newly selling listings"/);
  assert.match(home,/home4-daily-graphic/);
  assert.match(css,/\.home4-daily-graphic\{/);
});

test("strongest platform item stays the lead story",()=>{
  assert.match(home,/const leadPlatform=allPlatform\[0\]\?\?null/);
  assert.match(home,/const otherPlatform=leadPlatform\?allPlatform\.find\(item=>item\.platform!==leadPlatform\.platform\):null/);
});
