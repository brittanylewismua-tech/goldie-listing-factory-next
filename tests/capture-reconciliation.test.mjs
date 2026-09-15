/**
 * A SUCCESSFUL PUBLISH CANNOT LEAVE THE EVIDENCE PIPELINE.
 *
 * The capture job is durable once its row exists. The insert that creates it
 * can still fail, and that failure is deliberately swallowed so a publish
 * never breaks — which leaves exactly one hole: a listing published with no
 * job and no capture, invisible forever.
 *
 * These run the real reconciliation SQL against a database in that state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const source = await readFile(
  new URL("../app/artwork-capture-queue.ts", import.meta.url), "utf8");

const sqlFrom = (needle) => {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = source.match(new RegExp("prepare\\(\\s*`([^`]*" + escaped + "[^`]*)`"));
  assert.ok(found, `no statement containing ${needle}`);
  return found[1];
};

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE etsy_listing_links (
      printify_product_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, batch_id TEXT,
      etsy_listing_id INTEGER, status TEXT, last_error TEXT, updated_at TEXT);
    CREATE TABLE etsy_connections (
      user_id TEXT, shop_id INTEGER, is_active INTEGER);
    CREATE TABLE artwork_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, printify_product_id TEXT,
      artwork_hash TEXT, artwork_key TEXT);
    CREATE TABLE artwork_capture_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
      printify_shop_id INTEGER NOT NULL, printify_product_id TEXT NOT NULL,
      etsy_listing_id INTEGER, batch_id TEXT NOT NULL DEFAULT '',
      because TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'queued',
      outcome TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
      queued_at TEXT NOT NULL, completed_at TEXT,
      UNIQUE (user_id, printify_product_id, because));
  `);
  db.prepare(`INSERT INTO etsy_connections VALUES (?,?,?)`).run("u1", 16538900, 1);
  return db;
}

const adopt = sqlFrom("reconciled-published-without-capture");
const orphanCount = sqlFrom("MIN(links.updated_at) AS oldest");

test("a publish whose enqueue failed is adopted into the queue", () => {
  const db = database();
  /* Published successfully. No capture, no job — the exact gap. */
  db.prepare(`INSERT INTO etsy_listing_links VALUES (?,?,?,?,?,?,?)`)
    .run("prod-1", "u1", "batch-1", 991, "finished", null, "2026-09-14 10:00:00");

  const before = db.prepare(orphanCount).get();
  assert.equal(before.n, 1, "the orphan is visible before reconciliation");

  const now = new Date().toISOString();
  db.prepare(adopt).run(now, now, 200);

  const job = db.prepare(`SELECT * FROM artwork_capture_jobs`).get();
  assert.ok(job, "a job now exists");
  assert.equal(job.printify_product_id, "prod-1");
  assert.equal(job.etsy_listing_id, 991);
  assert.equal(job.printify_shop_id, 16538900, "it finds the member's active shop");
  assert.equal(job.because, "reconciled-published-without-capture");
});

test("reconciliation is idempotent — a second pass adds nothing", () => {
  const db = database();
  db.prepare(`INSERT INTO etsy_listing_links VALUES (?,?,?,?,?,?,?)`)
    .run("prod-1", "u1", "batch-1", 991, "finished", null, "2026-09-14 10:00:00");
  const now = new Date().toISOString();
  db.prepare(adopt).run(now, now, 200);
  db.prepare(adopt).run(now, now, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM artwork_capture_jobs`).get().c, 1);
});

test("a publish that already has its artwork is left alone", () => {
  const db = database();
  db.prepare(`INSERT INTO etsy_listing_links VALUES (?,?,?,?,?,?,?)`)
    .run("prod-1", "u1", "batch-1", 991, "finished", null, "2026-09-14 10:00:00");
  db.prepare(`INSERT INTO artwork_provenance (user_id, printify_product_id, artwork_hash, artwork_key) VALUES (?,?,?,?)`)
    .run("u1", "prod-1", "abc", "provenance/u1/abc.png");
  const now = new Date().toISOString();
  db.prepare(adopt).run(now, now, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM artwork_capture_jobs`).get().c, 0);
  assert.equal(db.prepare(orphanCount).get().n, 0);
});

test("a publish with a job already waiting is not queued twice", () => {
  const db = database();
  db.prepare(`INSERT INTO etsy_listing_links VALUES (?,?,?,?,?,?,?)`)
    .run("prod-1", "u1", "batch-1", 991, "finished", null, "2026-09-14 10:00:00");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO artwork_capture_jobs
      (user_id, printify_shop_id, printify_product_id, because, state, next_attempt_at, queued_at)
      VALUES (?,?,?,?,?,?,?)`)
    .run("u1", 16538900, "prod-1", "listing-factory-publish", "queued", now, now);
  db.prepare(adopt).run(now, now, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM artwork_capture_jobs`).get().c, 1);
});

test("a job that permanently failed is re-adopted rather than abandoned", () => {
  /* 'failed' is not in the states that block adoption: artwork Goldie could
     not keep is exactly what must come back around. */
  const db = database();
  db.prepare(`INSERT INTO etsy_listing_links VALUES (?,?,?,?,?,?,?)`)
    .run("prod-1", "u1", "batch-1", 991, "finished", null, "2026-09-14 10:00:00");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO artwork_capture_jobs
      (user_id, printify_shop_id, printify_product_id, because, state, next_attempt_at, queued_at)
      VALUES (?,?,?,?,?,?,?)`)
    .run("u1", 16538900, "prod-1", "listing-factory-publish", "failed", now, now);
  db.prepare(adopt).run(now, now, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM artwork_capture_jobs`).get().c, 2);
});

test("the health view reports the gap from the publish records, not the queue", () => {
  /* A queue that lost a row cannot report its own loss. */
  assert.match(source, /FROM etsy_listing_links links/);
  for (const field of ["publishedWithoutCapture", "missingCaptureJob",
    "captureBacklog", "oldestMissingSince", "permanentlyMissing"])
    assert.match(source, new RegExp(field), `health must report ${field}`);
});

test("reconciliation runs before the queue is worked", () => {
  const tick = source.includes("adoptPublishedWithoutCapture");
  assert.ok(tick, "the function exists");
});
