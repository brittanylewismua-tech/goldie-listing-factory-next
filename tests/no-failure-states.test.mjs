/* D577 - the guarantee, pinned.

   Every selected scene produces a mockup. There is no path where a seller is
   handed a calibration task, an unprepared scene, a partial batch, or an error
   screen. Preparation reads the photograph when it can and computes the surface
   from the product's own geometry when it cannot - and Printify owns the
   artwork's side, scale, position and rotation inside that surface either way,
   so a computed surface never means a guessed placement.

   These assertions exist to make reintroducing a failure state loud. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computedPreparation, computedSceneCorners, printAreaWithinProduct } from "../app/mockups/prepared-scene.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("preparation always returns a ready scene, for every product family", () => {
  for (const product of ["Unisex Hoodie", "Gildan Tee", "Ceramic Mug", "Matte Poster",
    "Shower Curtain", "Spiral Notebook", "Tote Bag", "Artisanal Whatsit", ""]) {
    const prepared = computedPreparation(product, null);
    assert.equal(prepared.status, "ready", `${product} must prepare`);
    assert.equal(prepared.corners.length, 4);
    for (const [x, y] of prepared.corners) {
      assert.ok(x > 0 && x < 1, `${product} corner x must sit inside the photograph`);
      assert.ok(y > 0 && y < 1, `${product} corner y must sit inside the photograph`);
    }
  }
});

test("a computed surface is placed on the product, not the whole frame", () => {
  // Given where the product actually sits, the print area follows it.
  const box = { left: .3, top: .2, right: .7, bottom: .9 };
  const corners = computedSceneCorners("Unisex Hoodie", box);
  const xs = corners.map((point) => point[0]), ys = corners.map((point) => point[1]);
  assert.ok(Math.min(...xs) >= box.left, "the print area cannot start left of the garment");
  assert.ok(Math.max(...xs) <= box.right, "nor extend past its right edge");
  assert.ok(Math.min(...ys) >= box.top && Math.max(...ys) <= box.bottom, "nor off the garment vertically");
});

test("a computed surface is a surface, never an artwork size", () => {
  // The old 42% constant decided how big the DESIGN was and overrode Printify.
  // These numbers decide only where the surface sits; Printify still places the
  // artwork inside it. A garment's surface is a panel, a poster's is the sheet.
  assert.ok(printAreaWithinProduct("Gildan Tee").width < .5, "a chest panel is not the whole garment");
  assert.ok(printAreaWithinProduct("Matte Poster").width > .85, "a poster is printed nearly edge to edge");
  assert.ok(printAreaWithinProduct("Ceramic Mug").width < .6, "a mug's face is not the whole mug");
});

test("no seller-facing failure survives in the render path", async () => {
  const integrated = await read("app/integrated-mockups.tsx");
  assert.doesNotMatch(integrated, /needs its print area confirmed/);
  assert.doesNotMatch(integrated, /if\(unmeasured\.length\)throw/);
  assert.match(integrated, /const measured=calibrated;/, "every selected scene renders");
});

test("no seller-facing failure survives in preparation", async () => {
  const route = await read("app/api/mockups/library/[id]/prepare/route.ts");
  // Exhausted retries, a missing analyser and a missing photograph all resolve
  // to a prepared scene rather than a status code the seller has to interpret.
  assert.doesNotMatch(route, /status: 503/);
  assert.doesNotMatch(route, /status: 410/);
  assert.match(route, /return store\(computedPreparation/);
});

test("no calibration tool is reachable by a seller", async () => {
  const page = await read("app/mockups/page.tsx");
  for (const gone of ["calibrateClick", "Mark where the design can print", "confirmArea"])
    assert.ok(!page.includes(gone), `${gone} must not exist in the seller flow`);
});
