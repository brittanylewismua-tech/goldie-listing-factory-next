import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1018: a known bundle run remains the public URL while children restore",()=>{
  const restore=app.slice(app.indexOf("async function restoreBatchById"),app.indexOf("/* Restored batches keep"));
  assert.match(restore,/url\.searchParams\.set\("batch",runIdRef\.current\|\|id\)/);
});

test("D1028: the Drafts screen does not repeat its completed state in a banner",()=>{
  assert.doesNotMatch(app,/workflowStep==="designs"&&complete&&<div className="step-success-banner"/);
});

test("D1018: grouped Printify color ids all remain eligible for variants",()=>{
  const normalize=app.slice(app.indexOf("function normalizeColorIds"),app.indexOf("function variantsFor"));
  assert.match(normalize,/new Set\(\[option\.id,\.\.\.\(option\.ids\|\|\[\]\)\]\)/);
  assert.match(normalize,/canonical\.add\(groupedId\)/);
});
