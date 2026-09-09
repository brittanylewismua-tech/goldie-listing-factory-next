import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const footer=readFileSync(new URL("../app/factory-footer.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/lilac-theme.css",import.meta.url),"utf8");

test("D1246: Review names the exact missing item without tool jargon",()=>{
  assert.doesNotMatch(app,/Needs you/);
  assert.doesNotMatch(review,/Needs you/);
  for(const issue of ["No title yet.","No Etsy tags yet.","Finished cost needs price approval.","No listing photo selected."]){
    assert.ok(review.includes(issue));
  }
  assert.match(review,/\{issue\|\|"✓ Ready"\}/);
});

test("D1246: Etsy details remain automatic without a manual preparation control",()=>{
  assert.match(app,/Preparing Etsy details automatically…/);
  assert.doesNotMatch(app,/className="secondary-action prepare-etsy"/);
  assert.doesNotMatch(app,/>Prepare Etsy details</);
  assert.match(footer,/children\?: ReactNode/);
  assert.match(footer,/children == null \? null : forward/);
});

test("D1251: every reviewed listing exposes all seven edit destinations",()=>{
  for(const label of ["Artwork placement","Colors & sizes","Pricing & shipping","Listing photos","Title & tags","Description","Etsy details & personalization"]){
    assert.ok(review.includes(label));
  }
  for(const stage of ["artwork","variants","pricing","photos"])assert.ok(review.includes(`onEditProduct?.("${stage}",draft)`));
  for(const phase of ["title","description","etsy"])assert.ok(review.includes(`onEdit("${phase}",draft)`));
  for(const route of [
    'target.phase==="mockups"||target.phase==="photos"',
    'target.phase==="pricing"',
    'target.phase==="variants"',
    'target.phase==="artwork"',
  ])assert.ok(app.includes(route));
  assert.match(app,/onEditProduct=\{editReviewedProduct\}/);
  assert.doesNotMatch(app,/function finalProductOverview\(/);
  assert.match(css,/\.recipe-listing-sections/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.recipe-listing-sections>button/);
});

test("D1251: settings are attached to the listing instead of a detached product strip",()=>{
  assert.doesNotMatch(review,/Product settings/);
  assert.match(review,/aria-label=\{`Edit listing/);
  assert.doesNotMatch(review,/Change product/);
});

test("D1248: provider refreshes cannot erase the saved product identity",()=>{
  const preservation=/productName:payload\.draft!\.productName\|\|item\.productName/g;
  assert.equal([...app.matchAll(preservation)].length,4);
  assert.match(app,/productName:update\.productName\|\|draft\.productName/);
  assert.match(app,/refreshImages:true[\s\S]*?setBundleMembers/);
});

test("D1249: an older blank provider name cannot split one product into fake groups",()=>{
  assert.match(review,/const key=productName\|\|draft\.productName\|\|"Saved product"/);
  assert.match(app,/productName=\{activeBundle&&bundleRecipes\.length>1\?"":activeRecipe\?\.name\|\|templateDetails\?\.blueprintTitle\|\|""\}/);
});
