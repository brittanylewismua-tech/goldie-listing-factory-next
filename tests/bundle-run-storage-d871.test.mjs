import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

/* D871 · The parent/child model exercised against real SQL, using the exact
   statements the route runs. The point is behaviour, not shape: two runs of one
   saved bundle stay apart, a child never surfaces as its own job, an autosave
   that forgets its parent cannot orphan it, and deleting a run takes the run. */

const route = fs.readFileSync(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");
/* Pull the real statements out of the route so the test cannot drift from it. */
const sqlIn = (needle) => {
  const at = route.indexOf(needle);
  assert.ok(at > -1, `route no longer contains: ${needle}`);
  const start = route.lastIndexOf('"', at) + 1;
  return route.slice(start, route.indexOf('"', at));
};
const UPSERT = sqlIn("INSERT INTO listing_batches (id,user_id,status,step,setup_name,product_title,design_count,state_json,parent_batch_id");
const LIST = sqlIn("SELECT id,status,step,setup_name,product_title,design_count,state_json,created_at,updated_at FROM listing_batches WHERE user_id=? AND parent_batch_id IS NULL");
const DELETE_CHILDREN = sqlIn("DELETE FROM listing_batches WHERE user_id=? AND parent_batch_id=?");
const DELETE_ONE = sqlIn("DELETE FROM listing_batches WHERE id=? AND user_id=?");

const BUNDLE = "saved-bundle-1";

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE listing_batches (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, step TEXT NOT NULL,
    setup_name TEXT NOT NULL DEFAULT '', product_title TEXT NOT NULL DEFAULT '', design_count INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec("ALTER TABLE listing_batches ADD parent_batch_id TEXT");
  const save = (id, parent, state, name = "") =>
    db.prepare(UPSERT.replace(",CURRENT_TIMESTAMP)", ")").replace(",updated_at)", ")"))
      .run(id, "u", "draft", "designs", name, "", 2, JSON.stringify(state), parent);
  const topLevel = () => db.prepare(LIST).all("u").map(r => r.id);
  const childrenOf = id => db.prepare("SELECT id FROM listing_batches WHERE parent_batch_id=? ORDER BY id").all(id).map(r => r.id);
  return { db, save, topLevel, childrenOf };
}

test("two runs of the same saved bundle stay two runs", () => {
  const { save, topLevel, childrenOf } = freshDb();
  save("run1", null, { run: { bundleId: BUNDLE, productOrder: ["hoodie", "tee"] } }, "Tee + Hoodie");
  save("r1-hoodie", "run1", { activeRecipe: { id: "hoodie" }, drafts: [{ id: "p1" }, { id: "p2" }] });
  save("r1-tee", "run1", { activeRecipe: { id: "tee" }, drafts: [{ id: "p3" }, { id: "p4" }] });

  /* Same saved bundle, run again next week. */
  save("run2", null, { run: { bundleId: BUNDLE, productOrder: ["hoodie", "tee"] } }, "Tee + Hoodie");
  save("r2-hoodie", "run2", { activeRecipe: { id: "hoodie" }, drafts: [{ id: "p5" }] });

  assert.deepEqual(topLevel().sort(), ["run1", "run2"], "one history row per run, and no child among them");
  assert.deepEqual(childrenOf("run1"), ["r1-hoodie", "r1-tee"]);
  assert.deepEqual(childrenOf("run2"), ["r2-hoodie"]);
});

test("an autosave that omits the parent cannot orphan a child", () => {
  /* Autosave is debounced and fires from several places; one that leaves
     parentBatchId out must not put the child back in Batch History as a job. */
  const { save, topLevel, childrenOf } = freshDb();
  save("run1", null, { run: { bundleId: BUNDLE, productOrder: ["hoodie", "tee"] } });
  save("r1-tee", "run1", { activeRecipe: { id: "tee" } });
  save("r1-tee", null, { activeRecipe: { id: "tee" }, drafts: [{ id: "p3" }] });

  assert.deepEqual(topLevel(), ["run1"]);
  assert.deepEqual(childrenOf("run1"), ["r1-tee"]);
});

test("deleting a run deletes the run, and only that run", () => {
  const { db, save, topLevel } = freshDb();
  save("run1", null, { run: { bundleId: BUNDLE } });
  save("r1-hoodie", "run1", { activeRecipe: { id: "hoodie" } });
  save("r1-tee", "run1", { activeRecipe: { id: "tee" } });
  save("run2", null, { run: { bundleId: BUNDLE } });
  save("r2-hoodie", "run2", { activeRecipe: { id: "hoodie" } });

  db.prepare(DELETE_CHILDREN).run("u", "run1");
  db.prepare(DELETE_ONE).run("run1", "u");

  assert.deepEqual(db.prepare("SELECT id FROM listing_batches ORDER BY id").all().map(r => r.id), ["r2-hoodie", "run2"]);
  assert.deepEqual(topLevel(), ["run2"]);
});

test("a legacy sibling row still lists on its own", () => {
  /* Rows written before the column have parent_batch_id NULL, so they appear
     exactly as they do today - not grouped, not rewritten, not hidden. */
  const { save, topLevel } = freshDb();
  save("legacy-a", null, { activeBundle: { id: BUNDLE, name: "Old bundle" }, bundleRecipes: [{}, {}], bundleIndex: 0 });
  save("legacy-b", null, { activeBundle: { id: BUNDLE, name: "Old bundle" }, bundleRecipes: [{}, {}], bundleIndex: 1 });
  assert.deepEqual(topLevel().sort(), ["legacy-a", "legacy-b"]);
});

test("a single-product batch is unaffected by any of it", () => {
  const { save, topLevel, childrenOf } = freshDb();
  save("solo", null, { activeRecipe: { id: "tee" }, drafts: [{ id: "p1" }] });
  assert.deepEqual(topLevel(), ["solo"]);
  assert.deepEqual(childrenOf("solo"), []);
});
