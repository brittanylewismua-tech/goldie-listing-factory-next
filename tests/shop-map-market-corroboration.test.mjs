import test from "node:test";
import assert from "node:assert/strict";
import { corroborateAttentionWithMarket } from "../app/shop-map-market-corroboration.ts";

const attention={
  basis:"sales-90",basisLabel:"units sold in the last 90 days",totalSignal:100,
  activeListingsTotal:30,unclassifiedSignal:0,unclassifiedAttentionShare:0,
  listings:[
    {rank:1,listingId:1,title:"Dark Romance Reader Sweatshirt",signal:40,attentionShare:.4,attentionPercent:40,worldId:"dark"},
    {rank:2,listingId:2,title:"Western Reader Cowboy Book Tee",signal:25,attentionShare:.25,attentionPercent:25,worldId:"western"},
  ],
  worlds:[
    {rank:1,worldId:"dark",label:"Dark Romance",signal:40,attentionShare:.4,attentionPercent:40,activeListings:5,catalogShare:.16,catalogPercent:16,buildGap:.24,buildGapPoints:24,state:"underbuilt"},
    {rank:2,worldId:"western",label:"Western Readers",signal:25,attentionShare:.25,attentionPercent:25,activeListings:4,catalogShare:.13,catalogPercent:13,buildGap:.12,buildGapPoints:12,state:"underbuilt"},
  ],
};

test("a clearly matching tracked keyword can corroborate a shop opportunity",()=>{
  const evidence=corroborateAttentionWithMarket(attention,[{
    key:"dark+romance",phrase:"dark romance shirt",terms:["dark","romance","shirt"],
    summary:{moving:8,repeated:3,shops:6},
    listings:[
      {listingId:101,title:"Dark Romance Mug Book Lover Cup",sold30:7,sold7:2},
      {listingId:102,title:"Dark Romance Reader Tee",sold30:4,sold7:1},
      {listingId:103,title:"Dark Romance Sweatshirt",sold30:0,sold7:0},
    ],
  }],new Map([["dark",["crewneck"]]]));
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].worldId,"dark");
  assert.equal(evidence[0].phrase,"dark romance shirt");
  assert.equal(evidence[0].sellingListings,2);
  assert.equal(evidence[0].observedSold30,11);
  assert.ok(evidence[0].missingProductFamilies.some(row=>row.family==="mug"));
  assert.ok(evidence[0].missingProductFamilies.some(row=>row.family==="tee"));
});

test("an unrelated tracked keyword is not attached to an opportunity",()=>{
  const evidence=corroborateAttentionWithMarket(attention,[{
    key:"teacher",phrase:"teacher appreciation gift",terms:["teacher","appreciation","gift"],
    summary:{moving:20,repeated:8,shops:12},
    listings:[{listingId:201,title:"Teacher Mug",sold30:20}],
  }],new Map());
  assert.deepEqual(evidence,[]);
});

test("one generic-looking partial word is not enough to force a market match",()=>{
  const evidence=corroborateAttentionWithMarket(attention,[{
    key:"romance",phrase:"romance mug",terms:["romance","mug"],
    summary:{moving:9,repeated:4,shops:7},
    listings:[{listingId:301,title:"Romance Mug",sold30:9}],
  }],new Map());
  assert.deepEqual(evidence,[]);
});

test("market product families already present in the shop are not called missing",()=>{
  const evidence=corroborateAttentionWithMarket(attention,[{
    key:"dark+romance",phrase:"dark romance sweatshirt",terms:["dark","romance","sweatshirt"],
    summary:{moving:5,repeated:2,shops:4},
    listings:[{listingId:401,title:"Dark Romance Sweatshirt",sold30:6}],
  }],new Map([["dark",["crewneck"]]]));
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].missingProductFamilies.length,0);
});
