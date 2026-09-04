import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/goldie-ui.tsx",import.meta.url),"utf8");

test("D918: a published child cannot declare an unfinished bundle complete",()=>{
  assert.match(app,/function nextUnfinishedBundleProduct\(\)/);
  assert.match(app,/nextBundleProduct=\{nextUnfinishedBundleProduct\(\)\?\.name\}/);
  assert.match(ui,/bundleInProgress\?\"PRODUCT COMPLETE\":\"BATCH COMPLETE\"/);
  assert.match(ui,/still needs to be completed before the bundle is finished/);
});

test("D918: the receipt can return to an unfinished product in either direction",()=>{
  assert.match(app,/openBundleProduct\(bundleRecipes\.findIndex\(recipe=>recipe\.id===pending\.id\)\)/);
  assert.doesNotMatch(app,/nextBundleProduct=\{bundleRecipes\[bundleIndex\+1\]\?\.name\}/);
  assert.match(app,/void continueBundle\(index\)/);
  assert.match(app,/async function continueBundle\(targetIndex=bundleIndex\+1\)/);
  assert.match(app,/setBundleIndex\(targetIndex\)/);
});

test("D919: photo ordering never invents a batch size guide",()=>{
  assert.match(app,/batchName=\{sizeGuideName\}/);
  assert.match(app,/guide\?\"Selected\":\"No size guide selected\"/);
  assert.match(app,/guide\?\"Use a different size guide\":\"Choose a size guide\"/);
  assert.doesNotMatch(app,/name\|\|\"Using the batch size guide\"/);
});
