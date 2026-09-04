import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const screen = app.slice(app.indexOf("function listingGridScreen()"), app.indexOf("function stepProductCards("));

test("listing screen renders Etsy details once in the former checklist column", () => {
  assert.doesNotMatch(screen, /RequiredDetailsChecklist/);
  assert.doesNotMatch(screen, /\{etsyRows\(design\)\}[\s\S]*<\/div>\s*<RequiredDetailsChecklist/);
  assert.match(screen, /<div className="factory-etsy-details-column">\{etsyRows\(design\)\}<\/div>/);
  assert.equal((screen.match(/\{etsyRows\(design\)\}/g) || []).length, 1);
});
