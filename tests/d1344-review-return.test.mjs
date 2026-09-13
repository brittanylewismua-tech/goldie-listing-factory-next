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
  /* PINNED TO A NUMBER, NOT TO ONE RELEASE.

     This asserted the marker still read the exact release it shipped with, so
     every later bump broke four unrelated suites and the fix was to retype the
     number in each. The guarantee that was wanted is "the marker moved past
     this release and never went backwards", which is a comparison, so it is
     written as one and never needs touching again. */
  const shipped = Number(/BUILD_MARKER = "D(\d+)"/.exec(marker)?.[1]);
  assert.ok(shipped >= 1344, `build marker is D${shipped}, expected D1344 or later`);
});
