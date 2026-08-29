import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync("app/listing-factory-app.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/interface-v2.css", "utf8");

const required = [
  "GoldieWordmark", "Batch History", "Keyword Banks", "Usage + Plan",
  "Connections", "workflow-restart-button", "sidebarUsage", "listingGoal",
  "etsy-api-disclosure", "approved-powered", "account-link", "ContextHelp",
  "SupportChat", "workflow-footer-actions", "restoreNotice", "resumeChoices",
  "activeBundle", "bundleBatchIds", "saveBatchFiles", "pricingApproved",
  "etsyShippingProfileId", "printifyImageSelections", "sizeGuideName",
  "ListingPhotoOrder", "createdListingsMissingImages", "publishBlockers",
  "byProduct", "publishRun", "publishFailures", "batchReceipt",
];

test("interface v2 keeps the production capability inventory", () => {
  for (const capability of required) {
    assert.ok(app.includes(capability), `missing preserved capability: ${capability}`);
  }
});

test("interface v2 is a scoped presentation layer with one-step rollback", () => {
  assert.match(app, /className="app-shell interface-v2"/);
  assert.match(layout, /import "\.\/interface-v2\.css"/);
  assert.match(css, /\.app-shell\.interface-v2/);
  assert.doesNotMatch(css, /display\s*:\s*none[^}]*!(?:important)?[^}]*\b(ContextHelp|SupportChat|approved-sidebar-footer)\b/i);
});

test("the removed generated-mockup UI is not revived by the migration", () => {
  assert.doesNotMatch(css, /mockup-library|scene-picker|integrated-mockups/i);
});
