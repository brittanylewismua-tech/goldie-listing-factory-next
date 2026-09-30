import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../app/shop-map-build-plan.ts";

const attention={
  basis:"sales-90",
  basisLabel:"units sold in the last 90 days",
  totalSignal:100,
  activeListingsTotal:50,
  unclassifiedSignal:0,
  unclassifiedAttentionShare:0,
  listings:[],
  worlds:[
    {rank:1,worldId:"dark",label:"Dark Romance",signal:40,attentionShare:.40,attentionPercent:40,activeListings:6,catalogShare:.12,catalogPercent:12,buildGap:.28,buildGapPoints:28,state:"underbuilt"},
    {rank:2,worldId:"bookish",label:"Bookish Humor",signal:27,attentionShare:.27,attentionPercent:27,activeListings:13,catalogShare:.26,catalogPercent:26,buildGap:.01,buildGapPoints:1,state:"aligned"},
    {rank:3,worldId:"western",label:"Western Readers",signal:18,attentionShare:.18,attentionPercent:18,activeListings:5,catalogShare:.10,catalogPercent:10,buildGap:.08,buildGapPoints:8,state:"underbuilt"},
    {rank:4,worldId:"teacher",label:"Teacher",signal:8,attentionShare:.08,attentionPercent:8,activeListings:15,catalogShare:.30,catalogPercent:30,buildGap:-.22,buildGapPoints:-22,state:"overbuilt"},
    {rank:5,worldId:"mom",label:"Mom Life",signal:7,attentionShare:.07,attentionPercent:7,activeListings:11,catalogShare:.22,catalogPercent:22,buildGap:-.15,buildGapPoints:-15,state:"overbuilt"},
  ],
};

test("next-build slots go to measurable catalog deficits, not overbuilt worlds",()=>{
  const plan=buildPlan(attention,10);
  assert.equal(plan.requestedListings,10);
  assert.equal(plan.allocatedListings,10);
  assert.equal(plan.heldBackListings,0);
  assert.ok(plan.rows.some(row=>row.worldId==="dark"));
  assert.ok(plan.rows.some(row=>row.worldId==="western"));
  assert.equal(plan.rows.some(row=>row.worldId==="teacher"),false);
  assert.equal(plan.rows.some(row=>row.worldId==="mom"),false);
});

test("the strongest underbuilt world keeps the largest allocation in the reference shop",()=>{
  const plan=buildPlan(attention,10);
  const dark=plan.rows.find(row=>row.worldId==="dark");
  const western=plan.rows.find(row=>row.worldId==="western");
  assert.ok(dark&&western);
  assert.ok(dark.recommendedListings>western.recommendedListings);
});

test("unclassified customer response holds back build slots instead of inventing a destination",()=>{
  const plan=buildPlan({...attention,unclassifiedSignal:20,unclassifiedAttentionShare:.2},10);
  assert.equal(plan.allocatedListings,8);
  assert.equal(plan.heldBackListings,2);
  assert.match(plan.note,/held back/);
});

test("no customer response produces no allocation",()=>{
  const plan=buildPlan({...attention,basis:"none",totalSignal:0},10);
  assert.equal(plan.allocatedListings,0);
  assert.equal(plan.heldBackListings,10);
});
