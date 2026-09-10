import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const upload=readFileSync(new URL("../app/client-artwork-upload.ts",import.meta.url),"utf8");
const worker=readFileSync(new URL("../app/large-png-worker.ts",import.meta.url),"utf8");

test("D1285: Create Printify drafts starts immediately after validation",()=>{
  const create=app.slice(app.indexOf("function beginDraftCreation()"),app.indexOf("/** Stage every member"));
  assert.match(create,/requestedListingCount>planDraftsRemaining/);
  assert.match(create,/confirmDrafts\(\)/);
  assert.match(app,/onClick=\{createDrafts\}/);
  assert.doesNotMatch(app,/preflightOpen|preflight-backdrop|preflight-confirm/);
});

test("D1285: the synchronous duplicate guard remains ahead of every mutation",()=>{
  const queue=app.slice(app.indexOf("async function queueDraftSubmission()"),app.indexOf("function confirmDrafts()"));
  assert.match(queue,/if\(draftRunInFlight\.current\|\|!activeRecipe\|\|!templateDetails\)return/);
  assert.ok(queue.indexOf("draftRunInFlight.current=true")<queue.indexOf("setRunning(true)"));
});

test("D1285: large transparent PNG optimization is serialized and quality gated",()=>{
  assert.match(upload,/LARGE_TRANSPARENT_PNG_BYTES = 12 \* 1024 \* 1024/);
  assert.match(upload,/optimizerQueue = turn/);
  assert.match(upload,/optimized\.size < file\.size \* \.75/);
  assert.match(worker,/UPNG\.quantize\(\[original\], 256\)/);
  assert.match(worker,/mean > 4 \|\| p95 > 18 \|\| alphaMean > 1/);
  assert.match(worker,/encoded\.byteLength >= event\.data\.originalBytes \* \.75/);
});

test("D1285: the one progress bar covers preparation, admission, and provider completion",()=>{
  assert.match(app,/setPreparationCompleted\(\+\+preparedCount\)/);
  assert.match(app,/setPreparationCompleted\(requests\.length\);setDraftsAdmitted\(true\)/);
  assert.match(app,/creationProgressPercent=runTotal\?Math\.min\(100/);
  assert.match(app,/Printify draft creation progress/);
  assert.match(app,/artwork files prepared/);
});
