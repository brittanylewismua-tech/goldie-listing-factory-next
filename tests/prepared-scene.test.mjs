import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSceneAnalysis,
  boxFromCxCyWh,
  cornersStayOnProduct,
  computedSceneCorners,
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
    const result = normalizeSceneAnalysis({ corners, productBox:{left:.03,top:.03,right:.97,bottom:.97}, side:"front", geometry, occluded:false }, product);
    assert.ok(result, `${product} must produce a reusable scene profile`);
    assert.equal(result.geometry, geometry);
  }
});

test("D582: a plausible quadrilateral is rejected when it leaves the product", () => {
  const productBox = { left:.18, top:.1, right:.62, bottom:.92 };
  const offTheShirt = [[.43,.2],[.88,.2],[.88,.78],[.43,.78]];
  assert.equal(cornersStayOnProduct(offTheShirt, productBox), false);
  assert.equal(normalizeSceneAnalysis({
    productBox, corners:offTheShirt, side:"front", geometry:"flexible", occluded:false,
  }, "Gildan Tee"), null);
});

test("D582: the three live bad readings cannot pass product-bound validation", () => {
  const live = [
    ["Gildan Tee", [[.208,.24],[.802,.24],[.802,.91],[.208,.91]], {left:.16,top:.12,right:.69,bottom:.93}],
    ["Gildan Hoodie", [[.29,.23],[.89,.23],[.89,.86],[.29,.86]], {left:.18,top:.08,right:.76,bottom:.94}],
    ["Ceramic Mug", [[.26,.29],[.64,.29],[.64,.74],[.26,.74]], {left:.24,top:.34,right:.72,bottom:.82}],
  ];
  for (const [product, corners, productBox] of live) {
    assert.equal(normalizeSceneAnalysis({ productBox, corners, side:"front", geometry:"flexible", occluded:false }, product), null,
      `${product} must reject the reading measured off the product`);
    assert.equal(cornersStayOnProduct(computedSceneCorners(product, productBox), productBox), true,
      `${product} must replace it with a surface inside the product`);
  }
});

test("D582: SAM's cxcywh box is converted before it validates a print area", () => {
  const converted = boxFromCxCyWh([.5,.5,.6,.8]);
  assert.ok(Math.abs(converted.left-.2)<1e-9 && Math.abs(converted.top-.1)<1e-9
    && Math.abs(converted.right-.8)<1e-9 && Math.abs(converted.bottom-.9)<1e-9);
  const productBox = boxFromCxCyWh([.5,.5,.6,.8]);
  const safe = computedSceneCorners("Gildan Hoodie", productBox);
  assert.equal(cornersStayOnProduct(safe, productBox), true);
});

test("D582: mug fallback stays below the rim and inside the detected mug body", () => {
  const mugBody = { left:.3, top:.2, right:.72, bottom:.84 };
  const corners = computedSceneCorners("Ceramic Mug", mugBody);
  assert.equal(cornersStayOnProduct(corners, mugBody), true);
  assert.ok(Math.min(...corners.map(point=>point[1])) > mugBody.top);
});

test("D576: a prepared scene is reused only for a compatible product family", () => {
  const preparation = {
    version:SCENE_PREPARATION_VERSION, status:"ready", productFamily:"apparel", geometry:"flexible",
    printSide:"front", corners:[[.2,.2],[.8,.2],[.8,.8],[.2,.8]], productBoundsVerified:true,
    occluded:false, preparedAt:new Date(0).toISOString(),
  };
  assert.equal(preparationMatchesProduct(preparation, "Gildan Hoodie"), true);
  assert.equal(preparationMatchesProduct(preparation, "Ceramic Mug"), false);
});

test("D576: the analysis contract uses the Printify area and never a centre-box guess", () => {
  const prompt = sceneAnalysisPrompt("Gildan Hoodie");
  assert.match(prompt, /complete Printify print area/);
  assert.match(prompt, /productBox/);
  assert.match(prompt, /Every print-area corner and its centre must stay inside productBox/);
  assert.match(prompt, /pocket-scale, oversized/);
  assert.match(prompt, /hood, hair, hand, arm, strap/);
  assert.doesNotMatch(prompt, /middle 70%|42%/);
});
