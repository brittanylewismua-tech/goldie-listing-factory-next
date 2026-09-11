import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1238: the three-step rail names the job each stage performs",()=>{
  assert.match(app,/\{label:"Setup",index:1,title:"Choose a product and add designs"/);
  assert.match(app,/\{label:"Designs",index:2,title:"Add designs and create drafts"/);
  assert.match(app,/\{label:"Review",index:8,title:"Review and finish listings"/);
});

test("D943: moving from Product cannot claim it creates drafts",()=>{
  assert.match(app,/setupForwardReady\?"Review draft plan"/);
  assert.match(app,/activeBundle&&bundleRecipes\.length>1&&!bundleRecoveryOnly\?`Create drafts for all/);
  assert.match(app,/:`Create \$\{files\.length\} \$\{files\.length===1\?"Printify draft":"Printify drafts"\}`/);
  assert.doesNotMatch(app,/setupForwardReady\?"Continue to create drafts"/);
});

test("D949: Step 2 names the immediate task without another review layer",()=>{
  assert.match(app,/designs: complete[\s\S]*title: "Finish your Printify drafts"[\s\S]*Check artwork, colors, sizes, pricing, shipping, and listing photos/);
  assert.match(app,/title: "Create Printify drafts", copy: "Check the products and designs below, then create the drafts\."/);
});

test("D943: bundle summaries count the whole run",()=>{
  assert.match(app,/bundleRunDrafts=activeBundle&&bundleRecipes\.length>1&&!bundleRecoveryOnly[\s\S]*bundleBatchSummary\[recipe\.id\]\?\.drafts/);
  assert.match(app,/bundleRunListings=activeBundle&&bundleRecipes\.length>1&&!bundleRecoveryOnly\?requestedListingCount:files\.length/);
  assert.match(app,/runCountLabel=activeBundle&&bundleRecipes\.length>1&&!bundleRecoveryOnly\?`\$\{bundleRunListings\}.*\$\{bundleRecipes\.length\} products`/);
});

test("D943: restored work never claims it will publish automatically",()=>{
  assert.match(app,/restored and can still be finished here/);
  assert.doesNotMatch(app,/restored and can still be completed and published/);
});

test("D943: every post-draft panel uses a plain-language task name",()=>{
  for(const label of ["Product colors","Artwork placement","Listing photos"]){
    assert.match(app,new RegExp(`label:"${label}"`));
  }
  assert.match(app,/title=\{activeBundle\?"Titles for this product":"Titles for this batch"\}/);
});

test("D943: the Drafts help explains the screen that is actually open",()=>{
  assert.match(app,/const workflowHelp=workflowStep==="designs"[\s\S]*title:"Finish your Printify drafts"[\s\S]*:WORKFLOW_HELP\[3\]/);
  assert.match(app,/Open detailed help for \$\{workflowHero\.title\}/);
  assert.match(app,/title=\{workflowHelp\.title\} intro=\{workflowHelp\.intro\} sections=\{workflowHelp\.sections\}/);
});
