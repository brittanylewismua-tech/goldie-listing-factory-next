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
import { DELETION_PLAN, OBJECT_PREFIXES, NOT_MEMBER_DATA, CONFIRMATION_PHRASE, RECENT_AUTH_SECONDS } from "../app/deletion-plan.ts";

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
  /*
    A stored-object bucket, seeded with both members' files under the same
    prefixes. A prefix delete that reaches the bystander's artwork is the
    single worst thing this code could do, so the store is built to catch it.
  */
  const objects = new Set();
  for (const entry of OBJECT_PREFIXES)
    for (const who of [VICTIM, BYSTANDER])
      for (const n of [1, 2]) objects.add(`${entry.prefix}${who}/file-${n}.png`);

  return {
    rows, audits, objects,
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
      async removeObjects(prefix, userId) {
        const mine = [...objects].filter(key => key.startsWith(`${prefix}${userId}/`));
        mine.forEach(key => objects.delete(key));
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
        /* The most recent finished run, and what it could not do — the same
           shape the real storage reads back out of the audit. */
        const done = [...audits].reverse()
          .find(entry => entry.userId === userId && entry.finishedAt);
        if (!done) return null;
        return { finishedAt: done.finishedAt,
          incompleteTables: (done.steps ?? [])
            .filter(step => step.failed).map(step => step.table) };
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
  assert.equal(result.steps.length, DELETION_PLAN.length + OBJECT_PREFIXES.length,
    "every step must report, stored files included");

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
  assert.equal(audit.steps.length, DELETION_PLAN.length + OBJECT_PREFIXES.length,
    "per-step counts are the evidence under 'your data was deleted'");
});

test("one step that cannot run does not abandon the other forty-two", async () => {
  /*
    This used to assert the opposite: that a throwing step stopped the run and
    left the audit row open as the record of a partial deletion. Defensible
    with twelve steps. With forty-three it means one table that was never
    migrated onto this database aborts at step three and leaves forty tables
    of the member's data in place — after they typed the phrase and were told
    the deletion was under way.

    Every step is attempted now, the failure is carried rather than thrown,
    and the audit says exactly what could not be done.
  */
  const store = seededStore();
  let calls = 0;
  const failing = { ...store.runner,
    async run(sql, userId) {
      calls += 1;
      if (calls === 3) throw new Error("no such table: mockup_templates");
      return store.runner.run(sql, userId);
    } };
  const outcome = await deleteAccount({ ...good(store), runner: failing });

  assert.equal(outcome.ok, true);
  assert.equal(calls, DELETION_PLAN.length, "every SQL step must still be attempted");
  assert.equal(outcome.incomplete.length, 1);
  assert.match(outcome.incomplete[0].failed, /no such table/);
  /* The audit is completed, carrying the failure, rather than left open —
     an open row would make a retry repeat the whole plan and would report a
     mostly complete deletion as one that never happened. */
  assert.equal(store.audits.length, 1);
  assert.ok(store.audits[0].finishedAt, "the run finished, with a failure recorded");
  assert.ok(store.audits[0].steps.some(step => step.failed),
    "the audit must carry what could not be done");
});

test("a clean run reports nothing incomplete", async () => {
  const store = seededStore();
  const outcome = await deleteAccount(good(store));
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.incomplete, []);
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
  /* One lookup for every step, stored files included, and it can only ever
     return a sentence — never a table name or a storage prefix. */
  assert.match(route, /const sayFor = \(table: string\) =>/);
  assert.match(route, /DELETION_PLAN\.find\(entry => entry\.table === table\)\?\.say/);
  assert.match(route, /OBJECT_PREFIXES\.find\(/);
  assert.ok(!/\?\? step\.table/.test(route),
    "a step with no sentence must not fall back to its table name");
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /step\.say/);
  assert.ok(!/step\.table/.test(client), "the interface still renders a table name");
  /* Every step has a sentence to render. */
  for (const step of DELETION_PLAN)
    assert.ok(step.say && step.say.length > 10, `${step.table} has no member-facing sentence`);
  for (const entry of OBJECT_PREFIXES)
    assert.ok(entry.say && entry.say.length > 10, `${entry.prefix} has no member-facing sentence`);
});

test("the held-data counts do not go stale after a deletion", () => {
  /* The page showed "27 design scans" above a panel saying they had just been
     removed. */
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /onDone\(\)/);
  assert.match(client, /onDone=\{\(\) => setData\(\{ yours: \{\} \}\)\}/);
});

test("stored files go with the rows, and only the member's own", async () => {
  /*
    The plan's header has always said R2 artwork "needs care" and no step ever
    touched it: a member could delete their account and their uploaded print
    files stayed in the bucket. The care turned out to be already designed in
    — every object key starts with the member's id, so removal is a prefix
    delete that cannot name anybody else's file. This is the test that the
    design actually holds.
  */
  const store = seededStore();
  const before = store.objects.size;
  const outcome = await deleteAccount(good(store));

  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.incomplete, []);
  for (const entry of OBJECT_PREFIXES) {
    const step = outcome.steps.find(one => one.table === `${entry.prefix}<member>`);
    assert.ok(step, `${entry.prefix} was never attempted`);
    assert.equal(step.changed, 2, `${entry.prefix}: the member's files were not removed`);
  }
  assert.equal(store.objects.size, before / 2);
  for (const key of store.objects)
    assert.ok(key.includes(BYSTANDER),
      `a prefix delete reached somebody else's file: ${key}`);
});

