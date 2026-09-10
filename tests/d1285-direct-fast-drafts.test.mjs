import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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

test("D1285: large transparent PNG preparation is serialized, native, and crop gated",()=>{
  assert.match(upload,/LARGE_TRANSPARENT_PNG_BYTES = 12 \* 1024 \* 1024/);
  assert.match(upload,/optimizerQueue = turn/);
  assert.match(upload,/large-png-worker\.ts\?worker&url/);
  assert.match(upload,/new Worker\(largePngWorkerUrl/);
  assert.doesNotMatch(upload,/new Promise<Blob \| null>\(async/);
  assert.match(upload,/catch \{ resolve\(null\); return; \}/);
  assert.match(upload,/optimized\.size < file\.size \* \.82/);
  assert.match(upload,/bounds: \{ left: 0, top: 0, right: 1, bottom: 1 \}/);
  assert.match(worker,/createImageBitmap/);
  assert.match(worker,/new OffscreenCanvas\(width, height\)/);
  assert.match(worker,/blob\.size >= event\.data\.originalBytes \* \.82/);
  assert.doesNotMatch(worker,/UPNG|quantize/);
});

test("production build serves the PNG worker from the public site, never a local file URL",()=>{
  const staticRoot=new URL("../dist/client/_next/static/",import.meta.url);
  const files=readdirSync(staticRoot,{recursive:true}).map(String);
  const scripts=files.filter(file=>file.endsWith(".js"));
  const bundled=scripts.map(file=>readFileSync(new URL(file,staticRoot),"utf8")).join("\n");
  assert.doesNotMatch(bundled,/file:\/\/\/_next\/static\/large-png-worker-/);
  assert.match(bundled,/\/_next\/static\/large-png-worker-[A-Za-z0-9_-]+\.js/);
  assert.ok(files.some(file=>/large-png-worker-[A-Za-z0-9_-]+\.js$/.test(file)),"the referenced worker asset must be emitted");
});

test("D1285: the one progress bar covers preparation, admission, and provider completion",()=>{
  assert.match(app,/setPreparationCompleted\(\+\+preparedCount\)/);
  assert.match(app,/setPreparationCompleted\(requests\.length\);setDraftsAdmitted\(true\)/);
  assert.match(app,/measuredCreationProgress=measuredDraftCreationPercent\(draftCreationPhases,runTotal\)/);
  assert.match(app,/Printify draft creation progress/);
  assert.match(app,/artwork files prepared/);
});
