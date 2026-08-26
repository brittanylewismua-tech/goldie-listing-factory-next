/* Stage 1 persistence: two records, two lifetimes, never merged.

   The failure this guards against is the one that would break immediately in
   production - a correction made for one design being served to a different
   design on the same scene, same product, same print side. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("an override cannot be loaded for a different design", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  // The key includes the design, so an identical scene/product/side pair still
  // cannot reach another design's correction.
  assert.match(route, /const overrideKey = \(userId: string, listingId: string, designKey: string, sceneId: string\)/);
  assert.match(route, /\[userId, listingId, designKey, sceneId\]\.join\("\|"\)/);
  // And it is only queried when a design key was actually supplied.
  assert.match(route, /listingId && designKey \? await db\.select\(\)\.from\(mockupArtworkOverrides\)/);
});

test("the two keys are built from different things", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  // Scene geometry is keyed by the SURFACE - never by listing or design, or it
  // could not be reused; never without side/family, or it would be misapplied.
  assert.match(route, /\[userId, body\.sceneId, body\.productFamily, body\.printSide,/);
  const geometryKeyBlock = route.slice(route.indexOf("const geometryKey"), route.indexOf("const overrideKey"));
  for (const forbidden of ["listingId", "designKey"])
    assert.ok(!geometryKeyBlock.includes(forbidden),
      `scene geometry must not be keyed by ${forbidden} - it is a fact about the photograph`);
});

test("an override is stored relative to Printify, never as absolute corners", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  const schema = await read("db/schema.ts");
  for (const relative of ["offsetU", "offsetV", "scaleMultiplier"])
    assert.ok(route.includes(relative), `${relative} must be part of the override`);
  // The one thing that must never be persisted as an override: final corners.
  const overrides = schema.slice(schema.indexOf("mockupArtworkOverrides"));
  assert.ok(!/corners/i.test(overrides.slice(0, 1200)),
    "a design's absolute corners must never be stored as reusable placement");
});

test("background preparation cannot overwrite an improved scene", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  assert.match(route, /if \(!\(existing\?\.origin === "seller-adjusted" && incomingOrigin === "automatic"\)\)/,
    "an automatic write must be refused when the seller has already improved the scene");
});

test("scene geometry carries the material settings, not an artwork transform", async () => {
  const schema = await read("db/schema.ts");
  const geometry = schema.slice(schema.indexOf("mockupSceneGeometry"), schema.indexOf("mockupArtworkOverrides"));
  for (const field of ["surfaceJson", "curvature", "fabricStrength", "blendMode", "renderingMode"])
    assert.ok(geometry.includes(field), `scene geometry needs ${field}`);
  for (const forbidden of ["offsetU", "scaleMultiplier", "rotation"])
    assert.ok(!geometry.includes(forbidden),
      `${forbidden} belongs to one design and must not live on the reusable scene record`);
});

test("the tables are created on a database that predates them", async () => {
  const storage = await read("app/api/mockups/storage.ts");
  assert.match(storage, /CREATE TABLE IF NOT EXISTS mockup_scene_geometry/);
  assert.match(storage, /CREATE TABLE IF NOT EXISTS mockup_artwork_overrides/);
});
