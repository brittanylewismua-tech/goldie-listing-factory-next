/* D596 - the editor writes to the database, and reads back from it.

   Before this the corrections lived in component state plus a sessionStorage
   draft: they survived navigation inside a session and vanished with the tab.
   The tables, the API and the owner gate were deployed but nothing called them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("save calls the real placement API and refuses to lie about it", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  assert.match(grid, /await fetch\("\/api\/mockups\/placement",\{method:"PUT"/);
  assert.match(grid, /if\(!written\.ok\)throw new Error\("Goldie could not save this placement\."\)/,
    "a failed write must throw rather than fall through to Adjusted");
  // Adjusted state is only set after the write.
  const writeAt = grid.indexOf("if(!written.ok)throw");
  const adjustedAt = grid.indexOf("adjusted:true");
  assert.ok(writeAt > 0 && adjustedAt > writeAt, "Adjusted must be set after the durable write");
});

test("a failed write keeps the editor open and keeps the local draft", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  // The draft is removed only after the caller's promise resolves.
  const save = editor.slice(editor.indexOf("async function runSave"), editor.indexOf("const busy ="));
  const awaitAt = save.indexOf("await props.onSave");
  const clearAt = save.indexOf("removeItem(draftKey)");
  assert.ok(awaitAt > 0 && clearAt > awaitAt, "the draft may only be cleared after a successful save");
  assert.match(save, /catch \(error\)/);
  assert.match(save, /setSaveError\(/, "and the seller is told");
  assert.doesNotMatch(save, /finally \{[^}]*removeItem/, "never cleared in a finally");
});

test("an older session draft cannot beat newer database data", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  assert.match(editor, /const persisted = props\.persistedAt \? Date\.parse\(props\.persistedAt\) : 0/);
  assert.match(editor, /if \(persisted && drafted && persisted > drafted\)/);
  assert.match(editor, /window\.sessionStorage\.removeItem\(draftKey\);\s*\n\s*return;/,
    "the stale draft is discarded rather than applied");
  assert.match(editor, /savedAt: new Date\(\)\.toISOString\(\)/, "drafts carry when they were written");
});

test("cancel writes neither record", async () => {
  const editor = await read("app/mockups/scene-editor.tsx");
  const cancel = editor.slice(editor.indexOf("const cancel = useCallback"), editor.indexOf("const cancel = useCallback") + 260);
  assert.doesNotMatch(cancel, /fetch\(/, "cancel must not reach the network");
  assert.match(cancel, /removeItem\(draftKey\)/, "it clears only the unsaved draft");
});

test("the override is stored relative to Printify, and only for this design", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  const body = grid.slice(grid.indexOf("const body:Record<string,unknown>={override:"), grid.indexOf("if(improveScene)body.geometry"));
  for (const key of ["sceneId", "listingId", "designKey", "batchId", "offsetU", "offsetV", "scaleMultiplier"])
    assert.ok(body.includes(key), `the override needs ${key}`);
  assert.ok(!/corners:/.test(body), "absolute corners must never be written as an override");
});

test("scene geometry is written only on explicit opt-in, and carries no listing", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  assert.match(grid, /if\(improveScene\)body\.geometry=\{/,
    "geometry is written only when the seller ticked the box");
  const geometry = grid.slice(grid.indexOf("if(improveScene)body.geometry={"), grid.indexOf("const written=await fetch"));
  for (const forbidden of ["listingId", "designKey", "batchId"])
    assert.ok(!geometry.includes(forbidden), `scene geometry must not carry ${forbidden}`);
  assert.match(geometry, /origin:"seller-adjusted"/);
});

test("the load order reads geometry and override separately", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  /* D597 - the load happens when the seller opens the editor, not during
     render. Running it in the render body re-fired it on every setState it
     caused - seven identical GETs for one open - and the editor takes
     `transform` into its own useState on mount, so a record arriving after mount
     never reached it and the restore silently fell back to automatic. */
  assert.match(grid, /const composeSaved=useCallback\(async\(template:Template\)/);
  assert.match(grid, /const openEditor=useCallback\(async\(result:Result,index:number\)/);
  assert.match(grid, /const loaded=await composeSaved\(template\);[\s\S]{0,200}setEditing\(\{result,index\}\)/,
    "the record must be loaded before the editor is opened");
  assert.match(grid, /answer\.geometry/);
  assert.match(grid, /answer\.override/);
  // The override is applied after the geometry mapping, never before.
  const load = grid.slice(grid.indexOf("const composeSaved=useCallback"), grid.indexOf("const openEditor=useCallback"));
  assert.ok(load.indexOf("if(geometry)") < load.indexOf("override.scaleMultiplier"),
    "Printify placement maps into geometry first, then the override adjusts it");
});

test("every read and write is scoped to the signed-in seller", async () => {
  const route = await read("app/api/mockups/placement/route.ts");
  // userId comes from the session and is part of both keys and both queries.
  assert.match(route, /const user = await getChatGPTUser\(\)/);
  assert.match(route, /eq\(mockupSceneGeometry\.userId, user\.userId\)/);
  assert.match(route, /eq\(mockupArtworkOverrides\.userId, user\.userId\)/);
  assert.match(route, /geometryKey\(user\.userId/);
  assert.match(route, /overrideKey\(user\.userId/);
  // No identifier from the request may stand in for the seller.
  assert.ok(!/userId: *(body|o|g)\./.test(route), "the seller is never taken from the request body");
});

test("the tables carry seller ownership", async () => {
  const schema = await read("db/schema.ts");
  const geometry = schema.slice(schema.indexOf("mockupSceneGeometry"), schema.indexOf("mockupArtworkOverrides"));
  const override = schema.slice(schema.indexOf("mockupArtworkOverrides"));
  for (const [name, table] of [["geometry", geometry], ["override", override]])
    assert.match(table, /userId: text\("user_id"\)\.notNull\(\)/, `${name} must record its owner`);
  assert.match(override, /batchId: text\("batch_id"\)/, "an override is scoped to its batch");
});

test("the persisted record is loaded before the editor opens, and only once", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  /* D597 - found on a real restore: the editor came back with the automatic
     placement even though the database held the correction. Two causes.

     The fetch lived in the render body, so every setState it caused re-ran it -
     seven identical GETs for one open. And SceneEditor takes `transform` into
     its own useState on mount, so a record that arrived after mount could never
     reach it. */
  assert.doesNotMatch(grid, /void loadPersisted\(\)/, "no fetching from the render body");
  assert.match(grid, /setOpeningScene\(result\.templateId\)/, "the control shows it is loading");
  const open = grid.slice(grid.indexOf("const openEditor=useCallback"), grid.indexOf("const openEditor=useCallback") + 600);
  assert.ok(open.indexOf("await composeSaved") < open.indexOf("setEditing({result,index})"),
    "load first, open second");
});

test("a returning seller sees Adjusted before opening anything", async () => {
  const grid = await read("app/integrated-mockups.tsx");
  // The grid asks the database once per result set, deduplicated by a ref.
  assert.match(grid, /const scanned = ?useRef<string>\(""\)|const scanned=useRef<string>\(""\)/);
  assert.match(grid, /if\(scanned\.current===key\)return/, "one scan per result set, not per render");
  assert.match(grid, /adjustedScenes\[r\.templateId\]/, "and the badge reflects the database");
});
