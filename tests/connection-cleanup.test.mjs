/*
  A PAGE LOAD MUST NOT RETIRE A CREDENTIAL.

  The Printify connection check answered "are you connected?" on every page
  load and, when Printify replied 401, deleted the stored token there and
  then. A 401 is also what a provider returns during an outage, so that would
  have destroyed a working credential and sent the member off to reconnect for
  nothing.

  These run the real queue against a real table.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { noteRejection, clearRejection, confirmedRejections, markRetired,
  ensureCleanupQueue, CONFIRM_AFTER_SECONDS, CONFIRMATIONS_REQUIRED }
  from "../app/connection-cleanup.ts";

/* A D1-shaped wrapper over node:sqlite, so the module under test runs its own
   SQL rather than a rewritten version of it. */
function d1(sqlite) {
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const call = (values) => ({
        run: async () => stmt.run(...values),
        first: async () => stmt.get(...values) ?? null,
        all: async () => ({ results: stmt.all(...values) }),
      });
      return { ...call([]), bind: (...v) => call(v) };
    },
  };
}
const fresh = async () => {
  const db = d1(new DatabaseSync(":memory:"));
  await ensureCleanupQueue(db);
  return db;
};
const NOW = 1_800_000_000;
const rows = async (db) => (await db.prepare(
  "SELECT * FROM connection_cleanup_queue").bind().all()).results;

test("one refusal is a report, never a verdict", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  assert.equal((await confirmedRejections(db)).length, 0,
    "a single 401 must not be actionable — that is what an outage looks like");
});

test("a page loading forty times cannot manufacture a confirmation", async () => {
  const db = await fresh();
  for (let i = 0; i < 40; i += 1)
    await noteRejection("u1", "printify", "unauthorized", db, NOW + i);
  const [row] = await rows(db);
  assert.equal(row.sightings, 1, "repeats inside the window advance nothing");
  assert.equal((await confirmedRejections(db)).length, 0);
});

test("the provider must say it twice, with real time in between", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  await noteRejection("u1", "printify", "unauthorized", db, NOW + CONFIRM_AFTER_SECONDS);
  const due = await confirmedRejections(db);
  assert.equal(due.length, 1);
  assert.equal(due[0].sightings, CONFIRMATIONS_REQUIRED);
  assert.equal(due[0].userId, "u1");
});

test("a credential that works again clears its own report", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  await noteRejection("u1", "printify", "unauthorized", db, NOW + CONFIRM_AFTER_SECONDS);
  assert.equal((await confirmedRejections(db)).length, 1);
  await clearRejection("u1", "printify", db);
  assert.equal((await confirmedRejections(db)).length, 0);
  assert.equal((await rows(db)).length, 0, "the report is gone, not merely ignored");
});

test("retiring is idempotent and does not re-arm", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  await noteRejection("u1", "printify", "unauthorized", db, NOW + CONFIRM_AFTER_SECONDS);
  await markRetired("u1", "printify", db);
  await markRetired("u1", "printify", db);
  assert.equal((await confirmedRejections(db)).length, 0,
    "a handled report must not come back round");
  assert.equal((await rows(db)).length, 1, "the record of what happened survives");
});

test("one report per member and provider, and members do not collide", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  await noteRejection("u2", "printify", "forbidden", db, NOW);
  await noteRejection("u1", "printify", "forbidden", db, NOW + CONFIRM_AFTER_SECONDS);
  const all = await rows(db);
  assert.equal(all.length, 2, "one row per member and provider");
  const mine = all.find(r => r.user_id === "u1");
  assert.equal(mine.sightings, 2);
  assert.equal(all.find(r => r.user_id === "u2").sightings, 1,
    "another member's report is untouched");
});

test("nothing from the provider's own response is stored", async () => {
  const db = await fresh();
  await noteRejection("u1", "printify", "unauthorized", db, NOW);
  const [row] = await rows(db);
  /* A closed set of our own words. A provider's error text is exactly the
     kind of thing that turns out to contain a token. */
  assert.ok(["unauthorized", "forbidden", "unreadable-token"].includes(row.reason));
});

test("the connection check itself no longer deletes anything", () => {
  const route = readFileSync(new URL("../app/api/printify/route.ts",
    import.meta.url), "utf8");
  const at = route.search(/export async function GET\b/);
  assert.ok(at > -1);
  const open = route.indexOf("{", at);
  let depth = 0, end = open;
  for (let i = open; i < route.length; i += 1) {
    if (route[i] === "{") depth += 1;
    else if (route[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const body = route.slice(open, end + 1);
  assert.ok(!/DELETE FROM/.test(body), "the check must be a read");
  assert.match(body, /noteRejection\(/, "a refusal is recorded");
  assert.match(body, /clearRejection\(/, "and recovery clears it");
});

test("only the worker retires, and it asks the provider once more first", () => {
  const tick = readFileSync(new URL(
    "../app/api/operations/connection-cleanup-tick/route.ts", import.meta.url), "utf8");
  const deleteAt = tick.indexOf("DELETE FROM printify_connections");
  const verifyAt = tick.indexOf("api.printify.com/v1/shops.json");
  assert.ok(verifyAt > -1 && deleteAt > verifyAt,
    "it must re-verify before it destroys anything");
  assert.match(tick, /if \(answer\.ok\) recovered = true/);
  assert.match(tick, /could-not-verify/,
    "a failure to ask is not a confirmation");
  assert.match(tick, /cf-connecting-ip/, "internal only");
});
