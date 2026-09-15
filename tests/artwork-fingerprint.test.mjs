/**
 * RANKING A PRINT FILE AGAINST A PHOTOGRAPH OF A T-SHIRT.
 *
 * These are not the same kind of picture, and every cheap measure will
 * disagree about them. The property that matters is not accuracy — it is that
 * nothing here can permanently reject a pair.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fingerprint, plausibility } from "../app/artwork-fingerprint.ts";

const route = readFileSync(
  new URL("../app/api/shop-map/benchmark-candidates/route.ts", import.meta.url), "utf8");
const module = readFileSync(
  new URL("../app/artwork-fingerprint.ts", import.meta.url), "utf8");

/** A tiny image of flat colour, with an optional dark block for structure. */
const image = (size, base, block) => {
  const rgb = new Uint8Array(size * size * 3).fill(base);
  if (block)
    for (let y = 2; y < size / 2; y += 1)
      for (let x = 2; x < size / 2; x += 1) {
        const at = (y * size + x) * 3;
        rgb[at] = 10; rgb[at + 1] = 10; rgb[at + 2] = 10;
      }
  return { width: size, height: size, rgb };
};

test("a fingerprint is stable for the same picture", () => {
  const once = fingerprint(image(16, 240, true));
  const twice = fingerprint(image(16, 240, true));
  assert.deepEqual(once, twice);
});

test("two different pictures produce different fingerprints", () => {
  const plain = fingerprint(image(16, 240, false));
  const marked = fingerprint(image(16, 240, true));
  assert.notEqual(plain.dHash, marked.dHash);
  assert.ok(marked.inkShare > plain.inkShare);
});

test("the same design scores higher than an unrelated one", () => {
  const artwork = fingerprint(image(16, 240, true));
  const same = fingerprint(image(16, 235, true));
  const different = fingerprint(image(16, 60, false));
  assert.ok(plausibility(artwork, same).score > plausibility(artwork, different).score);
});

test("the score can always be taken apart", () => {
  /* A single number nobody can decompose is how a false rejection hides. */
  const out = plausibility(fingerprint(image(16, 240, true)), fingerprint(image(16, 100, false)));
  assert.deepEqual(Object.keys(out.parts).sort(),
    ["busyness", "colour", "structure", "tone"]);
});

test("transparency is flattened to white, not left as black", () => {
  /* A transparent print file rendered on black would invent a dark shape that
     is not in the design, and then match dark garments. */
  assert.match(module, /Transparency is the whole difference/);
  assert.match(module, /255 \* \(1 - alpha\)/);
});

test("nothing in the candidate pass rejects a pair", () => {
  assert.match(route, /NOTHING IS REJECTED HERE/);
  assert.match(route, /Kept whatever they scored/);
  /* Every artwork keeps candidates regardless of score. */
  assert.match(route, /candidates: scored\.slice\(0, keepPerArtwork\)/);
  assert.doesNotMatch(route, /filter\(\w+ => \w+\.score > /);
});

test("the pass writes nothing and claims no relationship", () => {
  assert.doesNotMatch(route, /UPDATE artwork_provenance|INSERT INTO artwork_provenance/);
  assert.match(route, /No pair here is a relationship, and nothing was written/);
  assert.match(route, /TECHNICAL VALIDATION ONLY/);
});

test("the signals it has not used yet are named", () => {
  /* So a weak result can be attributed rather than guessed at. */
  assert.match(route, /notUsedYet/);
  assert.match(route, /ORB features/);
});

test("the PNG decoder undoes every filter", () => {
  /* Skipping a filter gives noise that looks like data, which is worse than
     failing outright. */
  for (const filter of ["filter === 1", "filter === 2", "filter === 3", "filter === 4"])
    assert.match(module, new RegExp(filter.replace(/ /g, "\\s*")));
});
