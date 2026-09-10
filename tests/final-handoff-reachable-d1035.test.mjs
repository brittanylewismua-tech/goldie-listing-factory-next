import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("automatic draft creation is the persistent action in the sticky review box",()=>{
  assert.match(app,/className="review-etsy-draft-button"[^>]*disabled=\{creatingEtsyDrafts/);
  assert.doesNotMatch(app,/FactoryFooter status=\{handoffBlockers/);
  assert.doesNotMatch(app,/publish-all-button printify-handoff-button/);
});
