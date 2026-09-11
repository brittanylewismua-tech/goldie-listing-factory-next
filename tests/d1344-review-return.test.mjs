import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const marker = readFileSync(new URL("../app/build-marker.ts", import.meta.url), "utf8");

test("review editors return leftward from the left side of the footer", () => {
  const controls = app.match(/className="workflow-back review-return"/g) ?? [];
  assert.equal(controls.length, 2);
  assert.match(app, /<span aria-hidden="true">←<\/span> Back to Review<\/button>/);
  assert.doesNotMatch(app, /Back to Review <span aria-hidden="true">→<\/span>/);
  assert.match(css, /\.workflow-footer-actions>\.review-return\{[\s\S]*?margin:0 auto 5px 0!important/);
  assert.match(marker, /BUILD_MARKER = "D1344"/);
});
