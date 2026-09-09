import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const theme=readFileSync(new URL("../app/lilac-theme.css",import.meta.url),"utf8");
const interfaceCss=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1251: Review reports readiness from saved listing data",()=>{
  assert.match(review,/etsyReady=Boolean\(design\?\.etsy\?\.category\?\.trim\(\)\)/);
  assert.match(review,/descriptionReady=Boolean\(String\(design\?\.descriptionOverride\?\?draft\.description/);
  assert.match(review,/variants=Number\(draft\.selectedVariantIds\?\.length\|\|draft\.costReview\?\.variants\.filter/);
  assert.match(review,/section\.ready\?"✓":""/);
  assert.match(review,/pricingAndShippingReady\?\.\(draft\)/);
});

test("D1251: all Review rows route directly into the matching editor",()=>{
  for(const pair of [["artwork","Artwork placement"],["variants","Colors & sizes"],["pricing","Pricing & shipping"],["photos","Listing photos"]]){
    assert.ok(review.includes(`label:"${pair[1]}"`));
    assert.ok(review.includes(`onEditProduct?.("${pair[0]}",draft)`));
  }
  for(const pair of [["title","Title & tags"],["description","Description"],["etsy","Etsy details & personalization"]]){
    assert.ok(review.includes(`label:"${pair[1]}"`));
    assert.ok(review.includes(`onEdit("${pair[0]}",draft)`));
  }
});

test("D1251: the listing editor keeps every section and Review return visible",()=>{
  for(const label of ["Artwork placement","Colors & sizes","Pricing & shipping","Listing photos","Title & tags","Description","Etsy details"]){
    assert.ok(app.includes(`label:"${label}"`));
  }
  assert.match(app,/className="review-listing-editor-nav"/);
  assert.match(app,/>Back to Review<\/button>/);
  assert.match(app,/\.factory-listing-form \.design-fields/);
  assert.match(app,/\.individual-description-disclosure/);
  assert.match(app,/\.factory-etsy-details-column/);
  assert.match(app,/visibleListings=reviewEditing\?listings\.filter/);
  assert.match(app,/position:reviewEditing\?\{index:listings\.findIndex/);
  assert.match(readFileSync(new URL("..\/app\/listing-rows.tsx",import.meta.url),"utf8"),/position=row\.position\|\|\{index:index\+1,total:rows\.length\}/);
});

test("D1251: the completion map and sticky editor navigation remain usable on narrow screens",()=>{
  assert.match(theme,/\.recipe-listing-sections>button:focus-visible/);
  assert.match(theme,/@media\(max-width:560px\)[\s\S]*?\.recipe-listing-sections>button/);
  assert.match(interfaceCss,/\.review-listing-editor-nav\{position:sticky/);
  assert.match(interfaceCss,/@media\(max-width:620px\)[\s\S]*?\.review-listing-editor-nav nav/);
});

test("D1252: Review color and size edits target the selected listing",()=>{
  assert.match(app,/function syncDraftVariantChoices\(nextColors:number\[\],nextSizes:number\[\],targetDraft\?:DraftResult\)/);
  assert.match(app,/const created=targetDraft\?\.id\?\[targetDraft\]:drafts\.filter/);
  assert.match(app,/shown=focused\?\[focused\]:drafts\.filter/);
  assert.match(app,/onChange=\{\(draft,ids\)=>void syncDraftVariantChoices\(ids,draftVariantAxes\(draft\)\.sizes,draft\)\}/);
  assert.match(app,/onChange=\{ids=>void syncDraftVariantChoices\(axes\.colors,ids,focused\)\}/);
  assert.doesNotMatch(app,/A choice applies to every design draft/);
});
