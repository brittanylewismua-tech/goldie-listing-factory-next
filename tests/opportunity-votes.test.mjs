import test from "node:test";
import assert from "node:assert/strict";
import {buildTopTen} from "../app/shop-map/opportunity-engine-model.ts";
import {listingBadge,listingWhy,saveRate,winningFormula,productsChosen,savedNotBought,buyerSignals,whenLine,backLine,wearLine} from "../app/shop-map/opportunity-votes-model.ts";

const sale=(listingId,units)=>({listingId,title:`Sold ${listingId}`,imageUrl:null,state:"active",unitsPurchased:units,productRevenueMinor:units*2200,share:units/10,lastPurchasedAt:1});
const listing=(listingId,favorites,extra={})=>({listingId,title:`Listing ${listingId}`,state:"active",family:"tee",favorites,views:1000,imageUrl:null,...extra});
const review=(listingId,text,rating=5,createdAt=1)=>({listingId,rating,review:text,createdAt});

/* Votes reports; it does not recommend. Every line below is a count. */
test("a listing whose year of sales all came in the period is labelled Rising and says so",()=>{
  const top=buildTopTen([sale(1,3),sale(2,1)],[listing(1,50,{views:297}),listing(2,10)],[{listingId:1,sales:3},{listingId:2,sales:1}]);
  assert.deepEqual(listingBadge(top[0],top,[]),{label:"Rising",tone:"green"});
  assert.equal(listingWhy(top[0],top,[],90),"All 3 of its sales this year came in the last 90 days, from only 297 views.");
});

test("save rate is favorites per view and is unknown, not zero, without views",()=>{
  assert.equal(saveRate({favorites:50,views:200}),0.25);
  assert.equal(saveRate({favorites:50,views:null}),null);
});

test("the formula counts only read designs and compares the period with the year",()=>{
  const reads=new Map([[1,{listingId:1,name:"A",wording:"",credit:"Cher",lettering:"typewriter",art:"none",textLed:true,garment:"white",ink:[]}],
    [2,{listingId:2,name:"B",wording:"",credit:null,lettering:"sans",art:"floral",textLed:false,garment:"black",ink:[]}]]);
  const {cards,units}=winningFormula([{listingId:1,sales:6},{listingId:2,sales:4},{listingId:3,sales:10}],[{listingId:2,unitsPurchased:3},{listingId:1,unitsPurchased:1}],reads,[listing(1,1),listing(2,1)]);
  assert.equal(units,10);
  const credit=cards.find(card=>card.key==="credit");
  assert.equal(credit.share,0.6);
  assert.equal(credit.recent,0.25);
  assert.equal(credit.trend,"down");
  assert.equal(cards.find(card=>card.key.startsWith("garment:")).label,"Printed on a white tee");
});

test("products and saved-not-bought come from the catalog and twelve months of sales",()=>{
  const catalog=[listing(1,10),listing(2,4000,{family:"hoodie"}),listing(3,90)];
  const {rows,total}=productsChosen(catalog,[{listingId:1,sales:5}]);
  assert.equal(total,5);
  assert.deepEqual(rows.map(row=>[row.label,row.sold,row.listed]),[["Tees",5,2],["Hoodies",0,1]]);
  assert.deepEqual(savedNotBought(catalog,[{listingId:1,sales:5}],new Set()).map(row=>row.listingId),[2]);
});

test("buyer signals are counts, and the gift line never claims most orders are gifts",()=>{
  const reviews=[review(1,"Bought it for my daughter's birthday, perfect gift"),review(1,"I wore this to work and got compliments"),
    review(2,"Love it, will order again!",5,5),review(2,"Great shirt for my college aged sister"),...Array.from({length:6},(_,i)=>review(3,`Nice ${i}`))];
  const signals=buyerSignals(reviews);
  assert.equal(signals.count,10);
  assert.equal(signals.when.gift,1);
  assert.equal(signals.when.birthday,1);
  assert.equal(whenLine(signals),"1 of 10 reviews mention a gift. A birthday is the occasion named most.");
  assert.equal(signals.back.n,1);
  assert.equal(backLine(signals),"That’s about 1 in every 10 reviewers.");
  assert.equal(signals.wear.work,1);
  assert.equal(signals.wear.campus,1);
  assert.equal(wearLine(signals,"tees"),"Your tees get worn to work and to campus.");
  assert.deepEqual(signals.whoFor.map(row=>row.label).sort(),["Daughters","Sisters"]);
});
