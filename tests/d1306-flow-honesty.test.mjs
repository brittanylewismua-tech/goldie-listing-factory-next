import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const history=await readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1306: restoring a bundle replaces stale child ids with the server's exact child map",()=>{
  assert.match(app,/const childMap=Object\.fromEntries\(children\.filter\(child=>child\.productId&&child\.id\)/);
  assert.match(app,/setBundleBatchIds\(childMap\)/);
  assert.doesNotMatch(app,/setBundleBatchIds\(current=>\(\{\.\.\.childMap,\.\.\.current\}\)\)/);
});

test("D1306: bundle history represents ordered products that have no child batch yet",()=>{
  assert.match(route,/const recipeNames=new Map\(/);
  assert.match(route,/order\.map\(\(recipeId,index\)=>actualByRecipe\.get\(recipeId\)\|\|\{batchId:"",recipeId,productName:recipeNames\.get\(recipeId\)\|\|`Product \$\{index\+1\}`/);
  assert.match(route,/children\.length>=order\.length/);
  assert.match(history,/member\.batchId\|\|`missing-\$\{member\.position\}`/);
  assert.match(history,/batch\.members\.find\(member=>!member\.done\)\?\.batchId\?`Resume/);
  assert.match(history,/:"Resume bundle"/);
});

test("D1306: focused artwork editing does not show irrelevant multi-select controls",()=>{
  assert.match(app,/!reviewEditing&&selectedPlacementDrafts\.length/);
  assert.match(app,/selected:!reviewEditing&&Boolean\(/);
  assert.match(app,/onSelect:!reviewEditing&&draft\.id\?/);
});

test("D1306: selected colors stay visible and the unused catalog is collapsed",()=>{
  assert.match(app,/const includedColors=colors\.filter/);
  assert.match(app,/const availableToAdd=colors\.filter/);
  assert.match(app,/<b>Selected colors<\/b>/);
  assert.match(app,/<details className="draft-color-more" open=\{!includedColors\.length\}>/);
  assert.match(app,/<summary>Add more colors <span>\{availableToAdd\.length\}<\/span><\/summary>/);
  assert.match(css,/\.app-shell \.draft-color-more>summary/);
});

test("D1306: pricing uses seller-facing product terms instead of variant jargon",()=>{
  const pricing=app.slice(app.indexOf("function PricingReview"),app.indexOf("function ProductPhotoUpload"));
  assert.match(pricing,/const optionNoun=apparelPricing\?"color and size combination":"product option"/);
  assert.match(pricing,/View included \{optionNouns\} or edit one separately/);
  assert.doesNotMatch(pricing,/View included variants|Close variants|variants with the exact same product cost/i);
});
