import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync("app/visual-review/shop-map/page.tsx","utf8");
const client=readFileSync("app/visual-review/shop-map/visual-review-client.tsx","utf8");

test("Your Shop visual review mounts the real client",()=>{
  assert.match(page,/VisualReviewClient/);
  assert.match(client,/ShopMapClient/);
});

test("Your Shop visual review exercises distinct responses for all four tabs",()=>{
  for(const view of ["overview-insights","overview-support","money","themes","sold"])
    assert.ok(client.includes(`view==="${view}"`),`missing mock for ${view}`);
  assert.match(client,/patterns:\{basis:"sales-90"[\s\S]*patterns:\[\],listings:topListings/);
  assert.match(client,/soldListings:/);
  assert.match(client,/worlds:/);
  assert.match(client,/thisMonth:/);
});
