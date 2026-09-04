import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1075 color browsing never mounts a Printify mockup automatically",()=>{
  assert.match(app,/showRealPreview&&realPreview\?<img/);
  assert.match(app,/Back to color view":"Preview"/);
  assert.doesNotMatch(app,/Printify preview loading/);
});

test("D1075 hover only changes the local illustrated color",()=>{
  assert.match(app,/function focusColor\(id:number\)\{setActiveColor\(id\);setShowRealPreview\(false\)\}/);
  assert.match(app,/onMouseEnter=\{\(\)=>focusColor\(color\.id\)\}/);
  assert.doesNotMatch(app,/onMouseEnter=\{[^}]*onChange/);
});
