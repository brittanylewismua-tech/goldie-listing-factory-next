import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {printifyMockupDetails,printifyMockupForColor,printifyVariantIdsForColor} from "../app/printify-color-mockup.ts";

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

test("D969: a current Printify CDN fallback changes the variant, not the blueprint",()=>{
  const broad=[{src:"https://images.printify.com/mockup/6a977424f8329d96f40c1205/12100/92570/front-dark.jpg?camera_label=front",variantIds:[12100,12124],position:"front"}];
  assert.equal(printifyMockupForColor(broad,[12124]),"https://images.printify.com/mockup/6a977424f8329d96f40c1205/12124/92570/front-dark.jpg?camera_label=front");
});

test("D910: footer controls remain visible and aligned",()=>{
  assert.match(css,/workflow-footer-actions>\.workflow-back\{[\s\S]*?height:44px!important/);
  assert.match(css,/factory-footer\.in-bar>\*:not\(small\):disabled\{[\s\S]*?opacity:1/);
});

test("D910: bundle language and one-column listing states tell the truth",()=>{
  assert.match(app,/activeBundle&&bundleRecipes\.length>1\?"Complete each product from top to bottom\.":"Complete each section from top to bottom\."/);
  assert.match(css,/factory-listing-grid:has\(>\.factory-form-card:only-child\)/);
});

test("D911: a broad single Printify image is addressed by the requested color variant",()=>{
  const broad=[{src:"https://images-api.printify.com/mockup/12100/92570/front-dark.jpg",variantIds:[92570,92571,92572],position:"front"}];
  assert.equal(printifyMockupForColor(broad,[92571]),"https://images-api.printify.com/mockup/12100/92571/front-dark.jpg");
  assert.equal(printifyMockupForColor(broad,[92572]),"https://images-api.printify.com/mockup/12100/92572/front-dark.jpg");
});

test("D916: restored batches resolve color variants from raw Printify options",()=>{
  const variants=[
    {id:92570,options:[101,201]},
    {id:92571,options:[102,201]},
    {id:92572,colorId:103,options:[103,201]},
  ];
  assert.deepEqual([...printifyVariantIdsForColor(variants,[101])],[92570]);
  assert.deepEqual([...printifyVariantIdsForColor(variants,[102])],[92571]);
  assert.deepEqual([...printifyVariantIdsForColor(variants,[103])],[92572]);
});

test("D974: a size option id cannot make every colour use the same garment mockup",()=>{
  const variants=[
    {id:12100,colorId:101,options:[101,201]},
    {id:12101,colorId:102,options:[102,101]}, // size id collides with White's colour id
    {id:12102,colorId:103,options:[103,201]},
  ];
  assert.deepEqual([...printifyVariantIdsForColor(variants,[101])],[12100]);
  assert.deepEqual([...printifyVariantIdsForColor(variants,[102])],[12101]);
  assert.deepEqual([...printifyVariantIdsForColor(variants,[103])],[12102]);
});

test("D917: restored drafts recover variant metadata from their saved Printify URLs",()=>{
  const saved=[
    "https://images.printify.com/mockup/6a977424f8329d96f40c1205/12100/92570/front-dark.jpg?camera_label=front",
    "https://images.printify.com/mockup/6a977424f8329d96f40c1205/12124/92570/front-dark.jpg?camera_label=front",
    "https://images.printify.com/mockup/6a977424f8329d96f40c1205/12100/92571/back-dark.jpg?camera_label=back",
  ];
  const details=printifyMockupDetails(saved);
  assert.deepEqual(details.map(item=>item.variantIds),[[12100],[12124],[12100]]);
  assert.equal(printifyMockupForColor(details,[12124]),saved[1]);
  assert.equal(printifyMockupForColor(details,[12100]),saved[0]);
});

test("D911: Step 1 keeps a visible disabled continuation before upload",()=>{
  assert.match(app,/workflowStep==="setup"&&files\.length===0&&!bundleCreationMode&&!productFormMode&&<FactoryFooter status=\{`\$\{missingRequirement\} to continue`\}><button className="workflow-next" type="button" disabled>\{missingRequirement\}<\/button>/);
  assert.match(app,/!productSelected \? "Choose or add a saved product"[\s\S]{0,180}files\.length === 0 \? "Add at least one design"/);
});

test("D911: selected bundles are named and destructive controls meet the target floor",()=>{
  assert.match(app,/bundleSelected\?<button[\s\S]{0,220}>Choose a different bundle<\/button>:<button[\s\S]{0,220}>Choose a different product<\/button>/);
  assert.match(css,/batch-history \.remove-batch\{[\s\S]*?min-height:36px/);
});

test("D911: every action-bar button uses the same 44px box",()=>{
  assert.match(css,/workflow-footer-actions>\.save-draft-link,[\s\S]*?factory-footer\.in-bar>\*:not\(small\)\{[\s\S]*?height:44px!important;min-height:44px!important/);
});
