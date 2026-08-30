import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

/* D727 · "Matches the preview" as something a machine can check.

   Every claim that production matches goldie-ux-preview-site @ aad9208
   (public/prototype.html, peach-glass) has so far been made by eye, and the
   eye has been wrong: the page title rendered in DM Serif at 34px while the
   rule written for it said Inter 29px, because eleven legacy `.hero h1` rules
   were still in the cascade. A rule existing in interface-v2.css proves
   nothing - what matters is which declaration WINS.

   This resolves the real cascade across the sheets in the order layout.tsx
   imports them, and asserts the winner equals the value measured from the
   prototype's own CSSOM (docs/prototype-spec.md). Base cascade only: @media
   blocks are responsive behaviour and are checked where they matter by the
   rules they override, not here. */

const SHEETS = ["globals","factory-navigation","theme","lilac-theme","approved-functional","management-aesthetic","clarity-pass","interface-v2"];

const rules = [];
SHEETS.forEach((name, sheetIndex) => {
  const root = postcss.parse(readFileSync(new URL(`../app/${name}.css`, import.meta.url), "utf8"));
  let order = 0;
  root.walkRules(rule => {
    order += 1;
    /* D727 · Skipping at-rules once hid a `.app-shell .hero{padding-bottom:30px
       !important}` inside @media(min-width:821px) - it applies at every desktop
       width, which is the width being matched. min-width blocks are in;
       max-width blocks are the narrow layouts and are not. */
    const atRule = rule.parent?.type === "atrule" ? rule.parent : null;
    if (atRule && !(atRule.name === "media" && /min-width/.test(atRule.params) && !/max-width/.test(atRule.params))) return;
    for (const selector of rule.selectors) {
      /* Position-dependent and state selectors cannot be resolved from a
         chain that carries no siblings or interaction, so they are out of this
         cascade rather than silently treated as matching everything. */
      if (/[>+~]|::|:hover|:focus|:active|:first-child|:last-child|:nth-|:only-|:empty/.test(selector)) continue;
      const declarations = {};
      rule.walkDecls(decl => { declarations[decl.prop] = { value: decl.value, important: decl.important }; });
      rules.push({ sheet: name, sheetIndex, order, selector, specificity: specificity(selector), declarations, media: atRule?.params });
    }
  });
});

function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+\(?/g) || []).length;
  const types = (selector.replace(/[#.:][\w-]+(\([^)]*\))?|\[[^\]]+\]/g, "").match(/[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + classes * 100 + types;
}

/* An element is a chain from the root: [{tag, classes}, ...]. A descendant
   selector matches when its compounds appear in order along that chain, the
   last one on the element itself. */
function matches(selector, chain) {
  const compounds = selector.trim().split(/\s+/);
  let at = chain.length - 1;
  if (!compoundMatches(compounds[compounds.length - 1], chain[at])) return false;
  at -= 1;
  for (let i = compounds.length - 2; i >= 0; i -= 1) {
    while (at >= 0 && !compoundMatches(compounds[i], chain[at])) at -= 1;
    if (at < 0) return false;
    at -= 1;
  }
  return true;
}

function compoundMatches(compound, node) {
  if (!node) return false;
  const parts = compound.match(/^[a-z][\w-]*|\.[\w-]+|:not\([^)]*\)|\[[^\]]+\]/gi) || [];
  for (const part of parts) {
    if (part.startsWith(".")) { if (!node.classes.includes(part.slice(1))) return false; }
    else if (part.startsWith(":not(")) {
      const inner = part.slice(5, -1);
      if (inner.startsWith(".") && node.classes.includes(inner.slice(1))) return false;
      if (!inner.startsWith(".") && !inner.startsWith("[") && node.tag === inner) return false;
    }
    else if (part.startsWith("[")) { /* attribute selectors are state, not identity */ }
    else if (node.tag !== part) return false;
  }
  return true;
}

function winner(chain, property) {
  let best = null;
  for (const rule of rules) {
    const declaration = rule.declarations[property];
    if (!declaration) continue;
    if (!matches(rule.selector, chain)) continue;
    const rank = [declaration.important ? 1 : 0, rule.specificity, rule.sheetIndex, rule.order];
    if (!best || compare(rank, best.rank) > 0) best = { rank, rule, value: declaration.value };
  }
  return best;
}

const compare = (a, b) => { for (let i = 0; i < a.length; i += 1) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; };

const el = (tag, ...classes) => ({ tag, classes });
const shell = [el("main", "app-shell"), el("div", "factory-main"), el("div", "factory-work")];

/* Each case: where the element lives, the property, and the value measured
   from the prototype. A miss here is a real visual mismatch, named. */
