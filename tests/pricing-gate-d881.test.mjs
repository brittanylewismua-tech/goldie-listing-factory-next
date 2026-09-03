import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D881 · The finished-cost gate blocked correctly and could never be released.
   Three independent faults stacked, found by walking the deployed D880 build:
   the stage holding the control was hidden, an entrance animation pinned it
   invisible, and the approve handler threw before it made a request. Each is
   pinned here because each alone was enough to strand a seller. */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const bounded = read("app/bounded-work.ts");
const approved = read("app/approved-functional.css");
const globals = read("app/globals.css");
const v2 = read("app/interface-v2.css");
const app = read("app/listing-factory-app.tsx");

test("runBounded tolerates the three-argument call that broke the gate", () => {
  assert.match(bounded, /onComplete\?: \(result: R\) => void \| Promise<void>/,
    "onComplete must be optional");
  assert.match(bounded, /if \(onComplete\) await onComplete\(result\)/,
    "and guarded at the call, or a three-arg caller throws mid-flight");
  assert.doesNotMatch(bounded, /^\s*await onComplete\(result\);/m);
});

test("the cost approval still calls runBounded without an onComplete", () => {
  /* Not a mistake to correct at the call site: it has nothing to do per
     result. This asserts the shape the guard above exists to support, so the
     guard is not quietly removed later as dead code. */
  const call = app.slice(app.indexOf("approveActualPricingGroup(group:"));
  assert.match(call.slice(0, 900), /runBounded\(group\.drafts\.filter\(draft=>!draft\.costReview\?\.approved\),2,async draft=>/);
});

test("the post-draft stage is only hidden when it holds nothing a seller needs", () => {
  assert.match(approved,
    /\.workspace\.mockup-workspace \.workflow-stage:not\(:has\(\.actual-cost-review,\.retry-button\)\)\{display:none!important\}/,
    "the cost approval and the failed-draft retry both live in this stage");
  assert.doesNotMatch(approved,
    /\.workspace\.mockup-workspace \.workflow-stage\{display:none!important\}/,
    "the unconditional hide is gone, not merely overridden");
});

test("no entrance animation can leave required content invisible", () => {
  assert.match(globals, /@keyframes workflow-in\{from\{transform:translateY\(8px\)\}to\{transform:none\}/);
  assert.doesNotMatch(globals, /@keyframes workflow-in\{from\{opacity:0/,
    "a stranded animation pinned the panel at opacity 0 and inline opacity lost to it");
});

test("the assignment matrix is a full-width workspace, not a 282px caption", () => {
  assert.match(v2, /\.design-upload-review:has\(\.artwork-version-tools\)\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(v2, /\.design-artwork-card:has\(\.artwork-version-tools\)>\.design-artwork-primary\{[\s\S]*?grid-template-columns:76px minmax\(0,1fr\) auto/,
    "the collapsed 0px middle track is what made the filename overprint the copy");
  assert.doesNotMatch(approved,/\.design-upload-review article\{[^}]*grid-template-columns/,
    "the legacy thumbnail-row grid must not turn the full artwork card into three columns");
  assert.doesNotMatch(approved,/\.design-upload-review img\{[^}]*!important/,
    "legacy image sizing must not override the component's own preview geometry");
  assert.match(v2, /\.artwork-assignment-matrix select\{width:100%;text-overflow:ellipsis\}/);
});

test("artwork actions use the workflow's button hierarchy instead of bare links", () => {
  assert.match(v2,/\.artwork-version-tools label\.secondary-action\{[\s\S]*?border:1px solid #d8ccd4[\s\S]*?border-radius:10px[\s\S]*?text-decoration:none/);
  assert.match(v2,/label\.secondary-action\{border-color:#111;background:#111;color:#fff;box-shadow:none/);
  assert.match(v2,/\.design-artwork-primary>\.artwork-remove-action\{[\s\S]*?border:1px solid #e3b9c5[\s\S]*?color:#9b3d55[\s\S]*?text-decoration:none/);
});

test("the release control reads as a press", () => {
  assert.match(v2, /\.actual-cost-review button\{[\s\S]*?background:linear-gradient\(145deg,#ff6ecd,#f52fb2\)/);
  assert.match(v2, /\.actual-cost-review button:disabled\{/);
});
