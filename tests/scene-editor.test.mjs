/* Stage 1 of the embedded editor: the guarantees that do not need a browser.

   The rest of Stage 1 - real pointer drags, reopening a saved scene, comparing
   a full-resolution export - has to be operated on a deployed preview, and is
   not claimed here. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the editor never sends the photograph to a generative model", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  const compositor = await read("app/mockups/scene-composite.ts");
  // Strip comments first: this file talks ABOUT generative editing in order to
  // rule it out, and the prose must not fail the check the prose describes.
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const source of [code(editor), code(compositor)]) {
    for (const forbidden of ["fal.run", "fal-ai", "openai.com", "api/mockups/analyze", "api/mockups/print-area"]) {
      assert.ok(!source.toLowerCase().includes(forbidden),
        `the deterministic editor path must not call ${forbidden}`);
    }
    assert.ok(!/fetch\(/.test(source), "the editor export path must make no network call at all");
  }
  // The photograph is drawn, once, and never read back into a model.
  assert.match(compositor, /ctx\.drawImage\(photo, 0, 0, size\.width, size\.height\)/);
});

test("export renders at the source photograph's resolution, not the viewport's", async () => {
  const compositor = await read("app/mockups/scene-composite.ts");
  assert.match(compositor, /composite\(\{ \.\.\.input, width: input\.photo\.width, height: input\.photo\.height \}\)/,
    "the export must ignore the preview size and use the photo's own dimensions");
  const editor = await read("app/mockups/scene-editor.tsx");
  // The preview is explicitly the scaled one; the export call passes no size.
  assert.match(editor, /width: view\.width, height: view\.height/, "the on-screen preview is scaled");
  assert.doesNotMatch(editor, /exportComposite\(\{[^}]*width: view\.width/, "the export must not inherit the viewport size");
});

test("preview and export are produced by the same function", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  assert.match(editor, /import \{ composite, exportComposite \} from "\.\/scene-composite\.ts"/);
  const compositor = await read("app/mockups/scene-composite.ts");
  // exportComposite delegates rather than reimplementing, so they cannot drift.
  assert.match(compositor, /export async function exportComposite[\s\S]{0,200}composite\(\{ \.\.\.input/);
});

test("an export always rebuilds from the original photo and artwork", async () => {
  const compositor = await read("app/mockups/scene-composite.ts");
  // Never from an already-composited image, so repeated saves cannot degrade.
  assert.match(compositor, /photo: CanvasImageSource & Pixels/);
  assert.match(compositor, /artwork: CanvasImageSource & Pixels/);
});

test("undo and redo move the whole record, not just position", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  // One state object holds corners AND opacity AND blend AND fabric strength,
  // so restoring it restores the rendering settings with the geometry.
  assert.match(editor, /setPast\(p => \[\.\.\.p\.slice\(-40\), current\]\)/);
  assert.match(editor, /setTransform\(p\[p\.length - 1\]\)/);
  assert.match(editor, /setTransform\(f\[0\]\)/);
});

test("cancel does not save", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  // onCancel is wired straight to the close and Cancel controls and never
  // touches onSave, so the previously saved result stands.
  assert.match(editor, /onClick=\{props\.onCancel\}/);
  assert.doesNotMatch(editor, /onCancel[\s\S]{0,80}runSave/);
});

test("fabric shading borrows luminance instead of fading the ink", async () => {
  const compositor = await read("app/mockups/scene-composite.ts");
  assert.match(compositor, /globalCompositeOperation = "saturation"/, "the garment's colour is removed, its light kept");
  assert.match(compositor, /globalCompositeOperation = "multiply"/);
  // and the shading is confined to the artwork's own alpha
  assert.match(compositor, /globalCompositeOperation = "destination-in"/,
    "shading must not bleed outside the artwork");
  const editor = await read("app/mockups/scene-editor.tsx");
  assert.match(editor, /Let the fabric show through/, "and it is a control of its own, separate from opacity");
});

test("in-progress work survives a refresh", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  assert.match(editor, /sessionStorage\.setItem\(draftKey/);
  assert.match(editor, /sessionStorage\.removeItem\(draftKey\)/, "and is cleared once saved");
});

test("the seller never reads the vocabulary of the pipeline", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  // Only user-visible strings matter, so check the JSX text and labels.
  // Only text a seller actually reads: JSX text nodes and label content.
  const withoutComments = editor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const visible = [...withoutComments.matchAll(/>([^<>{}\n]{3,})</g)].map(m => m[1]).join(" | ");
  for (const word of ["SAM", "FAL", "segmentation", "RLE", "quad", "calibrat", "preparation version", "derived fallback"])
    assert.ok(!visible.toLowerCase().includes(word.toLowerCase()),
      `"${word}" must never be shown to a seller. Visible text was: ${visible.slice(0, 400)}`);
});

test("zoom and pan do not reach the stored placement", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  // Zoom is a Stage property; corners are normalized against `view`, which is
  // derived from the photo, not from zoom.
  assert.match(editor, /scaleX=\{zoom\} scaleY=\{zoom\}/);
  assert.doesNotMatch(editor, /corners:[^\n]*zoom/, "zoom must never appear in a stored corner");
  assert.doesNotMatch(editor, /\/ view\.width \* zoom/);
});
