import test from "node:test";
import assert from "node:assert/strict";
import { opportunitiesFromAttention } from "../app/shop-map-opportunities.ts";

const base={
  basis:"sales-90",
  basisLabel:"units sold in the last 90 days",
  totalSignal:100,
  listings:[],
  worlds:[
    {rank:1,worldId:"dark",label:"Dark Romance",signal:40,attentionShare:.40,attentionPercent:40,activeListings:6,catalogShare:.12,catalogPercent:12,buildGap:.28,buildGapPoints:28,state:"underbuilt"},
    {rank:2,worldId:"bookish",label:"Bookish Humor",signal:27,attentionShare:.27,attentionPercent:27,activeListings:13,catalogShare:.26,catalogPercent:26,buildGap:.01,buildGapPoints:1,state:"aligned"},
    {rank:3,worldId:"teacher",label:"Teacher",signal:8,attentionShare:.08,attentionPercent:8,activeListings:15,catalogShare:.30,catalogPercent:30,buildGap:-.22,buildGapPoints:-22,state:"overbuilt"},
  ],
};

test("underbuilt winners become build-deeper opportunities with a MirrorBot handoff",()=>{
  const rows=opportunitiesFromAttention(base);
  const dark=rows[0];
  assert.equal(dark.state,"underbuilt");
  assert.match(dark.action,/Build deeper/);
  assert.match(dark.explanation,/40%/);
  assert.match(dark.explanation,/12%/);
  assert.match(dark.mirrorBotPrompt,/Dark Romance/);
  assert.match(dark.mirrorBotPrompt,/40%/);
});

test("overbuilt themes are explicitly paused instead of receiving more research work",()=>{
  const teacher=opportunitiesFromAttention(base).find(row=>row.worldId==="teacher");
  assert.ok(teacher);
  assert.equal(teacher.state,"overbuilt");
  assert.match(teacher.action,/pause expansion/i);
  assert.equal(teacher.mirrorBotPrompt,null);
});

test("favorites are named honestly when a pre-sale shop uses favorites as its signal",()=>{
  const rows=opportunitiesFromAttention({...base,basis:"favorites"});
  assert.match(rows[0].explanation,/favorites/);
  assert.match(rows[0].mirrorBotPrompt,/favorites/);
});


test("Market Radar context is carried into the MirrorBot handoff",()=>{
  const market=[{
    worldId:"dark",keywordKey:"dark+romance",phrase:"dark romance shirt",
    moving:9,repeated:4,shops:7,sellingListings:8,observedSold30:23,
    productFamilies:[],missingProductFamilies:[],listingIds:[101,102],
  }];
  const dark=opportunitiesFromAttention(base,market)[0];
  assert.match(dark.mirrorBotPrompt,/Market Radar/);
  assert.match(dark.mirrorBotPrompt,/dark romance shirt/);
  assert.match(dark.mirrorBotPrompt,/8 listings/);
  assert.match(dark.mirrorBotPrompt,/23 observed units/);
});
