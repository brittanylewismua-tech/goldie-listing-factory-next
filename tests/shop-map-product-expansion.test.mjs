import test from "node:test";
import assert from "node:assert/strict";
import {buildPurchasePriorities} from "../app/shop-map-purchase-priorities.ts";
import {buildProductDirections} from "../app/shop-map-product-expansion.ts";

const now=1_780_000_000;
const listing=(listingId,title,state="active")=>({listingId,title,state,imageUrl:""});
const sales=(listingId,quantity)=>({listingId,quantity,priceMinor:2000,currency:"USD",soldAt:now-86400,refunded:false});
const purchase=(id=1)=>buildPurchasePriorities([sales(id,12)],[listing(id,"SEO title")],{
  days:90,now,receiptsComplete:true,
});
const tee={listingId:1,productFamily:"tee",state:"active",artworkHash:"a1",
  design:{wording:["My body my choice"],illustrationCategory:"text"},
  verifiedCompatibleFormats:["sweatshirt"]};
const sweater={listingId:2,productFamily:"sweatshirt",state:"active",artworkHash:"a2",
  design:{wording:["Different visible message"],illustrationCategory:"text"}};

test("a purchased winner gets an exact-artwork format test only in an established compatible format",()=>{
  const [row]=buildProductDirections(purchase(),[tee,sweater]);
  assert.equal(row.kind,"test");
  assert.match(row.retainedCharacteristic,/My body my choice/);
  assert.match(row.proposedChange,/exact artwork on a sweatshirt/);
  assert.match(row.catalogCoverage,/No exact-artwork sweatshirt was found/);
  assert.match(row.whyNow,/12 purchased units across 1 recorded transaction/);
  assert.doesNotMatch(JSON.stringify(row),/SEO title/);
});

test("an existing active exact-artwork format is surfaced instead of a duplicate",()=>{
  const [row]=buildProductDirections(purchase(),[tee,{...sweater,artworkHash:"a1"}]);
  assert.equal(row.kind,"already-offered");
  assert.equal(row.proposedChange,null);
  assert.equal(row.relatedListingId,2);
});

test("partial catalog identities and unconfirmed production make the format idea check-first",()=>{
  const [unconfirmed]=buildProductDirections(purchase(),[{...tee,verifiedCompatibleFormats:[]},sweater]);
  assert.equal(unconfirmed.kind,"check-first");
  assert.match(unconfirmed.researchQuestion,/confirm the target production method/);
  const [partial]=buildProductDirections(purchase(),[tee,sweater,{
    listingId:9,productFamily:"tee",state:"active",artworkHash:null,design:null,
  }]);
  assert.equal(partial.kind,"check-first");
  assert.match(partial.catalogCoverage,/1 active listing has no linked artwork identity/);
});

test("every tied leader beyond the compact cutoff receives a direction or review state",()=>{
  const map=buildPurchasePriorities([sales(1,5),sales(2,5),sales(3,5),sales(4,5)],
    [1,2,3,4].map(id=>listing(id,`Winner ${id}`)),{days:90,now,receiptsComplete:true});
  const analyzed=[1,2,3,4].map(id=>({...tee,listingId:id,artworkHash:`art-${id}`}));
  assert.deepEqual(buildProductDirections(map,[...analyzed,{...sweater,listingId:9}]).map(row=>row.listingId),[1,2,3,4]);
});

test("a tie for third keeps equal access while directions include weaker purchased products",()=>{
  const map=buildPurchasePriorities([sales(1,10),sales(2,8),sales(3,5),sales(4,5),sales(5,1)],
    [1,2,3,4,5].map(id=>listing(id,`Winner ${id}`)),{days:90,now,receiptsComplete:true});
  const analyzed=[1,2,3,4,5].map(id=>({...tee,listingId:id,artworkHash:`art-${id}`}));
  assert.deepEqual(buildProductDirections(map,[...analyzed,{...sweater,listingId:9}]).map(row=>row.listingId),[1,2,3,4,5]);
});

test("missing imagery and unsupported format do not produce invented suggestions",()=>{
  const [missing]=buildProductDirections(purchase(),[{...tee,design:null},sweater]);
  assert.equal(missing.kind,"research");
  assert.equal(missing.proposedChange,null);
  const [unsupported]=buildProductDirections(purchase(),[tee]);
  assert.equal(unsupported.kind,"research");
  assert.equal(unsupported.proposedChange,null);
});

test("inactive purchased products prompt availability review before expansion",()=>{
  const [row]=buildProductDirections(purchase(),[{...tee,state:"sold_out"},sweater]);
  assert.equal(row.kind,"availability-review");
  assert.equal(row.proposedChange,null);
  assert.match(row.researchQuestion,/replenished/);
});

test("the selected purchase period remains in the reason while artwork cannot rerank winners",()=>{
  const map=buildPurchasePriorities([sales(3,8),sales(1,4)],
    [listing(1,"First"),listing(3,"Winner")],{days:30,now,receiptsComplete:true});
  const rows=buildProductDirections(map,[tee,sweater,{...tee,listingId:3,artworkHash:"a3"}]);
  assert.equal(rows[0].listingId,3);
  assert.match(rows[0].whyNow,/last 30 days/);
});

test("a sixth purchased product can produce a checked format direction",()=>{
  const counts=[32,24,19,15,11,8];
  const map=buildPurchasePriorities(counts.map((count,index)=>sales(index+1,count)),
    counts.map((_,index)=>listing(index+1,"Product "+(index+1))),
    {days:90,now,receiptsComplete:true});
  const analyzed=counts.map((_,index)=>({
    ...tee,listingId:index+1,artworkHash:"art-"+(index+1),
  }));
  const directions=buildProductDirections(map,[...analyzed,{...sweater,listingId:20}]);
  assert.equal(directions.length,6);
  assert.equal(directions[5].listingId,6);
  assert.equal(directions[5].kind,"test");
  assert.match(directions[5].whyNow,/8 purchased units/);
});
