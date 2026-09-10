import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const gates=readFileSync(new URL("../app/workflow-gates.ts",import.meta.url),"utf8");

test("D905: Etsy shipping is not required to create private Printify drafts",()=>{
  const create=app.slice(app.indexOf("function createDrafts()"),app.indexOf("async function queueDraftSubmission()"));
  assert.doesNotMatch(create,/etsyShippingProfileId|Choose shipping/);
  const required=app.slice(app.indexOf("function requiredForStep"),app.indexOf("async function openProgressStep"));
  assert.match(required,/step==="finish"&&!etsyShippingProfileId/);
  assert.doesNotMatch(required,/\["review","finish"\].*etsyShippingProfileId/);
});

test("D905: shipping is rendered immediately after finished-cost pricing",()=>{
  const actions=app.slice(app.indexOf('if(task==="draft-pricing")'),app.indexOf("const listings="));
  assert.match(actions,/editable-draft-pricing/);
  assert.match(actions,/post-draft-shipping-review/);
  assert.match(actions,/section="shipping"/);
  assert.ok(actions.indexOf("editable-draft-pricing")<actions.indexOf("post-draft-shipping-review"));
});

test("D905: direct draft creation does not claim pricing and shipping happen first",()=>{
  const create=app.slice(app.indexOf("function beginDraftCreation()"),app.indexOf("async function queueDraftSubmission()"));
  assert.doesNotMatch(create,/Review previews, prices, and shipping|enabled variants reviewed and approved/);
  assert.match(create,/confirmDrafts\(\)/);
  assert.doesNotMatch(app,/enabled variants reviewed and approved/);
  assert.match(gates,/Choose the Etsy shipping profile after approving the finished prices on the Images step/);
});
