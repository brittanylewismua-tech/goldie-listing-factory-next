import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");

test("D1302: every Review destination resets the app scroller after rendering",()=>{
  assert.match(app,/function scrollReviewTaskToTop\(\)[\s\S]*?scrollFactoryToTop\(\);[\s\S]*?"\.review-listing-editor-nav"[\s\S]*?scrollIntoView\(\{block:"start"\}\)/);
  assert.match(app,/setActiveTask\(section==="artwork"[\s\S]*?goToStep\("designs",false,true\);[\s\S]*?window\.setTimeout\(scrollReviewTaskToTop,300\)/);
  assert.match(app,/else goToStep\("finish",false,true\);[\s\S]*?window\.setTimeout\(scrollReviewTaskToTop,300\)/);
  assert.doesNotMatch(app,/document\.querySelector\(selector\)\?\.scrollIntoView\(\{block:"start"\}\)/);
});

test("D1302: the all-listing description panel describes its actual scope",()=>{
  assert.match(app,/description="Set the shared description, then customize individual listings only if needed\."/);
  assert.doesNotMatch(app,/description="Set the shared description, then customize this listing only if needed\."/);
});

test("D1302: Review describes saved choices without Printify variant jargon",()=>{
  assert.match(review,/optionLabel=\["tee","hoodie","crewneck","tank","longSleeve"\]\.includes\(family\)\?"Colors & sizes":"Product options"/);
  assert.match(app,/const productOptionsLabel=\["tee","hoodie","crewneck","tank","longSleeve"\]\.includes\(reviewProductFamily\)\?"Colors & sizes":"Product options"/);
  assert.match(review,/detail:reviewOptionSummary\(optionLabel==="Colors & sizes",draft\.costReview\?\.variants\|\|\[\],draft\.selectedVariantIds\)/);
  assert.doesNotMatch(review,/variants===1\?"variant":"variants"/);
});

test("D1302: focused product headers use the selected listing's saved choices",()=>{
  assert.match(app,/const focusedReviewDraft=isActive&&reviewEditing\?productDrafts\.find\(draft=>draft\.id===reviewEditing\.id\):undefined/);
  assert.match(app,/const focusedReviewAxes=focusedReviewDraft\?draftVariantAxes\(focusedReviewDraft\):null/);
  assert.match(app,/const rowColors=focusedReviewAxes\?focusedReviewAxes\.colors:/);
  assert.match(app,/const rowSizes=focusedReviewAxes\?focusedReviewAxes\.sizes:/);
  assert.match(app,/const focusedArtworkValue=focusedReviewDraft\?`Listing \$\{Math\.max\(1,files\.findIndex/);
  assert.match(app,/label:"Artwork placement",value:focusedArtworkValue/);
});

test("D1302: artwork review names saved print sides without a long warning",()=>{
  assert.match(app,/const printSides=Object\.keys\(draft\.artworkSummary\|\|\{\}\)\.map\(printSideLabel\)/);
  assert.match(app,/`\$\{printSides\.join\(" \+ "\)\} artwork`/);
  assert.match(app,/Printify may ask you to sign in and choose the matching shop before editing\./);
  assert.doesNotMatch(app,/Otherwise, Printify may show an error when you open a draft\./);
});
