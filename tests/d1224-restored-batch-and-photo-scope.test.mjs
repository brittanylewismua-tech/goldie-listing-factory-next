import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {navigationIssues} from "../app/workflow-gates.ts";
import {printifyDraftChangeError} from "../app/printify-draft-error.ts";
import {normalizeProductDescription} from "../app/product-description.ts";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8");

test("D1224: a completed restored draft is not blocked by an unavailable original design check",()=>{
  const ready={connected:true,etsyConnected:true,productSelected:true,templateReady:true,shippingReady:true,variantsReady:true,bundleProductsReady:true,colorsReady:true,pricesReady:true,designCount:1,designsReady:false,etsyShippingProfileReady:true,pricingApproved:true,draftsComplete:true,createdDraftCount:1,titlesReady:true,tagsReady:true,descriptionReady:true,etsyDetailsReady:true,personalizationReady:true,imagesReady:true};
  assert.deepEqual(navigationIssues(8,ready),[]);
  assert.match(navigationIssues(3,{...ready,draftsComplete:false}).join(" "),/design check/);
});

test("D1224: Printify draft failures are useful without exposing raw provider responses",()=>{
  const missing=printifyDraftChangeError(404,'{"error":"Not found","request_id":"secret-provider-id"}');
  assert.match(missing,/no longer exists/i);
  assert.doesNotMatch(missing,/request_id|secret-provider-id|\{"/);
  assert.equal(printifyDraftChangeError(400,'{"status":"error","errors":{"reason":"Too many variants enabled. Maximum allowed: 100"}}'),"Printify could not save this change: Too many variants enabled. Maximum allowed: 100");
  assert.match(route,/printifyDraftChangeError\(response\.status,detail\)/);
  assert.doesNotMatch(route,/Printify could not update this draft.*detail/);
});

test("D1224: one-listing photo choices stay on that listing until Apply All is used",()=>{
  const start=app.indexOf('onApplyOne={values=>');
  const end=app.indexOf('onApplyAll={values=>',start);
  const one=app.slice(start,end);
  assert.match(one,/setPrintifyImageSelections/);
  assert.doesNotMatch(one,/saveImagePreferences|setPrintifyImageIndices/);
  assert.match(app.slice(end,end+1500),/setPrintifyImageIndices\(values\)/);
});

test("D1224: restored Etsy details use one provider sync path",()=>{
  assert.match(app,/if\(file\.etsy\)return false/);
  assert.match(app,/syncPreparedListing\(file,file\.etsy!\);syncedListingSignatures\.current\.set/);
});

test("D1224: final bundle review waits for every product and explains the real Etsy Drafts action",()=>{
  assert.match(app,/bundleProductsStillReading\(\)\.length\?<section className="listing-review-gate is-saving bundle-final-loading"/);
  assert.match(app,/title:"Finish your Etsy drafts"/);
  assert.match(app,/heading:"Save to Etsy Drafts"/);
  assert.doesNotMatch(app,/last checkpoint before you finish publishing in Printify/);
  assert.doesNotMatch(app,/final action opens Printify My Products/);
});

test("D1224: Printify's dot-colon export markers become readable bullets",()=>{
  assert.equal(normalizeProductDescription("Intro. .: First detail. .: Second detail."),"Intro.\n• First detail.\n• Second detail.");
  assert.equal(normalizeProductDescription("Normal seller copy"),"Normal seller copy");
  assert.match(app,/setDescription\(normalizeProductDescription\(state\.description\)\)/);
});
