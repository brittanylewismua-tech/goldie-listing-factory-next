import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the Printify handoff is the persistent footer action, not clipped inside the review box",()=>{
  assert.match(app,/<FactoryFooter status=\{handoffBlockers\(\)\[0\]\|\|"Keep Hide in store checked when transferring from Printify\."\}>/);
  assert.match(app,/className="workflow-next" href="https:\/\/printify\.com\/app\/store\/products"/);
  assert.doesNotMatch(app,/publish-all-button printify-handoff-button/);
});
