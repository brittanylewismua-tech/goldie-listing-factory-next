import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/etsy/route.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D1008: an Etsy database row is not reported as a verified connection", () => {
  assert.match(route, /await etsyConnection\(user\.userId\)/,
    "GET validates or refreshes the active token before returning connected");
  assert.match(route, /catch\(error\).*connected:false/s,
    "an unusable token is reported as disconnected");
  assert.doesNotMatch(route, /return NextResponse\.json\(active\?\{connected:true/,
    "the old row-only connected response is gone");
});

test("D1008: failed shipping cannot coexist with a ready handoff", () => {
  assert.match(app, /shippingProfilesError\?"Reconnect Etsy":"Needs review"/);
  assert.match(app, /done:isActive\?bundlePricingReady&&etsyShippingSelectionReady\(\):started/);
  assert.match(app, /handoffBlockers\(\)\.length\?"Finish the items above before opening Printify\.":"Your listings are ready in Printify\."/);
  assert.match(app, /aria-disabled=\{handoffBlockers\(\)\.length>0\}/,
    "the Printify handoff is disabled while required work remains");
  const handoff=app.slice(app.indexOf("function handoffBlockers()"),app.indexOf("function suggestedBatchName()"));
  assert.match(handoff, /issue!=="Select at least one successful listing"/);
  assert.match(handoff, /bundlePublishDrafts\(\)/,
    "the handoff validates every finished draft, not only hidden publisher selections");
});
