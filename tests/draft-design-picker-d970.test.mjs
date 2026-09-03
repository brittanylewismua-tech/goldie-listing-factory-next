import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D970: every created design is visible without a clipped dropdown",()=>{
  assert.doesNotMatch(app,/Design preview<select/);
  assert.match(app,/className="draft-design-picker"/);
  assert.match(app,/createdDrafts\.map\(\(item,index\)/);
  assert.match(app,/Design \{index\+1\}/);
  assert.match(app,/onClick=\{\(\)=>setActiveDraft\(item\.id!\)\}/);
  assert.match(app,/aria-pressed=\{active\}/);
});

test("D970: selector cards fit their container and clearly mark the active design",()=>{
  assert.match(css,/\.draft-design-picker>div:last-child\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.draft-design-picker button\{[^}]*min-width:0/);
  assert.match(css,/\.draft-design-picker button\.selected\{[^}]*border-color:#2f7d53[^}]*background:#eff8f2/);
  assert.match(css,/\.draft-design-picker button small\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
});
