import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the draft-plan screen names the action that is actually available",()=>{
  assert.match(app,/designs: complete[\s\S]*title: "Finish your Printify drafts"[\s\S]*title: "Create Printify drafts", copy: "Check the products and designs below, then create the drafts\."/);
});

test("future bundle outputs are never labelled as drafts that already exist",()=>{
  assert.match(app,/\$\{bundleRecoveryOnly\?files\.length:requestedListingCount\} drafts to create/);
  assert.doesNotMatch(app,/\$\{requestedListingCount\} private drafts/);
});

test("D1333: the plan and rail describe future drafts and the actual Etsy-draft action",()=>{
  assert.match(app,/`\$\{requestedListingCount\} \$\{requestedListingCount===1\?"draft":"drafts"\} to create`/);
  assert.match(app,/live\?"Ready to save to Etsy Drafts"/);
  assert.doesNotMatch(app,/`\$\{requestedListingCount\} private \$\{requestedListingCount===1\?"draft":"drafts"\}`/);
  assert.doesNotMatch(app,/live\?"Ready to publish"/);
});
