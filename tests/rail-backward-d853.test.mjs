import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D853 · The progress rail refused to go back to a finished step.
   Measured live on the publish step of a real batch: PRODUCT and IMAGES
   enabled, LISTING disabled, all three carrying class "done". Disabled took
   lilac-theme's blanket dimming with it, so the completed step's tick rendered
   grey - a finished step drawn as unfinished, on the screen where she decides
   whether to publish. */

const source = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("a gate only ever blocks a step ahead of the one you are standing on", () => {
  assert.match(source, /const ahead=stagePosition>=0&&position>stagePosition;/);
  assert.match(source, /disabled=\{!active&&ahead&&Boolean\(issues\.length\)\}/);
  assert.doesNotMatch(source, /disabled=\{!active&&Boolean\(issues\.length\)\}/,
    "The undirected gate is what made a finished step unreachable.");
});

test("the rail still keeps its promise in writing", () => {
  /* If this sentence ever goes, the test above is measuring nothing anyone
     was promised. */
  assert.match(source, /You can return to an earlier step without starting over\./);
});

test("the step you are standing on is never disabled — D227", () => {
  /* D227: when drafts failed the rail greyed out Listing while the seller was
     standing on Listing. `!active` still leads the condition. */
  assert.match(source, /disabled=\{!active&&/);
});

test("a blocker says where it lives, not just what it is — D854", () => {
  const gates = readFileSync(new URL("../app/workflow-gates.ts", import.meta.url), "utf8");
  /* Measured on her batch, standing on Images: Next step disabled, all four
     sections ticked complete, and the stated reason - the Etsy shipping
     profile - belonging to the Product step, with nothing on the page to
     click. */
  assert.match(gates, /Choose the Etsy shipping profile on the Product step\./);
  assert.match(gates, /Approve prices and buyer-paid shipping on the Product step\./);
});
