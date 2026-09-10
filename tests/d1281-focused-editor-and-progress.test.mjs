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

test("D1283/D1292: inline draft progress stays visibly active while real completion waits",()=>{
  assert.match(app,/className="progress-ring" aria-hidden="true"\/\>/);
  assert.match(app,/artworkPreparationIndeterminate=running&&!draftsAdmitted&&preparationCompleted===0/);
  assert.match(app,/className="progress-track is-indeterminate" role="progressbar" aria-label="Preparing artwork for Printify"/);
  assert.match(app,/className="progress-track" role="progressbar" aria-label="Printify draft creation progress"/);
  assert.match(app,/aria-valuenow=\{creationProgressPercent\}/);
  assert.match(app,/aria-valuetext=\{creationProgressText\}/);
  assert.match(app,/<b>\{creationProgressPercent\}%<\/b>/);
  assert.match(app,/className="progress-activity"><i aria-hidden="true"\/>Working<\/small>/);
  assert.match(app,/creationActivityText=.*Printify is building your drafts/);
  assert.match(baseTheme,/\.progress-track\{[^}]*height:24px[^}]*position:relative[^}]*place-items:center/);
  assert.match(baseTheme,/\.progress-track\.is-indeterminate span\{[^}]*animation:goldie-progress-sweep/);
  assert.match(baseTheme,/\.progress-track::after\{[^}]*animation:goldie-progress-activity/);
  assert.match(baseTheme,/@keyframes goldie-progress-activity\{0%\{transform:translateX\(-110%\)\}100%\{transform:translateX\(365%\)\}\}/);
  assert.match(baseTheme,/\.progress-activity i\{[^}]*animation:goldie-progress-pulse/);
  assert.doesNotMatch(app,/setInterval\([^)]*creationProgressPercent|setTimeout\([^)]*creationProgressPercent/);
});

