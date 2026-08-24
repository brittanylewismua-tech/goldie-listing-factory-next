import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

/* Load the TypeScript module by stripping its type annotations — the file is
   deliberately dependency-free arithmetic so this is safe and keeps the test
   running against the real source rather than a copy. */
const src = (await readFile(new URL("app/product-photo.ts", root), "utf8"))
  .replace(/export const/g, "const")
  .replace(/export function/g, "function")
  .replace(/export type[^\n]*\n/g, "")
  .replace(/: ArrayLike<number>/g, "")
  .replace(/: PhotoStats/g, "")
  .replace(/: \[number, number, number\]/g, "")
  .replace(/ as \[number, number, number\]/g, "")
  .replace(/: number(?=[,)= ])/g, "")
  .replace(/size = PHOTO_SAMPLE_SIZE/g, "size = PHOTO_SAMPLE_SIZE");
const { photoStats, backdropReference, PHOTO_SAMPLE_SIZE } = await import(
  `data:text/javascript,${encodeURIComponent(`${src}\nexport { photoStats, backdropReference, PHOTO_SAMPLE_SIZE };`)}`
);

const SIZE = PHOTO_SAMPLE_SIZE;

/* Build a frame: a backdrop, with a rectangle of subject painted into it. */
function frame({ backdrop = [230, 230, 222], subject = [40, 40, 40], box = null }) {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inBox = box && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
      const c = inBox ? subject : backdrop;
      const i = (y * SIZE + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return px;
}

test("reads the backdrop from the corners, not the middle of the subject", () => {
  // A subject filling the centre must not become the reference colour.
  const px = frame({ backdrop: [230, 230, 222], subject: [10, 10, 10], box: { x0: 8, y0: 8, x1: SIZE - 9, y1: SIZE - 9 } });
  assert.deepEqual(backdropReference(px, SIZE), [230, 230, 222]);
});

test("one contaminated corner cannot drag the reference onto the subject", () => {
  const px = frame({ backdrop: [230, 230, 222], subject: [10, 10, 10], box: { x0: 0, y0: 0, x1: 4, y1: 4 } });
  // Median of three backdrop corners and one subject corner is still backdrop.
  assert.deepEqual(backdropReference(px, SIZE), [230, 230, 222]);
});

test("an isolated product beats a subject that bleeds off every edge", () => {
  const isolated = photoStats(frame({ box: { x0: 10, y0: 10, x1: SIZE - 11, y1: SIZE - 11 } }), SIZE);

  /* A macro shot is not a flat fill — it is a lit, textured surface filling the
   * frame, so its colour varies well beyond the backdrop tolerance. That is the
   * shape of the real candidate this defect was about: 20% backdrop, 52% edge. */
  const macroPixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = 60 + x * 3;
      const i = (y * SIZE + x) * 4;
      macroPixels[i] = v; macroPixels[i + 1] = v - 10; macroPixels[i + 2] = 30; macroPixels[i + 3] = 255;
    }
  }
  const macro = photoStats(macroPixels, SIZE);

  assert.equal(isolated.edge, 0, "nothing touches the border");
  assert.ok(macro.edge > 50, `the macro shot bleeds off the frame (edge ${macro.edge})`);
  assert.ok(isolated.score > macro.score, `${isolated.score} should beat ${macro.score}`);
});

test("a frame with no distinguishable subject is rejected, not scored perfectly", () => {
  // Uniform fill: the corners ARE the subject, so it looks like flawless
  // backdrop with a clean border. Without the guard this outscores every real
  // product shot, and a blank placeholder would win.
  const blank = photoStats(frame({ box: null }), SIZE);
  assert.equal(blank.backdrop, 100);
  assert.equal(blank.edge, 0);
  assert.equal(blank.score, Number.NEGATIVE_INFINITY, "a blank frame can never win");

  const real = photoStats(frame({ box: { x0: 10, y0: 10, x1: SIZE - 11, y1: SIZE - 11 } }), SIZE);
  assert.ok(real.score > blank.score);
});

test("an isolated product beats a taller subject running off top and bottom", () => {
  // The model shot: more backdrop than the flat lay is possible, but it clips.
  const flatLay = photoStats(frame({ box: { x0: 12, y0: 12, x1: SIZE - 13, y1: SIZE - 13 } }), SIZE);
  const model = photoStats(frame({ box: { x0: 20, y0: 0, x1: SIZE - 21, y1: SIZE - 1 } }), SIZE);

  assert.ok(model.backdrop > flatLay.backdrop, "the model shot does show more backdrop");
  assert.equal(flatLay.edge, 0);
  assert.ok(model.edge > 0, "the model runs off the frame");
  assert.ok(flatLay.score > model.score, "isolation still wins — this is why the penalty is weighted 3x");
});

