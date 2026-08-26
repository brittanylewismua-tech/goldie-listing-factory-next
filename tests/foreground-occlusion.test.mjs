/* D573 - the foreground layer. This is the arm-in-front-of-the-poster work: the
   design sits behind whatever the photograph has in front of it. The mechanism
   was never removed, but the only scenes that ever switched it on were the
   bundled Pink Dorm templates carrying foregroundPrompt:"woman", and those came
   out in 2d787ea. From then until now foregroundPrompt was read in three places
   and set in none, so nothing uploaded could reach it. These tests keep the
   compositing step, and keep a route to switching it on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the design is drawn behind the photograph's foreground, not over it", async () => {
  const integrated = await read("app/integrated-mockups.tsx");
  // The order is what makes it work: photograph, then artwork, then foreground.
  assert.match(integrated, /for\(const layer of foregrounds\)ctx\.drawImage/,
    "the foreground must still be drawn back over the composited artwork");
  const draw = integrated.indexOf("for(const layer of foregrounds)");
  const ink = integrated.indexOf("const inkCanvas=document.createElement");
  assert.ok(ink > 0 && draw > ink, "the foreground must be drawn after the artwork layer, not before");
});

test("a saved mask is preferred over anything worked out at render time", async () => {
  const integrated = await read("app/integrated-mockups.tsx");
  assert.match(integrated, /async function foregroundLayers\(t:Template\)\{if\(t\.occlusionUrl\)return\[t\.occlusionUrl\]/,
    "a confirmed mask must win, so the same scene renders identically every time");
});

test("a scene can actually be given a foreground, which it could not before", async () => {
  const page = await read("app/mockups/page.tsx");
  assert.match(page, /setMasking\(item\)/, "every custom scene needs a way into the foreground editor");
  const editor = await read("app/mockups/occlusion-editor.tsx");
  // Painting samples the real photograph, so what covers the design is the real
  // hood rather than a flat shape.
  assert.match(editor, /context\.drawImage\(photo, 0, 0, canvas\.width, canvas\.height\)/);
  for (const tool of ["Paint", "Erase", "Clear"]) assert.ok(editor.includes(`>${tool}<`), `the editor needs ${tool}`);
});

test("the mask is stored with the scene rather than recomputed", async () => {
  const route = await read("app/api/mockups/library/[id]/occlusion/route.ts");
  assert.match(route, /export async function PUT/);
  assert.match(route, /occlusionConfirmed: 1/);
  // An empty mask is a real answer - nothing crosses the print - and must be
  // saved as confirmed rather than left looking unanswered.
  assert.match(route, /cleared: true/);
});

test("a back print without a confirmed foreground is not treated as ready", async () => {
  const { sceneNeedsOcclusion } = await import("../app/mockups/placement-contract.ts");
  const back = { x: .5, y: .5, scale: .5, angle: 0, side: "back" };
  assert.equal(sceneNeedsOcclusion({ printSide: "back", occlusionConfirmed: false }, back), true);
  assert.equal(sceneNeedsOcclusion({ printSide: "back", occlusionConfirmed: true }, back), false);
});
