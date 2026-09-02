import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D927: a product without a color or size axis can still be fully set up",()=>{
  assert.match(tools,/requiresColorSelection\?\:boolean;requiresSizeSelection\?\:boolean/);
  assert.match(tools,/recipe\.requiresColorSelection===false\|\|Boolean\(\(recipe\.defaultColorIds\|\|\[\]\)\.length\)/);
  assert.match(tools,/recipe\.requiresSizeSelection===false\|\|Boolean\(\(recipe\.defaultSizeIds\|\|\[\]\)\.length\)/);
  assert.doesNotMatch(tools,/if\(recipe\.setupComplete===true\)return true/,
    "a legacy flag cannot bypass the actual axes required by this product");
  assert.match(route,/merged\.requiresColorSelection!==false/);
  assert.match(route,/merged\.requiresSizeSelection!==false/);
  assert.match(app,/requiresColorSelection:Boolean\(templateDetails\.colorOptions\?\.length\)/);
  assert.match(app,/requiresSizeSelection:Boolean\(templateDetails\.sizeOptions\?\.length\)/);
});

test("D927: selecting a product immediately shows an honest loading state",()=>{
  assert.match(tools,/selected-product-loading/);
  assert.match(tools,/Loading product details…/);
});

test("D928: saved readiness refreshes the chooser before bundle selection",()=>{
  const start=app.indexOf("async function saveProductDefaults");
  const end=app.indexOf("async function rememberBatchDefaultsAfterPublish",start);
  const save=app.slice(start,end);
  assert.match(save,/if\(!response\.ok\)throw/);
  assert.match(save,/setSavedRevision\(current=>current\+1\)/,
    "a successful defaults write must invalidate the chooser's fetched recipe copy");
  assert.ok(save.indexOf("if(!response.ok)throw")<save.indexOf("setSavedRevision(current=>current+1)"),
    "a failed save must not refresh the chooser as though it succeeded");
});
