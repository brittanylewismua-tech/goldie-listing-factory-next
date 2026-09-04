import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("the listing batch panel does not repeat Etsy guidance above the real editor", () => {
  const screen = app.slice(app.indexOf("function listingGridScreen()"), app.indexOf("function stepProductCards("));
  assert.doesNotMatch(screen, /\{etsyLead\(\)\}/);
  assert.match(screen, /factory-etsy-details-column/);
});

test("single-listing photo review hides the meaningless apply-to-every-listing action", () => {
  assert.match(app, /showApplyAll=\{drafts\.filter\(item=>item\.status==="Created"\)\.length>1\}/);
  assert.match(app, /showApplyAll\?<button[^>]*>[\s\S]*?Apply these photos to every listing/);
});

test("returning to Product after drafts exist still has a visible continuation", () => {
  assert.match(app, /workflowStep==="setup"&&files\.length>0&&complete&&<FactoryFooter status="Your Printify drafts are ready">/);
  assert.match(app, />Continue to drafts <span>→<\/span>/);
});

test("a restored or sibling product with unfinished final costs blocks final review", () => {
  assert.match(app, /draft\.costReview\?\.required&&!draft\.costReview\.approved/);
  assert.match(app, /Save final prices for/);
  assert.match(app, /Choose at least one photo for/);
  assert.match(app, /Choose an Etsy shipping profile for/);
});
