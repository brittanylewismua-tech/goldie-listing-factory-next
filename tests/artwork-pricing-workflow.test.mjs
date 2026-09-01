import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {assignFrontColor,frontAssignmentFor} from "../app/artwork-assignment.ts";
import {actualCostReview,pricesFromActualCosts} from "../app/draft-pricing.ts";

test("every garment color resolves to one front artwork, including primary",()=>{
  const start=[
    {id:"light",side:"front",colorIds:[1,2]},
    {id:"dark",side:"front",colorIds:[3]},
    {id:"back",side:"back",colorIds:[1,2,3]},
  ];
  const moved=assignFrontColor(start,2,"dark");
  assert.deepEqual(moved.find(item=>item.id==="light").colorIds,[1]);
  assert.deepEqual(moved.find(item=>item.id==="dark").colorIds,[3,2]);
  assert.deepEqual(moved.find(item=>item.id==="back").colorIds,[1,2,3],"front choices cannot alter the back print");
  assert.equal(frontAssignmentFor(moved,2),"dark");
  assert.equal(frontAssignmentFor(assignFrontColor(moved,2,"primary"),2),"primary");
});

test("twenty designs with long artwork names keep independent assignments",()=>{
  const designs=Array.from({length:20},(_,index)=>({
    id:`design-${index}`,
    versions:[{id:`alternate-${index}-${"x".repeat(90)}`,side:"front",colorIds:[]},{id:`back-${index}`,side:"back",colorIds:[1]}],
  }));
  const assigned=designs.map((design,index)=>({...design,versions:assignFrontColor(design.versions,index%8+1,design.versions[0].id)}));
  assert.equal(assigned.length,20);
  assert.equal(new Set(assigned.flatMap(design=>design.versions.filter(version=>version.side==="front").flatMap(version=>version.colorIds))).size,8);
  assert.ok(assigned.every(design=>design.versions.find(version=>version.side==="back").colorIds[0]===1));
});

test("pricing uses the finished draft costs and refuses incomplete cost data",()=>{
  const review=actualCostReview([
    {id:1,cost:1250,price:2200,isEnabled:true},
    {id:2,cost:1650,price:2600,isEnabled:true},
    {id:3,cost:0,price:0,isEnabled:false},
  ]);
  assert.equal(review.required,true);
  assert.equal(review.verified,true);
  assert.equal(review.approved,false);
  const prices=pricesFromActualCosts(review,{targetProfit:10,etsyFeePercent:9.5,fixedFee:.25,listingFee:.2});
  assert.ok(prices["1"]>=1250&&prices["2"]>=1650);
  const missing=actualCostReview([{id:1,cost:Number.NaN,price:2200,isEnabled:true}]);
  assert.equal(missing.verified,false);
  assert.throws(()=>pricesFromActualCosts(missing,{targetProfit:10}));
});

test("draft creation, resume, final review, and publishing share the same safeguards",async()=>{
  const [app,create,update,review]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(create,/resolvedProduct\.variants/);
  assert.match(create,/actualCostReview\(costVariants\)/);
  assert.match(update,/price<cost/);
  assert.match(update,/approved:true/);
  assert.match(app,/costReviewDrafts\(\)\.filter\(draft=>!draft\.costReview\?\.approved\)/);
  assert.match(app,/Approve final prices for/);
  assert.match(app,/function costReviewGroups\(\)/);
  assert.match(app,/approveActualPricingGroup\(group/);
  assert.match(app,/bundleProductsStillReading\(\)\.length.*reading the finished costs/s);
  assert.match(app,/pricingForDraft\(draft\)/);
  assert.match(app,/setBundleMembers\(current=>Object\.fromEntries/);
  assert.match(app,/const productName=draft\.productName\|\|member\?\.productName/);
  assert.match(app,/artworkVersions:artworkVersions\?\.map/);
  assert.match(review,/Artwork and print locations/);
  assert.match(review,/Front · \{item\.name\}/);
  assert.match(review,/Back · \{item\.name\}/);
});
