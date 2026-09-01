import { test } from "node:test";
import assert from "node:assert/strict";
import { printAreasForArtworkAssignments } from "../app/api/printify/product-payload.ts";

const template = [{
  variant_ids: [101, 102, 103, 104],
  background: "#ffffff",
  placeholders: [
    { position: "front", images: [{ id: "old-front", x: .5, y: .46, scale: .82, angle: 0 }] },
    { position: "back", images: [{ id: "old-back", x: .5, y: .5, scale: .76, angle: 0 }] },
    { position: "neck", images: [{ id: "old-label", x: .5, y: .2, scale: 1, angle: 0 }] },
  ],
}];

test("maps light and dark artwork to different garment variants", () => {
  const result = printAreasForArtworkAssignments(template, [
    { position: "front", variantIds: [101, 102], artworkKey: "dark-ink" },
    { position: "front", variantIds: [103, 104], artworkKey: "light-ink" },
  ], { "dark-ink": "upload-dark", "light-ink": "upload-light" });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((area) => area.variant_ids), [[101, 102], [103, 104]]);
  assert.deepEqual(result.map((area) => area.placeholders[0].images[0].id), ["upload-dark", "upload-light"]);
  assert.ok(result.every((area) => area.placeholders[0].position === "front"));
});

test("supports separate front and back artwork on the same variants", () => {
  const result = printAreasForArtworkAssignments(template, [
    { position: "front", variantIds: [101, 102], artworkKey: "front-art" },
    { position: "back", variantIds: [101, 102], artworkKey: "back-art" },
  ], { "front-art": "upload-front", "back-art": "upload-back" });
  assert.equal(result.length, 1, "Printify receives one variant group with both sides");
  assert.deepEqual(result[0].placeholders.map((placeholder) => placeholder.position), ["back", "front"]);
  assert.deepEqual(result[0].placeholders.map((placeholder) => placeholder.images[0].id), ["upload-back", "upload-front"]);
});

test("never carries inherited artwork or an inside label", () => {
  const result = printAreasForArtworkAssignments(template, [
    { position: "front", variantIds: [101], artworkKey: "art" },
  ], { art: "fresh-upload" });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /old-front|old-back|old-label/);
  assert.doesNotMatch(serialized, /neck/);
});

test("rejects duplicate assignments for one variant and side", () => {
  assert.throws(() => printAreasForArtworkAssignments(template, [
    { position: "front", variantIds: [101], artworkKey: "a" },
    { position: "front", variantIds: [101], artworkKey: "b" },
  ], { a: "upload-a", b: "upload-b" }), /more than one artwork assignment/);
});

test("rejects a side that the saved Printify product has not prepared", () => {
  assert.throws(() => printAreasForArtworkAssignments(template, [
    { position: "left_sleeve", variantIds: [101], artworkKey: "art" },
  ], { art: "fresh-upload" }), /does not have prepared placement/);
});

test("rejects missing uploads and label assignments", () => {
  assert.throws(() => printAreasForArtworkAssignments(template, [
    { position: "front", variantIds: [101], artworkKey: "missing" },
  ], {}), /was not uploaded/);
  assert.throws(() => printAreasForArtworkAssignments(template, [
    { position: "neck", variantIds: [101], artworkKey: "art" },
  ], { art: "fresh-upload" }), /inside-label/);
});
