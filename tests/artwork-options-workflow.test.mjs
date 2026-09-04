import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("artwork versions stay attached to one listing design and survive resume", async () => {
  const [app, cache] = await Promise.all([read("../app/listing-factory-app.tsx"), read("../app/batch-cache.ts")]);
  assert.match(app, /artworkVersions\?:ArtworkVersion\[\]/);
  assert.match(app, /artworkVersions:artworkVersions\?\.map/);
  assert.match(app, /loadBatchArtworkAssets/);
  assert.match(app, /saveBatchArtworkAssets/);
  assert.match(cache, /assets\?:Record<string,File>/);
  assert.match(cache, /saveBatchArtworkAssets/);
  assert.match(cache, /loadBatchArtworkAssets/);
});

test("the controls distinguish primary colour artwork from every secondary print area", async () => {
  const [app,assignment] = await Promise.all([read("../app/listing-factory-app.tsx"),read("../app/artwork-assignment.ts")]);
  assert.match(app, /Use different artwork for \$\{focused\.title\}/);
  assert.match(app, /Using the main design/);
  assert.match(app, /Use main design/);
  assert.match(app, /artworkVersions\|\|\[\]\)\.every\(artwork=>!artwork\.originalUnavailable&&artwork\.file\?\.size&&artwork\.colorIds\.length>0&&\(artwork\.productIds\?\.length\?\?1\)>0\)/, "unused, unassigned, or missing secondary artwork must hold the draft gate");
  assert.match(app, /addArtworkVersion\(file\.id,side/);
  assert.match(app, /toggleArtworkColor/);
  assert.match(assignment, /artwork\.id===artworkId\?\[\.\.\.new Set\(\[\.\.\.artwork\.colorIds,colorId\]\)\]:artwork\.colorIds\.filter/, "one primary-side color cannot silently use two artworks");
});

test("colour-specific artwork is introduced only after Printify has rendered the draft previews", async () => {
  const app = await read("../app/listing-factory-app.tsx");
  assert.match(app, /Color-specific artwork is chosen later, beside the finished Printify color previews\./);
  assert.doesNotMatch(app, /Review the primary artwork, any color-specific alternatives/);
  assert.match(app, /Choose product colors/);
});

test("ordinary one-artwork listings retain the established request", async () => {
  const app = await read("../app/listing-factory-app.tsx");
  assert.match(app, /versions\.length\?\{\.\.\.commonDraftRequest,artworks:stagedArtworks,artworkAssignments\}:\{\.\.\.commonDraftRequest,maxPlacementScale/);
  assert.match(app, /fileName:stagedArtworks\[0\]\.fileName,stagedId:stagedArtworks\[0\]\.stagedId/);
});

test("Printify reports only print sides with saved placement", async () => {
  const route = await read("../app/api/printify/route.ts");
  assert.match(route, /const printPositions=\[\.\.\.new Set\(configuredPlacements/);
  assert.match(route, /printPositions, shop:/);
});

test("all staged artwork is ownership checked, retried together, and cleaned up", async () => {
  const route = await read("../app/api/printify/drafts/route.ts");
  assert.match(route, /for \(const artwork of requestedArtworks\)/);
  assert.match(route, /customMetadata\?\.owner !== user\.userId/);
  assert.match(route, /const uploadAllArtwork = async/);
  assert.match(route, /if \(imageErrors === 1\) \{\s*await uploadAllArtwork\(\)/);
  assert.match(route, /Promise\.all\(\[\.\.\.new Set\(stagedIdsForCleanup\)\]/);
});
