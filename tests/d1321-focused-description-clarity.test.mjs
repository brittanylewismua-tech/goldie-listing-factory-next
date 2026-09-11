import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("description rows summarize their source instead of repeating the full description",()=>{
  const summary=app.slice(app.indexOf("function taskSummary("),app.indexOf("function designTaskRows("));
  assert.match(summary,/if\(task==="description"\)/);
  assert.match(summary,/return activeBundle\?"Uses this product’s description":"Uses batch description"/);
  assert.doesNotMatch(summary,/replace\(\/\\s\+\/g/);
});

test("the product badge follows the focused description or Etsy task",()=>{
  const status=app.slice(app.indexOf('function bundleCardStatus('),app.indexOf('function stepProductCards('));
  assert.match(status,/focused==="description"[\s\S]*?descriptions ready/);
  assert.match(status,/focused==="etsy"[\s\S]*?Etsy details ready/);
  assert.match(status,/reviewEditing\?\.section==="description"[\s\S]*?descriptions ready/);
});

test("the Etsy editor does not claim unfinished details are already pre-filled",()=>{
  assert.match(app,/<h3>Etsy details and personalization<\/h3>/);
  assert.match(app,/Review the category, required details, and personalization for each listing/);
  assert.doesNotMatch(app,/Review the pre-filled Etsy category/);
});
