import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1064 shows automatic Etsy preparation as loading, not an error",()=>{
  assert.match(app,/!design\.etsyError\?<div className="etsy-detail-loading" role="status"><span className="goldie-spinner"/);
  assert.match(app,/<b>Loading Etsy details…<\/b>/);
  assert.doesNotMatch(app,/Etsy details still need to be created\./);
  assert.match(app,/design\.etsyError\}<\/span><button/);
});

test("D1064 clears stale Etsy failures whenever titles or tags change",()=>{
  assert.match(app,/\{title,etsy:undefined,etsyError:""\}/);
  assert.match(app,/etsy:undefined,etsyError:""\}\)\} placeholder="Exact title phrases/);
});

test("D1064 loading state is a centered neutral status with a spinner",()=>{
  assert.match(css,/\.etsy-detail-loading\{[^}]*display:flex[^}]*justify-content:center[^}]*background:#fff/);
  assert.match(css,/\.etsy-detail-loading \.goldie-spinner\{width:18px;height:18px;margin:0\}/);
});