const CASES = [
  // page head - the one that was silently wrong
  { name: "page title font", chain: [...shell, el("section","hero","workflow-hero"), el("div","factory-page-head"), el("div","factory-heading-with-help"), el("h1")], property: "font", expect: /^700 29px\/1\.12 Inter/ },
  /* D727 · The shorthand won this cascade while an !important longhand in
     clarity-pass still set the family and size. Shorthands are not enough:
     the longhands are checked too, or the title goes back to serif. */
  { name: "page title family", chain: [...shell, el("section","hero","workflow-hero"), el("div","factory-page-head"), el("div","factory-heading-with-help"), el("h1")], property: "font-family", expect: null },
  { name: "page title size", chain: [...shell, el("section","hero","workflow-hero"), el("div","factory-page-head"), el("div","factory-heading-with-help"), el("h1")], property: "font-size", expect: null },
  { name: "page title letter-spacing", chain: [...shell, el("section","hero","workflow-hero"), el("div","factory-page-head"), el("div","factory-heading-with-help"), el("h1")], property: "letter-spacing", expect: /^-1\.015px$/ },
  { name: "page head layout", chain: [...shell, el("section","hero","workflow-hero"), el("div","factory-page-head")], property: "display", expect: /^flex$/ },
  { name: "summary chip background", chain: [...shell, el("section","hero"), el("div","factory-page-head"), el("span","factory-summary")], property: "background", expect: /#fff7fa/ },
  { name: "hero wrapper padding", chain: [...shell, el("section","hero","workflow-hero")], property: "padding", expect: /^0$|^0px$/ },
  { name: "hero wrapper padding-bottom", chain: [...shell, el("section","hero","workflow-hero")], property: "padding-bottom", shorthand: "padding", expect: null },
  { name: "hero wrapper margin", chain: [...shell, el("section","hero","workflow-hero")], property: "margin", expect: /^0$|^0px$/ },
  { name: "hero wrapper margin-bottom", chain: [...shell, el("section","hero","workflow-hero")], property: "margin-bottom", shorthand: "margin", expect: null },
  // panels
  { name: "panel background", chain: [...shell, el("section","factory-panel")], property: "background", expect: /#fffafc/ },
  { name: "panel radius", chain: [...shell, el("section","factory-panel")], property: "border-radius", expect: /^12px$/ },
  { name: "panel head columns", chain: [...shell, el("section","factory-panel"), el("div","factory-panel-head")], property: "grid-template-columns", expect: /34px/ },
  // artwork grid
  { name: "artwork grid columns", chain: [...shell, el("div","factory-art-grid")], property: "grid-template-columns", expect: /repeat\(2,/ },
  { name: "artwork preview height", chain: [...shell, el("div","factory-art-grid"), el("article","factory-art-card"), el("div","factory-art-preview")], property: "height", expect: /^190px$/ },
  // step 1 product tiles
  { name: "product grid columns", chain: [...shell, el("div","recipe-grid")], property: "grid-template-columns", expect: /repeat\(3,minmax\(0,1fr\)\)/ },
  { name: "product tile border", chain: [...shell, el("div","recipe-grid"), el("article","recipe-tile")], property: "border", expect: /^1px solid #ded5db$/ },
  { name: "chosen tile border", chain: [...shell, el("div","recipe-grid"), el("article","recipe-tile","selected")], property: "border", expect: /^2px solid #6c3a5c$/ },
  { name: "product image band", chain: [...shell, el("div","recipe-grid"), el("article","recipe-tile"), el("button","recipe-use"), el("span","recipe-icon")], property: "height", expect: /^116px$/ },
  // step 3 listing details
  { name: "listing grid columns", chain: [...shell, el("div","factory-listing-grid")], property: "grid-template-columns", expect: /^1\.15fr \.85fr$/ },
  { name: "form card border", chain: [...shell, el("div","factory-listing-grid"), el("aside","factory-form-card")], property: "border", expect: /^1px solid #e4cedb$/ },
  { name: "checklist row rule", chain: [...shell, el("div","factory-checklist"), el("div","factory-check")], property: "border-bottom", expect: /^1px solid #eee9ec$/ },
  // photo layout
  { name: "photo layout columns", chain: [...shell, el("div","factory-photo-layout")], property: "grid-template-columns", expect: /^240px minmax\(0,1fr\)$/ },
  { name: "design-large size", chain: [...shell, el("div","factory-photo-layout"), el("aside","factory-listing-identity"), el("div","factory-design-large")], property: "height", expect: /^210px$/ },
  { name: "photo strip columns", chain: [...shell, el("div","factory-photo-column"), el("section","listing-photo-order"), el("div","photo-order-strip")], property: "grid-template-columns", expect: /repeat\(4,/ },
];

test("every migrated component wins its own cascade with the prototype's values", () => {
  const failures = [];
  for (const item of CASES) {
    const won = winner(item.chain, item.property);
    if (item.expect === null) {
      /* The component sets this through the `font` shorthand. A longhand
         elsewhere only matters if it OUTRANKS that shorthand - which is exactly
         what six !important declarations in clarity-pass were doing. */
      const shorthand = winner(item.chain, item.shorthand ?? "font");
      if (won && shorthand && compare(won.rank, shorthand.rank) > 0) {
        failures.push(`${item.name}: ${item.property} is overridden by ${won.rule.sheet} (${won.rule.selector}: ${won.value})`);
      }
      continue;
    }
    if (!won) { failures.push(`${item.name}: nothing sets ${item.property}`); continue; }
    if (!item.expect.test(won.value)) {
      failures.push(`${item.name}: ${item.property} resolves to "${won.value}" from ${won.rule.sheet} (${won.rule.selector}), not ${item.expect}`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});
