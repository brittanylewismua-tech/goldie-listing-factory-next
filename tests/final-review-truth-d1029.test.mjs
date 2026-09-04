import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const rows = fs.readFileSync(new URL("../app/listing-rows.tsx", import.meta.url), "utf8");

test("saved product defaults cannot override an unfinished finished-cost review", () => {
  assert.match(app, /const unfinished=drafts\.some\(draft=>draft\.status==="Created"&&draft\.costReview\?\.required&&!draft\.costReview\.approved\)/);
  assert.match(app, /if\(carries&&!unfinished&&!pricingApproved/);
});

test("bundle approval uses the active product's real approval and loaded sibling drafts", () => {
  assert.match(app, /recipe\.id===activeRecipe\?\.id\?pricingApproved:\(bundleApproved\[recipe\.id\]\?\?false\)/);
  assert.match(app, /created\.every\(draft=>!draft\.costReview\?\.required\|\|draft\.costReview\.approved\)/);
  assert.match(app, /bundlePricingReady&&etsyShippingSelectionReady\(\)/);
});

test("the sibling approval effect is declared after the sibling state it reads", () => {
  assert.ok(app.indexOf("const [bundleMembers,setBundleMembers]") < app.indexOf("const member=bundleMembers[recipe.id]"));
});

test("the Printify handoff validates every bundle draft, not retired publish selections", () => {
  const handoff = app.slice(app.indexOf("function handoffBlockers()"), app.indexOf("function suggestedBatchName()"));
  assert.match(handoff, /bundlePublishDrafts\(\)\.filter\(draft=>draft\.status==="Created"\)/);
  assert.match(handoff, /runProductGaps\(\)/);
  assert.match(handoff, /createdListingsMissingImages\(all\)/);
});

test("a one-listing editor does not repeat a one-listing summary bar", () => {
  assert.match(rows, /\{rows\.length>1&&<div className="listing-rows-bar">/);
});
