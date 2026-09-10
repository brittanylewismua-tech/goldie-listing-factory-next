import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("draft creation starts directly without a redundant confirmation",()=>{
  assert.match(app,/function createDrafts\(\)[\s\S]{0,1400}beginDraftCreation\(\)/);
  assert.doesNotMatch(app,/preflightOpen|preflight-backdrop|preflight-timing/);
});

test("draft creation reports a live count instead of looking hung",()=>{
  assert.match(app,/Creating drafts · \$\{processed\} of \$\{runTotal\} finished/);
  assert.match(app,/creationProgressPercent/);
  assert.match(app,/artwork files prepared/);
});

test("the Printify photo limit names current photo sources",()=>{
  assert.match(app,/Your uploads and size guide share the 20-photo limit/);
  assert.doesNotMatch(app,/Lifestyle mockups and a size guide already chosen/);
});