test("D1293: focused Review gives the work priority and scales listing navigation in a right rail",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.doesNotMatch(nav,/className="review-listing-switcher"/);
  assert.match(app,/className="review-listing-thumb"/);
  assert.match(nav,/className="review-listing-picker"/);
  assert.match(nav,/className="review-listing-chooser"/);
  assert.match(nav,/className="review-listing-choices"/);
  assert.doesNotMatch(nav,/<select aria-label="Jump to listing"/);
  assert.match(nav,/files\.map\(\(candidate,index\)=>/);
  assert.match(nav,/aria-label="Previous listing"/);
  assert.match(nav,/aria-label="Next listing"/);
  assert.match(app,/className="review-section-switcher" aria-label="Listing sections"/);
  assert.match(css,/\.step-product-card:has\(>\.review-listing-editor-nav\)\{display:grid;grid-template-columns:minmax\(0,1fr\) 250px/);
  assert.match(css,/\.focused-review-section\{display:grid;grid-template-columns:minmax\(0,1fr\) 250px/);
  assert.match(css,/\.focused-review-section>\.review-listing-editor-nav\{grid-column:2/);
  assert.match(css,/\.review-listing-editor-nav\{position:sticky/);
  assert.match(css,/@media\(max-width:1000px\)[^{]*\{\.app-shell \.step-product-card:has\(>\.review-listing-editor-nav\)\{grid-template-columns:1fr\}/);
  assert.match(css,/listing-rows:is\(\.is-static-open,\.is-compact\) \.listing-card\{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none/);
});

test("D1295: focused work uses one large surface instead of nested ornamental cards",()=>{
  assert.match(css,/step-product-card:has\(>\.review-listing-editor-nav\) \.placement-review-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/step-product-card:has\(>\.review-listing-editor-nav\) \.factory-art-card\{border:0;border-radius:0;background:transparent/);
  assert.match(css,/step-product-card:has\(>\.review-listing-editor-nav\) \.factory-art-preview\{height:clamp\(300px,45vw,560px\)/);
  assert.match(css,/step-product-card:has\(>\.review-listing-editor-nav\) \.factory-art-meta\{padding:12px 2px 0;border:0/);
  assert.match(css,/step-product-card:has\(>\.review-listing-editor-nav\) \.listing-photo-workspace>\.uploaded-listing-photos,[\s\S]*?border:0!important;border-top:1px solid #d9d0d6!important;[\s\S]*?box-shadow:none!important/);
});

test("D1296: title fields stay inline and each listing has a useful enlarged preview",()=>{
  assert.match(app,/detail:<div onFocus=\{openAll\?undefined:\(\)=>setActiveDesign\(design\.id\)\}/);
  assert.match(app,/preview:openAll&&shot\?<UploadedDesignPreview src=\{shot\} label=\{`Enlarge mockup for listing/);
  assert.match(listingRows,/className="listing-card-preview"/);
  assert.match(app,/!openAll&&\(\(\)=>\{const shot=drafts\.find\(draft=>draft\.clientId===design\.id\)\?\.previewUrl\|\|design\.previewUrl/);
  assert.match(css,/\.focused-review-all-listings \.factory-form-card:is\(\.factory-form-card\)\{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none\}/);
  assert.match(css,/\.focused-review-section\.focused-review-all-listings \.listing-rows\.is-static-open \.listing-card\{padding:16px;border:2px solid #171717/);
  assert.match(css,/\.focused-review-all-listings \.listing-card-preview\{display:block;width:176px;height:176px/);
  assert.match(css,/\.focused-review-all-listings \.listing-card-preview \.uploaded-design-preview\{width:176px!important;height:176px!important/);
});

test("D1297: the all-listings title page does not pretend one listing is selected",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/const editingAllListings=current==="title"\|\|current==="description"/);
  assert.match(nav,/Editing all listings/);
  assert.match(nav,/!editingAllListings&&files\.length>1&&<div className="review-listing-picker"/);
});

test("D1290: unfinished Review rows use a centered boxed X",()=>{
  assert.match(review,/section\.ready\?"is-complete":"is-incomplete"/);
  assert.match(review,/section\.ready\?"✓":"×"/);
  assert.match(theme,/span\.is-incomplete\{color:#a52f3b;background:#fff\}/);
});

test("D1282: switching a focused photo listing cannot leave its workspace blank",()=>{
  assert.match(listingRows,/const rowKeySignature=rows\.map\(row=>row\.key\)\.join/);
  assert.match(listingRows,/compactNavigation&&rows\.length&&!rows\.some\(row=>current\.has\(row\.key\)\)/);
  assert.match(listingRows,/return new Set\(\[rows\[0\]\.key\]\)/);
  assert.match(listingRows,/\[focusedKey,compactNavigation,rowKeySignature\]/);
});

test("D1284/D1290: focused editor rail shows compact completion marks and returns through the footer",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/className=\{`review-section-state \$\{entry\.done\?"is-done":"is-incomplete"\}`\}/);
  assert.match(nav,/entry\.done\?"✓":"×"/);
  assert.match(nav,/aria-label=\{`\$\{entry\.label\}: \$\{entry\.done\?"complete":"incomplete"\}`\}/);
  assert.doesNotMatch(nav,/Needed|needed/);
  assert.doesNotMatch(nav,/className="review-listing-done"/);
  assert.match(app,/reviewEditing\?<button className="workflow-back"[^>]+onClick=\{\(\)=>openFinishedReview\(false\)\}[\s\S]*?Back to Review/);
  assert.match(css,/\.review-section-state\.is-done\{color:#53bd7c\}/);
  assert.match(css,/\.review-section-state\.is-incomplete\{color:#f06a6a\}/);
});

test("D1290: Review map uses boxed checks and Xs without a visible Needed label",()=>{
  assert.match(review,/section\.ready\?"is-complete":"is-incomplete"/);
  assert.match(review,/section\.ready\?"✓":"×"/);
  assert.doesNotMatch(review,/section\.ready\?"✓":"Needed"/);
  assert.match(theme,/span\.is-incomplete\{color:#a52f3b;background:#fff\}/);
});

test("D1291: completion marks cannot turn green for half-finished content",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/listingPhotoCount=selectedPhotos\.length\+\(draft\.id\?preparedMockupCounts\[draft\.id\]\|\|0:0\)/);
  assert.match(nav,/key:"photos",label:"Listing photos",done:listingPhotoCount>0/);
  assert.match(nav,/key:"title",label:"Title & tags",done:Boolean\(design\.title\.trim\(\)&&design\.tags\.length\)/);
  assert.doesNotMatch(nav,/sizeGuideName[^\n]{0,120}done:/);
  assert.match(review,/const photoCount=\(selections\[draft\.id\]\?\?defaultIndices\)\.length\+\(preparedMockupCounts\[draft\.id\]\|\|0\)/);
  assert.match(review,/photoCount=selectedCount\+mockupCount,sizeGuideReady=/);
  assert.match(review,/label:"Listing photos"[^\n]+ready:photoCount>0/);
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
  assert.match(app,/Download photos to computer/);
  assert.match(css,/\.printify-image-option>\.printify-photo-expand\{right:8px;bottom:42px;width:28px;height:28px;min-width:28px;min-height:28px;border:0;border-radius:0;background:transparent/);
  assert.match(css,/\.focused-review-section \.factory-etsy-details-column \.listing-product-preview\{[^}]*width:140px/);
  assert.match(css,/\.draft-color-grid button span\{[^}]*overflow:visible[^}]*white-space:normal/);
});
