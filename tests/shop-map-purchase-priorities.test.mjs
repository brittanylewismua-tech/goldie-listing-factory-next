import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchasePriorities } from "../app/shop-map-purchase-priorities.ts";

const now=1_780_000_000;
const listings=[
  {listingId:1,title:"Winner",imageUrl:"/winner.png",state:"active"},
  {listingId:2,title:"Runner",imageUrl:"",state:"sold_out"},
  {listingId:3,title:"Third",imageUrl:"",state:"inactive"},
  {listingId:4,title:"Long tail",imageUrl:"",state:"active"},
];
const sale=(listingId,quantity,daysAgo=8,extra={})=>({
  listingId,quantity,priceMinor:2500,currency:"USD",soldAt:now-daysAgo*86400,refunded:false,...extra,
});
const build=(sales,days=90)=>buildPurchasePriorities(sales,listings,{
  days,now,receiptsComplete:true,refreshedAt:now-3600,
});

test("purchase units set priority and denominator, including historical and unshown listings",()=>{
  const map=build([sale(1,60),sale(2,25),sale(3,10),sale(4,5)]);
  assert.deepEqual(map.priorities.map(row=>row.listingId),[1,2,3]);
  assert.deepEqual(map.priorities.map(row=>row.unitsPurchased),[60,25,10]);
  assert.equal(map.totalUnits,100);
  assert.equal(map.priorities[0].share,.6);
  assert.equal(map.remainingUnits,5);
  assert.equal(map.priorities[1].state,"sold_out");
});

test("bulk quantities count as units while order count stays separate",()=>{
  const map=build([sale(1,5),sale(2,2)]);
  assert.equal(map.priorities[0].unitsPurchased,5);
  assert.equal(map.priorities[0].orders,1);
  assert.equal(map.totalOrders,2);
});

test("equal unit votes keep equal rank and latest purchase only stabilizes display",()=>{
  const map=build([sale(1,5,4),sale(2,5,2),sale(3,1)]);
  assert.deepEqual(map.priorities.map(row=>[row.listingId,row.rank]),[[2,1],[1,1],[3,3]]);
  assert.equal(map.priorities[0].share,map.priorities[1].share);
});

test("30 and 90 day windows use purchase dates without a lifetime fallback",()=>{
  const sales=[sale(1,5,70),sale(2,2,6)];
  assert.deepEqual(build(sales,30).priorities.map(row=>row.listingId),[2]);
  assert.deepEqual(build(sales,90).priorities.map(row=>row.listingId),[1,2]);
  assert.equal(build([sale(1,5,120)],30).totalUnits,0);
});

test("missing listing metadata keeps a purchased winner in the ranking",()=>{
  const map=build([sale(99,6),sale(1,2)]);
  assert.equal(map.priorities[0].listingId,99);
  assert.equal(map.priorities[0].title,"Listing details unavailable");
  assert.equal(map.priorities[0].state,"unknown");
});

test("receipt-level refund uncertainty and incomplete import change the share claim",()=>{
  const map=buildPurchasePriorities([sale(1,6),sale(2,3,8,{refunded:true})],listings,{
    days:90,now,receiptsComplete:false,
  });
  assert.equal(map.totalUnits,6);
  assert.equal(map.excludedRefundUnits,3);
  assert.equal(map.shareLabel,"Share of matched purchases");
  assert.equal(map.refreshedAt,null);
});
