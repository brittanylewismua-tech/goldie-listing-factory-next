import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page=readFileSync("app/market-watch/market-watch-client.tsx","utf8");
test("tracked cards use member-facing metric labels",()=>{
  for(const label of ["Selling listings","Repeat-selling listings","Shops represented","Listings to review","Recent changes","Review themes"])
    assert.ok(page.includes(label),label+" is missing");
  assert.doesNotMatch(page,/>Activity items<|>Repeated activity<|>Listings with activity</);
});
