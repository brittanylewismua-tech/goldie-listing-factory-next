import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";

/* D745 · One scale, or it looks "slightly off" and nobody can say why.

   Swept the built page: the type ran 8, 8.5, 9, 9.5, 10, 11, 11.5, 12, 12.5,
   13, 13.5 and the radii ran 6 through 30 including 11, 13, 15, 18, 24 and 28.
   Half-pixel type does not land on the pixel grid, so the same word renders
   fractionally differently in two places on one screen. That is most of what
   "it doesn't quite look like the preview" is made of.

   The prototype uses whole numbers only: type 8/9/10/11/12/13/14/15/20/29,
   radii 6/7/8/9/10/12/14/16 plus the round ones. 65 font sizes and 172 radii
   were snapped to it. This keeps them there. */

/* Whole pixels. The rule being kept is that no size lands between two pixels -
   which of the whole sizes a heading uses is D233's business, not this test's. */
/* D803 · 22 joins the scale because the prototype uses it - .goldie-help-dialog
   is radius 22, measured off its own CSSOM. The scale was written from the
   screens I had opened, and I had never opened the help dialog, so its corner
   was missing from the list rather than wrong in the app. A scale built from a
   partial walk of the product is a scale that will reject the product. */
const RADIUS = new Set([0, 6, 7, 8, 9, 10, 12, 14, 16, 22]);

const sheets = readdirSync(new URL("../app", import.meta.url)).filter(name => name.endsWith(".css"));
const offences = { type: [], radius: [] };

for (const name of sheets) {
  const css = readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
  postcss.parse(css).walkDecls(decl => {
    const where = `${name}: ${decl.parent.selector?.replace(/\s+/g, " ").slice(0, 46)}`;
    if (/font-size$/.test(decl.prop) || decl.prop === "font") {
      /* rem is the same defect wearing another unit: .84rem is 13.44px. */
      for (const [, raw, unit] of decl.value.matchAll(/(\d*\.?\d+)(px|rem)/g)) {
        const size = unit === "rem" ? parseFloat(raw) * 16 : parseFloat(raw);
        /* `font` shorthand carries a line-height in px too; only the size
           precedes the slash, and clamp()/calc() are responsive, not scale. */
        if (decl.prop === "font" && decl.value.indexOf(`${raw}${unit}/`) === -1) continue;
        if (/clamp|calc|var\(/.test(decl.value)) continue;
        if (!Number.isInteger(size)) offences.type.push(`${where} — ${size}px`);
      }
    }
    if (/^border(-[a-z]+)?-radius$/.test(decl.prop)) {
      /* rem is the same defect wearing another unit: .84rem is 13.44px. */
      for (const [, raw, unit] of decl.value.matchAll(/(\d*\.?\d+)(px|rem)/g)) {
        const size = unit === "rem" ? parseFloat(raw) * 16 : parseFloat(raw);
        if (!RADIUS.has(size)) offences.radius.push(`${where} — ${size}px`);
      }
    }
  });
}

test("no type size lands between two pixels", () => {
  assert.deepEqual(offences.type, [], `fractional type:\n${offences.type.slice(0, 12).join("\n")}`);
});

test("corner radii sit on the prototype's scale", () => {
  assert.deepEqual(offences.radius, [], `off the radius scale:\n${offences.radius.slice(0, 12).join("\n")}`);
});
