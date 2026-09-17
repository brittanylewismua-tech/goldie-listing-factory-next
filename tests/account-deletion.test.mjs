/*
  DELETION, EXERCISED AGAINST A SEEDED STORE AND A DISPOSABLE IDENTITY.

  This is the one path that cannot be tested by running it: there is no second
  attempt on a real account. So the lifecycle takes its storage as a parameter
  and is driven here against an in-memory stand-in seeded with rows belonging
  to two identities — the one being deleted and a bystander who must come
  through untouched.

  Nothing here reaches a real database, and the production route refuses the
  owner outright.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deleteAccount, DELETION_AUDIT_TABLE } from "../app/account-deletion.ts";
import { DELETION_PLAN, CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS } from "../app/deletion-plan.ts";

const NOW = 1_800_000_000;
const VICTIM = "disposable-identity";
const BYSTANDER = "someone-else";

/** A seeded store that understands only what the plan actually does. */
function seededStore() {
  const rows = new Map();
  for (const step of DELETION_PLAN)
    rows.set(step.table, [
      { user_id: VICTIM, retired: false },
      { user_id: VICTIM, retired: false },
      { user_id: BYSTANDER, retired: false },
    ]);
  const audits = [];

  return {
    rows, audits,
    runner: {
      async run(sql, userId) {
        const table = /(?:DELETE FROM|UPDATE)\s+(\w+)/.exec(sql)?.[1];
        assert.ok(table, `could not read a table out of: ${sql}`);
        assert.match(sql, /WHERE user_id = \?/,
          `${table} is not scoped to one member`);
        const held = rows.get(table) ?? [];
        const mine = held.filter(row => row.user_id === userId);
        if (/^DELETE/.test(sql.trim()))
          rows.set(table, held.filter(row => row.user_id !== userId));
        else mine.forEach(row => { row.retired = true; });
        return mine.length;
      },
      async begin(userId, at) { audits.push({ userId, at, finishedAt: null, steps: null }); },
      async finish(userId, at, steps) {
        const open = audits.find(entry => entry.userId === userId && !entry.finishedAt);
        assert.ok(open, "finish without begin");
        open.finishedAt = new Date(at * 1000).toISOString();
        open.steps = steps;
      },
      async existing(userId) {
        const done = audits.find(entry => entry.userId === userId && entry.finishedAt);
        return done ? { finishedAt: done.finishedAt } : null;
      },
    },
  };
}

const good = store => ({
  userId: VICTIM, phrase: CONFIRMATION_PHRASE, authenticatedAt: NOW - 60,
  now: NOW, runner: store.runner,
});

test("the exact phrase is required", async () => {
  const store = seededStore();
  for (const phrase of ["", "delete my data", "DELETE MY DATA PLEASE", "DELETE  MY DATA"]) {
    const result = await deleteAccount({ ...good(store), phrase });
    assert.equal(result.ok, false, `"${phrase}" was accepted`);
  }
  assert.equal(store.audits.length, 0, "a refused attempt must not open an audit row");
  assert.equal(store.rows.get(DELETION_PLAN[0].table).length, 3, "nothing may be touched");
});

test("stale authentication is refused", async () => {
  const store = seededStore();
  const result = await deleteAccount({
    ...good(store), authenticatedAt: NOW - RECENT_AUTH_SECONDS - 1 });
  assert.equal(result.ok, false);
  assert.match(result.because, /Sign in again/);
  assert.equal(store.rows.get(DELETION_PLAN[0].table).length, 3);
});

test("a complete run deletes, retires, and leaves the bystander alone", async () => {
  const store = seededStore();
  const result = await deleteAccount(good(store));
  assert.equal(result.ok, true);
  assert.equal(result.alreadyDone, false);
  assert.equal(result.steps.length, DELETION_PLAN.length, "every step must report");

  for (const step of DELETION_PLAN) {
    const held = store.rows.get(step.table);
    const mine = held.filter(row => row.user_id === VICTIM);
    const theirs = held.filter(row => row.user_id === BYSTANDER);
    assert.equal(theirs.length, 1, `${step.table} lost the bystander's row`);
    assert.ok(theirs.every(row => row.retired === false),
      `${step.table} retired the bystander`);
    if (step.disposition === "delete")
      assert.equal(mine.length, 0, `${step.table} still holds the member's rows`);
    else {
      assert.equal(mine.length, 2, `${step.table} deleted rows it should have retired`);
      assert.ok(mine.every(row => row.retired), `${step.table} did not retire`);
    }
  }
});

