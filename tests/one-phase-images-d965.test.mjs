import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D965: Step 2 renders one phase and one forward path",()=>{
  assert.match(app,/workflowStep==="designs"&&!complete/,
    "the upload/review surface must leave the page after drafts exist");
  assert.match(app,/!\(workflowStep==="designs"\)\|\|complete/,
    "the draft-launch surface must leave the page after drafts exist");
  assert.equal((app.match(/Back to finishing your listings/g)||[]).length,0,
    "Step 2 must never describe forward movement as going back");
  assert.match(app,/\{!files\.length&&<>/,
    "the two large upload choices must collapse after files are selected");
});

test("D965: finished costs and shipping live in the product task sequence",()=>{
  const rows=app.slice(app.indexOf('if(workflowStep==="designs")'),app.indexOf('if(finishPhase==="final")'));
  assert.match(rows,/label:"Final prices"[\s\S]*task:"draft-pricing"/);
  assert.match(rows,/label:"Etsy shipping"[\s\S]*task:"draft-shipping"/);
  assert.ok(rows.indexOf('label:"Final prices"')<rows.indexOf('label:"Etsy shipping"'));
  const task=app.slice(app.indexOf('if(task==="draft-pricing")'),app.indexOf('const listings='));
  assert.match(task,/actual-cost-review/);
  assert.match(task,/aria-label="Final price review"/);
  assert.match(task,/PricingReview section="shipping"/);
});
