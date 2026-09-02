import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D940: secondary artwork records the product where it was created",()=>{
  assert.match(app,/ownerProductId:activeRecipe\?\.id,productIds:activeRecipe\?\.id\?\[activeRecipe\.id\]:\[\]/);
  assert.match(app,/artwork\.productIds\?\.length\?artwork\.productIds/);
});

test("D940: bundle draft creation filters extra artwork by the current product",()=>{
  assert.match(app,/return artwork\.colorIds\.length>0&&\(!activeBundle\|\|products\.includes\(currentProductId\)\)/);
  assert.match(app,/artwork\.ownerProductId&&artwork\.ownerProductId!==currentProductId\?\{\.\.\.artwork,colorIds:\[\.\.\.selectedColorIds\]\}/);
});

test("D940: the upload card makes product scope explicit and selectable",()=>{
  assert.match(app,/Which products get this \{printSideLabel\(artwork\.side\)\.toLocaleLowerCase\(\)\} artwork\?/);
  assert.match(app,/Goldie applies it only to products that support this print area/);
  assert.match(app,/onClick=\{\(\)=>toggleArtworkProduct\(file\.id,artwork\.id,recipe\.id\)\}/);
  assert.match(css,/\.bundle-print-products button\.selected\{border-color:#2f7a50;background:#f1faf4!important/);
});

test("D940: final confirmation states listing and print-area scope",()=>{
  assert.match(app,/one listing per design on each product/);
  assert.match(app,/Goldie never turns a back file into another product’s front design/);
  assert.match(app,/files\.map\(printPlanFor\)/);
});