test("no object store is reported as not done, never as done", async () => {
  /* Silence here would mean telling a member their files were removed when
     nothing had been asked to remove them. */
  const store = seededStore();
  const withoutBucket = { ...store.runner, removeObjects: undefined };
  const outcome = await deleteAccount({ ...good(store), runner: withoutBucket });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.incomplete.length, OBJECT_PREFIXES.length);
  for (const step of outcome.incomplete)
    assert.match(step.failed, /no object store/);
  assert.equal(store.objects.size, OBJECT_PREFIXES.length * 4, "nothing was removed");
});

test("the confirmation renders the lists its own sentence promises", () => {
  /*
    The route sent `incomplete` and `kept`; the component destructured neither,
    so a partial deletion rendered "Some of it could not be removed and is
    listed below" above nothing at all. Seen in the state harness on the
    deployed build. A promise of a list is worse than no list, because the
    member is left believing something is missing from the page rather than
    knowing what could not be removed.
  */
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /incomplete\?: \{ say: string \}\[\]; kept\?: string\[\]/);
  assert.match(client, /incomplete: answer\.incomplete \?\? \[\]/);
  assert.match(client, /kept: answer\.kept \?\? \[\]/);
  assert.match(client, /done\.incomplete!\.map/);
  assert.match(client, /done\.kept!\.map/);
});

/* ------------------------------------------------------------------------
   THE FINAL SAFEGUARDS.

   Deletion is the one thing in this product with no second attempt against a
   real account, so each of these is proved against a seeded store and a
   bystander identity rather than reasoned about. Controlled fixtures only:
   nothing here touches a real member.
   ------------------------------------------------------------------------ */

const failingOn = (store, tables) => ({ ...store.runner,
  async run(sql, userId) {
    const table = /(?:DELETE FROM|UPDATE)\s+(\w+)/.exec(sql)?.[1];
    if (tables.includes(table)) throw new Error(`no such table: ${table}`);
    return store.runner.run(sql, userId);
  } });

