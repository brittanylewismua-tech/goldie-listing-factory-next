import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("final Review summarizes every listing with the same required correction",()=>{
  const summary=app.slice(app.indexOf("function handoffBlockerSummary()"),app.indexOf("function suggestedBatchName()"));
  assert.match(summary,/const unpriced=count\(draft=>!reviewedPricingAndShippingReady\(draft\)\)/);
  assert.match(summary,/if\(unpriced\)return line\(unpriced,"pricing and shipping approval"\)/);
  assert.match(summary,/if\(missingTitles\)return line\(missingTitles,"a title"\)/);
  assert.match(app,/<span>\{handoffBlockerSummary\(\)\}<\/span>/);
});

test("completed progress steps do not carry a contradictory missing-work tooltip",()=>{
  assert.match(app,/title=\{active\|\|ahead\?issues\[0\]\|\|undefined:undefined\}/);
});
