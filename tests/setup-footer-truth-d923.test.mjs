import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D923: the product-step footer cannot claim readiness through a product load failure",()=>{
  assert.match(source,/const setupForwardReady=ready&&designsFinished&&!templateError&&!failedBundleNames\(\)\.length/);
  assert.match(source,/disabled=\{!setupForwardReady\}/);
  assert.match(source,/status=\{setupForwardReady\?`\$\{files\.length\} \${files\.length===1\?"listing":"listings"} in this batch`/);
  assert.match(source,/title: files\.length\?"Review your product and designs":"Add your designs"/);
});