test("the audit row is opened before the first statement and closed after the last", async () => {
  const store = seededStore();
  await deleteAccount(good(store));
  assert.equal(store.audits.length, 1);
  const [audit] = store.audits;
  assert.equal(audit.userId, VICTIM);
  assert.ok(audit.finishedAt, "the run must be recorded as finished");
  assert.equal(audit.steps.length, DELETION_PLAN.length,
    "per-step counts are the evidence under 'your data was deleted'");
});

test("an interrupted run leaves an open audit row, not a silent absence", async () => {
  const store = seededStore();
  let calls = 0;
  const failing = { ...store.runner,
    async run(sql, userId) {
      calls += 1;
      if (calls === 3) throw new Error("connection lost");
      return store.runner.run(sql, userId);
    } };
  await assert.rejects(() => deleteAccount({ ...good(store), runner: failing }));
  assert.equal(store.audits.length, 1);
  assert.equal(store.audits[0].finishedAt, null,
    "a half-finished deletion must be visible as half-finished");
});

test("running it twice does not run the plan twice", async () => {
  const store = seededStore();
  const first = await deleteAccount(good(store));
  assert.equal(first.alreadyDone, false);

  let ranAgain = false;
  const watched = { ...store.runner,
    async run(sql, userId) { ranAgain = true; return store.runner.run(sql, userId); } };
  const second = await deleteAccount({ ...good(store), runner: watched });

  assert.equal(second.ok, true);
  assert.equal(second.alreadyDone, true);
  assert.equal(second.finishedAt, first.finishedAt, "the same completion is reported");
  assert.equal(ranAgain, false, "a retry must not re-run the plan");
  assert.equal(store.audits.length, 1, "and must not open a second audit row");
});

test("the audit is not part of the plan it audits", async () => {
  /* Deleting the proof of a deletion is how a system ends up unable to answer
     the only question that matters afterwards. */
  assert.ok(!DELETION_PLAN.some(step => step.table === DELETION_AUDIT_TABLE),
    "the deletion plan removes its own audit trail");
});

test("every step is scoped to one member by a bound parameter", () => {
  for (const step of DELETION_PLAN) {
    assert.match(step.sql, /WHERE user_id = \?/, `${step.table} is not member-scoped`);
    const binds = (step.sql.match(/\?/g) || []).length;
    assert.equal(binds, 1, `${step.table} binds ${binds} parameters; it may bind only the member`);
    assert.ok(!/DROP|TRUNCATE|ALTER/i.test(step.sql), `${step.table} does more than it says`);
  }
});

test("the route refuses the owner and anyone not signed in", () => {
  const route = readFileSync(new URL("../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /isOwner\(user\)/, "the owner's own account must not be deletable here");
  assert.match(route, /status: 401/);
  assert.match(route, /CONFIRMATION_PHRASE/);
});

test("the confirmation never shows a member a table name", () => {
  /*
    The first version of the success state listed "27 from scan_history" and
    "1 from etsy_connections" — the same defect as the raw field names on the
    account page, made twice on the same screen. The plan already carries a
    sentence per step written for a person.
  */
  const route = readFileSync(new URL(
    "../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /say: DELETION_PLAN\.find\(entry => entry\.table === step\.table\)\?\.say/);
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /step\.say/);
  assert.ok(!/step\.table/.test(client), "the interface still renders a table name");
  /* Every step has a sentence to render. */
  for (const step of DELETION_PLAN)
    assert.ok(step.say && step.say.length > 10, `${step.table} has no member-facing sentence`);
});

test("the held-data counts do not go stale after a deletion", () => {
  /* The page showed "27 design scans" above a panel saying they had just been
     removed. */
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /onDone\(\)/);
  assert.match(client, /onDone=\{\(\) => setData\(\{ yours: \{\} \}\)\}/);
});
