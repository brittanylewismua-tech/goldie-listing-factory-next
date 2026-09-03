import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D954: internal workflow actions use a flat black face",()=>{
  const start=css.indexOf("/* D945");
  assert.ok(start>0,"the workflow action hierarchy must have one named owner");
  const block=css.slice(start);
  for(const selector of [
    ".launch-button",".workflow-next",".save-recipe",".publish-all-button",
    ".pricing-approval-button",".actual-cost-review button",".support-chat-form button"
  ]) assert.ok(block.includes(selector),`${selector} must use the shared primary-action treatment`);
  assert.match(block,/background:#0d0b0c!important;\s*color:#fff!important;\s*box-shadow:none!important/);
  assert.match(block,/\.recipe-card \.recipe-tile \.recipe-use em\{[\s\S]*?background:#0d0b0c!important;[\s\S]*?box-shadow:none!important/);
});

test("D945: disabled actions remain visibly disabled instead of hot pink",()=>{
  const block=css.slice(css.indexOf("/* D945"));
  assert.match(block,/:disabled\{[\s\S]*?background:#eee9ec!important;[\s\S]*?color:#9b8e96!important;[\s\S]*?box-shadow:4px 4px 0 #f2dce9!important/);
});

test("D945: destructive and selected-state controls are not swallowed by the primary action rule",()=>{
  const block=css.slice(css.indexOf("/* D945"));
  assert.doesNotMatch(block,/\.confirm-action-go(?!:not\(\.destructive\))/);
  assert.doesNotMatch(block,/\.bundle-quality-review button\.selected/);
  assert.doesNotMatch(block,/\.color-choice-grid button\.selected/);
});
