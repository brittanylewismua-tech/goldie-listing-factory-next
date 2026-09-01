import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the completed receipt is handed to the run write, not reread from stale React state",()=>{
  assert.match(app,/const receipt=\{publishedCount:job\.completed/);
  assert.match(app,/setBatchReceipt\(receipt\).*await persistRunNow\(receipt\)/s);
  assert.match(app,/async function persistRunNow\(receipt:BatchReceipt\|null=batchReceipt\)/);
  assert.doesNotMatch(app,/setBatchReceipt\(\{publishedCount:job\.completed[\s\S]{0,500}persistRunNow\(\)/);
});

test("restoring a run seeds every product-to-child link before cards are used",()=>{
  assert.match(app,/const childMap=Object\.fromEntries\(children\.filter/);
  assert.match(app,/setBundleBatchIds\(current=>\(\{\.\.\.childMap,\.\.\.current\}\)\)/);
  assert.match(app,/const reachable=many&&!open&&Boolean\(bundleBatchIds\[recipe\.id\]/);
});

test("listing readiness includes every product in a bundle",()=>{
  assert.match(app,/function runProductGaps\(\)/);
  assert.match(app,/if\(index>=6\)issues\.push\(\.\.\.runProductGaps\(\)\)/);
  assert.match(app,/Finish \$\{counts\.designs-counts\.titled\}/);
  assert.match(app,/Add tags to \$\{counts\.designs-counts\.tagged\}/);
});
