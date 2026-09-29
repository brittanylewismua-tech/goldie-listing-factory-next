import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route=readFileSync("app/api/shop-map/map/route.ts","utf8");
const home=readFileSync("app/home-preview/preview-client.tsx","utf8");

test("Home asks Shop Map for the lightweight connected-shop identity",()=>{
  assert.match(home,/\/api\/shop-map\/map\?home=1&days=30/);
  assert.match(home,/data\?\.shop\?\.shopName/);
});

test("Home scorecard returns before Shop Map worlds and finance work",()=>{
  const fast=route.indexOf('if(parameters.get("home")==="1")');
  const worlds=route.indexOf("/* --------------------------------------------------------------- worlds */");
  assert.ok(fast>-1&&worlds>-1&&fast<worlds,"the Home fast path must return before world-building starts");
  assert.match(route.slice(fast,worlds),/return NextResponse\.json/);
  assert.match(route.slice(fast,worlds),/shopTotals/);
  assert.match(route.slice(fast,worlds),/soldListings/);
});
