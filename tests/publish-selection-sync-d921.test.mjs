import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const review=fs.readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const factory=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D921: final review reports its initial selection directly to the publish owner",()=>{
  assert.match(review,/onSelectionChange\?\:\(ids:string\[\]\)=>void/);
  assert.match(review,/onSelectionChange\?\.\(selectedIds\)/);
  assert.match(factory,/onSelectionChange=\{setSelectedPublishIds\}/);
});

test("D921: selection intent is reported directly instead of relying on event timing",()=>{
  assert.match(review,/onSelectionTouched\?\.\(\)/);
  assert.match(factory,/onSelectionTouched=\{\(\)=>\{sellerChosePublish\.current=true\}\}/);
});

test("D931: the retired paid publish press is not rendered",()=>{
  assert.match(factory,/\{false&&<>\s*<div className="publish-live-warning"/);
  assert.match(factory,/Open My Products in Printify/);
});
