import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("automatic draft creation is the persistent footer action, not clipped inside the review box",()=>{
  assert.match(app,/<FactoryFooter status=\{handoffBlockers\(\)\[0\]\|\|"Creates drafts only\. Nothing goes live\."\}>/);
  assert.match(app,/className="workflow-next" disabled=\{creatingEtsyDrafts/);
  assert.doesNotMatch(app,/publish-all-button printify-handoff-button/);
});
