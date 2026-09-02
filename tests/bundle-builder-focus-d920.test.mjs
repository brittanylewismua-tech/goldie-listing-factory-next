import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const tools=readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");

test("D920: bundle creation is one isolated task",()=>{
  assert.match(tools,/activeId&&!bundleForm&&<div className="selected-summary-block">/);
  assert.match(app,/productSelected&&!failedBundleNames\(\)\.length&&!bundleCreationMode\)\?"active-panel":"hidden-panel"/);
  assert.match(app,/workflowStep==="setup"&&files\.length===0&&!bundleCreationMode&&!productFormMode&&<FactoryFooter/);
});
