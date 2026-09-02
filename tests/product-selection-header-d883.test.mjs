import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D883: product cards select directly and do not contain a second Choose control",()=>{
  assert.match(tools,/aria-label={`Choose \${recipe\.name}`}/);
  assert.doesNotMatch(tools,/: "Choose →"/);
  assert.doesNotMatch(tools,/>Change product<\/button>/);
});

test("D883: a chosen product becomes the header and the library recedes",()=>{
  assert.match(app,/title={activeBundle\?\.name\|\|activeRecipe\?\.name\|\|"Choose a product"}/);
  assert.match(tools,/\(!activeId\|\|showLibrary\)/);
  assert.match(tools,/setShowLibrary\(false\)/);
});

test("D883: selected-product header offers both safe management paths",()=>{
  assert.match(app,/headerActions=\{productSelected\|\|bundleSelected\?<><button type="button" onClick=\{\(\)=>setShowProductLibrary\(true\)\}>Choose a different product<\/button>/);
  assert.match(app,/>Remove from this batch<\/button>/);
  assert.match(tools,/showLibrary\?:boolean/);
});
