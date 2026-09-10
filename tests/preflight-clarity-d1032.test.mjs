import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
test("free private draft creation has no confirmation detour",()=>{
  assert.doesNotMatch(app,/preflightOpen|preflight-backdrop|preflight-title/);
  assert.match(app,/onClick=\{createDrafts\}/);
  assert.match(app,/function beginDraftCreation\(\)[\s\S]{0,900}confirmDrafts\(\)/);
});

test("final price approval persists to its original product even when a bundle product is switched",()=>{
  assert.match(app,/await persistBatchNow\(sourceBatchId,\{\.\.\.sourceSnapshot,drafts:nextDrafts\.map\(snapshotDraft\),pricingApproved:true\}\)/);
  assert.match(app,/const byId=new Map\(saved\.map\(draft=>\[draft\.id,draft\]\)\),nextDrafts=drafts\.map/);
});

test("an automatic product-default retry never interrupts the active batch",()=>{
  assert.match(app,/if\(key!=="auto-defaults"\)stopWith\("This default was not saved\."/);
});
