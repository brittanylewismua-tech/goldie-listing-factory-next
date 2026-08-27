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

/* D607 - the button greyed out and nothing else happened. The page-level saving
   banner sits at the top of the section, off-screen once she has scrolled down
   to the set she is adding to, so the flow looked frozen. */
test("the set being added to says so, where the button was", () => {
  assert.match(page, /addingTheme===theme/, "the row reacts to the set it belongs to");
  assert.match(page, /className="addingToSet" role="status" aria-live="polite"/);
  assert.match(page, /Adding \$\{Math\.min\(libraryProgress\+1,libraryTotal\)\} of \$\{libraryTotal\}/);
  assert.match(css, /\.addingToSet\{/);
});

test("progress is state, not a ref", () => {
  // A ref does not re-render, which is exactly how the row went silent.
  assert.match(page, /const \[addingTheme,setAddingTheme\]=useState\(""\)/);
  assert.match(page, /setAddingTheme\(target\.theme\)/);
});

test("the indicator always clears, including on failure", () => {
  const handler = page.slice(page.indexOf("const addMockupsToSet"), page.indexOf("const addMockupsManaged"));
  assert.match(handler, /finally\{setLibraryBusy\(false\);setAddingTheme\(""\)/);
});

test("D604 revisited - the grids that actually hold fifty scenes load lazily", () => {
  /* The first attempt matched a pattern that existed on this page but belonged
     to a different grid, so the test passed while the set thumbnails and the
     collapsed previews still fetched every photograph at full size. */
  assert.match(page, /<img src=\{item\.src\} alt=\{item\.name\} loading="lazy" decoding="async"\/>/,
    "the open set's thumbnails");
  assert.match(page, /<img key=\{item\.id\} src=\{item\.src\} alt="" loading="lazy" decoding="async"\/>/,
    "the collapsed set previews");
});
