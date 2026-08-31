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

test("D814: the photo strip is not squeezed by nested containers", () => {
  /* 102px of the photo layout's width went to four levels of inset the preview
     does not have, which cost the strip a whole column: tiles at 131px against
     the preview's 169. Two of the four were containers wrapping containers. */
  const faults = [];
  const rows = resolve({
    selectorTest: selector => /factory-work .listing-rows$/.test(selector),
    property: "padding-left",
  });
  if (!rows || !/^0(px)?$/.test(rows.value)) {
    faults.push(`.listing-rows resolves to padding-left:${rows ? rows.value : "unset"} — it is a list, not a card`);
  }
  const card = resolve({
    selectorTest: selector => /\.listing-rows .listing-card$/.test(selector),
    property: "margin-left",
  });
  if (!card || !/^0(px)?$/.test(card.value)) {
    faults.push(`.listing-card resolves to margin-left:${card ? card.value : "unset"} inside the rows`);
  }
  assert.deepStrictEqual(faults, []);
});

test("D815: the listing form's parts resolve to the preview's values", () => {
  /* Measured on both windows at 1440. Each of these was a rule I had already
     written once and which never won - the input from an !important in
     approved-functional, the chips from one in lilac-theme. Asserting the rule
     exists is what let that happen twice, so this asserts what wins. */
  const faults = [];
  const expect = [
    [selector => /\.listing-title-field$/.test(selector), "font-size", /^12px$/],
    [selector => /\.listing-title-field$/.test(selector), "padding", /^10px 11px$/],
    [selector => /\.tag-row span$/.test(selector), "font-size", /^10px$/],
    [selector => /\.tag-row span$/.test(selector), "background", /^#f1ebef$/i],
  ];
  for (const [selectorTest, property, want] of expect) {
    const winner = resolve({ selectorTest, property });
    if (!winner || !want.test(winner.value)) {
      faults.push(`${property} resolves to "${winner ? winner.value : "unset"}" from ${winner ? `${winner.file}:${winner.line}` : "nowhere"}, wanted ${want}`);
    }
  }
  assert.deepStrictEqual(faults, []);
});

test("D816: every heading in the pane resolves to Inter", () => {
  /* Four h3 were still in Manrope on the live build - the batch title
     builder's, the Etsy details lead's, the listing card's and the
     checklist's. D774 claimed one typeface, D803 closed h2, and nothing had
     ever covered h3 or h4 because I had not opened the panels they live in.
     The wordmark and the help dialog's h2 keep DM Serif; they are the two
     places the preview uses it. */
  for (const heading of ["h3", "h4"]) {
    const winner = resolve({
      selectorTest: selector => new RegExp(`factory-work ${heading}$`).test(selector),
      property: "font-family",
    });
    assert.ok(winner && /^Inter/.test(winner.value),
      `${heading} in the pane resolves to ${winner ? winner.value : "unset"}`);
  }
});

test("D817: a bundle product's failure carries the API's instruction, not just its headline", () => {
  /* Diagnosed on her ZZ TEST BUNDLE by calling the endpoint directly:

       Gildan Hoodie    400 "This Printify product cannot be used yet."
                            issues: "Publish this product to Etsy once with the
                            shipping profile you want Goldie to copy."
       gildan crewneck  400  same
       Gildan Tee       409 "This Printify store publishes to a different Etsy
                            shop than the one Goldie is connected to."
                            shop: "She's A Wolf Clothing"

     The headline alone is a dead end; the issues array is the instruction. */
  const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /body\?\.issues/, "the failure path reads the API's issues");
  assert.match(app, /detail\?`\$\{headline\} \$\{detail\}`:headline/, "and shows them with the headline");
});