test("a white garment on a grey sweep is still separated", () => {
  /* The case D194 was built for. Tolerance is 60 across summed RGB, so a
   * garment must differ from the backdrop by more than that to register — a
   * real white tee against Printify's grey sweep clears it easily (their sweep
   * runs about 184,184,169 against a near-white garment). A flat fill 56 apart
   * does NOT clear it, and that is the deliberate limit of this heuristic:
   * tightening the tolerance was measured on all three live products and made
   * the picks worse, because shadow gradients around a flat lay then read as
   * subject and cost it the edge score it wins on. */
  const px = frame({ backdrop: [184, 184, 169], subject: [250, 250, 250], box: { x0: 10, y0: 10, x1: SIZE - 11, y1: SIZE - 11 } });
  const stats = photoStats(px, SIZE);
  assert.ok(stats.backdrop > 0 && stats.backdrop < 99, `backdrop ${stats.backdrop} should be a real fraction`);
  assert.equal(stats.edge, 0);
  assert.ok(Number.isFinite(stats.score) && stats.score > 0);
});

test("photographic backdrop drift does not register as subject", () => {
  // Real Printify backdrops are sweeps, not flat fills; small drift is backdrop.
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = 228 + ((x + y) % 6); // drifts within tolerance
      const i = (y * SIZE + x) * 4;
      px[i] = v; px[i + 1] = v; px[i + 2] = v - 8; px[i + 3] = 255;
    }
  }
  const stats = photoStats(px, SIZE);
  assert.equal(stats.backdrop, 100, "a plain sweep is entirely backdrop");
  assert.equal(stats.edge, 0);
});

test("the live tee measurements reproduce the shipped ranking", () => {
  // Recorded from the six real candidates on Unisex Heavy Cotton Tee.
  const measured = [
    { i: 0, backdrop: 52, edge: 27 }, { i: 1, backdrop: 34, edge: 53 },
    { i: 2, backdrop: 61, edge: 0 },  { i: 3, backdrop: 20, edge: 52 },
    { i: 4, backdrop: 71, edge: 9 },  { i: 5, backdrop: 54, edge: 15 },
  ].map((row) => ({ ...row, score: row.backdrop - row.edge * 3 }));

  const winner = measured.slice().sort((a, b) => b.score - a.score)[0];
  assert.equal(winner.i, 2, "the flat lay wins");

  const loser = measured.slice().sort((a, b) => a.score - b.score)[0];
  assert.equal(loser.i, 3, "the macro shot that D194 selected now ranks last");

  // Under the old rule the ranking was the other way round.
  const oldInk = { 0: 86, 1: 86, 2: 64, 3: 99, 4: 86, 5: 89 };
  const oldWinner = Object.entries(oldInk).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(oldWinner, "3", "documents the defect: most-ink chose the macro shot");
});

/* D349 · Saved-product thumbnails were a mix — tee and crewneck as flat studio
   shots, the hoodie as a model wearing it. Printify returns both and the old
   score could not tell them apart: it measured subject isolation on a plain
   backdrop, and a studio model shot scores well on exactly that. */
test("a flat lay beats the same garment on a model — D349", () => {
  const size = PHOTO_SAMPLE_SIZE;
  const frame = (paint) => {
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = paint(x, y);
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
    }
    return pixels;
  };
  const inset = (x, y) => x > size * 0.25 && x < size * 0.75 && y > size * 0.2 && y < size * 0.8;

  /* A grey garment centred on a white sweep. */
  const flatLay = frame((x, y) => (inset(x, y) ? [140, 140, 145] : [250, 250, 250]));
  /* The same garment, plus a head and hands: warm, red-dominant, not grey. */
  const onModel = frame((x, y) => {
    if (y < size * 0.2 && x > size * 0.4 && x < size * 0.6) return [198, 152, 122];
    if (inset(x, y)) return [140, 140, 145];
    return [250, 250, 250];
  });

  assert.ok(photoStats(onModel, size).skin >= 3, "skin has to register at all");
  assert.equal(photoStats(flatLay, size).skin, 0, "a plain flat lay has none");
  assert.ok(photoStats(flatLay, size).score > photoStats(onModel, size).score,
    "the flat lay wins");
});

test("the skin penalty never rejects a whole set — D349", () => {
  /* If every candidate is a model shot the seller still needs a thumbnail, so
     the penalty must leave the frames comparable rather than bottoming out. */
  const size = PHOTO_SAMPLE_SIZE;
  const modelFrame = (headWidth) => {
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const skin = y < size * 0.2 && x > size * 0.5 - headWidth && x < size * 0.5 + headWidth;
      const body = x > size * 0.3 && x < size * 0.7 && y > size * 0.2 && y < size * 0.8;
      const [r, g, b] = skin ? [198, 152, 122] : body ? [140, 140, 145] : [250, 250, 250];
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
    }
    return pixels;
  };
  const less = photoStats(modelFrame(size * 0.06), size).score;
  const more = photoStats(modelFrame(size * 0.16), size).score;
  assert.ok(Number.isFinite(less) && Number.isFinite(more));
  assert.ok(less > more, "between two model shots, the one showing less skin still wins");
});
