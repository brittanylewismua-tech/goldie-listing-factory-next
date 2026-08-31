import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";

/* D756 · One hairline family.

   211 distinct border colours were in use across the sheets - rgba(91,48,79)
   at .12, .14, .16, .18, .2 and .22, rgba(139,89,137) at four more alphas,
   rgba(74,42,62) at three. Against the page's tint they are all the same pale
   plum line, a percent or two apart, and no two panels agreed. That is the
   texture of "it doesn't quite look like the preview": nothing is wrong
   enough to point at.

   The prototype uses six, and they are named here. Alert, success and brand
   edges keep their own colours - this is only the hairline family. */

const HAIRLINES = new Set(["#dfc8d5", "#ded1d8", "#ded5db", "#d8cfd5", "#eee8ec", "#e4cedb", "#ded6dc", "#d9cbd3"]);
/* D821 · one member of the family is an alpha in the prototype rather than a
   hex, and it is the rail's right edge - read off .goldie-sidebar's own CSSOM.
   D721 approximated it as #ded6dc, which composites greyer than the prototype
   does over the pink pane. It is named here so it is a member of the family
   rather than the one-off this test exists to catch. */
const NAMED_ALPHAS = new Set(["rgba(113,65,91,.15)"]);
/* Alphas below this read as a hairline against the pane and belong to the
   family; anything stronger is doing a different job. */
const isPlumHairline = (value) => {
  const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*\.?\d*\)/);
  if (!match) return false;
  if (NAMED_ALPHAS.has(value.replace(/\s+/g, ""))) return false;
  const [, r, g, b] = match.map(Number);
  const alpha = parseFloat(value.slice(value.lastIndexOf(",") + 1)) || 1;
  return r > b && b > g && alpha > 0 && alpha <= 0.3;
};

const offenders = [];
for (const name of readdirSync(new URL("../app", import.meta.url)).filter(file => file.endsWith(".css"))) {
  postcss.parse(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8")).walkDecls(decl => {
    if (!/^border(-[a-z]+)?(-color)?$/.test(decl.prop)) return;
    for (const [raw] of decl.value.matchAll(/rgba\([^)]*\)/g)) {
      if (!isPlumHairline(raw)) continue;
      offenders.push(`${name}: ${decl.parent.selector?.replace(/\s+/g, " ").slice(0, 44)} — ${raw}`);
    }
  });
}

test("hairlines come from the named family, not a new alpha each time", () => {
  assert.deepEqual(offenders.slice(0, 10), [],
    `plum hairlines written as one-off alphas instead of the family:\n${offenders.slice(0, 10).join("\n")}\n(${offenders.length} total; the family is ${[...HAIRLINES].join(", ")})`);
});
