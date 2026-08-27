/* D600 - foreground obstruction.

   Measured live before this change: all nineteen scenes in the seller's library
   reported occluded:false with zero occlusion masks stored, on hoodies whose
   hoods and hair plainly cross the chest. The cause was a single literal - the
   derived-geometry branch hard-coded occluded:false - so no mask was ever
   requested and every design rendered on top of the hood. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const prepare = strip(await read("app/api/mockups/library/[id]/prepare/route.ts"));
const occlusion = strip(await read("app/api/mockups/library/[id]/occlusion/route.ts"));
const library = strip(await read("app/api/mockups/library/route.ts"));
const scene = await read("app/mockups/prepared-scene.ts");
const sceneCode = strip(scene);

test("a rejected corner quad does not erase the foreground reading", () => {
  // Whether something crosses the print is a fact about the photograph. The
  // derived branch must carry the analyser's answer, never a literal false.
  const derived = prepare.slice(prepare.indexOf("const geometry = measured || {"));
  const branch = derived.slice(0, derived.indexOf("};") + 2);
  assert.ok(!/occluded:\s*false/.test(branch),
    "the derived branch must not hard-code occluded:false");
  /* D601 - and it must not read the answer off the object that the rejection
     nulls, which is what made D600 still report false on every scene. */
  assert.ok(!/reading\.geometry\?\.occluded/.test(branch),
    "reading.geometry is null exactly when the quad was rejected");
  assert.match(branch, /occluded:\s*reading\.observation\.occluded/);
});

test("D601 - the observation is read before any corner is validated", () => {
  // normalizeSceneAnalysis has eight return-null exits. None of them may take
  // the analyser's reading of the photograph down with the quad.
  const reader = sceneCode.slice(sceneCode.indexOf("export function readSceneObservation"));
  const body = reader.slice(0, reader.indexOf("\n}") + 2);
  assert.ok(!/return null/.test(body), "an observation always comes back");
  assert.ok(!/corners/.test(body), "it must not depend on the corner quad at all");
  assert.match(body, /occluded:\s*Boolean\(candidate\?\.occluded\)/);

  const analyse = prepare.slice(prepare.indexOf("async function analyzeGeometry"));
  const fn = analyse.slice(0, analyse.indexOf("\n}") + 2);
  assert.match(fn, /observation: readSceneObservation\(value\)/);
  assert.ok((fn.match(/observation/g) || []).length >= 3,
    "every exit from the analyser carries an observation, including the failures");
});

test("D601 - the analyser's print side is recorded but not yet authoritative", () => {
  // Changing a scene's side rekeys every placement saved against it, so the
  // disagreement is measured before it is acted on.
  assert.match(prepare, /analyserSide: reading\.observation\.side/);
  assert.match(sceneCode, /analyserSide\?:\s*PrintSide \| null/);
  const derived = prepare.slice(prepare.indexOf("const geometry = measured || {"));
  assert.match(derived.slice(0, derived.indexOf("};") + 2), /side: computed\.printSide/,
    "the side in use is unchanged this round");
});

test("no branch hard-codes the scene as unobstructed", () => {
  /* Exactly one literal false is legitimate: the analyser returned nothing
     parseable at all, so there is no reading to carry. Every other path must
     take the answer from the photograph. */
  const literals = prepare.match(/occluded:\s*false/g) || [];
  assert.equal(literals.length, 1, "only the no-response sentinel may assume nothing is in front");
  assert.match(prepare, /const nothingSeen = \{ occluded: false/,
    "and that one literal is the sentinel, named as such");
});

test("each class of obstruction is asked for on its own", () => {
  // One compound prompt returns one concept, so a hood cost us the drawstring.
  for (const name of ["hood", "hair", "drawstrings", "hands"])
    assert.match(prepare, new RegExp(`name:\\s*"${name}"`), `${name} must be its own class`);
  assert.ok(!/prompt:\s*"hood, hair, hand, arm, strap, flap/.test(prepare),
    "the single compound prompt must be gone");
  assert.match(prepare, /return_multiple_masks:\s*false/,
    "one prompt asks for one object, so one mask per class");
});

test("every isolated layer is kept, not only the first", () => {
  assert.match(prepare, /occlusionUrls\.push\(url\)/);
  assert.match(prepare, /occlusion-\$\{index\}\.png/, "each layer is stored under its own key");
  assert.match(prepare, /occlusionKeys\[0\]/, "the first layer stays readable as occlusionKey");
  assert.match(prepare, /occlusionKeys,\s*occlusionClasses/);
});

test("which classes were found is recorded on the scene", () => {
  // So a scene can be answered for later without re-running the analyser.
  assert.match(prepare, /occlusionClasses\[name\]\s*=\s*Boolean\(url\)/);
  assert.match(scene, /occlusionClasses\?:\s*Record<string,\s*boolean>/);
  assert.match(scene, /occlusionKeys\?:\s*string\[\]/);
});

test("a missing class costs a layer, never the preparation", () => {
  // Every segmentation call goes through optional(), which swallows the throw.
  const block = prepare.slice(prepare.indexOf("if (geometry.occluded)"), prepare.indexOf("const [surfaceMaskKey"));
  assert.match(block, /await optional\(\(\) => falJson\("fal-ai\/sam-3\/image"/);
  assert.ok(!/throw/.test(block), "isolating a foreground must not throw the preparation away");
});

test("layers are individually addressable", () => {
  assert.match(occlusion, /searchParams\.get\("layer"\)/);
  assert.match(occlusion, /const key = keys\[/);
  assert.match(library, /occlusion\?layer=\$\{index\}/);
});

test("deleting a set removes every foreground layer", () => {
  // Otherwise each re-preparation orphans more objects in storage.
  assert.match(library, /\.\.\.\(preparation\?\.occlusionKeys\|\|\[\]\)/);
});

test("a new preparation generation is required for this to take effect", () => {
  /* D581: cached preparations short-circuit the analyser, so a fix that changes
     what preparation MEANS has to invalidate what is already stored. Asserted as
     a floor, not an exact number - pinning it makes the next honest bump a
     failure, which is how a real fix gets reverted to keep a test green. */
  const version = Number(/SCENE_PREPARATION_VERSION = (\d+)/.exec(scene)?.[1]);
  assert.ok(Number.isInteger(version) && version >= 9,
    `D600 and D601 each changed what preparation means, found generation ${version}`);
});
