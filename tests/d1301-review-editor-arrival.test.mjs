import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1301: Review destinations open at their task heading instead of a buried field",()=>{
  assert.match(app,/if\(section==="title"\|\|section==="description"\|\|section==="etsy"\)[\s\S]*?window\.setTimeout\(scrollReviewTaskToTop,300\)/);
  assert.match(app,/else goToStep\("finish",false,true\);[\s\S]*?window\.setTimeout\(scrollReviewTaskToTop,300\)/);
  assert.doesNotMatch(app,/section==="title"\?"\.factory-listing-form \.design-fields"/);
  assert.doesNotMatch(app,/target\.phase==="description"\?"\.individual-description-disclosure"/);
});

test("D1301: a restored Review URL keeps its section highlighted",()=>{
  assert.match(app,/const current=reviewEditing\.section\|\|"title"/);
  assert.doesNotMatch(app,/const current=workflowStep==="finish"/);
  assert.match(app,/aria-current=\{current===entry\.key\?"page":undefined\}/);
});

test("D1301: browser Back and Forward restore the exact Review destination",()=>{
  assert.match(app,/const restoreReviewLocation=\(\)=>\{/);
  assert.match(app,/if\(step==="finish"&&phase==="final"\)\{setReviewEditing\(null\);return\}/);
  assert.match(app,/setActiveDesign\(clientId\);setReviewEditing\(\{id:draft\.id,clientId,section\}\)/);
  assert.match(app,/window\.addEventListener\("popstate",restoreReviewLocation\)/);
});

test("D1301: all-listing editors state their actual scope",()=>{
  assert.match(app,/editingAllListingDetails=Boolean\(reviewEditing&&\(reviewEditing\.section==="title"\|\|reviewEditing\.section==="description"\)\)/);
  assert.match(app,/title:"Edit titles and tags",copy:"Update every listing below, then return to Review\."/);
  assert.match(app,/title:"Edit descriptions",copy:"Update the shared description or any listing below, then return to Review\."/);
  assert.match(app,/editingAllListingDetails\?`\$\{files\.length\} \$\{files\.length===1\?"listing":"listings"\}`/);
});

test("D1301: empty title rows do not repeat instructions beneath every tag box",()=>{
  assert.doesNotMatch(app,/Matching tags appear here when you auto-create this product’s titles\./);
  assert.match(app,/className="ai-title-button"[\s\S]*?"Create all titles and tags"/);
});
