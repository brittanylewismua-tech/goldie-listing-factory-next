import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D923: the product-step footer cannot claim readiness through a product load failure",()=>{
  assert.match(source,/const setupForwardReady=ready&&designsFinished&&!templateError&&!failedBundleNames\(\)\.length/);
  assert.match(source,/disabled=\{!setupForwardReady\}/);
  assert.match(source,/status=\{setupForwardReady\?"Your product and designs are ready":templateError\|\|missingRequirement/);
});
