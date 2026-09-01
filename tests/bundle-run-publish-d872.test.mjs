import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

/* D872 · One authorisation, one job, one receipt - and a retry that cannot
   republish. The queue's own statements are pulled from the route so the test
   cannot drift from what actually runs. */

const route = fs.readFileSync(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const sqlIn = (needle) => {
  const at = route.indexOf(needle);
  assert.ok(at > -1, `route no longer contains: ${needle}`);
  return route.slice(route.lastIndexOf('"', at) + 1, route.indexOf('"', at));
};
const JOB_UPSERT = sqlIn("INSERT INTO etsy_publish_jobs");
const ITEM_UPSERT = sqlIn("INSERT INTO etsy_publish_items");

function queue() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE etsy_publish_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, batch_id TEXT NOT NULL,
    status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, settings_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec("CREATE UNIQUE INDEX idx_etsy_publish_jobs_user_batch ON etsy_publish_jobs (user_id,batch_id)");
  db.exec(`CREATE TABLE etsy_publish_items (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, user_id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_id TEXT, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
    available_at INTEGER NOT NULL DEFAULT 0, locked_at INTEGER, last_error TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.exec("CREATE UNIQUE INDEX idx_etsy_publish_items_user_product ON etsy_publish_items (user_id,product_id)");

  const authorise = (runId, productIds, batchByProduct = {}) => {
    db.prepare(JOB_UPSERT).run(`job-${Math.random()}`, "u", runId, productIds.length,
      JSON.stringify({ frozenProductIds: productIds }));
    const jobId = db.prepare("SELECT id FROM etsy_publish_jobs WHERE user_id=? AND batch_id=?").get("u", runId).id;
    for (const productId of productIds) {
      db.prepare(ITEM_UPSERT).run(`item-${productId}-${Math.random()}`, jobId, "u", productId, batchByProduct[productId] || runId);
    }
    return jobId;
  };
  return { db, authorise };
}

test("one run, one job — however many products it spans", () => {
  const { db, authorise } = queue();
  /* A bundle: two products, two child records, one authorisation. */
  authorise("run-1", ["p1", "p2", "p3", "p4"], { p1: "child-hoodie", p2: "child-hoodie", p3: "child-tee", p4: "child-tee" });
  const jobs = db.prepare("SELECT batch_id,total FROM etsy_publish_jobs").all();
  assert.equal(jobs.length, 1, "one authorisation is one job");
  assert.equal(jobs[0].batch_id, "run-1");
  /* Attribution stays per product, which is what D697 fixed - the job is the
     run, the item still knows which product record it came from. */
  const items = db.prepare("SELECT product_id,batch_id FROM etsy_publish_items ORDER BY product_id").all();
  assert.deepEqual(items.map(i => i.batch_id), ["child-hoodie", "child-hoodie", "child-tee", "child-tee"]);
});

test("a completed listing survives re-authorisation and is never re-queued", () => {
  const { db, authorise } = queue();
  authorise("run-1", ["p1", "p2"]);
  db.prepare("UPDATE etsy_publish_items SET status='completed' WHERE product_id='p1'").run();
  db.prepare("UPDATE etsy_publish_items SET status='failed',last_error='Etsy said no' WHERE product_id='p2'").run();

  /* She comes back and presses publish again. */
  authorise("run-1", ["p1", "p2"]);

  const after = Object.fromEntries(db.prepare("SELECT product_id,status FROM etsy_publish_items").all().map(i => [i.product_id, i.status]));
  assert.equal(after.p1, "completed", "a published listing cannot be published again");
  assert.equal(after.p2, "queued", "only the confirmed failure is retried");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM etsy_publish_items").get().c, 2, "and no duplicate item is created");
});

test("two runs of the same bundle are two jobs, not one", () => {
  const { db, authorise } = queue();
  authorise("run-1", ["p1", "p2"]);
  authorise("run-2", ["p5", "p6"]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM etsy_publish_jobs").get().c, 2);
});

test("the authorised set is frozen onto the job", () => {
  /* A resumed run re-enqueues from what she confirmed, so coming back later
     cannot widen it. */
  assert.match(route, /frozenProductIds:ids\.map\(String\),frozenAt:new Date\(\)\.toISOString\(\)/);
  const { db, authorise } = queue();
  authorise("run-1", ["p1", "p2"]);
  const settings = JSON.parse(db.prepare("SELECT settings_json FROM etsy_publish_jobs").get().settings_json);
  assert.deepEqual(settings.frozenProductIds, ["p1", "p2"]);
});

test("the client authorises the run, and records the receipt on it", () => {
  assert.match(app, /runBatchId:runIdRef\.current\|\|batchIdRef\.current/);
  assert.match(app, /const receipt=\{publishedCount:job\.completed[\s\S]{0,400}?setBatchReceipt\(receipt\)[\s\S]{0,400}?await persistRunNow\(receipt\);/);
  /* The run row is where the receipt lives, so history reports the whole run. */
  assert.match(app, /state:\{run:\{[\s\S]*?\},batchReceipt:receipt\|\|null\}/);
});
