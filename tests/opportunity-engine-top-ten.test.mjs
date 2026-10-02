import test from "node:test";
import assert from "node:assert/strict";
import {buildTopTen,readListing,shopMoves,familyStats} from "../app/shop-map/opportunity-engine-model.ts";

const sale=(listingId,units,extra={})=>({listingId,title:`Sold ${listingId}`,imageUrl:null,state:"active",
  unitsPurchased:units,productRevenueMinor:units*2200,share:0,lastPurchasedAt:1,...extra});
const listing=(listingId,favorites,extra={})=>({listingId,title:`Listing ${listingId}`,state:"active",family:"tee",
  favorites,views:1000,imageUrl:null,...extra});

/* The engine follows customer votes: purchases rank first, in the order the
   purchase ranking already returns. Favorites only fill empty places. */
test("sold listings rank first and favorites fill the remaining places",()=>{
  const catalog=[listing(1,10),listing(2,5),listing(3,900),listing(4,50),listing(5,700,{state:"inactive"})];
  const top=buildTopTen([sale(2,3),sale(1,1)],catalog,[]);
  assert.deepEqual(top.map(row=>[row.listingId,row.basis]),[[2,"sales"],[1,"sales"],[3,"favorites"],[4,"favorites"]]);
  assert.deepEqual(top.map(row=>row.rank),[1,2,3,4]);
});

test("a favorites rank never shows period sales and inactive listings never fill a place",()=>{
  const top=buildTopTen([],[listing(9,700,{state:"expired"}),listing(8,3)],[{listingId:8,sales:2}]);
  assert.equal(top.length,1);
  assert.equal(top[0].unitsPeriod,0);
  assert.equal(top[0].unitsYear,2);
});

test("no more than ten listings, even when more sold",()=>{
  const period=Array.from({length:14},(_,i)=>sale(i+1,20-i));
  assert.equal(buildTopTen(period,[],[]).length,10);
});

test("a listing whose year of sales came in the period reads as picking up",()=>{
  const [row]=buildTopTen([sale(1,3)],[listing(1,50,{views:297})],[{listingId:1,sales:3}]);
  const read=readListing(row,{days:90,reviews:[],directions:[],families:[],totalYearUnits:17,month:10});
  assert.match(read.headline,/^Picking up: 3 of its 3 sales/);
  assert.equal(read.moves[0].kind,"expose");
  assert.ok(read.missing.some(line=>/No reviews yet/.test(line)));
});

test("an expansion into a product type that does not sell becomes a hold",()=>{
  const catalog=[listing(1,50),...Array.from({length:6},(_,i)=>listing(10+i,1,{family:"hoodie"}))];
  const year=[{listingId:1,sales:40},{listingId:10,sales:1}];
  const [row]=buildTopTen([sale(1,5)],catalog,year);
  const read=readListing(row,{days:90,reviews:[],families:familyStats(catalog,year),totalYearUnits:41,month:3,
    directions:[{listingId:1,kind:"test",targetFormat:"hoodie",whyNow:"x",catalogCoverage:"y"}]});
  assert.ok(read.moves.some(move=>move.kind==="check"&&/hoodies/.test(move.title)));
  assert.ok(!read.moves.some(move=>move.kind==="expand"));
});

test("shop moves only appear with evidence",()=>{
  assert.deepEqual(shopMoves([listing(1,20)],[],[],new Set()),[]);
  const moves=shopMoves([listing(1,4000),listing(2,1)],[{listingId:2,sales:1}],[],new Set());
  assert.equal(moves[0].id,"wanted");
  assert.match(moves[0].evidence[0],/4,000 favorites, 0 sold in 12 months/);
});

import {parseDesignRead,styleBreakdown,buildNextMoves} from "../app/shop-map/opportunity-engine-model.ts";

/* A half-read design must never be shown as measured. */
test("design reads are accepted only when complete",()=>{
  assert.equal(parseDesignRead(1,'{"name":"Rich Man","lettering":"typewriter","art":"none"}'),null);
  const read=parseDesignRead(1,'```json\n{"name":"Mom, I Am A Rich Man","wording":"Mom, I am a rich man","credit":"Cher","lettering":"typewriter","art":"floral","textLed":true,"garment":"white","ink":["red"]}\n```');
  assert.equal(read.credit,"Cher");
  assert.equal(parseDesignRead(2,'{"name":"X","credit":"null","lettering":"sans","art":"none","textLed":false}').credit,null);
});

test("style breakdown counts only read designs and keeps the denominator honest",()=>{
  const reads=new Map([[1,{listingId:1,name:"A",wording:"",credit:"Cher",lettering:"typewriter",art:"none",textLed:true,garment:"white",ink:[]}]]);
  const style=styleBreakdown([{listingId:1,sales:14},{listingId:2,sales:6}],reads);
  assert.equal(style.analysedUnits,14);
  assert.equal(style.totalUnits,20);
  assert.equal(style.traits.find(row=>row.key==="credit").units,14);
});

test("make more appears only when two or more read designs share the winning trait",()=>{
  const read=(id,credit)=>({listingId:id,name:`D${id}`,wording:"",credit,lettering:"typewriter",art:"none",textLed:true,garment:"white",ink:[]});
  const year=[{listingId:1,sales:14},{listingId:2,sales:7},{listingId:3,sales:3}];
  const catalog=[1,2,3].map(id=>listing(id,100));
  const base={top:[],catalog,year,reviews:[],days:90,month:3};
  const one=buildNextMoves({...base,reads:new Map([[1,read(1,"Cher")],[3,read(3,null)]])});
  assert.ok(!one.some(move=>move.id==="make"&&/named person/.test(move.title)));
  const two=buildNextMoves({...base,reads:new Map([[1,read(1,"Cher")],[2,read(2,"De La Vega")],[3,read(3,null)]])});
  assert.ok(two.some(move=>move.id==="make"&&/named person/.test(move.title)));
});
