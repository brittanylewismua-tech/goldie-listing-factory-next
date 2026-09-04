import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1063: colors move through every created design without a clipped dropdown or toggle wall",()=>{
  assert.doesNotMatch(app,/Design preview<select/);
  assert.doesNotMatch(app,/className="draft-design-picker"/);
  assert.match(app,/className="factory-listing-next draft-color-next"/);
  assert.match(app,/Listing \{activeDraftIndex\+1\} of \{createdDrafts\.length\}/);
  assert.match(app,/onClick=\{\(\)=>showDraft\(createdDrafts\[activeDraftIndex\+1\]\.id!\)\}/);
});

test("D1063: color listing navigation has usable spacing",()=>{
  assert.match(css,/\.draft-color-next\{margin-top:4px!important\}/);
  assert.match(css,/\.factory-listing-next button\{padding:10px 18px!important/);
});
