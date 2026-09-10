import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("app/listing-factory-app.tsx","utf8");
const review=readFileSync("app/final-listing-review.tsx","utf8");
const css=readFileSync("app/interface-v2.css","utf8");
const theme=readFileSync("app/lilac-theme.css","utf8");
const baseTheme=readFileSync("app/theme.css","utf8");
const listingRows=readFileSync("app/listing-rows.tsx","utf8");

test("D1281: Printify creation has one inline progress surface",()=>{
  const wait=app.slice(app.indexOf("<WaitProgress"),app.indexOf("{/* D721 · Top bar",app.indexOf("<WaitProgress")));
  assert.match(wait,/observeTools=\{!\(running\|\|Boolean\(bundleRun\)\)\}/);
  assert.match(wait,/creatingEtsyDrafts\|\|running\|\|bundleRun\?null/);
  assert.doesNotMatch(wait,/Creating your Printify drafts/);
  assert.match(app,/className="batch-progress" role="status" aria-live="polite"/);
});

test("D1283/D1285: inline draft progress shows real preparation and provider progress",()=>{
  assert.match(app,/className="progress-ring" aria-hidden="true"\/\>/);
  assert.match(app,/className="progress-track" role="progressbar" aria-label="Printify draft creation progress"/);
  assert.match(app,/aria-valuenow=\{creationProgressPercent\}/);
  assert.match(app,/aria-valuetext=\{creationProgressText\}/);
  assert.match(app,/<b>\{creationProgressPercent\}%<\/b>/);
  assert.match(baseTheme,/\.progress-track\{[^}]*height:24px[^}]*position:relative[^}]*place-items:center/);
});

test("D1281: focused Review exposes listings first and sections in a side rail",()=>{
  assert.match(app,/className="review-listing-switcher" aria-label="Choose a listing"/);
  assert.match(app,/className="review-listing-thumb"/);
  assert.match(app,/candidateDraft\?\.previewUrl\|\|candidate\.previewUrl/);
  assert.match(app,/className="review-section-switcher" aria-label="Listing sections"/);
  assert.doesNotMatch(app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor")),/Previous listing|Next listing/);
  assert.match(css,/grid-template-columns:230px minmax\(0,1fr\)/);
  assert.match(css,/\.review-listing-editor-nav\{position:sticky/);
  assert.match(css,/@media\(max-width:1000px\)[^{]*\{\.app-shell \.step-product-card:has\(>\.review-listing-editor-nav\)\{grid-template-columns:1fr\}/);
});

test("D1281: unfinished Review rows use a centered Needed badge",()=>{
  assert.match(review,/section\.ready\?"is-complete":"is-needed"/);
  assert.match(review,/section\.ready\?"✓":"Needed"/);
  assert.match(theme,/span\.is-needed\{[^}]*place-items:center[^}]*width:52px[^}]*height:24px[^}]*text-align:center/);
});

test("D1282: switching a focused photo listing cannot leave its workspace blank",()=>{
  assert.match(listingRows,/const rowKeySignature=rows\.map\(row=>row\.key\)\.join/);
  assert.match(listingRows,/compactNavigation&&rows\.length&&!rows\.some\(row=>current\.has\(row\.key\)\)/);
  assert.match(listingRows,/return new Set\(\[rows\[0\]\.key\]\)/);
  assert.match(listingRows,/\[focusedKey,compactNavigation,rowKeySignature\]/);
});

test("D1284: focused editor rail shows compact completion marks and returns through the footer",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/className=\{`review-section-state \$\{entry\.done\?"is-done":"is-needed"\}`\}/);
  assert.match(nav,/entry\.done\?"✓":"×"/);
  assert.match(nav,/aria-label=\{`\$\{entry\.label\}: \$\{entry\.done\?"complete":"needed"\}`\}/);
  assert.doesNotMatch(nav,/className="review-listing-done"/);
  assert.match(app,/reviewEditing\?<button className="workflow-back"[^>]+onClick=\{\(\)=>openFinishedReview\(false\)\}[\s\S]*?Back to Review/);
  assert.match(css,/\.review-section-state\.is-done\{color:#53bd7c\}/);
  assert.match(css,/\.review-section-state\.is-needed\{color:#f06a6a\}/);
});

test("D1284: focused title editing shows every listing together without pagination",()=>{
  assert.match(app,/focusedSection==="title"\?titlesRows\(undefined,true\)/);
  assert.match(app,/alwaysOpen=\{openAll\}/);
  assert.match(listingRows,/alwaysOpen\?null:singleOpen/);
  assert.match(listingRows,/!compactNavigation&&!alwaysOpen&&rows\.length>1/);
  assert.match(app,/Titles and tags for every listing/);
});

test("D1284: photos, size guide, zoom, previews and color labels stay compact",()=>{
  const workspace=app.slice(app.indexOf('className="listing-photo-workspace"'),app.indexOf('className="listing-photo-workspace"')+5000);
  assert.match(workspace,/<UploadedListingPhotos[\s\S]+?sizeGuideName=\{design\.sizeGuideName\}[\s\S]+?onSizeGuideSaved=/);
  assert.doesNotMatch(workspace,/<IndividualSizeGuide/);
  assert.match(app,/Download photos to your computer/);
  assert.match(css,/\.printify-image-option>\.printify-photo-expand\{right:8px;bottom:42px;width:28px;height:28px;min-width:28px;min-height:28px;border:0;border-radius:0;background:transparent/);
  assert.match(css,/\.focused-review-section \.factory-etsy-details-column \.listing-product-preview\{[^}]*width:140px/);
  assert.match(css,/\.draft-color-grid button span\{[^}]*overflow:visible[^}]*white-space:normal/);
});
