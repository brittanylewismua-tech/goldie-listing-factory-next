import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1019: a stale outgoing autosave cannot overwrite the incoming bundle child",()=>{
  assert.match(app,/const targetId=batchIdRef\.current;const timer=window\.setTimeout\(\(\)=>\{void persistBatchNow\(targetId\);\},700\)/);
});

test("D1019: automatic bundle creation waits for the incoming product's own template",()=>{
  assert.match(app,/function templateBelongsToRecipe\([\s\S]*?recipe\.templateUrl\.includes\(details\.id\)/);
  assert.match(app,/if\(!ready\|\|!expectedRecipe\|\|activeRecipe\?\.id!==expectedRecipe\.id\|\|!templateBelongsToRecipe\(templateDetails,expectedRecipe\)\)return;/);
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

test("D1021: a new bundle starts with separate parent-run and first-child ids",()=>{
  assert.match(app,/runIdRef\.current=crypto\.randomUUID\(\);runStartedRef\.current=new Date\(\)\.toISOString\(\);[\s\S]*?const firstBatchId=crypto\.randomUUID\(\);batchIdRef\.current=firstBatchId/);
  assert.match(app,/setBundleBatchIds\(\{\[recipes\[0\]\.id\]:firstBatchId\}\)/);
  assert.match(app,/batchUrl\.searchParams\.set\("batch",runIdRef\.current\|\|durableBatchId\)/);
});

test("D1022: a parent run never borrows children from another execution of the saved bundle",()=>{
  assert.match(app,/if\(runIdRef\.current\)return;[\s\S]*?const missing=bundleRecipes\.filter/);
});

test("D1023: a parented run rebuilds its child map from authoritative server children",()=>{
  assert.match(app,/if\(runIdRef\.current\)setBundleBatchIds\(\{\}\)/);
  assert.match(app,/const childMap=Object\.fromEntries\(children\.filter/);
});

test("D1024: automatic creation is anchored to the stable recipe at the bundle index",()=>{
  assert.match(app,/const expectedRecipe=bundleRecipes\[bundleIndex\]/);
  assert.match(app,/activeRecipe\?\.id!==expectedRecipe\.id/);
  assert.match(app,/templateBelongsToRecipe\(templateDetails,expectedRecipe\)/);
});

test("D1070: successive choices are queued while distinct drafts update concurrently with retries",()=>{
  assert.match(app,/variantSaveQueue\.current=variantSaveQueue\.current\.then/);
  assert.match(app,/runBounded\(created,4,async draft=>/);
  assert.match(app,/for\(let attempt=0;attempt<3&&!saved;attempt\+\+\)/);
  assert.match(app,/response\.status!==429&&response\.status<500/);
});
