import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("automatic Etsy draft creation respects unfinished pricing while the recovery link remains available", async () => {
  assert.match(app,/disabled=\{creatingEtsyDrafts\|\|Boolean\(handoffBlockers\(\)\.length\)\}/);
  assert.match(app,/photoDeliveryRef\.current\?\.prepare\(\)/);
  const photos=await readFile(new URL("../app/photo-delivery-handoff.tsx",import.meta.url),"utf8");
  assert.match(photos,/Open Printify without preparing these drafts/);
});

test("starting fresh clears both the child batch and parent bundle-run identities", () => {
  assert.match(app, /batchIdRef\.current="";runIdRef\.current="";runStartedRef\.current="";setBundleRun\(null\)/);
});
