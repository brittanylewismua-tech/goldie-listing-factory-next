import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1016: the final bundle child is saved before the run becomes idle",()=>{
  assert.match(app,/const bundleFinishing=useRef\(false\)/);
  assert.match(app,/if\(bundleIndex\+1>=bundleRecipes\.length\)\{[\s\S]{0,500}?persistBatchNow\(batchIdRef\.current\)[\s\S]{0,250}?setBundleRun\(null\)/);
});

test("D1016: a bundle cannot leave Drafts while another product is incomplete",()=>{
  const fn=app.slice(app.indexOf("function imagesStepIssues()"),app.indexOf("function progressStatus",app.indexOf("function imagesStepIssues()")));
  assert.match(fn,/for\(const recipe of bundleRecipes\)/);
  assert.match(fn,/Finish the Printify drafts for \$\{recipe\.name\}/);
  assert.match(fn,/final pricing approval for \$\{recipe\.name\}/);
  assert.match(fn,/at least one photo for \$\{recipe\.name\}/);
  assert.match(fn,/Choose an Etsy shipping profile for \$\{recipe\.name\}/);
});

test("D1016: low-resolution approvals survive a child restore",()=>{
  assert.match(app,/bundleBatchIds,bundleQualityDecisions,designs,drafts/);
  assert.match(app,/restoredBundleQualityDecisions=/);
  assert.match(app,/setBundleQualityDecisions\(restoredBundleQualityDecisions\)/);
});
