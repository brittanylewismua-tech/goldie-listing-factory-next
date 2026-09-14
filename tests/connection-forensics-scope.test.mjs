/**
 * A DIAGNOSTIC MUST NOT READ OTHER PEOPLE'S ROWS.
 *
 * The first version of this endpoint selected every connection in the table.
 * It was owner-only, which is exactly the reasoning that made it feel safe,
 * and it printed other members' shop names into an investigation report.
 * Owner access is a reason to write a narrower query, not a wider one.
 *
 * These RUN the statements the route ships, against a database holding two
 * members' rows. A source-text search for "user_id" would pass on a query
 * that filters the wrong table, binds the wrong argument, or compares a
 * column to itself. Executing it cannot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const route = await readFile(
  new URL("../app/api/shop-map/connection-forensics/route.ts", import.meta.url), "utf8");

/** Every SQL string the route hands to the database, in order. */
/* The generic argument can itself contain angle brackets, so the match runs
   to the opening parenthesis rather than trying to balance them. */
const statements = [...route.matchAll(/ask<[\s\S]*?\(\s*`([\s\S]*?)`/g)].map(match =>
  match[1].replace(/\s+/g, " ").trim());

const database = new DatabaseSync(":memory:");
database.exec(`CREATE TABLE etsy_connections (
  user_id TEXT NOT NULL, shop_id INTEGER NOT NULL,
  encrypted_access_token TEXT NOT NULL DEFAULT 'tok',
  encrypted_refresh_token TEXT NOT NULL DEFAULT 'ref',
  expires_at INTEGER NOT NULL DEFAULT 0,
  etsy_user_id INTEGER NOT NULL DEFAULT 1,
  shop_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scopes TEXT, scopes_checked_at TEXT,
  PRIMARY KEY (user_id, shop_id))`);
/* The member asking, and a member who must stay invisible to them. */
database.prepare(`INSERT INTO etsy_connections (user_id,shop_id,shop_name,is_active) VALUES (?,?,?,?)`)
  .run("supabase:mine", 16538900, "shesawolfclothing", 1);
database.prepare(`INSERT INTO etsy_connections (user_id,shop_id,shop_name,is_active) VALUES (?,?,?,?)`)
  .run("supabase:someone-else", 28219612, "HousePanthers", 1);
database.prepare(`INSERT INTO etsy_connections (user_id,shop_id,shop_name,is_active) VALUES (?,?,?,?)`)
  .run("supabase:someone-else", 21777478, "godisagirlapparel", 1);

const connectionQuery = statements.find(sql =>
  /^SELECT/.test(sql) && /FROM etsy_connections/.test(sql) && !/COUNT\(/.test(sql));

test("the endpoint has a connection query to check", () => {
  assert.ok(connectionQuery, "no connection SELECT found in the route");
});

test("running it returns only the caller's rows, never another member's", () => {
  const rows = database.prepare(connectionQuery).all("supabase:mine").map(row => ({ ...row }));
  assert.equal(rows.length, 1, "exactly the caller's one connection");
  assert.equal(rows[0].shop_name, "shesawolfclothing");
  const names = JSON.stringify(rows);
  assert.doesNotMatch(names, /HousePanthers|godisagirlapparel/,
    "another member's shops must not appear in any field");
});

test("a member with no connections sees nothing rather than everything", () => {
  /* The failure mode of a missing filter is not an error — it is a full table
     scan that looks like a successful answer. */
  const rows = database.prepare(connectionQuery).all("supabase:nobody");
  assert.equal(rows.length, 0);
});

test("the caller cannot see another member's rows by asking about their shop", () => {
  /* The shop parameter is attacker-controlled. Whatever it is set to, it may
     only ever produce a count. */
  const counting = statements.filter(sql => /COUNT\(\*\)/.test(sql) && /etsy_connections/.test(sql));
  assert.ok(counting.length > 0, "the cross-account check must be a count");
  for (const sql of counting) {
    const result = database.prepare(sql).all(21777478, "supabase:mine").map(row => ({ ...row }));
    assert.deepEqual(Object.keys(result[0] ?? {}), ["n"],
      "a cross-account query may return a count and nothing else");
    assert.equal(result[0].n, 1, "and it counts the other member's row without naming it");
  }
});

test("no token column is ever selected", () => {
  for (const sql of statements)
    assert.doesNotMatch(sql, /encrypted_access_token|encrypted_refresh_token/,
      `a diagnostic query reading tokens: ${sql.slice(0, 80)}`);
});

test("every etsy_connections read in the route is either scoped or a bare count", () => {
  const reads = statements.filter(sql => /FROM etsy_connections/.test(sql));
  assert.ok(reads.length >= 2);
  for (const sql of reads)
    assert.ok(/WHERE[\s\S]*user_id/.test(sql) || /COUNT\(\*\)/.test(sql),
      `an unscoped connection read: ${sql.slice(0, 80)}`);
});


test("the check itself fails when a query loses its filter", () => {
  /* A guard that cannot fail is decoration. This runs the unscoped query the
     endpoint used to ship and asserts it does exactly the damaging thing. */
  const unscoped = "SELECT shop_id, shop_name FROM etsy_connections ORDER BY updated_at DESC";
  const leaked = database.prepare(unscoped).all().map(row => ({ ...row }));
  assert.ok(leaked.length > 1, "the unscoped query reaches other members' rows");
  assert.match(JSON.stringify(leaked), /HousePanthers/);
  /* And the rule the other tests apply would reject it. */
  assert.ok(!/WHERE[\s\S]*user_id/.test(unscoped) && !/COUNT\(\*\)/.test(unscoped));
});
