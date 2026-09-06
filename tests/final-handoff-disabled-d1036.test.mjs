import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("external Printify navigation is not gated by unfinished pricing", () => {
  const link=app.slice(app.indexOf('href="https://printify.com/app/store/products"'),app.indexOf('>Open My Products'));
  assert.doesNotMatch(link,/handoffBlockers|aria-disabled/);
  assert.match(link,/photoDeliveryRef/);
  const photos=readFile(new URL("../app/photo-delivery-handoff.tsx",import.meta.url),"utf8");
  return photos.then(source=>assert.match(source,/open Printify without preparing another photo delivery/));
});

test("starting fresh clears both the child batch and parent bundle-run identities", () => {
  assert.match(app, /batchIdRef\.current="";runIdRef\.current="";runStartedRef\.current="";setBundleRun\(null\)/);
});
