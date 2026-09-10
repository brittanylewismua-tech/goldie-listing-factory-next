import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1314: every corrective modal contains focus and closes with Escape",()=>{
  const effect=app.slice(app.indexOf("/* D1314"),app.indexOf("useEffect(()=>{if(imageStepError"));
  for(const label of ["blocking-modal-title","category-change-title","missing-photo-title","pixel-warning-title"])assert.ok(effect.includes(label),`missing keyboard handling for ${label}`);
  assert.match(effect,/containModalFocus\(modal\.label\)/);
  assert.match(effect,/event\.key==="Escape"/);
  assert.match(effect,/window\.removeEventListener\("keydown",close\);restore\(\)/);
});
