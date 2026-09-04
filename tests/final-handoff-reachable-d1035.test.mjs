import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the Printify handoff is the persistent footer action, not clipped inside the review box",()=>{
  assert.match(app,/<FactoryFooter status=\{handoffBlockers\(\)\[0\]\|\|"Nothing publishes until you choose it in Printify\."\}>/);
  assert.match(app,/className=\{`workflow-next\$\{handoffBlockers\(\)\.length\?" disabled":""\}`\}/);
  assert.doesNotMatch(app,/publish-all-button printify-handoff-button/);
});
