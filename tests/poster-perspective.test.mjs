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

/* D609 - measured after D608 deployed. The prompt fix worked on the hanging
   poster, which came back as a real quadrilateral:
   [0.405,0.05] [0.85,0.03] [0.83,0.73] [0.38,0.75].

   It did not work on the leaning frame, the most obviously angled scene of the
   five, which came back [0.205,0.205] [0.795,0.205] [0.795,0.895] [0.205,0.895]
   and still classified "flat". Prompt wording alone is not a mechanism you can
   depend on, so the upright answer is now detected and questioned. */
test("a perfectly upright quad is recognised as a bounding box, not an answer", () => {
  const fn = scene.slice(scene.indexOf("export function isUprightRectangle"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.match(body, /tl\[1\] === tr\[1\] && bl\[1\] === br\[1\] && tl\[0\] === bl\[0\] && tr\[0\] === br\[0\]/);
});

test("the corrective is asked once, and cannot fail", () => {
  assert.match(prepare, /if \(isUprightRectangle\(reading\.geometry\?\.corners\)\)/);
  assert.match(prepare, /const second = await optional\(\(\) => analyzeGeometry\(imageUrl, productName, key, segmentation\?\.productBox, true\)\)/,
    "optional, so a failed second question costs nothing");
  assert.match(prepare, /if \(second\?\.geometry && !isUprightRectangle\(second\.geometry\.corners\)\) reading = second/,
    "a second upright answer means the face really is square on, and the first answer stands");
});

test("the corrective names the exact failure", () => {
  assert.match(prepare, /That is the rectangle AROUND the surface, not the surface/);
  assert.match(prepare, /If the face genuinely faces the camera squarely, return the same answer/);
});

test("the corrective runs at most once", () => {
  // A loop here would be an unbounded spend on a model that may never comply.
  const block = prepare.slice(prepare.indexOf("let cornersRetried = false"), prepare.indexOf("const productBox ="));
  assert.ok(!/while|for \(/.test(block), "no loop around the corrective");
});

test("D606 revisited - the silhouette diagnostic did not go quiet", () => {
  /* Making the analyser path "measured" switched off the one line that recorded
     WHY the silhouette was missing, which is how a live investigation lost its
     only instrument. */
  assert.match(prepare, /const silhouetteNote = segmentation\?\.mask \? "" :/);
  assert.match(prepare, /box-without-mask/, "a box with no decodable mask is a different fault from no response");
  assert.match(prepare, /upright-quad/, "and an upright quad is recorded whether or not it was corrected");
});
