import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("a listing opened from Review has one stable Review return and no unrelated step footer",()=>{
  assert.match(app,/!reviewEditing&&\(!etsyDetailsPrepared\?<FactoryFooter/);
  assert.match(app,/workflow-footer-actions">\{reviewEditing\?null:progressIndex>0/);
  assert.match(app,/factory-footer-slot"\/>{reviewEditing\?<button className="workflow-next"[^>]*>[\s\S]*?Back to Review <span/);
  assert.match(app,/reviewEditing\?<button className="workflow-next"[^>]*>[\s\S]*?Back to Review <span/);
  assert.equal((app.match(/reviewEditing\?<button className="workflow-next"/g)||[]).length,2);
});

test("focused Etsy details has one heading",()=>{
  assert.match(app,/focusedSection!=="etsy"&&<h3>/);
  assert.match(app,/focusedSection==="etsy"&&etsyLead\(\)/);
});
