import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("automatic Etsy draft creation respects unfinished pricing while the recovery link remains available", async () => {
  assert.match(app,/disabled=\{creatingEtsyDrafts\|\|!photoDeliveryStatusReady\|\|Boolean\(handoffBlockers\(\)\.length\)\}/);
  assert.match(app,/photoDeliveryRef\.current\?\.prepare\(\)/);
  assert.match(app,/<a className="review-printify-link" href="https:\/\/printify\.com\/app\/store\/products"/);
});

test("starting fresh clears both the child batch and parent bundle-run identities", () => {
  assert.match(app, /batchIdRef\.current="";runIdRef\.current="";authoritativeRunBatchIds\.current=null;runStartedRef\.current="";setBundleRun\(null\)/);
});
