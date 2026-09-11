import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the first stage names both jobs that actually appear on its page",()=>{
  assert.match(app,/\{label:"Setup",index:1,title:"Choose a product and add designs",covers:\[1\]\}/);
  assert.match(app,/setup: templateDetails&&productSelected&&!showProductLibrary[\s\S]*title: files\.length\?"Review your product and designs":"Add your designs"[\s\S]*title: "Start your batch", copy: "Choose a saved product or bundle."/);
  assert.doesNotMatch(app,/\{label:"Product",index:1,title:"Choose product"/);
});
