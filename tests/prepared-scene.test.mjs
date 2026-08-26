import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSceneAnalysis,
  preparationMatchesProduct,
  SCENE_PREPARATION_VERSION,
  sceneAnalysisPrompt,
} from "../app/mockups/prepared-scene.ts";

test("D576: scene preparation supports apparel, flat, cylindrical and irregular POD geometry", () => {
  const fixtures = [
    ["Gildan 5000 T-Shirt", "flexible", [[.25,.2],[.75,.2],[.72,.8],[.28,.8]]],
    ["Ceramic Mug 11oz", "cylindrical", [[.25,.2],[.7,.24],[.68,.78],[.27,.8]]],
    ["Framed Poster", "perspective", [[.08,.06],[.92,.1],[.88,.94],[.12,.9]]],
    ["Phone Case", "irregular", [[.2,.08],[.8,.08],[.82,.92],[.18,.92]]],
  ];
  for (const [product, geometry, corners] of fixtures) {
    const result = normalizeSceneAnalysis({ corners, side:"front", geometry, occluded:false }, product);
    assert.ok(result, `${product} must produce a reusable scene profile`);
    assert.equal(result.geometry, geometry);
  }
});

test("D576: a prepared scene is reused only for a compatible product family", () => {
  const preparation = {
    version:SCENE_PREPARATION_VERSION, status:"ready", productFamily:"apparel", geometry:"flexible",
    printSide:"front", corners:[[.2,.2],[.8,.2],[.8,.8],[.2,.8]], occluded:false, preparedAt:new Date(0).toISOString(),
  };
  assert.equal(preparationMatchesProduct(preparation, "Gildan Hoodie"), true);
  assert.equal(preparationMatchesProduct(preparation, "Ceramic Mug"), false);
});

test("D576: the analysis contract uses the Printify area and never a centre-box guess", () => {
  const prompt = sceneAnalysisPrompt("Gildan Hoodie");
  assert.match(prompt, /complete Printify print area/);
  assert.match(prompt, /pocket-scale, oversized/);
  assert.match(prompt, /hood, hair, hand, arm, strap/);
  assert.doesNotMatch(prompt, /middle 70%|42%/);
});
