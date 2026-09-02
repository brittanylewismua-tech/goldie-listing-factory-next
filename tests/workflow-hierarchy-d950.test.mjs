import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D950: the workflow rail is the only repeated step indicator",()=>{
  assert.match(app,/stepCount=\{workflowStep==="connect"\?<p className="hero-step-count">Account setup · before you start<\/p>:undefined\}/);
  assert.doesNotMatch(app,/stepCount=\{<p className="hero-step-count">`Step/);
});

test("D950: every workflow hero states only the immediate task",()=>{
  for(const copy of [
    "Complete each section from top to bottom.",
    "Review the plan, then create the private drafts.",
    "Finish each listing’s title, tags, and description.",
    "Finish the Etsy details.",
    "Review the batch, then open it in Printify.",
  ]) assert.ok(app.includes(copy),`missing concise workflow copy: ${copy}`);
  assert.doesNotMatch(app,/Confirm colors, sizes, placement, pricing, shipping, and listing photos/);
});
