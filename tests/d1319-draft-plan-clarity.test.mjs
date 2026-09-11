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

test("D1334: help, gates, and owner diagnostics use the current product language",()=>{
  assert.match(app,/total drafts to create/);
  assert.match(app,/Create at least one Printify draft before continuing\./);
  assert.match(app,/aria-label="Open Listing Factory diagnostics" title="Listing Factory diagnostics"/);
  assert.doesNotMatch(app,/total private drafts in this run/);
  assert.doesNotMatch(app,/created successfully before publishing/);
  assert.doesNotMatch(app,/Open Goldie Diagnostics/);
});
