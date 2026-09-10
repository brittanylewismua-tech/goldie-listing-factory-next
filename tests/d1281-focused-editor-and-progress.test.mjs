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

test("D1283: inline draft progress shows a real percentage with its spinner",()=>{
  assert.match(app,/className="progress-ring" aria-hidden="true"\/\>/);
  assert.match(app,/className="progress-track" role="progressbar" aria-label="Printify drafts created"/);
  assert.match(app,/aria-valuenow=\{runTotal\?Math\.min\(100,Math\.round\(processed\/runTotal\*100\)\):0\}/);
  assert.match(app,/aria-valuetext=\{`\$\{processed\} of \$\{runTotal\} drafts created`\}/);
  assert.match(app,/<b>\{runTotal\?Math\.min\(100,Math\.round\(processed\/runTotal\*100\)\):0\}%<\/b>/);
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
