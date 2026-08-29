import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const route = await readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");

/* D711 · The suite that let this ship was entirely source-text assertions. It
   asserted the query EXISTS; nothing executed it, and nothing checked what it
   was bound to. So a query bound to `undefined` passed every test and returned
   500 to every seller.
   These tests execute the real statement against a real SQLite with the real
   column shape, and assert the binding by name. */

function publishedGoalQuery() {
  const found = /prepare\("(SELECT substr\(MAX\(updated_at\)[^"]+)"\)\.bind\(([^)]+)\)/.exec(route);
  assert.ok(found, "the weekly-goal query must still be findable to be tested");
  return { sql: found[1], binding: found[2] };
}

test("the weekly-goal query binds the field the authenticated user actually has — D711", () => {
  const { binding } = publishedGoalQuery();
  /* getChatGPTUser returns { userId, displayName, email, fullName }. There is
     no `id`. Binding user.id bound undefined, which D1 rejects outright. */
  assert.equal(binding.trim(), "user.userId");
  assert.doesNotMatch(route, /\.bind\(user\.id\)/, "user.id does not exist on the authenticated user");
});

test("every query in this route binds the user the same way — D711", () => {
  const bindings = route.match(/\.bind\([^)]*user\.[A-Za-z]+/g) || [];
  assert.ok(bindings.length >= 5, "expected several user-scoped queries");
  for (const binding of bindings) {
    assert.match(binding, /user\.userId/, `${binding} must bind user.userId like the rest of the file`);
  }
});

test("the weekly-goal statement actually executes against the real column shape — D711", () => {
  const { sql } = publishedGoalQuery();
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE etsy_publish_items (
    id TEXT, user_id TEXT, job_id TEXT, product_id TEXT, batch_id TEXT,
    status TEXT, updated_at TEXT
  )`);
  database.exec(`INSERT INTO etsy_publish_items (user_id,product_id,status,updated_at) VALUES
    ('u1','p1','completed','2026-08-29 02:53:53'),
    ('u1','p1','completed','2026-08-29 03:10:00'),
    ('u1','p2','completed','2026-08-28 02:03:05'),
    ('u1','p3','failed','2026-08-28 02:03:05'),
    ('u2','p9','completed','2026-08-29 01:00:00')`);

  const rows = database.prepare(sql).all("u1");
  /* One row per product, not per publish attempt: a republish moves a listing,
     it does not mint a second one. p1 completed twice and counts once. */
  assert.equal(rows.length, 2, "one row per product for this user only");
  const days = rows.map(r => r.day).sort();
  assert.deepEqual(days, ["2026-08-28", "2026-08-29"]);
  /* And the binding is single-parameter: passing the wrong arity is the other
     way this throws at runtime while passing a text search. */
  assert.throws(() => database.prepare(sql).all("u1", "extra"));
});

test("a failing goal count cannot take the batch list down with it — D711", () => {
  /* The seller impact was not a missing number. It was that Batch History, the
     batch thumbnails and every batch row disappeared because a sidebar counter
     threw into the response. */
  const guarded = /let publishedDays[\s\S]{0,900}?try\s*\{[\s\S]{0,900}?etsy_publish_items[\s\S]{0,900}?\}\s*catch/;
  assert.match(route, guarded, "the goal query must be wrapped so its failure degrades to no goal, not no batches");
  assert.match(route, /let publishedDays[^=]*=\s*\[\]/, "it must fall back to an empty result rather than undefined");
  const responseIndex = route.indexOf("published:publishedDays");
  assert.ok(responseIndex > 0, "the response still carries the day rows when they are available");
});
