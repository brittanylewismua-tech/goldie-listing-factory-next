import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {printifyMockupForColor} from "../app/printify-color-mockup.ts";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D910: a returned Step 1 and a finished Step 2 each render one footer source",()=>{
  assert.match(app,/workflowStep==="designs"&&<FactoryFooter status=\{running/);
  assert.match(app,/\{!\(complete&&workflowStep==="designs"\)&&<div className="workflow-footer-actions">/);
  assert.match(app,/\{complete && workflowStep==="designs" && <div className="workflow-footer-actions post-draft-footer">/);
});

test("D910: a broad Printify fallback cannot hide color-specific mockups",()=>{
  const images=[
    {src:"https://images.example/92570/front-dark.jpg",variantIds:[11,12,21,22],position:"front"},
    {src:"https://images.example/11/front.jpg",variantIds:[11,12],position:"front"},
    {src:"https://images.example/21/front.jpg",variantIds:[21,22],position:"front"},
  ];
  assert.equal(printifyMockupForColor(images,[11,12]),images[1].src);
  assert.equal(printifyMockupForColor(images,[21,22]),images[2].src);
});

test("D910: footer controls remain visible and aligned",()=>{
  assert.match(css,/workflow-footer-actions>\.workflow-back\{[\s\S]*?height:44px!important/);
  assert.match(css,/factory-footer\.in-bar>\*:not\(small\):disabled\{[\s\S]*?opacity:1/);
});

test("D910: bundle language and one-column listing states tell the truth",()=>{
  assert.match(app,/activeBundle\?"Your bundle":"Your product"/);
  assert.match(css,/factory-listing-grid:has\(>\.factory-form-card:only-child\)/);
});

test("D911: a broad single Printify image is addressed by the requested color variant",()=>{
  const broad=[{src:"https://images-api.printify.com/mockup/12100/92570/front-dark.jpg",variantIds:[92570,92571,92572],position:"front"}];
  assert.equal(printifyMockupForColor(broad,[92571]),"https://images-api.printify.com/mockup/12100/92571/front-dark.jpg");
  assert.equal(printifyMockupForColor(broad,[92572]),"https://images-api.printify.com/mockup/12100/92572/front-dark.jpg");
});

test("D911: Step 1 keeps a visible disabled continuation before upload",()=>{
  assert.match(app,/workflowStep==="setup"&&files\.length===0&&<FactoryFooter status="Add at least one design to continue"><button className="workflow-next" type="button" disabled>Add at least one design<\/button>/);
});

test("D911: selected bundles are named and destructive controls meet the target floor",()=>{
  assert.match(app,/bundleSelected\?<button[\s\S]{0,220}>Choose a different bundle<\/button>:<button[\s\S]{0,220}>Choose a different product<\/button>/);
  assert.match(css,/batch-history \.remove-batch\{[\s\S]*?min-height:36px/);
});

test("D911: every action-bar button uses the same 44px box",()=>{
  assert.match(css,/workflow-footer-actions>\.save-draft-link,[\s\S]*?factory-footer\.in-bar>\*:not\(small\)\{[\s\S]*?height:44px!important;min-height:44px!important/);
});