test("a failed step means the outcome is not complete", () => {
  /* `ok` says the request was allowed and ran. `complete` says whether it
     finished. An interface must never turn the first into the second. */
  const route = readFileSync(new URL(
    "../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /complete: outcome\.complete/);
  const client = readFileSync(new URL(
    "../app/account/settings/account-client.tsx", import.meta.url), "utf8");
  assert.match(client, /complete\?: boolean/,
    "the interface must receive whether the deletion finished");
});

test("a partial run reports incomplete, and a resume finishes only what failed", async () => {
  /*
    A run with a failed step finishes its audit — that is what keeps the
    record honest and stops a retry repeating the whole plan. A first version
    then answered any finished audit with "already removed, nothing further
    was changed", so a member whose deletion had partly failed was told it was
    complete one screen after being told that asking again would finish it.
  */
  const store = seededStore();
  const first = await deleteAccount({ ...good(store),
    runner: failingOn(store, ["mockup_templates", "keyword_lists"]) });

  assert.equal(first.complete, false, "a failed step is not a completed deletion");
  assert.equal(first.resumed, false);
  assert.equal(first.incomplete.length, 2);

  /* Resume: only the two failed tables are touched. */
  const attempted = [];
  const watching = { ...store.runner,
    async run(sql, userId) {
      attempted.push(/(?:DELETE FROM|UPDATE)\s+(\w+)/.exec(sql)?.[1]);
      return store.runner.run(sql, userId);
    } };
  const second = await deleteAccount({ ...good(store), runner: watching });

  assert.equal(second.ok, true);
  assert.equal(second.resumed, true, "the second run must resume, not report done");
  assert.equal(second.alreadyDone, false);
  assert.deepEqual(attempted.sort(), ["keyword_lists", "mockup_templates"],
    "a resume must attempt only the steps that failed");
  assert.equal(second.complete, true);

  /* And a third run, with nothing outstanding, changes nothing. */
  let ranAgain = false;
  const third = await deleteAccount({ ...good(store),
    runner: { ...store.runner, async run(sql, userId) {
      ranAgain = true; return store.runner.run(sql, userId); } } });
  assert.equal(third.alreadyDone, true);
  assert.equal(third.complete, true);
  assert.equal(ranAgain, false, "nothing already done may be repeated");
});

test("a resume does not repeat a completed step destructively", async () => {
  /* Every step is scoped to one member and idempotent, but a resume must not
     rely on that: it attempts only what is outstanding. */
  const store = seededStore();
  await deleteAccount({ ...good(store), runner: failingOn(store, ["scan_history"]) });
  /* The bystander's rows in an ALREADY completed table are the canary: a
     resume that re-ran everything would still have to leave them, but one
     that re-ran nothing cannot touch them at all. */
  const before = JSON.stringify([...store.rows.entries()]);
  const attempted = [];
  await deleteAccount({ ...good(store),
    runner: { ...store.runner, async run(sql, userId) {
      attempted.push(sql); return store.runner.run(sql, userId); } } });
  assert.equal(attempted.length, 1);
  assert.match(attempted[0], /scan_history/);
  const after = JSON.parse(before);
  for (const [table, rows] of after)
    if (table !== "scan_history")
      assert.deepEqual(store.rows.get(table), rows, `${table} was touched again`);
});

test("R2 removal pages to the end of the prefix", async () => {
  /*
    R2 lists a page at a time. A first implementation that removed the first
    page and reported success would leave every object past it in the bucket
    while telling the member their files were gone.
  */
  const store = seededStore();
  const pages = [];
  const paging = { ...store.runner,
    async removeObjects(prefix, userId) {
      /* 2,500 objects across three pages of 1,000. */
      let removed = 0;
      for (let page = 0; page < 3; page += 1) {
        const size = page < 2 ? 1_000 : 500;
        pages.push({ prefix, page, size });
        removed += size;
      }
      void userId;
      return removed;
    } };
  const outcome = await deleteAccount({ ...good(store), runner: paging });
  for (const entry of OBJECT_PREFIXES) {
    const step = outcome.steps.find(one => one.table === `${entry.prefix}<member>`);
    assert.equal(step.changed, 2_500, `${entry.prefix} stopped before the end`);
  }
  assert.equal(pages.length, OBJECT_PREFIXES.length * 3);

  /* And the real implementation follows the cursor rather than one page. */
  const route = readFileSync(new URL(
    "../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /cursor = page\.truncated \? page\.cursor : undefined/);
  assert.match(route, /\} while \(cursor\)/);
  assert.match(route, /key\.startsWith\(scoped\)/,
    "keys must be re-checked before an unrecoverable delete");
});

test("tokens are destroyed and entitlement is removed", () => {
  const etsy = DELETION_PLAN.find(step => step.table === "etsy_connections");
  assert.equal(etsy.disposition, "retire");
  assert.match(etsy.sql, /encrypted_access_token = ''/);
  assert.match(etsy.sql, /encrypted_refresh_token = ''/);
  assert.match(etsy.sql, /is_active = 0/);
  const printify = DELETION_PLAN.find(step => step.table === "printify_connections");
  assert.match(printify.sql, /encrypted_token = ''/);
  const entitlement = DELETION_PLAN.find(step => step.table === "member_entitlements");
  assert.match(entitlement.sql, /state = 'none'/);
  assert.match(entitlement.sql, /plan = NULL/);
});

test("the audit record survives the deletion it records", () => {
  /* Deleting the proof of a deletion is how a system ends up unable to answer
     the only question that matters afterwards. */
  assert.ok(!DELETION_PLAN.some(step => step.table === DELETION_AUDIT_TABLE),
    "the audit table must not be in the plan it audits");
  assert.ok(NOT_MEMBER_DATA.some(entry => entry.table === DELETION_AUDIT_TABLE),
    "and it must be accounted for as deliberately kept");
});

test("another member's rows and objects survive a partial run too", async () => {
  /*
    A partial run is the case where a mistake would be hardest to see: some
    tables are cleared, some are not, and the bystander's rows have to come
    through all of it untouched.
  */
  const failed = ["scan_history", "niche_watches"];
  const store = seededStore();
  await deleteAccount({ ...good(store), runner: failingOn(store, failed) });

  const disposition = new Map(DELETION_PLAN.map(step => [step.table, step.disposition]));
  for (const [table, rows] of store.rows) {
    if (failed.includes(table)) {
      /* The step failed, so the member's rows are still there — that is what
         "incomplete" means, and it is why the resume exists. */
      assert.ok(rows.some(row => row.user_id === VICTIM),
        `${table} was reported as failed but its rows are gone`);
      continue;
    }
    if (disposition.get(table) === "retire") {
      /* A retired row survives on purpose, with its secret destroyed — the
         record that the connection existed is what shows nothing was
         published after the member left. */
      const mine = rows.filter(row => row.user_id === VICTIM);
      assert.ok(mine.length > 0, `${table} was dropped rather than retired`);
      assert.ok(mine.every(row => row.retired), `${table} was not actually retired`);
      continue;
    }
    for (const row of rows)
      assert.equal(row.user_id, BYSTANDER,
        `${table} still holds a row belonging to the deleted member`);
  }
  /* The bystander is untouched everywhere, failed tables included. */
  for (const [table, rows] of store.rows)
    assert.ok(rows.some(row => row.user_id === BYSTANDER),
      `${table} lost the other member's rows`);
  for (const key of store.objects)
    assert.ok(key.includes(BYSTANDER), `a prefix delete reached ${key}`);
});
