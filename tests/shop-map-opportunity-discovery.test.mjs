import test from "node:test";
import assert from "node:assert/strict";
import {buildPurchasePriorities} from "../app/shop-map-purchase-priorities.ts";
import {discoverShopFindings} from "../app/shop-map-opportunity-discovery.ts";

const now=1_780_000_000;
const row=(listingId,title,overrides={})=>({
  listingId,title,imageUrl:"",productFamily:"tee",state:"active",
  artworkHash:null,createdAt:now-120*86400,views:100,...overrides,
});
const sale=(listingId,quantity,daysAgo)=>({
  listingId,quantity,soldAt:now-daysAgo*86400,refunded:false,
});
const priority=(sales,listings,days=90)=>buildPurchasePriorities(
  sales.map(x=>({...x,priceMinor:2000,currency:"USD"})),
  listings.map(x=>({listingId:x.listingId,title:x.title,imageUrl:x.imageUrl,state:x.state})),
  {days,now,receiptsComplete:true},
);

test("an existing exact-artwork version produces a comparison, never another format build",()=>{
  const listings=[row(1,"Winning tee",{artworkHash:"same"}),
    row(2,"Existing sweatshirt",{productFamily:"sweatshirt",artworkHash:"same"})];
  const sales=[sale(1,12,10)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  assert.equal(result[0].kind,"compare");
  assert.deepEqual(result[0].listingIds,[1,2]);
  assert.match(result[0].evidence,/12 purchased on tee; 0 on the existing sweatshirt/);
  assert.match(result[0].direction,/existing version before creating another/);
});

test("an outside-top-three product with a real rise remains discoverable",()=>{
  const listings=[1,2,3,4,5,6].map(id=>row(id,"Product "+id));
  const sales=[sale(1,20,10),sale(2,15,10),sale(3,10,10),
    sale(4,8,45),sale(5,7,45),sale(6,5,10),sale(6,1,45)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  const emerging=result.find(x=>x.id==="emerging-6");
  assert.ok(emerging);
  assert.equal(emerging.evidence,"5 purchased in the last 30 days; 1 in the prior 30.");
});

test("a leading 30-day product keeps its dated rise alongside purchase rank",()=>{
  const listings=[row(1,"Recent winner"),row(2,"Prior winner")];
  const sales=[sale(1,8,10),sale(2,4,45)];
  const result=discoverShopFindings(priority(sales,listings,30),listings,sales,now);
  const emerging=result.find(x=>x.id==="emerging-1");
  assert.ok(emerging);
  assert.equal(emerging.kind,"emerging");
  assert.equal(emerging.evidence,"8 purchased in the last 30 days; 0 in the prior 30.");
});

test("an inactive purchased product remains a recovery finding",()=>{
  const listings=[row(1,"Historical winner",{state:"sold_out"})];
  const sales=[sale(1,4,10)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  assert.equal(result[0].kind,"restore");
  assert.match(result[0].direction,/restored/);
});

test("unlinked artwork and thin sales do not manufacture a format gap or weak area",()=>{
  const listings=[row(1,"One"),row(2,"Two",{productFamily:"sweatshirt"})];
  const sales=[sale(1,1,10)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  assert.deepEqual(result,[]);
});

test("a cooling product outside the leading set stays visible without diagnosing demand",()=>{
  const listings=[1,2,3,4].map(id=>row(id,"Product "+id));
  const sales=[sale(1,12,10),sale(2,9,10),sale(3,6,10),sale(4,4,45),sale(4,1,10)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  const cooling=result.find(x=>x.id==="cooling-4");
  assert.ok(cooling);
  assert.equal(cooling.kind,"cooling");
  assert.match(cooling.evidence,/1 purchased in the last 30 days; 4 in the prior 30/);
  assert.match(cooling.detail,/Purchase change alone cannot identify the cause/);
});

test("thin changes do not become cooling diagnoses",()=>{
  const listings=[row(1,"Product")],sales=[sale(1,2,45)];
  const result=discoverShopFindings(priority(sales,listings),listings,sales,now);
  assert.equal(result.some(x=>x.kind==="cooling"),false);
});
