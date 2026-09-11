import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const marker=fs.readFileSync(new URL("../app/build-marker.ts",import.meta.url),"utf8");

test("completed and working Etsy transfers replace the unfinished review instructions",()=>{
  assert.match(app,/etsyDraftTransferState==="complete"\?"Your Etsy drafts were created and verified\."/);
  assert.match(app,/etsyDraftTransferState==="working"\?"Your Etsy drafts are being created and checked\."/);
  assert.match(app,/etsyDraftTransferState==="complete"\?`\$\{bundlePublishDrafts\(\)\.length\} Etsy/);
  assert.match(app,/"Ready to open in Etsy\. Nothing is live\."/);
});

test("section changes return to the product task heading instead of scrolling the rail past it",()=>{
  assert.match(app,/function scrollReviewTaskToTop\(\)\{[\s\S]*?const reset=scrollFactoryToTop\(\);[\s\S]*?window\.requestAnimationFrame\(reset\)/);
  assert.doesNotMatch(app,/function scrollReviewTaskToTop\(\)[\s\S]{0,500}review-listing-editor-nav/);
});

test("stage footer and pricing copy describe the whole task honestly",()=>{
  assert.match(app,/"Product choices, pricing, shipping, and photos are ready"/);
  assert.match(app,/>Target profit<span className="money-input">/);
  assert.match(app,/Change this to recalculate prices\./);
});

test("core workflow text receives a readable, consistent polish",()=>{
  assert.match(css,/\.batch-description-body textarea\{min-height:240px;font-size:14px;line-height:1\.55/);
  assert.match(css,/\.review-section-switcher button\{min-height:42px;font-size:11px;line-height:1\.3\}/);
  assert.match(css,/\.factory-publish-box \.publish-box-ready span,[\s\S]*font-size:12px/);
  assert.match(marker,/D1354/);
});
