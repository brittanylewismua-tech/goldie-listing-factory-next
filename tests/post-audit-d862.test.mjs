import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../app/goldie-ui.tsx",import.meta.url),"utf8");
const v2=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const clarity=fs.readFileSync(new URL("../app/clarity-pass.css",import.meta.url),"utf8");

test("D862: workflow changes reset the pane that actually scrolls",()=>{
  assert.match(app,/function scrollFactoryToTop\(\)\{document\.querySelector<HTMLElement>\("\.factory-main"\)\?\.scrollTo/);
  assert.match(app,/useEffect\(\(\)=>\{scrollFactoryToTop\(\)\},\[workflowStep,finishPhase\]\)/);
  assert.doesNotMatch(app,/\[workflowStep,finishPhase\]\);?\s*useEffect\(\(\)=>\{window\.scrollTo/);
});

test("D862: requirements gate forward movement, never review of an earlier stage",()=>{
  assert.match(app,/const movingBackward=targetStage>=0&&targetStage<stagePosition/);
  assert.match(app,/if\(!movingBackward\)\{const issues=requiredForProgress\(index\)/);
  assert.match(app,/goToStep\("setup",false,movingBackward\)/);
  assert.match(app,/goToStep\("designs",false,movingBackward\)/);
});

test("D862: a bundle receipt only calls every product complete when every product has published",()=>{
  assert.match(app,/bundleRecipes\.every\(\(recipe,index\)=>index===bundleIndex\?Number\(batchReceipt\?\.publishedCount\)>0:Number\(bundleBatchSummary\[recipe\.id\]\?\.published\)>0\)/);
  assert.doesNotMatch(app,/bundleComplete=\{Boolean\(activeBundle&&bundleIndex===bundleRecipes\.length-1\)\}/);
});

test("D862: removed mockup generation is absent from seller-facing workflow copy",()=>{
  assert.doesNotMatch(app,/photos and mockups|ready for photos and mockups/i);
  assert.doesNotMatch(ui,/mockups prepared|mockupCount/);
  assert.match(ui,/Etsy \{receipt\.publishedCount===1\?"listing":"listings"\} published/);
});

test("D862: laptop layout reflows at full scale with usable controls",()=>{
  assert.doesNotMatch(clarity,/@media\(max-width:\d+px\)\{html\{zoom:/);
  assert.match(v2,/@media\(min-width:821px\) and \(max-width:1179px\)\{[\s\S]*html\{zoom:1!important\}[\s\S]*body\{min-width:0!important\}[\s\S]*grid-template-columns:240px minmax\(0,1fr\)/);
  assert.match(v2,/\.factory-listing-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(v2,/\.context-help-trigger\{width:36px;height:36px/);
  assert.match(v2,/\.bank-keyword-toggle,[\s\S]*\.bank-grid \.edit-bank\{min-height:36px\}/);
});

