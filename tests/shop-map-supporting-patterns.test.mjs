import test from "node:test";
import assert from "node:assert/strict";
import {purchasedPatternSupport} from "../app/shop-map-supporting-patterns.ts";

const pattern=(key,listingIds)=>({
  rank:1,key,label:key,customerPercent:20,catalogPercent:10,gapPoints:10,
  lift:2,sellingListings:1,catalogListings:1,listingIds,
});
const map={basis:"sales-90",basisLabel:"units sold in the last 90 days",totalSignal:15,
  patterns:[pattern("smaller",[2]),pattern("unlinked",[99]),pattern("winner",[1])],
  listings:[]};
const purchase={days:90,listings:[
  {listingId:1,rank:1,unitsPurchased:10,orders:2,share:2/3,title:"Winner"},
  {listingId:2,rank:2,unitsPurchased:5,orders:1,share:1/3,title:"Runner"},
]};

test("supporting patterns follow strongest linked purchased products, not catalog-gap order",()=>{
  const rows=purchasedPatternSupport(map,purchase);
  assert.deepEqual(rows.map(row=>row.pattern.key),["winner","smaller","unlinked"]);
  assert.deepEqual(rows.map(row=>row.source?.listingId??null),[1,2,null]);
});

test("a pattern supported by several products takes the strongest purchased source",()=>{
  const rows=purchasedPatternSupport({...map,patterns:[pattern("shared",[2,1])]},purchase);
  assert.equal(rows[0].source?.listingId,1);
});

test("patterns without selected-period purchases remain background observations",()=>{
  const rows=purchasedPatternSupport(map,{days:30,listings:[]});
  assert.equal(rows.every(row=>row.source===null),true);
  assert.deepEqual(rows.map(row=>row.pattern.key),["smaller","unlinked","winner"]);
});
