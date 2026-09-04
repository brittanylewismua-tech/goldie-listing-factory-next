import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("the Printify handoff looks and behaves disabled while restored products load", () => {
  assert.match(app, /workflow-next\$\{handoffBlockers\(\)\.length\?" disabled":""\}/);
  assert.match(app, /aria-disabled=\{handoffBlockers\(\)\.length>0\}/);
  assert.match(css, /\.factory-footer a\.disabled,[\s\S]*\.factory-footer a\[aria-disabled="true"\][\s\S]*pointer-events:none/);
});

test("starting fresh clears both the child batch and parent bundle-run identities", () => {
  assert.match(app, /batchIdRef\.current="";runIdRef\.current="";runStartedRef\.current="";setBundleRun\(null\)/);
});
