import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D925: adding a product is one focused task, not a form mixed with bundles and batch navigation",()=>{
  assert.match(tools,/onProductModeChange\?\:\(active:boolean\)=>void/);
  assert.match(tools,/onProductModeChange\?\.\(editing\)/);
  assert.match(tools,/!editing&&usableBundles\.length>0/);
  assert.match(app,/productFormMode\?"Add a saved product"/);
  assert.match(app,/!bundleCreationMode&&!productFormMode&&<FactoryFooter/);
  assert.match(css,/\.workflow-stage:has\(\.recipe-form\)>\.workflow-footer-actions\{\s*display:none!important/);
});
