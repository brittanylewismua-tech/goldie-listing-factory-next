import test from "node:test";
import assert from "node:assert/strict";
import {reviewOptionSummary} from "../app/review-option-summary.ts";

test("apparel Review summarizes the color and size choices sellers made",()=>{
  const variants=["White / S","White / M","Black / S","Black / M"].map((title,index)=>({id:index+1,title,isEnabled:true}));
  assert.equal(reviewOptionSummary(true,variants),"2 colors × 2 sizes");
  assert.equal(reviewOptionSummary(true,[{id:1,title:"White / S",isEnabled:true}]),"1 color × 1 size");
});

test("non-apparel and irregular option matrices stay plain and accurate",()=>{
  assert.equal(reviewOptionSummary(false,[{id:1,title:"11oz",isEnabled:true}]),"1 product option selected");
  assert.equal(reviewOptionSummary(false,[{id:1,title:"iPhone 17",isEnabled:true},{id:2,title:"Pixel",isEnabled:true}]),"2 product options selected");
  assert.equal(reviewOptionSummary(false,[]),"Choose product options");
});

test("a saved selected-id list controls the reported count",()=>{
  const variants=[{id:1,title:"White / S",isEnabled:true},{id:2,title:"White / M",isEnabled:true}];
  assert.equal(reviewOptionSummary(true,variants,[2]),"1 color × 1 size");
});
