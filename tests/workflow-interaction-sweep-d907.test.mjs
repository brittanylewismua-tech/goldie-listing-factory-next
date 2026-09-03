import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D907: product plus artwork has an obvious way into the draft step",()=>{
  assert.match(app,/workflowStep==="setup"&&<FactoryFooter status=\{setupForwardReady\?"Your product and designs are ready"/);
  assert.match(app,/onClick=\{\(\)=>goToStep\("designs"\)\}/);
  assert.match(app,/setupForwardReady\?"Review draft plan"/);
  assert.doesNotMatch(app,/workflowStep!=="setup"&&complete&&<FactoryFooter/);
});

test("D907: the private-draft action stays in the one persistent action bar",()=>{
  assert.match(app,/<FactoryFooter status=\{running\|\|preparingEtsy\|\|Boolean\(bundleRun\)/);
  assert.match(app,/<button className="launch-button"[\s\S]{0,1200}?onClick=\{createDrafts\}/);
});

test("D907: artwork file actions work for mouse and keyboard",()=>{
  const controls=[...app.matchAll(/<label className="secondary-action"[\s\S]*?<input className="hidden-picker"/g)].map(match=>match[0]);
  assert.ok(controls.length>=1,"generated secondary-side upload actions exist when Printify prepared the side");
  assert.ok(controls.every(control=>/role="button"/.test(control)&&/tabIndex=\{0\}/.test(control)&&/event\.key==="Enter"\|\|event\.key===" "/.test(control)),"no artwork upload action may exist without Enter and Space support");
  assert.match(app,/draft-color-artwork-action[^]*?role="button"[^]*?event\.key==="Enter"\|\|event\.key===" "/,"the focused-color artwork action has the same keyboard behavior");
  assert.match(css,/artwork-version-tools label\.secondary-action:focus-visible\{outline:/);
});

test("D907: workflow copy agrees with the post-draft pricing order",()=>{
  assert.doesNotMatch(app,/confirm the Etsy shipping profile before any Printify drafts are created/);
  assert.doesNotMatch(app,/copies the selected product, enabled variants, artwork placement, approved prices/);
  assert.match(app,/Prices come after the drafts/);
  assert.match(app,/Prices and shipping are reviewed after Printify reports the finished costs/);
});

test("D907: visible counts use singular draft grammar",()=>{
  assert.match(app,/bundleRunDrafts===1\?"draft":"drafts"/);
});

test("D907: compact workflow actions are still real, usable buttons",()=>{
  assert.match(app,/aria-label="Change saved product"/);
  assert.match(css,/\.summary-list div button\{[\s\S]*?min-height:36px/);
  assert.match(css,/\.workflow-footer-actions>\.save-draft-link\{min-height:38px/);
  assert.match(css,/\.workflow-footer-actions \.launch-button\{[\s\S]*?width:auto!important;[\s\S]*?min-height:44px!important;flex:0 0 auto/);
});
