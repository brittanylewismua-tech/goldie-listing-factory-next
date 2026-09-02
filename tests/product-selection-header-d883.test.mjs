import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D883: product cards select directly and do not contain a second Choose control",()=>{
  assert.match(tools,/aria-label=\{bundleForm\?[\s\S]{0,180}:`Choose \$\{recipe\.name\}`\}/);
  assert.doesNotMatch(tools,/: "Choose →"/);
  assert.doesNotMatch(tools,/>Change product<\/button>/);
});

test("D883: a chosen product becomes the header and the library recedes",()=>{
  assert.match(app,/title=\{bundleCreationMode\?"Create a product bundle":productFormMode\?"Add a saved product":showProductLibrary\|\|\(!productSelected&&!bundleSelected\)\?"Choose a product or bundle"/);
  assert.match(tools,/\(!activeId\|\|showLibrary\)/);
  assert.match(tools,/setShowLibrary\(false\)/);
});

test("D896: selected-product header offers one obvious management path",()=>{
  assert.match(app,/headerActions=\{bundleCreationMode\|\|productFormMode\?undefined:[\s\S]{0,650}<button type="button" className="panel-create-action" onClick=\{\(\)=>setShowProductLibrary\(true\)\}>Choose a different product<\/button>/);
  assert.doesNotMatch(app,/>Remove from this batch<\/button>/);
  assert.match(tools,/showLibrary\?:boolean/);
});
