import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D943: the four-step rail names the job each stage performs",()=>{
  assert.match(app,/\{label:"Product",index:1,title:"Choose product"/);
  assert.match(app,/\{label:"Drafts",index:2,title:"Create and finish drafts"/);
  assert.match(app,/\{label:"Listing",index:5,title:"Titles \+ Etsy details"/);
  assert.match(app,/\{label:"Finish",index:8,title:"Review \+ finish"/);
});

test("D943: moving from Product cannot claim it creates drafts",()=>{
  assert.match(app,/setupForwardReady\?"Review draft plan"/);
  assert.match(app,/activeBundle&&bundleRecipes\.length>1\?`Create drafts for all/);
  assert.match(app,/:"Create Printify drafts"/);
  assert.doesNotMatch(app,/setupForwardReady\?"Continue to create drafts"/);
});

test("D949: Step 2 names the immediate task without another review layer",()=>{
  assert.match(app,/designs: complete[\s\S]*title: "Finish your Printify drafts"[\s\S]*confirm colors, sizes, placement, pricing, shipping, and listing photos/);
  assert.match(app,/title: "Add your designs", copy: "Upload the artwork for this batch\."/);
});

test("D943: bundle summaries count the whole run",()=>{
  assert.match(app,/bundleRunDrafts=activeBundle&&bundleRecipes\.length>1[\s\S]*bundleBatchSummary\[recipe\.id\]\?\.drafts/);
  assert.match(app,/bundleRunListings=activeBundle&&bundleRecipes\.length>1\?requestedListingCount:files\.length/);
  assert.match(app,/runCountLabel=activeBundle&&bundleRecipes\.length>1\?`\$\{bundleRunListings\}.*\$\{bundleRecipes\.length\} products`/);
});

test("D943: restored work never claims Goldie will publish it",()=>{
  assert.match(app,/restored and can still be finished in Goldie/);
  assert.doesNotMatch(app,/restored and can still be completed and published/);
});

test("D943: every post-draft panel uses a plain-language task name",()=>{
  for(const label of ["Product colors","Artwork placement","Product photos","Size guide","Final photo order"]){
    assert.match(app,new RegExp(`label:"${label}"`));
  }
  assert.match(app,/title="Titles for this batch"/);
});

test("D943: the Drafts help explains the screen that is actually open",()=>{
  assert.match(app,/const workflowHelp=workflowStep==="designs"[\s\S]*title:"Finish your Printify drafts"[\s\S]*:WORKFLOW_HELP\[3\]/);
  assert.match(app,/Open detailed help for \$\{workflowHero\.title\}/);
  assert.match(app,/title=\{workflowHelp\.title\} intro=\{workflowHelp\.intro\} sections=\{workflowHelp\.sections\}/);
});
