import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/batches/route.ts",import.meta.url),"utf8");

test("saved batch snapshots compact draft mockups and variant costs",()=>{
  assert.match(app,/function snapshotDraft\(draft:DraftResult\)/);
  assert.match(app,/drafts:drafts\.map\(snapshotDraft\)/);
  assert.match(app,/colorPreviewImageDetails:compactPreviews/);
  assert.match(app,/variants:draft\.costReview\.variants\.map\(variant=>\(\{id:variant\.id,title:variant\.title,cost:variant\.cost,price:variant\.price,isEnabled:variant\.isEnabled\}\)\)/);
});

test("explicit price approval persists the same compact snapshot",()=>{
  assert.match(app,/persistBatchNow\(sourceBatchId,\{\.\.\.sourceSnapshot,drafts:nextDrafts\.map\(snapshotDraft\),pricingApproved:true\}\)/);
});

test("batch endpoint accepts a compact full 20-design run",()=>{
  assert.match(route,/stateJson\.length>1800000/);
});
