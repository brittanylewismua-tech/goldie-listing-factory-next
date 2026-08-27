/* D605 - a mockup set could be created and renamed and deleted, but never added
   to. The server has always accepted it: POST /api/mockups/library keys on the
   theme, counts what is already there and only refuses past fifty. The only
   thing missing was a way to ask. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const page = strip(await read("app/mockups/page.tsx"));
const route = strip(await read("app/api/mockups/library/route.ts"));
const css = await read("app/mockups/mockups.css");

test("every saved set offers a way to add more mockups", () => {
  assert.match(page, /className="selectSet addToSet"[^>]*onClick=\{\(\)=>chooseMoreForSet\(theme\)\}/);
  assert.match(page, /＋ Add mockups/);
});

test("the photographs are filed under the set that was clicked", () => {
  /* The file dialog spans several renders, so reading the set name out of the
     builder's input is how photographs end up under whatever was typed last.
     The target is captured on click and passed in. */
  assert.match(page, /addToSetTarget\.current=\{theme,surfaceKind:items\[0\]\?\.surfaceKind\|\|surfaceKind\}/);
  assert.match(page, /const target=addToSetTarget\.current/);
  assert.match(page, /await addMockups\(e,target\)/);
  assert.match(page, /const theme=target\?\.theme\|\|themeName\.trim\(\)/);
});

test("added mockups inherit the set's own product surface", () => {
  // A poster dropped into a hoodie set would render with the wrong geometry.
  assert.match(page, /const kind=target\?\.surfaceKind\|\|surfaceKind/);
  assert.match(page, /form\.set\("surfaceKind",kind\)/);
});

test("the fifty cap counts the set being added to", () => {
  const handler = page.slice(page.indexOf("const addMockupsToSet"), page.indexOf("const addMockupsManaged"));
  assert.match(handler, /library\.filter\(item=>item\.theme===target\.theme\)\.length/);
  assert.match(handler, /existing>=MAX_MOCKUPS_PER_SET/);
  assert.match(handler, /count>MAX_MOCKUPS_PER_SET-existing/);
  // And the server refuses independently, so the browser is not the only guard.
  assert.match(route, /existing\.length>=MAX_MOCKUPS_PER_SET/);
});

test("adding to an existing set does not spend a new-set allowance", () => {
  assert.match(route, /if\(!setExists&&Number\(setCount\?\.count\|\|0\)>=plan\.mockupSets\)/,
    "the plan limit applies to NEW sets only");
});

test("the upload cannot be started twice at once", () => {
  assert.match(page, /className="selectSet addToSet" disabled=\{libraryBusy\}/);
  const handler = page.slice(page.indexOf("const addMockupsToSet"), page.indexOf("const addMockupsManaged"));
  assert.match(handler, /finally\{setLibraryBusy\(false\)/, "the busy flag is always released");
});

test("three actions fit on the row", () => {
  assert.match(css, /\.collectionActions\{flex-wrap:wrap\}/);
});
