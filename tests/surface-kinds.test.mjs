/* D610 - her iPhone 16 case set was saved as "curved", because the closest
   option offered was "Mug, tumbler or other curved product". Two consequences:
   the set is hidden from phone-case products entirely, since a curved template
   family never matches a flat product family, and if it did render, the artwork
   would be barrel-wrapped across a face that is essentially flat. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const page = await read("app/mockups/page.tsx");
const route = await read("app/api/mockups/library/route.ts");
const compat = await read("app/mockup-compatibility.ts");
const grid = await read("app/integrated-mockups.tsx");

test("a phone case is its own surface", () => {
  assert.match(page, /"phone-case":"Phone case"/);
  assert.match(page, /type SurfaceKind = "rigid-flat" \| "phone-case"/);
  assert.match(route, /"rigid-flat", "phone-case"/, "and the server accepts it");
});

test("a phone case is flat, never curved", () => {
  // Barrel-wrapping artwork across a case distorts a design that sits square.
  assert.match(compat, /if\(kind==="curved"\)return"curved";/);
  const code = strip(compat);
  const fn = code.slice(code.indexOf("export function templateSurfaceFamily"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.ok(!/phone-case.*curved/.test(body), "phone-case must not map to curved");
});

test("a phone case renders product-aware, like any flat printed face", () => {
  for (const [name, source] of [["library", page], ["listing factory", grid]])
    assert.match(source, /isCalibratedSurface\(kind:SurfaceKind\)\{return\["rigid-flat","phone-case"/,
      `the ${name} page treats it as calibrated`);
});

test("a set saved under the wrong surface can be corrected", () => {
  // Deleting and re-uploading fifty photographs to fix a dropdown is not a fix.
  assert.match(route, /if\(surfaceKind&&!kinds\.has\(surfaceKind\)\)/, "the server validates it");
  assert.match(page, /className="renameSurface"/);
  assert.match(page, /setRenameSurface\(\(items\[0\]\?\.surfaceKind as SurfaceKind\)\|\|"rigid-flat"\)/,
    "the dialog opens on the surface the set actually has");
});

test("changing the surface re-reads the photographs", () => {
  /* The surface decides what the print area MEANS, so a preparation made under
     the old one no longer describes the scene. */
  assert.match(route, /preparationJson:null,preparationStatus:"queued"/);
  assert.match(page, /Changing the surface reads every photograph in this set again/);
});

test("renaming alone does not discard the preparations", () => {
  // Only a surface change invalidates them; a rename must stay cheap.
  assert.match(route, /\.\.\.\(surfaceKind\?\{surfaceKind,preparationJson:null/);
  assert.match(page, /const surfaceChanged=Boolean\(renameSurface&&renameSurface!==was\)/);
});
