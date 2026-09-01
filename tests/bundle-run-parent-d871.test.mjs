import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/batches/page.tsx", import.meta.url), "utf8");

/* D871 · A bundle run is one job. It was stored as one row per product, so each
   product independently owned history, resume, completion and publishing - and
   D697 records what that nearly cost: a Resume button over listings that were
   already live, which "would have published them again and charged Etsy's fee
   twice". The parent owns those now; the children own only per-product work. */

test("the run id is minted per execution, not taken from the saved bundle", () => {
  /* activeBundle.id identifies the bundle she SAVED. Two runs of it share that
     id, so it can never be the identity of one run. */
  assert.match(app, /runIdRef\.current=crypto\.randomUUID\(\);runStartedRef\.current=new Date\(\)\.toISOString\(\);/);
  const start = app.slice(app.indexOf("runIdRef.current=crypto.randomUUID()"));
  assert.match(start.slice(0, 400), /setActiveBundle\(bundle\)/,
    "the run id is minted where a run starts, beside the bundle it runs");
  assert.doesNotMatch(app, /runIdRef\.current=[^;]*activeBundle[.?]*\.id/,
    "the saved bundle's id must never become the run id");
});

test("switching products keeps the run id and the URL", () => {
  const switchFn = app.slice(app.indexOf("async function continueBundle"));
  const body = switchFn.slice(0, switchFn.indexOf("\n  }"));
  /* The child gets a new id - that is the isolation worth keeping - but the
     address bar, and therefore history, resume and publish, stay on the run. */
  assert.match(body, /const nextBatchId=crypto\.randomUUID\(\);batchIdRef\.current=nextBatchId/);
  assert.match(body, /url\.searchParams\.set\("batch",runIdRef\.current\|\|nextBatchId\)/);
  assert.doesNotMatch(body, /url\.searchParams\.set\("batch",nextBatchId\)/,
    "putting the child in the URL is what made one job look like several");
  assert.doesNotMatch(body, /runIdRef\.current=/, "switching a product must not touch the run id");
});

test("a child names its parent, and cannot be orphaned by a later autosave", () => {
  assert.match(app, /parentBatchId:runIdRef\.current&&runIdRef\.current!==id\?runIdRef\.current:undefined/);
  /* An autosave that omits the parent must not clear it - an orphaned child
     reappears in Batch History as a job of its own. */
  assert.match(route, /parent_batch_id=COALESCE\(excluded\.parent_batch_id,listing_batches\.parent_batch_id\)/);
});

test("history lists runs, never a run's own product records", () => {
  assert.match(route, /FROM listing_batches WHERE user_id=\? AND parent_batch_id IS NULL ORDER BY updated_at DESC/);
  /* Legacy sibling rows predate the column, so parent_batch_id is NULL on all
     of them: they list exactly as they do today, ungrouped and unaltered. */
  assert.doesNotMatch(route, /groupBundleBatches/,
    "grouping by the saved bundle id would merge two separate runs of it");
});

test("one run, one delete", () => {
  assert.match(route, /DELETE FROM listing_batches WHERE user_id=\? AND parent_batch_id=\?/);
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.ok(del.indexOf("parent_batch_id=?") < del.indexOf('WHERE id=? AND user_id=?'),
    "children go before the parent, so a failure cannot strand them");
});

test("resume opens the product the work stopped on, never a finished one", () => {
  const restore = app.slice(app.indexOf("const runState=payload.batch.state as"));
  const body = restore.slice(0, 1400);
  assert.match(body, /byOrder\.find\(child=>child\.published===0\)/);
  assert.match(body, /runIdRef\.current=id;/, "the run stays the run when a child is opened");
  assert.match(body, /restoreBatchById\(open\.id,requestedStep,requestedPhase,push\)/);
  /* The children come with the run, so resume is one decision and one trip. */
  assert.match(route, /FROM listing_batches WHERE user_id=\? AND parent_batch_id=\?"\)\.bind\(user\.userId,String\(row\.id\)\)/);
});

test("the card reports the run, and one action opens it", () => {
  assert.match(route, /product_title:`\$\{total\} products · \$\{listings\} \$\{listings===1\?"listing":"listings"\}/);
  assert.match(route, /const listings=designs\*Math\.max\(1,total\)/,
    "listings are designs x products - counting child rows reported 2 while she made 4");
  assert.match(route, /const resumeInto=members\.find\(member=>!member\.done\)\?\.batchId/);
  assert.match(page, /batch\.members\.every\(member=>member\.done\)\?"Open published bundle"/);
});

test("every Etsy duplicate-charge guard is still keyed on the product", () => {
  /* Changing batch identity must not touch these. All three are product-keyed,
     which is why a parent run is safe to introduce at all. */
  const queue = fs.readFileSync(new URL("../drizzle/0011_etsy_publish_queue.sql", import.meta.url), "utf8");
  const links = fs.readFileSync(new URL("../drizzle/0009_etsy_connection.sql", import.meta.url), "utf8");
  assert.match(queue, /CREATE UNIQUE INDEX `idx_etsy_publish_items_user_product` ON `etsy_publish_items` \(`user_id`,`product_id`\)/);
  assert.match(links, /`printify_product_id` text PRIMARY KEY NOT NULL/);
  /* And the job stays one-per-batch, which now means one per run. */
  assert.match(queue, /CREATE UNIQUE INDEX `idx_etsy_publish_jobs_user_batch` ON `etsy_publish_jobs` \(`user_id`,`batch_id`\)/);
});

test("the column is added where the table is created, not by a drizzle migration", () => {
  /* listing_batches is created by ensure(), so it is altered there too. */
  assert.match(route, /ALTER TABLE listing_batches ADD parent_batch_id TEXT/);
  assert.match(route, /CREATE INDEX IF NOT EXISTS idx_listing_batches_parent ON listing_batches\(user_id, parent_batch_id\)/);
  const drizzle = fs.readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql"));
  for (const file of drizzle) {
    const sql = fs.readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(sql, /listing_batches/, `${file} must not touch a table drizzle does not own`);
  }
});
