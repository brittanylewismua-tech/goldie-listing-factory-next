import test from "node:test";
import assert from "node:assert/strict";
import {splitVariations,variationVotes,repeatBuyers,boughtTogether,giftOrders,buyerPlaces,lastYearWindow,gainingFavorites} from "../app/shop-map/votes-signals-model.ts";
import {countPhrases,parsePhrases} from "../app/shop-map/buyer-words-model.ts";

const sale=(transactionId,receiptId,listingId,variations,soldAt=100,quantity=1)=>({transactionId,receiptId,listingId,quantity,variations,soldAt});
const order=(receiptId,buyerKey,extra={})=>({receiptId,buyerKey,country:"US",region:"CA",isGift:false,giftMessage:false,createdAt:100,...extra});

test("a combined option is split into size and color, each counted once per unit",()=>{
  assert.deepEqual(splitVariations([{name:"Size / Color",value:"L / Black"}]),[{name:"Size",value:"L"},{name:"Color",value:"Black"}]);
  const votes=variationVotes([sale(1,1,9,[{name:"Primary color",value:"Black"},{name:"Size",value:"M"}],100,2),
    sale(2,2,9,[{name:"Primary color",value:"White"},{name:"Size",value:"M"}])],0);
  assert.equal(votes.units,3);
  assert.deepEqual(votes.options.find(o=>o.name==="Color").values,[{value:"Black",units:2},{value:"White",units:1}]);
  /* One value only is not a choice, so Size is not shown. */
  assert.equal(votes.options.find(o=>o.name==="Size"),undefined);
});

test("repeat buyers are counted from buyer codes, and second orders show what they bought",()=>{
  const orders=[order(1,"a",{createdAt:1}),order(2,"a",{createdAt:2}),order(3,"b"),order(4,null)];
  const result=repeatBuyers(orders,[sale(1,1,10,[]),sale(2,2,11,[])]);
  assert.deepEqual([result.buyers,result.repeatBuyers,result.repeatOrders],[2,1,1]);
  assert.deepEqual(result.secondPicks,[{listingId:11,units:1}]);
});

test("bought together pairs come from multi-item orders",()=>{
  const r=boughtTogether([sale(1,1,10,[]),sale(2,1,11,[]),sale(3,2,10,[]),sale(4,3,10,[]),sale(5,3,11,[])],0);
  assert.equal(r.multiItemOrders,2);
  assert.deepEqual(r.pairs,[{a:10,b:11,orders:2}]);
});

test("gift orders and places are exact counts over the period",()=>{
  const orders=[order(1,"a",{isGift:true,giftMessage:true}),order(2,"b",{region:"TX"}),order(3,"c",{country:"GB",region:null,createdAt:1})];
  assert.deepEqual(giftOrders(orders,50),{orders:2,gifts:1,withMessage:1});
  const places=buyerPlaces(orders,0);
  assert.deepEqual(places.places.map(p=>p.label).sort(),["California","Texas","United Kingdom"]);
  assert.equal(places.abroad,1);
});

test("last year at this time reads the same 30 days a year back",()=>{
  const now=400*86400;
  const r=lastYearWindow([{listingId:1,quantity:2,soldAt:now-360*86400},{listingId:2,quantity:1,soldAt:now-300*86400}],now);
  assert.equal(r.units,2);
  assert.deepEqual(r.listings,[{listingId:1,units:2}]);
});

test("gaining favorites waits for a week of snapshots",()=>{
  const early=gainingFavorites([{listingId:1,day:"2026-10-01",favorites:10}],[{listingId:1,favorites:15}],"2026-10-03");
  assert.equal(early.ready,false);
  const ready=gainingFavorites([{listingId:1,day:"2026-09-25",favorites:10},{listingId:2,day:"2026-09-25",favorites:5}],
    [{listingId:1,favorites:15},{listingId:2,favorites:5}],"2026-10-03");
  assert.equal(ready.ready,true);
  assert.deepEqual(ready.listings,[{listingId:1,gained:5,favorites:15}]);
});

test("buyer phrases are counted against the reviews, never taken from the model",()=>{
  const phrases=parsePhrases('{"phrases":["For my daughter","love it","wore it to the march"]}');
  assert.deepEqual(phrases,["for my daughter","wore it to the march"]);
  const counted=countPhrases(phrases,["Bought for my daughter!","For my daughter's birthday","I wore it to the march."]);
  assert.deepEqual(counted,[{phrase:"for my daughter",reviews:2}]);
});
