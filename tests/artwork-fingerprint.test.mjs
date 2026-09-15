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

/*
  THE DECODER IS THE MEASUREMENT INSTRUMENT.

  Thirteen of thirty-three artworks and ten of sixty mockups were thrown away
  by the first pass as "could not be decoded". A benchmark that silently loses
  forty per cent of its subjects is not measuring what it claims to measure,
  so every PNG colour type and bit depth is built here and decoded back.
*/
import { deflateSync } from "node:zlib";
import { decodeTinyPng } from "../app/artwork-fingerprint.ts";

const chunk = (type, body) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of typed) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const check = Buffer.alloc(4);
  check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typed, check]);
};

/* Build a PNG with no filtering, so the test exercises decoding rather than
   whatever an encoder happened to choose. */
const png = ({ width, height, bitDepth, colourType, rows, palette, transparency }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = colourType;
  const raw = Buffer.concat(rows.map(row => Buffer.concat([Buffer.from([0]), Buffer.from(row)])));
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header)];
  if (palette) parts.push(chunk("PLTE", Buffer.from(palette)));
  if (transparency) parts.push(chunk("tRNS", Buffer.from(transparency)));
  parts.push(chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  const out = Buffer.concat(parts);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
};

const pixel = (image, x, y) => {
  const at = (y * image.width + x) * 3;
  return [image.rgb[at], image.rgb[at + 1], image.rgb[at + 2]];
};

test("truecolour 8-bit decodes to the colours that went in", async () => {
  const result = await decodeTinyPng(png({
    width: 2, height: 1, bitDepth: 8, colourType: 2,
    rows: [[255, 0, 0, 0, 0, 255]],
  }));
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(pixel(result.image, 0, 0), [255, 0, 0]);
  assert.deepEqual(pixel(result.image, 1, 0), [0, 0, 255]);
});

test("a palette PNG is expanded rather than refused", async () => {
  const result = await decodeTinyPng(png({
    width: 2, height: 1, bitDepth: 8, colourType: 3,
    palette: [10, 20, 30, 200, 100, 50],
    rows: [[0, 1]],
  }));
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(pixel(result.image, 0, 0), [10, 20, 30]);
  assert.deepEqual(pixel(result.image, 1, 0), [200, 100, 50]);
  assert.match(result.note, /palette expanded/);
});

test("a transparent palette entry becomes white, not black", async () => {
  const result = await decodeTinyPng(png({
    width: 2, height: 1, bitDepth: 8, colourType: 3,
    palette: [0, 0, 0, 0, 0, 0],
    transparency: [0, 255],
    rows: [[0, 1]],
  }));
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(pixel(result.image, 0, 0), [255, 255, 255]);
  assert.deepEqual(pixel(result.image, 1, 0), [0, 0, 0]);
});

test("greyscale and greyscale-with-alpha both decode", async () => {
  const grey = await decodeTinyPng(png({
    width: 2, height: 1, bitDepth: 8, colourType: 0, rows: [[0, 255]] }));
  assert.ok(grey.ok, grey.ok ? "" : grey.reason);
  assert.deepEqual(pixel(grey.image, 0, 0), [0, 0, 0]);

  /* Black at zero alpha must land on white — the ground a print is compared
     against — not on the black it nominally carries. */
  const alpha = await decodeTinyPng(png({
    width: 2, height: 1, bitDepth: 8, colourType: 4, rows: [[0, 0, 0, 255]] }));
  assert.ok(alpha.ok, alpha.ok ? "" : alpha.reason);
  assert.deepEqual(pixel(alpha.image, 0, 0), [255, 255, 255]);
  assert.deepEqual(pixel(alpha.image, 1, 0), [0, 0, 0]);
});

test("16-bit is down-converted instead of producing noise", async () => {
  const result = await decodeTinyPng(png({
    width: 1, height: 1, bitDepth: 16, colourType: 2,
    rows: [[255, 255, 0, 0, 128, 128]],
  }));
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(pixel(result.image, 0, 0), [255, 0, 128]);
  assert.match(result.note, /down-converted/);
});

test("low bit depths are scaled to the full range", async () => {
  /* Four one-bit greyscale pixels packed into a single byte: 1, 0, 1, 0. */
  const result = await decodeTinyPng(png({
    width: 4, height: 1, bitDepth: 1, colourType: 0, rows: [[0b10100000]] }));
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(pixel(result.image, 0, 0), [255, 255, 255]);
  assert.deepEqual(pixel(result.image, 1, 0), [0, 0, 0]);
});

test("every filter type reconstructs the same picture", async () => {
  const width = 4;
  const plain = [];
  for (let x = 0; x < width; x += 1) plain.push(40 + x * 20, 90, 200 - x * 10);
  for (const filter of [0, 1, 2, 3, 4]) {
    const filtered = [];
    for (let index = 0; index < plain.length; index += 1) {
      const left = index >= 3 ? plain[index - 3] : 0;
      /* One row only, so "up" and "up-left" are zero by definition. */
      const value = filter === 1 ? plain[index] - left
        : filter === 3 ? plain[index] - (left >> 1)
        : filter === 4 ? plain[index] - left
        : plain[index];
      filtered.push(value & 0xff);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8; header[9] = 2;
    const raw = Buffer.concat([Buffer.from([filter]), Buffer.from(filtered)]);
    const out = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    const result = await decodeTinyPng(
      out.buffer.slice(out.byteOffset, out.byteOffset + out.length));
    assert.ok(result.ok, `filter ${filter}: ${result.ok ? "" : result.reason}`);
    assert.deepEqual([...result.image.rgb], plain, `filter ${filter} did not reconstruct`);
  }
});

test("a decode failure names its exact reason", async () => {
  const notPng = await decodeTinyPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
  assert.equal(notPng.ok, false);
  assert.equal(notPng.reason, "not a PNG");

  const truncated = await decodeTinyPng(png({
    width: 8, height: 8, bitDepth: 8, colourType: 2, rows: [[0, 0, 0]] }));
  assert.equal(truncated.ok, false);
  assert.match(truncated.reason, /truncated/);
});

test("the benchmark records the reason it was given, not a generic phrase", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/benchmark-candidates/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /could not be decoded/);
  assert.match(route, /result\.failed/);
});
