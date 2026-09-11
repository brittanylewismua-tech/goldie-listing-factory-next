import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1313: the Etsy draft action names its required status check",()=>{
  const button=app.slice(app.indexOf('className="review-etsy-draft-button"'),app.indexOf('className="review-printify-link"'));
  assert.match(button,/data-inline-progress="true"/);
  assert.match(button,/aria-busy=\{creatingEtsyDrafts\|\|etsyDraftTransferState==='working'\}/);
  assert.match(button,/etsyDraftTransferState==='attention'\?"Check saved progress above"/);
  assert.match(button,/!photoDeliveryStatusReady\?"Checking saved Etsy drafts…":"Save to Etsy Drafts"/);
  assert.match(button,/disabled=\{creatingEtsyDrafts\|\|etsyDraftTransferState==='working'\|\|!photoDeliveryStatusReady\|\|Boolean\(handoffBlockers\(\)\.length\)\}/);
  assert.match(app,/etsyDraftTransferState!==\'complete\'/);
});

test("D1313: a partial product cannot make the bundle receipt claim completion",()=>{
  assert.match(app,/function bundleProductFullyPublished\(recipe:Recipe,index:number\)/);
  assert.match(app,/expected>0&&published>=expected/);
  assert.match(app,/bundleRecipes\.every\(bundleProductFullyPublished\)/);
  assert.match(app,/index!==bundleIndex&&!bundleProductFullyPublished\(recipe,index\)/);
});
