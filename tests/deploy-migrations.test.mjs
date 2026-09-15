/*
  A member's first action must never carry a schema migration, and running the
  migration twice must be the normal case rather than a risk.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));
const MIG = readFileSync(new URL("../app/deploy-migrations.ts", import.meta.url), "utf8");

const files = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
};
walk(appDir);

test("every foundational table has a deploy migration step", () => {
  /* Collect the tables the application creates, then check each one is
     reachable from a step in the deploy list. */
  const owners = new Map();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g))
      owners.set(match[1], file.slice(appDir.length));
  }
  /* Tables the deploy path reaches, via the ensure functions it imports. */
  /* A module may export more than one ensure function, so the import list can
     carry several names — matching only a single name missed the module
     entirely and reported its tables as uncovered. */
  const imported = [...MIG.matchAll(/import \{[^}]*\bensure\w+[^}]*\} from "@\/app\/([\w-]+)"/g)]
    .map(match => `${match[1]}.ts`);
  const covered = new Set(imported);

  const uncovered = [...owners.entries()]
    .filter(([table, file]) => !covered.has(file)
      /* Feature-local caches and diagnostic tables are safe to create at
         runtime: nothing foundational depends on them existing first. */
      && !/api\//.test(file)
      && !["sold_moves", "sold_moves_hourly", "sold_spend", "sold_state",
           "sold_taxonomy", "sold_watch", "shop_sold", "ai_vision_requests",
           "feature_canary", "account_plans"].includes(table))
    .map(([table, file]) => `${table} (${file})`);
  assert.deepEqual(uncovered, [],
    `these tables are still created only at runtime:\n${uncovered.join("\n")}`);
});

test("the two owners that take a database are given one", () => {
  /* They failed in production with "Cannot read properties of undefined"
     because the step called them with no argument. */
  assert.match(MIG, /run: \(\) => ensureErrorLog\(database\(\)\)/);
  assert.match(MIG, /run: \(\) => ensureRegisterTables\(database\(\)\)/);
});

test("a column-adding step runs before anything that indexes it", () => {
  /* ensureScopeColumn ALTERs etsy_connections; everything reading `scopes`
     must come after it. SQLite will not reorder for us. */
  const order = [...MIG.matchAll(/\{ name: "([a-z_]+)"/g)].map(match => match[1]);
  assert.ok(order.indexOf("etsy_connection_scopes") < order.indexOf("shop_map_listings"),
    "the scopes column is added after the tables that read it");
  assert.ok(order.indexOf("error_log") === 0, "errors have nowhere to be recorded");
  assert.ok(order.indexOf("market_store") < order.indexOf("niche_watches"),
    "niche watches come before the evidence they read");
});

test("one failing step never stops the rest", () => {
  assert.match(MIG, /outcomes\.push\(\{ name: step\.name, ok: false/);
  assert.match(MIG, /One failing step must not stop the twenty behind it/);
});

test("no migration step drops or rewrites data", () => {
  for (const banned of ["DROP TABLE", "DELETE FROM", "TRUNCATE", "DROP COLUMN"])
    assert.ok(!MIG.includes(banned), `a migration step performs ${banned}`);
});

test("the deploy runs it, so a fresh deploy is migrated without a member", () => {
  const scheduled = readFileSync(
    new URL("../scripts/add-scheduled-handler.mjs", import.meta.url), "utf8");
  assert.match(scheduled, /\/api\/operations\/migrate/);
  assert.match(scheduled, /SCHEMA FIRST/);
});

test("the migration route is owner-only or internal, never a member route", () => {
  const route = readFileSync(new URL(
    "../app/api/operations/migrate/route.ts", import.meta.url), "utf8");
  assert.match(route, /isOwner\(user\)/);
  assert.match(route, /const internal = !request\.headers\.get\("cf-connecting-ip"\)/);
});
