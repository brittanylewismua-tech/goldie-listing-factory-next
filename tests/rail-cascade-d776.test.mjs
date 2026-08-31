import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import postcss from "postcss";

/* D776c · The rail's underline and its segment height, resolved the way a
   browser resolves them - across every stylesheet in load order - rather than
   asserted about one file.

   Both had already been fixed once and both came back, because the rules that
   beat them live in sheets interface-v2.css cannot see. The underline lost to a
   plain `display:none` on `button:not(:last-of-type):after`: no !important, no
   media query, just a legacy connector rule that happened to match steps 1
   through 3 - which is where the seller usually stands. It looked fixed on
   Publish and nowhere else, which is exactly the kind of thing a screenshot of
   one screen will pass.

   The segment height came back the same way: a `padding-top:12px!important` in
   a min-width block ran the segment to 49px against the prototype's 37 and
   dropped the whole rail down the page. */

const LOAD_ORDER = [
  "globals.css",
  "factory-navigation.css",
  "theme.css",
  "lilac-theme.css",
  "approved-functional.css",
  "management-aesthetic.css",
  "clarity-pass.css",
  "interface-v2.css",
];

/* Specificity, counted the way the spec counts it: ids, then classes and
   attribute and pseudo-class selectors, then elements and pseudo-elements.
   :not() contributes its argument's specificity, not its own. */
