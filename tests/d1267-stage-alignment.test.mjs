import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("a listing editor highlights Review rather than the underlying legacy route",()=>{
  assert.match(app,/workflowStep==="designs"\?\(complete&&reviewEditing\?8:2\)/);
  assert.match(app,/eyebrow:"STEP 3 OF 3 · REVIEW",title:"Edit this listing"/);
  assert.match(app,/eyebrow:"STEP 3 OF 3 · REVIEW",title:"Edit titles and tags"/);
  assert.match(app,/eyebrow:"STEP 3 OF 3 · REVIEW",title:"Edit descriptions"/);
});

test("finished Printify drafts remain step 2 until the seller opens final Review",()=>{
  assert.match(app,/eyebrow: "STEP 2 OF 3", title: "Finish your Printify drafts", copy: "Check artwork, colors, sizes, pricing, shipping, and listing photos\."/);
  assert.doesNotMatch(app,/eyebrow: "STEP 3 OF 3", title: "Review your listings", copy: "Everything your saved product already answers has been applied\."/);
});
