import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1019: a stale outgoing autosave cannot overwrite the incoming bundle child",()=>{
  assert.match(app,/const targetId=batchIdRef\.current;const timer=window\.setTimeout\(\(\)=>\{void persistBatchNow\(targetId\);\},700\)/);
});

test("D1019: automatic bundle creation waits for the incoming product's own template",()=>{
  assert.match(app,/function templateBelongsToRecipe\([\s\S]*?recipe\.templateUrl\.includes\(details\.id\)/);
  assert.match(app,/if\(!ready\|\|!templateBelongsToRecipe\(templateDetails,activeRecipe\)\)return;/);
});

test("D1019: unresolved resolution warnings disable and explain the create action",()=>{
  assert.match(app,/bundleQualityGroups\.length\?`Review \$\{bundleQualityGroups\.length\} resolution/);
  assert.match(app,/disabled=\{!ready \|\| bundleQualityGroups\.length>0 \|\| running/);
  assert.match(app,/bundleQualityGroups\.length\?"Review resolution warnings above"/);
});

test("D1019: non-apparel calls its primary artwork Main, not Front",()=>{
  assert.match(app,/uploadItemNoun==="garment"&&uploadPrimarySide[\s\S]*?\/wrap\|around\/i\.test\(uploadPrimarySide\)\?"Wrap":"Main"/);
  assert.match(app,/\{itemNoun==="garment"&&primarySide\?`Main design · \$\{printSideLabel\(primarySide\)\}`:primarySide&&\/wrap\|around\/i\.test\(primarySide\)\?"Main design · Wrap":"Main design"\}/);
});

test("D1020: each draft request derives variants and identity from its protected product session",()=>{
  assert.match(app,/const requestDetails=templateDetails;/);
  assert.match(app,/bundleRecipes\.find\(recipe=>recipe\.templateUrl\.includes\(requestDetails\.id\)\)/);
  assert.match(app,/const requestPricedVariants=variantsFor\(requestDetails,requestColors,requestSizes\)/);
  assert.match(app,/selectedVariantIds:requestPricedVariants\.map\(variant=>variant\.id\)/);
  assert.match(app,/productName:requestRecipe\?\.name\|\|requestDetails\?\.blueprintTitle/);
});
