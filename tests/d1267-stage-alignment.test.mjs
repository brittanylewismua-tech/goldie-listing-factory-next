import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("a listing editor highlights Review rather than the underlying legacy route",()=>{
  assert.match(app,/workflowStep==="designs"\?\(complete&&reviewEditing\?8:complete&&finishPhase==="mockups"\?7:2\)/);
  assert.match(app,/eyebrow:"STEP 7 OF 7 · REVIEW",title:"Edit this listing"/);
  assert.match(app,/eyebrow:"STEP 7 OF 7 · REVIEW",title:"Edit titles and tags"/);
  assert.match(app,/eyebrow:"STEP 7 OF 7 · REVIEW",title:"Edit descriptions"/);
});

test("finished product and photo review is stage six",()=>{
  assert.match(app,/eyebrow: "STEP 6 OF 7", title: "Review photos and final product choices"/);
  assert.doesNotMatch(app,/eyebrow: "STEP 3 OF 7", title: "Review your listings", copy: "Everything your saved product already answers has been applied\."/);
});
