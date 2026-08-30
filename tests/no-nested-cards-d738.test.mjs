import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

/* D738 · A card inside a card inside a card.

   The prototype gives a section exactly one frame: the panel. The old shell
   wrapped everything in its own — so once the panels were migrated, every
   screen grew a second and sometimes a third frame inside the first. Found by
   eye on step 1 (.step-card inside .factory-panel-body), then again on step 2
   (.listing-photo-order, a 2px border and 22px of padding inside a panel that
   already has 18), then again on step 4 (.final-listing-review, and
   .publish-live-warning's pale panel inside the dark publish box, which made
   the fee warning pale-on-pale).

   Three times is a rule, not three bugs. Anything interface-v2 renders inside
   a panel body, a review list or a photo column must be flat: the frame
   belongs to the container. */

const SHEETS = ["globals","factory-navigation","theme","lilac-theme","approved-functional","management-aesthetic","clarity-pass","interface-v2"];
const CONTAINERS = ["factory-panel-body", "factory-review-list", "factory-photo-column", "factory-publish-box"];

/* Children that legitimately carry their own frame: the components the
   prototype itself draws as cards inside a section. */
const CARDS = /factory-art-card|factory-form-card|factory-checklist-card|recipe-tile|final-listing-card|final-design-group|final-select-all|factory-photo|photo-order-strip|connection-row|factory-design-large|recipe-icon|factory-art-preview/;

const rules = [];
for (const name of SHEETS) {
  postcss.parse(readFileSync(new URL(`../app/${name}.css`, import.meta.url), "utf8")).walkRules(rule => {
    const declarations = {};
    rule.walkDecls(decl => { declarations[decl.prop] = decl.value; });
    for (const selector of rule.selectors) rules.push({ sheet: name, selector, declarations });
  });
}

test("nothing draws a second frame inside a panel, a review list or the publish box", () => {
  const offenders = [];
  for (const { sheet, selector, declarations } of rules) {
    /* The container's own rule is the frame; it is what everything inside it
       must not repeat. */
    const inside = CONTAINERS.some(container =>
      selector.includes(container) && !selector.trim().endsWith(container));
    if (!inside) continue;
    if (CARDS.test(selector)) continue;
    /* A frame is a background AND an edge - a tint on its own is not a card. */
    const paints = /background|background-color|background-image/.test(Object.keys(declarations).join(" "))
      && Object.entries(declarations).some(([prop, value]) =>
        /^background(-color|-image)?$/.test(prop) && !/none|transparent|initial|inherit/.test(value));
    const edged = ["border", "border-radius", "box-shadow"].some(prop =>
      declarations[prop] && !/^(0|none)/.test(declarations[prop]));
    if (paints && edged) offenders.push(`${sheet}: ${selector}`);
  }
  assert.deepEqual(offenders, [], `a second frame inside a container that is already the frame:\n${offenders.join("\n")}`);
});
