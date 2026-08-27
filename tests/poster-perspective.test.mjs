/* D608 - measured on her five poster scenes, generation 11.

   pink-dorm-01-leaning-frame is a large frame leaning against a wall, plainly a
   trapezoid in the photograph. It was filed as
   [0.223,0.168] [0.777,0.168] [0.777,0.892] [0.223,0.892] - a perfectly upright
   rectangle - and classified "flat".

   pink-dorm-04-chair-and-plants holds a large blank frame on the wall and a
   small already-printed "ciao bella" frame in the bottom corner. Goldie chose
   the printed one: a print area 14% wide and 15% tall, against the bottom-right
   edge. The design would have printed onto the decor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const scene = await read("app/mockups/prepared-scene.ts");
const prepare = await read("app/api/mockups/library/[id]/prepare/route.ts");

const prompt = scene.slice(scene.indexOf("export function sceneAnalysisPrompt"));

test("the printable surface is the blank one", () => {
  assert.match(prompt, /This is a BLANK mockup scene/);
  assert.match(prompt, /ALREADY carries artwork, a picture, lettering or a pattern is decoration/);
  assert.match(prompt, /choose the largest blank one/);
});

test("an angled face may not come back as an upright rectangle", () => {
  assert.match(prompt, /no two corners share an x or y value/);
  assert.match(prompt, /Return the true quadrilateral you can see/);
  assert.match(prompt, /Only return an upright rectangle when the face really is square to the camera/);
});

test("tilted means perspective, not flat", () => {
  assert.match(prompt, /Use perspective whenever the printable face is tilted or angled away from the camera/);
});

test("a corner scrap is refused as a product boundary", () => {
  const fn = scene.slice(scene.indexOf("export function believableProductBox"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.match(body, /width \* height < \.06/, "a product does not occupy 6% of a mockup photograph");
  assert.match(body, /touching < 2/, "hugging two edges at once is a scrap in a corner");
});

test("one cropped edge is still a product", () => {
  // Garments and posters are routinely cropped by the frame. Only two or more.
  const fn = scene.slice(scene.indexOf("export function believableProductBox"));
  assert.ok(!/touching < 1/.test(fn.slice(0, fn.indexOf("\n}") + 2)));
});

test("the blind fallback centres rather than committing to nonsense", () => {
  assert.match(prepare, /const usableBox = believableProductBox\(productBox\) \? productBox : null/);
  assert.match(prepare, /computedPreparation\(productName, usableBox\)/);
});
