import test from "node:test";
import assert from "node:assert/strict";
import { buildAttentionMap } from "../app/shop-map-attention.ts";

const worlds=[
  {worldId:"dark",label:"Dark Romance",activeListings:9},
  {worldId:"bookish",label:"Bookish Humor",activeListings:18},
  {worldId:"teacher",label:"Teacher",activeListings:23},
];

test("recent sales own the attention bucket when they exist",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:100,sales90:30,lifetimeSales:60,worldId:"dark"},
    {listingId:2,title:"B",state:"active",favorites:500,sales90:20,lifetimeSales:90,worldId:"bookish"},
    {listingId:3,title:"C",state:"active",favorites:1000,sales90:0,lifetimeSales:100,worldId:"teacher"},
  ],worlds);
  assert.equal(map.basis,"sales-90");
  assert.equal(map.listings[0].listingId,1);
  assert.equal(map.listings[0].attentionPercent,60);
  assert.equal(map.listings[1].attentionPercent,40);
  assert.equal(map.listings.some(row=>row.listingId===3),false);
});

test("lifetime sales take over only when the recent sales window is empty",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:900,sales90:0,lifetimeSales:4,worldId:"dark"},
    {listingId:2,title:"B",state:"active",favorites:5,sales90:0,lifetimeSales:6,worldId:"bookish"},
  ],worlds);
  assert.equal(map.basis,"sales-lifetime");
  assert.equal(map.listings[0].listingId,2);
  assert.equal(map.listings[0].attentionPercent,60);
});

test("favorites are the fallback for a shop with no recorded sales",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:12,sales90:0,lifetimeSales:0,worldId:"dark"},
    {listingId:2,title:"B",state:"active",favorites:8,sales90:0,lifetimeSales:0,worldId:"bookish"},
  ],worlds);
  assert.equal(map.basis,"favorites");
  assert.equal(map.listings[0].attentionPercent,60);
  assert.match(map.basisLabel,/no recorded sales/);
});

test("world build gap compares customer attention with catalogue attention",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:0,sales90:40,lifetimeSales:40,worldId:"dark"},
    {listingId:2,title:"B",state:"active",favorites:0,sales90:20,lifetimeSales:20,worldId:"bookish"},
    {listingId:3,title:"C",state:"active",favorites:0,sales90:5,lifetimeSales:5,worldId:"teacher"},
  ],worlds);
  const dark=map.worlds.find(row=>row.worldId==="dark");
  const teacher=map.worlds.find(row=>row.worldId==="teacher");
  assert.ok(dark);
  assert.equal(dark.state,"underbuilt");
  assert.ok(dark.buildGapPoints>0);
  assert.ok(teacher);
  assert.equal(teacher.state,"overbuilt");
  assert.ok(teacher.buildGapPoints<0);
});

test("no response produces an honest empty attention map",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:0,sales90:0,lifetimeSales:0,worldId:"dark"},
  ],worlds);
  assert.equal(map.basis,"none");
  assert.equal(map.totalSignal,0);
  assert.deepEqual(map.listings,[]);
});


test("catalog share uses the whole active shop, including unclassified listings",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:0,sales90:10,lifetimeSales:10,worldId:"dark"},
  ],[{worldId:"dark",label:"Dark Romance",activeListings:5}],{activeListingsTotal:10});
  const dark=map.worlds[0];
  assert.equal(dark.catalogPercent,50);
  assert.equal(dark.attentionPercent,100);
  assert.equal(dark.buildGapPoints,50);
});


test("unclassified customer attention is not silently reassigned to a named world",()=>{
  const map=buildAttentionMap([
    {listingId:1,title:"A",state:"active",favorites:0,sales90:6,lifetimeSales:6,worldId:"dark"},
    {listingId:2,title:"B",state:"active",favorites:0,sales90:4,lifetimeSales:4,worldId:null},
  ],[{worldId:"dark",label:"Dark Romance",activeListings:5}],{activeListingsTotal:10});
  assert.equal(map.worlds[0].attentionPercent,60);
  assert.equal(map.worlds[0].attentionPercent,60);
});