test("D818: the interior pages are inside the shell, and the plan name is legible", async () => {
  /* Confirmed rendered before this was written. On the live build:

       /batches   document.querySelector('.app-shell') === null
       /keywords  same, and 81 of its text nodes computed to Manrope
       /usage     same, plus Fraunces and Helvetica Neue

     Every rule in interface-v2.css is scoped to `.app-shell`, so six pages of
     the product were outside the migration entirely and no amount of work in
     that file could reach them. They mount FactoryShell now. */
  const pages = ["batches", "keywords", "usage", "goals", "mockups", "operations"];
  for (const page of pages) {
    const source = await fs.promises.readFile(new URL(`../app/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /FactoryShell/, `/${page} mounts the shell`);
    assert.doesNotMatch(source, /<main className="(management-page|usage-page)/,
      `/${page} no longer renders a bare management page as its root`);
  }
  const shell = await fs.promises.readFile(new URL("../app/factory-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /className="app-shell interior-shell"/);
  assert.match(shell, /className="factory-work"/);

  /* D798 declared the light ink for the dark plan banner and never won, because
     clarity-pass carried `body:has(.management-nav) h2{color:#4c293f!important}`
     and an important on a colour cannot be out-specified. The plan name rendered
     at 1.23:1 - invisible - on the page whose only job is to name the plan. That
     block is deleted rather than overridden, so this resolves for real. */
  const banner = resolve({
    selectorTest: selector => /plan-banner h2$/.test(selector),
    property: "color",
  });
  assert.ok(banner && banner.value === "#fff",
    `the plan name resolves to ${banner ? `${banner.value} (${banner.file}:${banner.line})` : "unset"}`);

  const heading = resolve({
    selectorTest: selector => /interior-page > header h1$/.test(selector),
    property: "color",
  });
  assert.ok(heading && heading.value === "#3d2538",
    `the interior page heading resolves to ${heading ? heading.value : "unset"}`);

  /* And nothing may key off the deleted nav again. */
  for (const file of ["clarity-pass.css", "globals.css", "factory-navigation.css", "management-aesthetic.css"]) {
    const css = await fs.promises.readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    const rules = css.split("\n").filter(line => /^[^*/]*\.management-nav(?![\w-])[^{]*\{/.test(line));
    assert.deepEqual(rules, [], `${file} still styles the deleted nav:\n${rules.join("\n")}`);
  }
});

test("D818b: no text on an interior page is smaller than the pane's floor", async () => {
  /* Batch History was drawn by batch-history.css, which predates the migration:
     8px uppercase chips, 9px timestamps, 10px body. The pane's floor is 10px
     and its body is 12-13px, so every line in that list sat one to five pixels
     under the rest of the app. Measured on the live build: "DRAFT" and
     "2 PUBLISHED TO ETSY" both computed to 8px. */
  const css = fs.readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  const offences = [];
  postcss.parse(css).walkRules(rule => {
    if (!/interior-page|batch-history|batch-status|usage-card|bank-grid|plan-banner/.test(rule.selector)) return;
    rule.walkDecls(/^font(-size)?$/, decl => {
      for (const [, raw] of decl.value.matchAll(/(\d+(?:\.\d+)?)px\//g)) {
        if (parseFloat(raw) < 10) offences.push(`${rule.selector} — ${raw}px`);
      }
      if (decl.prop === "font-size") {
        const size = parseFloat(decl.value);
        if (Number.isFinite(size) && size < 10) offences.push(`${rule.selector} — ${size}px`);
      }
    });
  });
  assert.deepEqual(offences, [], `under the pane's 10px floor:\n${offences.join("\n")}`);
});

test("D820: step 3's parts resolve to the values measured off the prototype", () => {
  /* Read live off both CSSOMs, the preview beside her batch 04712deb, same
     viewport. Each of these was a difference between the two, not a guess. */
  const cases = [
    { name: "both form cards", test: s => /\.factory-form-card$/.test(s), prop: "background", want: "#fffafc" },
    { name: "both form cards", test: s => /\.factory-form-card$/.test(s), prop: "border-color", want: "#dfc8d5" },
    { name: "card rhythm", test: s => /\.factory-listing-form$/.test(s), prop: "gap", want: "13px" },
    { name: "forward action", test: s => /\.workflow-next$/.test(s), prop: "font-size", want: "16px" },
  ];
  for (const c of cases) {
    const winner = resolve({ selectorTest: c.test, property: c.prop });
    assert.ok(winner && winner.value === c.want,
      `${c.name}: ${c.prop} resolves to ${winner ? `${winner.value} (${winner.file}:${winner.line})` : "unset"}, not ${c.want}`);
  }

  /* The tag chip is 10px in the prototype. It was 12px here, from a lilac-theme
     rule with !important - the D783 shape again, so it is resolved rather than
     asserted from the file it is written in. */
  const chip = resolve({ selectorTest: s => /\.tag-row span$/.test(s), property: ["font", "font-size"] });
  assert.ok(chip && /(^|\s)10px/.test(chip.value),
    `the tag chip resolves to ${chip ? `${chip.value} (${chip.file}:${chip.line})` : "unset"}`);
});

test("D821: the shell's own surface resolves to the prototype's, not to a later restatement", () => {
  /* Read live off .goldie-sidebar and .goldie-main in the prototype, beside
     .topbar and .factory-main on thegoldiesuite.com, same viewport:

       sidebar gradient  rgba(255,241,244,.94) -> rgba(247,221,232,.9)
                         production: .58 -> .36, less than half the opacity
       sidebar edge      1px rgba(113,65,91,.15)   production: white at .72
       backdrop          blur(24px) saturate(1.04) production: 20px / 1.12
       main gradient     ...rgba(238,218,239,.9)   production: rgba(232,214,226,.9)

     D721 measured all of this correctly. D803 listed the production values in
     its own header as if they were the prototype's and overwrote D721 with
     them 650 lines later, so the rail was washed out on every screen. */
  const gradient = resolve({ selectorTest: s => /\.app-shell > \.topbar$|\.app-shell \.topbar$/.test(s), property: "background" });
  assert.ok(gradient && /rgba\(255,241,244,\.94\)/.test(gradient.value),
    `the rail resolves to ${gradient ? `${gradient.value} (${gradient.file}:${gradient.line})` : "unset"}`);

  const edge = resolve({ selectorTest: s => /\.app-shell > \.topbar$|\.app-shell \.topbar$/.test(s), property: ["border-right", "border-right-color"] });
  assert.ok(edge && /113,\s*65,\s*91/.test(edge.value),
    `the rail's edge resolves to ${edge ? edge.value : "unset"}`);

  const blur = resolve({ selectorTest: s => /\.app-shell > \.topbar$|\.app-shell \.topbar$/.test(s), property: "backdrop-filter" });
  assert.ok(blur && /blur\(24px\) saturate\(1\.04\)/.test(blur.value),
    `the rail's backdrop resolves to ${blur ? blur.value : "unset"}`);

  const pane = resolve({ selectorTest: s => /\.app-shell > \.factory-main$/.test(s), property: "background" });
  assert.ok(pane && /rgba\(238,218,239,\.9\)/.test(pane.value),
    `the pane resolves to ${pane ? pane.value : "unset"}`);
});

test("D822: no interior page reserves room for a rail the shell already owns", async () => {
  /* Measured live on /keywords after D818: the wrapper computed
     `padding: 42px 54px 90px 342px`, so the page head and the card rendered at
     x734 inside a column that starts at 392. The 342px is the space these
     pages used to leave for a rail they did not contain. Inside the shell the
     rail is a grid track and the reservation is 342px of nothing.

     /batches and /usage escaped it only because their copy of the rule carries
     no !important. The keyword and mockup copy carries !important on every
     line, which is the whole difference between a page that looked right and
     a page that looked broken. */
  const files = ["management-aesthetic.css", "globals.css", "clarity-pass.css", "approved-functional.css"];
  const offenders = [];
  for (const file of files) {
    const css = await fs.promises.readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    postcss.parse(css).walkDecls(/^padding(-left)?$/, decl => {
      if (!/342px/.test(decl.value)) return;
      offenders.push(`${file}:${decl.source.start.line} ${decl.parent.selector?.slice(0, 50)} — ${decl.value}`);
    });
  }
  assert.deepEqual(offenders, [], `a rail reservation survives inside the shell:\n${offenders.join("\n")}`);

  /* And the last unreadable line on the plan card. */
  const eyebrow = resolve({
    selectorTest: s => /plan-banner ?> ?div ?> ?span$|plan-banner span$/.test(s),
    property: "color",
  });
  assert.ok(eyebrow && /#e7c9dd/i.test(eyebrow.value),
    `"CURRENT PLAN" resolves to ${eyebrow ? `${eyebrow.value} (${eyebrow.file}:${eyebrow.line})` : "unset"}`);
});

test("D823: both sidebars format the allowance the way the prototype does", async () => {
  /* The prototype's rail reads "62 / 10,000 listings" and "6 of 20 published".
     D818 gave the interior rail that formatting and left the workflow's own
     printing the raw integer and dropping the last word, so the same component
     on two pages said the same number two ways. */
  for (const file of ["listing-factory-app.tsx", "factory-shell.tsx"]) {
    const source = await fs.promises.readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.match(source, /toLocaleString\(\)\} \/ \$\{[a-zA-Z.]+\.toLocaleString\(\)\} listings/,
      `${file} formats the allowance with separators`);
    assert.match(source, /published/, `${file} names what the goal counts`);
  }
});

test("D826: nothing outside interface-v2 dresses an interior heading", async () => {
  /* D818's own test asserted the interior h1 resolved to #3d2538 and it did
     not: it rendered #241f24 on the live build. The resolver's selectorTest
     matched only selectors ENDING in `interior-page > header h1`, so
     `.management-page>header h1{color:var(--studio-ink)!important}` was never a
     candidate - the same blind spot that let D816 pass while step 3 rendered
     Manrope.

     D826's first version had a third version of it. It read the rule's WHOLE
     selector as one string and skipped the rule if `mockup` appeared anywhere
     in it, so

       .keyword-page .keyword-hero h1,
       .managementOnly .mockupHero h1 { font-family:"DM Serif Display"!important }

     was skipped entirely and Keyword Banks kept its DM Serif heading while
     twenty tests passed. A rule is not one selector. Each comma-separated
     selector is evaluated on its own here, and an `:is()` list is expanded into
     its alternatives, because that is the level at which a rule actually
     matches an element.

     .mockupFactory and .mockupHero are out of scope: that page has its own
     camelCase design and I cannot verify it rendered as thoroughly. Being out
     of scope may not launder a selector that is in scope, which is exactly what
     went wrong. */
  const interior = /\.(management-page|usage-page|keyword-page|keyword-hero)(?![\w-])/;
  const mockup = /mockup/i;

  /* One selector can carry an :is() list that mixes an in-scope alternative
     with an out-of-scope one. Expand it so each is judged separately. */
  const expand = selector => {
    const match = selector.match(/:is\(([^()]*)\)/);
    if (!match) return [selector];
    return postcss.list.comma(match[1])
      .flatMap(alt => expand(selector.replace(match[0], alt)));
  };

  const files = (await fs.promises.readdir(new URL("../app", import.meta.url))).filter(name => name.endsWith(".css"));
  const offenders = [];
  for (const file of files) {
    if (file === "interface-v2.css") continue;
    const css = await fs.promises.readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    postcss.parse(css).walkRules(rule => {
      const typography = rule.nodes.filter(node =>
        node.type === "decl" && /^font(-family|-size|-weight)?$/.test(node.prop));
      if (!typography.length) return;
      for (const selector of rule.selectors) {
        for (const one of expand(selector.replace(/\s+/g, " "))) {
          if (!/\bh[1-4]\b/.test(one)) continue;
          if (!interior.test(one) || mockup.test(one)) continue;
          offenders.push(`${file}:${rule.source.start.line}  ${one.slice(0, 60)}  — ${typography.map(d => d.prop).join(", ")}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [],
    `a second heading scale still reaches the interior pages:\n${offenders.join("\n")}`);

  /* And the split has to hold: Mockup Library keeps the styling that was taken
     off Keyword Banks, in a rule of its own. */
  const management = await fs.promises.readFile(new URL("../app/management-aesthetic.css", import.meta.url), "utf8");
  assert.match(management, /\.managementOnly \.mockupHero h1\{[^}]*DM Serif Display/,
    "Mockup Library keeps its own heading");
  assert.doesNotMatch(management, /\.keyword-page \.keyword-hero h1[^{]*\{[^}]*font-family/,
    "Keyword Banks does not");
});

test("D830: editing a title never empties the tags or overwrites the seller's", async () => {
  /* Measured live on batch 3da79823, on the deployed build:
       tags entered by hand      13 of 13
       then the title was edited  0 of 13
     tagsFromTitle keeps only comma phrases of 20 characters or fewer, and the
     handler applied its result unconditionally on every keystroke. A 110
     character title with phrases of 36, 27 and 43 characters produces nothing,
     so the listing would have published with no tags. */
  const app = await fs.promises.readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /const title=event\.target\.value;updateDesign\(design\.id,\{title,tags:tagsFromTitle\(title\),etsy:undefined\}\)/,
    "the title must not overwrite tags unconditionally");
  assert.match(app, /const untouched=!design\.tags\.length\|\|/, "it replaces them only while they are still Goldie's");
  assert.match(app, /const keep=!untouched\|\|\(!next\.length&&design\.tags\.length>0\)/, "and never replaces them with nothing");

  /* And the rule itself, so the 20-character filter cannot be blamed later. */
  const seo = await fs.promises.readFile(new URL("../app/seo-utils.ts", import.meta.url), "utf8");
  assert.match(seo, /phrase\.length <= 20/, "tagsFromTitle still keeps only short phrases - that part is deliberate");
});

test("D831: 'Try these again' actually tries them again", async () => {
  /* Exercised live on the ZZ TEST BUNDLE. One click on the failure card's own
     retry control and the card was gone permanently - no message, no retry
     button - while /api/printify still answered 409 for the Gildan Tee at that
     same moment, confirmed by calling it from the page immediately after. The
     step then read "Complete" and "All product requirements complete" for a
     bundle with a product it cannot build.

     The button is `setBundleLoadErrors({})`. The effect that loads the missing
     products reads bundleLoadErrors in its filter and did not list it as a
     dependency, so clearing it reloaded nothing. */
  const app = await fs.promises.readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /\},\[activeBundle,bundleRecipes,activeRecipe,bundleColorProducts,bundleLoadErrors\]\);/,
    "the loader must re-run when the errors are cleared");
  assert.match(app, /onClick=\{\(\)=>setBundleLoadErrors\(\{\}\)\}>Try these again/,
    "and the retry control still clears them");

  /* D828's companion: while a member is unloadable the step may not claim to be
     complete. Both halves have to hold or the retry hides a broken batch. */
  assert.match(app, /function failedBundleNames\(\)/);
  assert.match(app, /could not be opened, so this batch cannot make its listings\./);
});

/* D832 · Two defects the re-verification of D831 found still standing. Both
   tests below compute the outcome from the whole stack rather than looking for
   the text of the fix, because for both of these the text of the fix was
   already present somewhere and losing. */

test("D832: no image the seller can see is deferred until it has a size", async () => {
  /* Measured on the deployed build, step 4 of batch 3da79823, both groups open:
       .final-listing-card img   shown 44x56, naturalWidth 0, loading="lazy"
     Two visible empty boxes in the publish review list. D829 removed the
     attribute from five images in this exact class and missed these two.

     Computed, not matched: every <img> in every component is collected and any
     that carries loading="lazy" is an offence. The retired mockups route is out
     of scope - notFound() means no seller reaches it. */
  const dir = new URL("../app/", import.meta.url);
  const files = [];
  const walk = async (base) => {
    for (const entry of await fs.promises.readdir(base, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, base);
      if (entry.isDirectory()) { if (entry.name !== "mockups") await walk(next); }
      else if (entry.name.endsWith(".tsx")) files.push(next);
    }
  };
  await walk(dir);

  const offences = [];
  for (const file of files) {
    const source = await fs.promises.readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      for (const tag of line.match(/<img\b[^>]*>/g) || []) {
        if (/loading=["']lazy["']/.test(tag)) {
          offences.push(`${file.pathname.split("/app/")[1]}:${index + 1}  ${tag.slice(0, 70)}`);
        }
      }
    });
  }
  assert.deepEqual(offences, [],
    `an image is deferred until it is near the viewport, inside a box that is 0x0 until it loads:\n${offences.join("\n")}`);
});

test("D833: every declaration that sizes the gate resolves for a 375px phone", () => {
  /* Measured on the deployed D832 at 375x812 with a coarse pointer:
       .app-shell min-width  0px      the D832 fix, landed
       body       min-width  1180px   clarity-pass.css:1543, !important
       .app-shell display    grid     interface-v2.css:10
       card                  168px wide at x15, document 1180 wide

     min-width on the shell was one of three declarations that define that box.
     The body is the containing block, so its min-width decides the shell's
     width whatever the shell says; and while the shell is still a grid the card
     is laid into the 288px sidebar track. So all five outcomes are resolved
     here, the way a browser would at that viewport - every sheet in load order,
     media conditions evaluated against 375px and a coarse pointer, !important
     first, then order. Asserting the rules exist is what let D832 ship half a
     fix; the last assertion is the one that would have caught it. */
  const load = ["globals.css", "factory-navigation.css", "theme.css", "lilac-theme.css",
    "approved-functional.css", "management-aesthetic.css", "clarity-pass.css", "interface-v2.css"];

  const appliesAt375Coarse = media => {
    if (!media) return true;
    const max = /max-width:\s*(\d+)px/.exec(media), min = /min-width:\s*(\d+)px/.exec(media);
    if (max && 375 > Number(max[1])) return false;
    if (min && 375 < Number(min[1])) return false;
    if (/pointer:\s*fine/.test(media)) return false;
    return true;
  };

  /* Every declaration of `property` that could apply, in cascade order. */
  const candidates = (matches, property) => {
    const found = [];
    load.forEach((name, order) => {
      const css = fs.readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
      postcss.parse(css).walkRules(rule => {
        if (!rule.selectors.some(one => matches(one.replace(/\s+/g, " ").trim()))) return;
        const media = rule.parent.type === "atrule" ? rule.parent.params : "";
        if (!appliesAt375Coarse(media)) return;
        rule.walkDecls(property, decl => found.push({
          where: `${name}:${decl.source.start.line}`, order, line: decl.source.start.line,
          value: decl.value, important: decl.important === true, media: media || "(none)",
        }));
      });
    });
    return found.sort((a, b) =>
      Number(a.important) - Number(b.important) || a.order - b.order || a.line - b.line);
  };

  const isBody = one => one.split(",").map(part => part.trim()).includes("body");
  const isShell = one => one === ".app-shell";

  const expected = [
    { name: "body min-width", matches: isBody, property: "min-width", want: /^0(px)?$/ },
    { name: ".app-shell min-width", matches: isShell, property: "min-width", want: /^0(px)?$/ },
    { name: ".app-shell width", matches: isShell, property: "width", want: /^100%$/ },
    { name: ".app-shell display", matches: isShell, property: "display", want: /^block$/ },
  ];

  const reversed = [];
  for (const one of expected) {
    const list = candidates(one.matches, one.property);
    const winner = list[list.length - 1];
    assert.ok(winner && one.want.test(winner.value),
      `${one.name} resolves to ${winner ? `${winner.value} (${winner.where})` : "unset"} at 375px/coarse\n  candidates: ${list.map(c => `${c.where}=${c.value}${c.important ? "!" : ""} @${c.media}`).join(" | ")}`);

    /* Nothing after the winner may put it back. A later declaration only loses
       if it is unimportant while the winner is important, so anything later
       that disagrees is a reversal waiting to happen. */
    const after = list.slice(list.indexOf(winner) + 1).filter(c => !one.want.test(c.value));
    if (after.length) reversed.push(`${one.name}: ${after.map(c => `${c.where}=${c.value}`).join(", ")}`);
  }
  assert.deepEqual(reversed, [],
    `a later declaration reverses a resolved value:\n${reversed.join("\n")}`);
});

test("D835: the rail is fixed and its contents fit inside it", () => {
  /* D834 restored "Powered by Goldie AI" by letting the rail scroll. The rail
     is fixed - one scroller in the pane - so the contents have to fit instead.

     Measured live before this: rail clientHeight 643, content 769, the
     powered-by line laid out at y712..744 and clipped.

     Two things are asserted. First, nothing may make the rail a scrolling
     region: overflow-y resolved at desktop must be neither auto nor scroll.
     Second, the savings that make it fit have to still be there - if someone
     puts the nav links or the padding back, the line is clipped again and no
     test would notice. */
  const load = ["globals.css", "factory-navigation.css", "theme.css", "lilac-theme.css",
    "approved-functional.css", "management-aesthetic.css", "clarity-pass.css", "interface-v2.css"];
  const winner = (matches, property) => {
    const found = [];
    load.forEach((name, order) => {
      const css = fs.readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
      postcss.parse(css).walkRules(rule => {
        if (!rule.selectors.some(one => matches(one.replace(/\s+/g, " ").trim()))) return;
        const media = rule.parent.type === "atrule" ? rule.parent.params : "";
        /* desktop: the gate breakpoint does not apply */
        if (/max-width:\s*(\d+)px/.test(media) && Number(/max-width:\s*(\d+)px/.exec(media)[1]) < 1180) return;
        rule.walkDecls(property, decl => found.push({
          where: `${name}:${decl.source.start.line}`, order, line: decl.source.start.line,
          value: decl.value, important: decl.important === true,
        }));
      });
    });
    found.sort((a, b) => Number(a.important) - Number(b.important) || a.order - b.order || a.line - b.line);
    return found[found.length - 1];
  };
  const isRail = one => one === ".app-shell > .topbar" || one === ".app-shell .topbar" || one === ".topbar";

  for (const property of ["overflow", "overflow-y"]) {
    const found = winner(isRail, property);
    if (!found) continue;
    assert.doesNotMatch(found.value, /auto|scroll/,
      `the rail must not scroll — ${property} resolves to ${found.value} (${found.where})`);
  }

  /* The savings, so they cannot quietly come back. */
  const v2 = fs.readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  const shell = fs.readFileSync(new URL("../app/factory-shell.tsx", import.meta.url), "utf8");
  const navCount = (shell.match(/\{ key: "/g) || []).length;
  assert.equal(navCount, 3, `the rail carries ${navCount} nav links; the height budget assumes 3`);
  assert.match(v2, /\.app-shell > \.topbar\{overflow:hidden;padding-top:26px;padding-bottom:18px\}/);
  assert.match(v2, /\.app-shell > \.topbar > \.brand-lockup\{margin-bottom:18px\}/);
  assert.match(v2, /\.app-shell \.approved-sidebar-footer\{gap:7px;padding-top:12px\}/);
  assert.match(v2, /\.listing-goal-side\{\s*border-radius:16px;padding:10px 14px/);
});

test("D838: the two things D834 declared and never won", () => {
  /* Both landed in the file and both lost, and the deploy is what showed it:

       .autosave-note position   static!important   approved-functional:124
                                 measured live at 501..631 on a bar centred
                                 on 864 - "centred on the card" was never true
       .listing-goal-side        a full !important surface block in
                                 clarity-pass:1794, so the plum tint that tells
                                 the two counters apart computed rgba(0,0,0,0)

     Resolved here rather than asserted, because asserting is exactly what
     missed them: the rules existed, they were just losing. */
  const load = ["globals.css", "factory-navigation.css", "theme.css", "lilac-theme.css",
    "approved-functional.css", "management-aesthetic.css", "clarity-pass.css", "interface-v2.css"];
  const winner = (matches, property) => {
    const found = [];
    load.forEach((name, order) => {
      const css = fs.readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
      postcss.parse(css).walkRules(rule => {
        if (!rule.selectors.some(one => matches(one.replace(/\s+/g, " ").trim()))) return;
        const media = rule.parent.type === "atrule" ? rule.parent.params : "";
        if (/max-width:\s*(\d+)px/.test(media) && Number(/max-width:\s*(\d+)px/.exec(media)[1]) < 1180) return;
        rule.walkDecls(property, decl => found.push({
          where: `${name}:${decl.source.start.line}`, order, line: decl.source.start.line,
          value: decl.value, important: decl.important === true,
        }));
      });
    });
    found.sort((a, b) => Number(a.important) - Number(b.important) || a.order - b.order || a.line - b.line);
    return found[found.length - 1];
  };

  const position = winner(one => /\.autosave-note$/.test(one), "position");
  assert.ok(position && position.value === "absolute",
    `the save note resolves to position:${position ? `${position.value} (${position.where})` : "unset"} — it cannot be centred while it is static`);

  /* D839 · position:absolute alone was not enough. left:50% with translate:-50%
     measured 65px off - exactly half the note's own width - because the lane
     rules left over from the grid era were still placing it too. Insets and an
     auto margin centre a box in its containing block by definition, with no
     transform to be half of, so that is what it uses. */
  const left = winner(one => /\.autosave-note$/.test(one), "left");
  const right = winner(one => /\.autosave-note$/.test(one), "right");
  const translate = winner(one => /\.autosave-note$/.test(one), "translate");
  assert.ok(left && left.value === "0", `left resolves to ${left ? left.value : "unset"}`);
  assert.ok(right && right.value === "0", `right resolves to ${right ? right.value : "unset"}`);
  assert.ok(!translate || translate.value === "none",
    `a transform on the note puts it off centre by half its width — resolves to ${translate ? translate.value : "none"}`);

  /* D840 · Three separate things beat the centring in turn: position:static,
     then a transform, then `margin:0!important` - a shorthand that also sets
     the inline axis the auto margins need. Each was individually reasonable
     and each silently undid the fix. All four are resolved here. */
  const transform = winner(one => /\.autosave-note$/.test(one), "transform");
  assert.ok(!transform || transform.value === "none",
    `transform resolves to ${transform ? transform.value : "none"} — it must not shift the note`);
  const inline = winner(one => /\.autosave-note$/.test(one), "margin-inline");
  assert.ok(inline && inline.value === "auto",
    `margin-inline resolves to ${inline ? `${inline.value} (${inline.where})` : "unset"} — auto margins are what centre it`);

  /* And the bar has to be readable. Fully transparent measured three product
     tiles printing through it on a 699px viewport. */
  const barFill = winner(one => /\.workflow-footer-actions$/.test(one), "background");
  assert.ok(barFill && /linear-gradient\(to top/.test(barFill.value),
    `the action bar resolves to ${barFill ? barFill.value.slice(0, 40) : "unset"} — content must not print through it`);

  const fill = winner(one => one === ".app-shell .listing-goal-side" || /\.listing-goal-side$/.test(one), "background");
  assert.ok(fill && /123,\s*62,\s*105/.test(fill.value),
    `the goal counter resolves to ${fill ? `${fill.value} (${fill.where})` : "unset"} — the two counters are told apart by that tint`);
});
