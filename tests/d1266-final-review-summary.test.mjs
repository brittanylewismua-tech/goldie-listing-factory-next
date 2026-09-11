import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("final Review summarizes every required correction without hiding later blockers",()=>{
  const summary=app.slice(app.indexOf("function handoffBlockerSummary()"),app.indexOf("function suggestedBatchName()"));
  assert.match(summary,/const unpriced=count\(draft=>!reviewedPricingAndShippingReady\(draft\)\)/);
  assert.match(summary,/if\(unpriced\)missing\.push\(line\(unpriced,"pricing and shipping approval"\)\)/);
  assert.match(summary,/if\(missingTitles\)missing\.push\(line\(missingTitles,"a title","titles"\)\)/);
  assert.match(summary,/if\(missingTags\)missing\.push\(line\(missingTags,"Etsy tags"\)\)/);
  assert.match(summary,/if\(missingEtsy\)missing\.push\(line\(missingEtsy,"Etsy details"\)\)/);
  assert.match(summary,/if\(missing\.length\)return `\$\{missing\.join\(" · "\)\}\.`/);
  assert.match(app,/:handoffBlockerSummary\(\)\}<\/span>/);
});

test("completed progress steps do not carry a contradictory missing-work tooltip",()=>{
  assert.match(app,/title=\{active\|\|ahead\?issues\[0\]\|\|undefined:undefined\}/);
});
