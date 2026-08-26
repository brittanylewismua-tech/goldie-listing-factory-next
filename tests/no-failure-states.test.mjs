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

test("a failed reading never overwrites corners that were measured", async () => {
  const route = await read("app/api/mockups/library/[id]/prepare/route.ts");
  /* D578 - found live: all three of her sets fell back to derived, and because
     store() wrote cornersJson unconditionally, a failed reading replaced real
     measured areas with a blind default. BACH TEES went from a measured
     43.5% x 48.5% region to 35.3% x 33.6%. A failure to read the photograph is
     not new information about it. */
  assert.match(route, /const keepCorners = Boolean\(preparation\.derived\) && measuredAlready/);
  assert.match(route, /preparationJson: JSON\.stringify\(kept\)/,
    "the protected corners must be the preparation that is cached, not only the response");
  assert.match(route, /\.\.\.\(keepCorners \? \{\} : \{ cornersJson: JSON\.stringify\(preparation\.corners\) \}\)/);
});

test("D583: old measured rectangles are not grandfathered into silhouette trust", async () => {
  const route = await read("app/api/mockups/library/[id]/prepare/route.ts");
  assert.match(route, /previous\?\.version === SCENE_PREPARATION_VERSION/);
  assert.match(route, /previous\.productSilhouetteVerified === true/);
  assert.doesNotMatch(route, /const keepCorners = Boolean\(preparation\.derived\) && measuredAlready;/);
});

test("why a scene fell back is recorded and readable", async () => {
  const route = await read("app/api/mockups/library/[id]/prepare/route.ts");
  const library = await read("app/api/mockups/library/route.ts");
  assert.match(route, /preparationError: reason/);
  assert.match(route, /"no-analyser-configured"/);
  assert.match(route, /model-geometry-invalid/);
  assert.match(route, /product-mask-unavailable/);
  assert.match(route, /rleDiagnostic/);
  assert.doesNotMatch(route, /rleDiagnostic[^\n]+String\(value\)/,
    "diagnostics record only shape and length, never the mask payload");
  assert.match(route, /model-surface-mask-coverage:/);
  assert.match(route, /store\(preparation, attempt, result\.fallbackReason\)/,
    "a successful preparation that used a fallback must say why");
  assert.match(library, /preparationError: row\.preparationError/,
    "the reason must be readable without shipping a new build to find it");
});

test("D585: cached pre-diagnostic preparations are retired", async () => {
  /* Pinning the exact number made every later generation a test failure, which
     is backwards: the point is that the generation only ever moves FORWARD, so
     preparations produced by superseded code cannot be served from cache. */
  const prepared = await read("app/mockups/prepared-scene.ts");
  const version = Number(/SCENE_PREPARATION_VERSION = (\d+)/.exec(prepared)?.[1]);
  assert.ok(Number.isInteger(version) && version >= 7,
    `the preparation generation must be at least 7, found ${version}`);
});

test("silhouette validation is required, while optional enrichment cannot discard it", async () => {
  const route = await read("app/api/mockups/library/[id]/prepare/route.ts");
  /* D580 - measured live on her freshly uploaded sets: 16 of 19 scenes analysed
     successfully, passed validation, and were then discarded because the SAM
     surface-mask call threw and the caller treated any throw as "preparation
     failed". Those masks and the depth map are stored and never read by the
     renderer at all. Geometry is the only required output. */
  assert.match(route, /const optional = async <T>\(task: \(\) => Promise<T>\)/);
  assert.match(route, /fal-ai\/sam-3\/image-rle/,
    "the product boundary must be a pixel mask, not a bounding rectangle");
  assert.match(route, /quadStaysOnMask\(segmentation\.mask, reading\.geometry\.corners\)/,
    "a plausible quadrilateral is not trusted until the silhouette approves it");
  assert.match(route, /optional\(\(\) => falJson\("fal-ai\/image-preprocessors\/depth-anything\/v2"/,
    "nor the depth map");
  assert.doesNotMatch(route, /storeRemoteAsset\(surfaceMaskUrl/,
    "the renderer must not download and save a surface image it never reads");
  assert.doesNotMatch(route, /throw new Error\("The printable product surface was not isolated\."\)/);
  assert.doesNotMatch(route, /throw new Error\("The product surface depth was not measured\."\)/);
  assert.doesNotMatch(route, /throw new Error\("The foreground crossing the print surface was not isolated\."\)/);
});