function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let elements = 0;
  const stripped = selector.replace(/::?(after|before|first-line|first-letter)/g, () => {
    elements += 1;
    return "";
  });
  for (const _ of stripped.matchAll(/#[\w-]+/g)) ids += 1;
  for (const match of stripped.matchAll(/:not\(([^)]*)\)/g)) {
    for (const _ of match[1].matchAll(/\.[\w-]+/g)) classes += 1;
    for (const _ of match[1].matchAll(/(^|[\s>+~,])([a-z][\w-]*)/g)) elements += 1;
  }
  const withoutNot = stripped.replace(/:not\([^)]*\)/g, "");
  for (const _ of withoutNot.matchAll(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g)) classes += 1;
  for (const _ of withoutNot.matchAll(/(^|[\s>+~(])([a-z][\w-]*)/g)) elements += 1;
  return [ids, classes, elements];
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/* The winner among every declaration that could apply to the element, ordered
   by !important, then specificity, then load order. Narrow-viewport blocks are
   excluded: this asserts the desktop rail. */
function resolve({ selectorTest, property }) {
  const properties = Array.isArray(property) ? property : [property];
  const candidates = [];
  LOAD_ORDER.forEach((file, fileIndex) => {
    const css = fs.readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8");
    postcss.parse(css).walkRules(rule => {
      const media = rule.parent.type === "atrule" ? rule.parent.params : "";
      if (/max-width/.test(media)) return;
      rule.selectors.forEach(raw => {
        const selector = raw.replace(/\s+/g, " ").trim();
        if (!selectorTest(selector)) return;
        rule.nodes
          .filter(node => node.type === "decl" && properties.includes(node.prop))
          .forEach(decl => {
            candidates.push({
              file,
              line: decl.source.start.line,
              selector,
              value: decl.value.replace(/\s+/g, " ").trim(),
              important: decl.important === true,
              specificity: specificity(selector),
              fileIndex,
            });
          });
      });
    });
  });
  candidates.sort((a, b) =>
    Number(a.important) - Number(b.important)
    || compare(a.specificity, b.specificity)
    || a.fileIndex - b.fileIndex
    || a.line - b.line);
  return candidates[candidates.length - 1] || null;
}

test("D776c: the rail keeps the prototype's underline and segment height", () => {
  const faults = [];

  /* Anything that would hide the ::after on the step the seller is standing on.
     :not(.active) rules cannot match it, and .start-new-batch is a different
     control that lives in the same nav. */
  const underline = resolve({
    selectorTest: selector =>
      /progress/.test(selector)
      && /after/.test(selector)
      && !/:not\(\.active\)/.test(selector)
      && !/start-new-batch/.test(selector),
    property: "display",
  });
  if (underline && underline.value === "none") {
    faults.push(`the current step's underline resolves to display:none from ${underline.file}:${underline.line} (${underline.selector})`);
  }

  const padding = resolve({
    selectorTest: selector =>
      /progress/.test(selector)
      && /button/.test(selector)
      && !/(after|before|span|em\b|small|\bb\b)/.test(selector),
    property: ["padding", "padding-top"],
  });
  const resolved = padding ? padding.value : "unset";
  if (resolved !== "0 4px 15px") {
    faults.push(`rail segment padding resolves to "${resolved}" from ${padding ? `${padding.file}:${padding.line}` : "nowhere"}, not the prototype's 0 4px 15px - the segment measures 37px tall there`);
  }

  assert.deepStrictEqual(faults, []);
});

test("D778: every footer bar has a slot for the step's forward action", async () => {
  const app = await fs.promises.readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const footer = await fs.promises.readFile(new URL("../app/factory-footer.tsx", import.meta.url), "utf8");

  /* Once the Printify drafts exist, step 2 swaps its bar for .post-draft-footer
     and leaves the ordinary one in the tree, hidden. Both need a slot, or the
     step's footer portals into whichever one happens to come first in the
     document - which on step 2 was the hidden one, leaving the bar the seller
     could see with Back, "Saved automatically", "Save as draft", and no way
     forward at all. */
  const bars = [...app.matchAll(/className="workflow-footer-actions[^"]*"/g)];
  assert.ok(bars.length >= 2, "expected more than one footer bar to exist");

  const slots = [...app.matchAll(/className="factory-footer-slot"/g)];
  assert.equal(slots.length, bars.length,
    `${bars.length} footer bars but ${slots.length} slots - a bar without a slot shows no way forward`);

  /* And the portal has to choose the bar that is actually laid out, not the
     first one in the document. */
  assert.match(footer, /offsetParent !== null/,
    "FactoryFooter must pick the slot inside a bar that is actually rendered");
});

test("D780: nothing in the work column is centred, and the final review is not a card", () => {
  const faults = [];

  /* The prototype centres no text in the work column on any screen. */
  const heading = resolve({
    /* the heading row itself - not .done-mark inside it, which is right-aligned
       on purpose so a wrapping bundle name keeps its count against the edge */
    selectorTest: selector => /final-review/.test(selector) && /\.step-heading$/.test(selector),
    property: "text-align",
  });
  if (!heading || heading.value !== "left") {
    faults.push(`the final review's heading resolves to text-align:${heading ? heading.value : "unset"} from ${heading ? `${heading.file}:${heading.line}` : "nowhere"}`);
  }

  /* And it is the screen, not a card sitting inside the pane holding more
     cards - the review list and the publish box are the cards. */
  for (const property of ["background", "border", "box-shadow"]) {
    const winner = resolve({
      selectorTest: selector => /\.step-card\.final-review$/.test(selector),
      property,
    });
    if (!winner || !/^(none|0)$/.test(winner.value)) {
      faults.push(`.step-card.final-review resolves to ${property}:${winner ? winner.value : "unset"} - it should carry no card chrome of its own`);
    }
  }

  assert.deepStrictEqual(faults, []);
});

test("D789: the product wrapper carries no card of its own", () => {
  /* Seven times she asked why the rows were still attached on one card. Six of
     those times the answer was that .batch-product-card still had a background,
     an edge, a radius and a shadow, with every panel inside it carrying the
     same again. The seventh time the answer was worse: D781's commit message
     described the fix and the rule was never written to the file. I had proved
     it by injecting CSS into a browser tab and reported from that.

     So this resolves the real cascade. It is not checking that some rule exists
     somewhere; it is checking what the wrapper actually computes to. */
  const faults = [];
  const bare = { background: /^(none|0)$/, border: /^0$/, "border-radius": /^0$/, "box-shadow": /^none$/ };
  for (const [property, expected] of Object.entries(bare)) {
    const winner = resolve({
      selectorTest: selector => /\.batch-product-card$/.test(selector),
      property,
    });
    if (!winner || !expected.test(winner.value)) {
      faults.push(`.batch-product-card resolves to ${property}:${winner ? winner.value : "unset"} — a wrapper is not a card`);
    }
  }
  /* D790 · And the product identity above them is a heading, not a card
     either. D789 gave the strip its own card; she was clear that the product
     should read as a compact heading over independent panels, so the only
     thing that may carry card chrome on this step is a panel. */
  const strip = resolve({
    selectorTest: selector => /\.batch-product-card > header$/.test(selector),
    property: "background",
  });
  if (!strip || strip.value !== "none") {
    faults.push(`the product identity resolves to background:${strip ? strip.value : "unset"} — it is a heading, not a card`);
  }
  assert.deepStrictEqual(faults, []);
});

test("D792: the panel head is one row — every child has a column of its own", () => {
  /* Twice now an item has been dropped into a grid column that already had
     something in it, and auto-placement has quietly moved it to a new row below
     the fold: the action bar's forward control at y761 in a 756px window, and
     the panel chevron under the state chip with every panel 92px instead of 66.
     Neither showed up in any test, because every rule involved was present and
     correct on its own.

     So this counts. The head has four children when a panel can open - index,
     title, state, chevron - and the template has to have a track for each. */
  const template = resolve({
    selectorTest: selector => /\.factory-panel-head$/.test(selector),
    property: "grid-template-columns",
  });
  assert.ok(template, "the panel head declares its columns");
  const tracks = template.value.split(/\s+(?![^(]*\))/).length;
  assert.equal(tracks, 4,
    `the head resolves to ${tracks} columns ("${template.value}") for four children — the fourth wraps to a second row`);

  const chevron = resolve({
    selectorTest: selector => /\.factory-panel-chevron$/.test(selector),
    property: "grid-column",
  });
  assert.equal(chevron && chevron.value, "4", "the chevron sits in the fourth track, not on top of the state chip");
});

test("D794: no grid in the listing form leaves its columns implicit", () => {
  /* Three times now an item has landed in an implicit grid track and been
     sized or placed by something it has nothing to do with:

       the action bar   forward control auto-placed to a second row, laid out
                        at y761 in a 756px window
       the panel head   chevron auto-placed under the state chip, every panel
                        92px instead of 66
       the field label  textarea auto-placed into row two, column one, so the
                        title field was 214px in a 497px card

     Every rule involved was correct on its own, which is why none of them
     failed a test. What they have in common is a grid container whose columns
     were never declared. So: any grid in the listing form declares its
     template, and any control inside a field label spans it. */
  const label = resolve({
    selectorTest: selector => /factory-listing-form .design-fields > label$/.test(selector),
    property: "grid-template-columns",
  });
  assert.ok(label && /minmax\(0,\s*1fr\)/.test(label.value),
    `field labels must declare their columns — resolved to "${label ? label.value : "unset"}"`);

  const control = resolve({
    selectorTest: selector => /factory-listing-form .design-fields > label > textarea$/.test(selector),
    property: "grid-column",
  });
  assert.equal(control && control.value.replace(/\s+/g, ""), "1/-1",
    "the control spans the label's columns instead of taking the first one");
});

test("D796: a closed disclosure hides its contents", () => {
  /* Measured on step 3: <details class="individual-title-builder"> 15px tall
     and correctly closed, with its keyword bank at 132px rendering below it,
     outside its box, over the next field. Twice per listing.

     A closed <details> hides its children through the UA's slot; a rule that
     sets display on one of them takes it back out, and these sheets set display
     on a great many things inside disclosures. The rule has to be stated. */
  const winner = resolve({
    selectorTest: selector => /details:not\(\[open\]\) > \*:not\(summary\)$/.test(selector),
    property: "display",
  });
  assert.equal(winner && winner.value, "none",
    "closed disclosures must hide their non-summary children");
});

test("D801: a bundle product that fails to load is reported, not spun on forever", async () => {
  const app = await fs.promises.readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her ZZ TEST BUNDLE could not be opened at all. /api/printify answers 409
     for two of its three products - a proven shop mismatch, which is a correct
     refusal - and the loader threw the answer away: `response.ok ? ... :
     undefined`, `.catch(()=>undefined)`, and a handler that only wrote state
     when something had loaded. Nothing changed, so the effect's own dependency
     never changed, so "Loading 3 products…" span forever with nothing behind
     it and no way out. */
  assert.match(app, /setBundleLoadErrors/, "failures are recorded");
  assert.match(app, /!bundleLoadErrors\[recipe\.id\]&&recipe\.templateUrl/,
    "a product that has already failed is not fetched again in a loop");
  assert.match(app, /bundle-load-failed/, "and the failure is rendered");
  assert.match(app, /Try these again/, "with a way to retry");

  /* The spinner must stop for a product that failed, or the report never shows. */
  assert.match(app, /const waiting=list\.some\([\s\S]{0,220}?bundleLoadErrors\[recipe\.id\]\)/,
    "waiting excludes products that failed, or the report never shows");
});

test("D813: the product tile's label is a word, not a filled bar", () => {
  /* D812 said this was done and it was not. Removing one rule left two behind:
     the very next line in the same file restored the green fill, and
     approved-functional restored a #673452 fill with !important, which beat
     everything. The commit's claim and the resolved cascade disagreed, and no
     test was checking the difference - so this resolves it.

     The tile is a <button>: clicking anywhere on it chooses that product. A
     filled bar inside it is a second control for the act the card already
     performs. */
  const faults = [];
  for (const selectorTest of [
    (selector) => /\.recipe-copy>em$/.test(selector),
    (selector) => /\.recipe-tile\.selected[^,]*em$/.test(selector),
  ]) {
    const winner = resolve({ selectorTest, property: "background" });
    if (winner && !/^(none|transparent|rgba\(0, ?0, ?0, ?0\))$/.test(winner.value)) {
      faults.push(`the tile label resolves to background:${winner.value} from ${winner.file}:${winner.line} (${winner.selector})`);
    }
  }
  assert.deepStrictEqual(faults, []);
});
