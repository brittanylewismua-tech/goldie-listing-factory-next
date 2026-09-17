/*
  A DELETION PLAN IS ONLY AS GOOD AS THE TABLES IT KNOWS ABOUT.

  The plan named twelve tables. Thirty-eight tables in this codebase are keyed
  by user_id. So a member who deleted their account kept their entire Shop Map
  and every classification in it, every mockup template and scene, their
  listing batches, their finance settings, production costs and adjustments,
  their design intelligence, and their artwork capture queue — while being
  told "Your data has been removed."

  The plan was correct about everything it named and silent about most of what
  existed, which is the worst possible shape for this particular promise.

  This walks every CREATE TABLE in the codebase and refuses any table with a
  user_id column that is in neither DELETION_PLAN nor NOT_MEMBER_DATA. A table
  added later cannot escape by nobody noticing.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DELETION_PLAN, NOT_MEMBER_DATA } from "../app/deletion-plan.ts";

const sources = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
    else if (/\.tsx?$/.test(entry.name)) sources.push(new URL(entry.name, dir));
  }
};
walk(new URL("../app/", import.meta.url));

/*
  EVERY TABLE SCOPED TO A MEMBER, FOUND BY HOW IT IS QUERIED.

  A first version looked only at CREATE TABLE statements in this codebase and
  reported everything accounted for. Eleven tables holding a member's rows are
  created by migration rather than here — photo_deliveries, the whole Etsy
  publish queue, every keyword bank a member built — so the scan could not see
  them and the plan did not cover them.

  A table is a member's if some statement in this codebase restricts it by
  `WHERE user_id = ?`. That is the definition the product itself uses every
  time it reads a member's rows, so it cannot drift from reality the way a
  hand-kept list does.
*/
function memberTables() {
  const found = new Map();
  const STARTS_SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|WITH)\b/is;
  const ACTS_ON = /\b(?:FROM|INTO|UPDATE|CREATE TABLE(?: IF NOT EXISTS)?)\s+([a-z_][a-z0-9_]{2,})/is;
  const SCOPED = /\buser_id\s*(?:=|IS)/i;
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    const strings = [...text.matchAll(/`([^`]*)`/g), ...text.matchAll(/"([^"]*)"/g)];
    for (const [, statement] of strings) {
      if (!STARTS_SQL.test(statement)) continue;
      if (!/\buser_id\b/.test(statement)) continue;
      const acts = statement.match(ACTS_ON);
      if (!acts) continue;
      const name = acts[1];
      if (name === "sqlite_master" || name.startsWith("json_")) continue;
      /* Scoped to one member somewhere, or declared with the column. */
      if (!SCOPED.test(statement) && !/CREATE TABLE/i.test(statement)) continue;
      if (!found.has(name)) found.set(name, file.pathname);
    }
  }
  return found;
}

test("every table holding a member's rows is accounted for", () => {
  const planned = new Set(DELETION_PLAN.map(step => step.table));
  const exempt = new Set(NOT_MEMBER_DATA.map(entry => entry.table));
  const tables = memberTables();
  assert.ok(tables.size > 30, `only ${tables.size} tables found — the scan is broken`);

  const unaccounted = [...tables.entries()]
    .filter(([name]) => !planned.has(name) && !exempt.has(name))
    .map(([name, where]) => `${name} (${where.replace(/.*\/app\//, "app/")})`);

  assert.deepEqual(unaccounted, [],
    `these tables hold a member's rows and no deletion plan step covers them:\n  `
    + unaccounted.join("\n  "));
});

test("nothing is exempt without a reason", () => {
  for (const entry of NOT_MEMBER_DATA) {
    assert.ok(entry.why && entry.why.length > 40,
      `${entry.table} is exempt without a real reason`);
  }
});

test("a step's SQL touches the table it claims and binds only the member", () => {
  for (const step of DELETION_PLAN) {
    assert.ok(step.sql.includes(step.table),
      `${step.table}: the SQL does not name the table the step claims`);
    assert.match(step.sql, /WHERE user_id = \?$/,
      `${step.table}: must be scoped to one member, with no second parameter`);
    assert.equal((step.sql.match(/\?/g) ?? []).length, 1,
      `${step.table}: exactly one bound parameter, the member's id`);
    if (step.disposition === "delete")
      assert.match(step.sql, /^DELETE FROM/, `${step.table}: a delete step must delete`);
    if (step.disposition === "retire")
      assert.match(step.sql, /^UPDATE/, `${step.table}: a retire step must update, not delete`);
  }
});

test("every step says something a member can read", () => {
  for (const step of DELETION_PLAN) {
    assert.ok(step.say.length > 15, `${step.table}: no sentence for the member`);
    assert.ok(!/_/.test(step.say), `${step.table}: the sentence contains a raw identifier`);
    assert.ok(!/\bGoldie\b/.test(step.say), `${step.table}: names the old product`);
  }
});

test("no table appears twice", () => {
  const seen = new Set();
  for (const step of DELETION_PLAN) {
    assert.ok(!seen.has(step.table), `${step.table} appears twice in the plan`);
    seen.add(step.table);
  }
});
