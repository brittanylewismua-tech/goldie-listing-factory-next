/* D613 - the regression that cost a day, and the guard that must not be narrowed
   again.

   D594 preserved neck-label artwork by passing the saved template's image OBJECTS
   through untouched. Those objects carry the template product's image IDs, so
   every new product request named an image belonging to a different product.
   Printify answered 400 / 8253 "Provided images do not exist" - correctly, and
   about the label, not the design we had just uploaded.

   Deterministic from the moment D594 shipped. Re-uploading the design could never
   help, because the stale label ID stayed in the payload on every retry. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { printAreasWithOnlyCurrentArtwork, isLabelPlaceholder } from "../app/api/printify/product-payload.ts";

const areas = (extra = {}) => ([{
  variant_ids: [1, 2],
  placeholders: [
    { position: "front", images: [{ id: "TEMPLATE_FRONT", x: .5, y: .5, scale: .4, angle: 0 }] },
    { position: "neck", images: [{ id: "TEMPLATE_LABEL", src: "https://images.printify.com/label.png", x: .5, y: .1, scale: .1, angle: 0 }] },
  ],
  ...extra,
}]);

test("no inherited template image ID ever reaches product creation", () => {
  const out = printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined,
    new Map([["TEMPLATE_LABEL", "FRESH_LABEL"]]));
  const ids = out.flatMap(a => a.placeholders.flatMap(p => p.images.map(i => i.id)));
  assert.ok(!ids.includes("TEMPLATE_LABEL"), "the label's template ID must not go out");
  assert.ok(!ids.includes("TEMPLATE_FRONT"), "nor the front's");
  assert.deepEqual([...new Set(ids)].sort(), ["FRESH_DESIGN", "FRESH_LABEL"]);
});

test("label artwork receives a newly uploaded ID, and keeps its placement", () => {
  const out = printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined,
    new Map([["TEMPLATE_LABEL", "FRESH_LABEL"]]));
  const label = out[0].placeholders.find(p => isLabelPlaceholder(p.position));
  assert.equal(label.images[0].id, "FRESH_LABEL");
  assert.equal(label.images[0].x, .5, "the label's own placement is untouched");
  assert.equal(label.images[0].scale, .1);
});

test("the main artwork never enters a label placeholder", () => {
  assert.throws(() => printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined,
    new Map([["TEMPLATE_LABEL", "FRESH_DESIGN"]])),
    /print the design on a label/);
});

test("a label with no re-uploaded ID fails loudly and creates nothing", () => {
  /* Silently dropping the seller's branding is the quiet damage this codebase
     keeps having to undo. No mapping means no draft. */
  assert.throws(() => printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN"),
    /could not re-upload the neck label artwork/);
  assert.throws(() => printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined, new Map()),
    /could not re-upload the neck label artwork/);
});

test("the guard covers labels too, not only print sides", () => {
  /* D594 narrowed this guard to print sides only, which is precisely what let the
     stale label ID out. A replacement that is itself an inherited ID must not
     satisfy it either. */
  assert.throws(() => printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined,
    new Map([["TEMPLATE_LABEL", "TEMPLATE_LABEL"]])),
    /inherited template image ID/);
  assert.throws(() => printAreasWithOnlyCurrentArtwork(areas(), "FRESH_DESIGN", undefined, undefined,
    new Map([["TEMPLATE_LABEL", "TEMPLATE_FRONT"]])),
    /inherited template image ID/);
});

test("a product with no label is unaffected", () => {
  const plain = [{ variant_ids: [1], placeholders: [{ position: "front", images: [{ id: "TEMPLATE_FRONT" }] }] }];
  const out = printAreasWithOnlyCurrentArtwork(plain, "FRESH_DESIGN");
  assert.equal(out[0].placeholders[0].images[0].id, "FRESH_DESIGN");
});

/* D613 - the retry ladder was the wrong shape for a deterministic payload error.
   Seven attempts over 125 seconds, four runs, all identical. */
const creation = (await import("node:fs/promises")).readFile;
const source = (path) => creation(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("a repeated image error stops quickly instead of running the full ladder", async () => {
  const code = strip(await source("app/api/printify/product-creation.ts"));
  assert.match(code, /const IMAGE_ERROR_LIMIT = 2/);
  assert.match(code, /if \(isImageNotReady\(response\.status, detail\)\) imageErrors \+= 1/);
  assert.match(code, /if \(imageErrors > IMAGE_ERROR_LIMIT\)/);
  assert.match(code, /Goldie stopped instead of retrying\. Nothing was created\./);
});

test("exactly one controlled re-upload, on the first image error", async () => {
  const route = strip(await source("app/api/printify/drafts/route.ts"));
  assert.match(route, /if \(imageErrors === 1\)/, "re-upload once, immediately");
  assert.ok(!/attempt === 3/.test(route), "the old third-attempt re-upload is gone");
});

test("transport faults keep the full ladder", async () => {
  // 429 and 5xx really do pass. Only the payload error is treated as final.
  const code = strip(await source("app/api/printify/product-creation.ts"));
  assert.match(code, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(code, /const waits = \[3000, 7000, 15000, 20000, 30000, 45000\]/);
});

test("a failed draft charges no quota and leaves no duplicate", async () => {
  const route = strip(await source("app/api/printify/drafts/route.ts"));
  /* The row is marked failed on any throw, and the plan check counts only
     succeeded rows plus recently-running ones - so a failure frees the slot. */
  assert.match(route, /SET status = 'failed'[\s\S]{0,80}WHERE request_key = \? AND status != 'succeeded'/);
  assert.match(route, /COUNT\(\*\) count FROM printify_draft_results WHERE user_id=\? AND \(\(status='succeeded'/);
  /* One row per batch+design, and a succeeded row short-circuits before any
     Printify call, so a retry cannot create a second product. */
  assert.match(route, /ON CONFLICT\(request_key\) DO UPDATE/);
  assert.match(route, /if \(prior\?\.status === "succeeded" && prior\.response_json\) return NextResponse\.json\(\{ draft: JSON\.parse\(prior\.response_json\) \}\)/);
});
