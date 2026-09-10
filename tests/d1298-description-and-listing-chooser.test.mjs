import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync("app/listing-factory-app.tsx","utf8");
const css=readFileSync("app/interface-v2.css","utf8");

test("D1298: descriptions for every listing stay together and remain visually identifiable",()=>{
  assert.match(app,/focusedSection==="description"\?descriptionRows\(undefined,true\)/);
  assert.match(app,/function descriptionRows\(only\?:DesignFile,openAll=false\)/);
  assert.match(app,/descriptionFlags,only,openAll/);
  assert.match(app,/Descriptions for every listing/);
  assert.match(app,/aria-label=\{`Description for listing \$\{files\.findIndex/);
  assert.match(app,/current==="title"\|\|current==="description"/);
  assert.match(app,/focused-review-all-listings/);
  assert.match(css,/\.focused-review-all-listings \.listing-card-preview\{display:block;width:176px;height:176px/);
});

test("D1298: single-listing sections use a scalable visual chooser",()=>{
  const nav=app.slice(app.indexOf("function reviewListingSectionNav"),app.indexOf("function rememberReviewEditor"));
  assert.match(nav,/className="review-listing-chooser"/);
  assert.match(nav,/className="review-listing-choices"/);
  assert.match(nav,/className="review-listing-choice-thumb"/);
  assert.match(nav,/aria-label=\{`Open listing \$\{index\+1\}: \$\{title\}`\}/);
  assert.match(nav,/files\.map\(\(candidate,index\)=>/);
  assert.doesNotMatch(nav,/<select aria-label="Jump to listing"/);
  assert.match(css,/\.review-listing-choices\{[^}]*max-height:290px;overflow:auto/);
});

test("D1298: photo download action uses the requested plain label",()=>{
  assert.match(app,/Download photos to computer <em>Optional<\/em>/);
  assert.match(app,/"Download photos to computer"/);
  assert.doesNotMatch(app,/Download this listing’s photos|Download photos to your computer/);
});
