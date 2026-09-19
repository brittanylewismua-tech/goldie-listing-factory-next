/*
  Two rules the whole suite depends on: a failure must look like a failure, and
  a member's data belongs to that member.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../app/", import.meta.url));
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full)
    : /\.(ts|tsx)$/.test(name) ? [full] : [];
});
const files = walk(root);
const read = file => readFileSync(file, "utf8");
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const rel = file => file.slice(root.length);

/* ---------------------------------------------------------- health */

const HEALTH = read(path.join(root, "api/operations/health/route.ts"));

test("a broken probe reports broken, with the error and the last valid value", () => {
  assert.match(HEALTH, /state: "broken"/);
  assert.match(HEALTH, /error: error instanceof Error \? error\.message/);
  assert.match(HEALTH, /broken: broken\.map\(row => \(\{ key: row\.key, error/);
  assert.match(HEALTH, /last: row\.detail/);
});

test("an empty result is reported as empty, never folded into healthy", () => {
  assert.match(HEALTH, /"empty"/);
  assert.match(HEALTH, /An empty probe is\s*\n?\s*reported as empty, never folded into ok/);
});

test("no health probe swallows an exception into a plausible empty", () => {
  /* Every probe runs through one wrapper; there is no bare catch returning a
     result shape inside the probe bodies. */
  const body = HEALTH.slice(HEALTH.indexOf("const probes: Probe[] = []"));
  assert.doesNotMatch(strip(body), /\.catch\(\(\)\s*=>\s*\(\{\s*results/);
  assert.doesNotMatch(strip(body), /\.catch\(\(\)\s*=>\s*null\)/);
});

/* --------------------------------------------------------- privacy */

test("no route returns an Etsy or Printify token", () => {
  const offences = [];
  for (const file of files) {
    if (!file.includes("/api/")) continue;
    const source = strip(read(file));
    /* Reading a token to USE it is fine; putting it in a response is not. */
    for (const match of source.matchAll(/NextResponse\.json\(([\s\S]{0,600}?)\)/g))
      if (/encrypted_access_token|encrypted_token|access_token|refresh_token|\btoken\b\s*[,:}]/.test(match[1])
        && !/<> ''|IS NOT NULL|tokenPresent|hasToken/.test(match[1]))
        offences.push(rel(file));
  }
  assert.deepEqual([...new Set(offences)], []);
});

test("the Printify connection route never reads the token value", () => {
  const source = read(path.join(root, "api/connections/printify/route.ts"));
  assert.match(source, /encrypted_token <> ''/);
  assert.doesNotMatch(strip(source), /encrypted_token AS|decrypt/);
});

test("every member-owned table read is scoped by user_id", () => {
  const owned = ["scan_uploads", "scan_history", "niche_watches",
    "member_shop_watches", "etsy_connections", "printify_connections"];
  const offences = [];
  for (const file of files) {
    const source = strip(read(file));
    for (const table of owned)
      for (const match of source.matchAll(
        new RegExp(`(SELECT[\\s\\S]{0,400}?)FROM ${table}([\\s\\S]{0,240})`, "g"))) {
        const [, select, after] = match;
        /*
          An aggregate that counts rows across all members returns no member's
          data and is how the owner health view reports scale. A query that
          returns ROWS must name the member.
        */
        const aggregateOnly = /SELECT\s+COUNT\(|SELECT\s+COUNT\(\*\)\s*-\s*COUNT\(/i.test(select)
          && !/shop_name|label|title|email|token/i.test(select);
        if (aggregateOnly) continue;
        /* Scoped by a bound parameter, or correlated to an outer row's member
           (`c.user_id = links.user_id`), which is equally scoped. */
        const scoped = /user_id\s*=\s*\?/.test(after)
          || /\buser_id\s*=\s*[a-z_]+\.user_id\b/.test(after);
        if (!scoped) offences.push(`${rel(file)}: FROM ${table}`);
      }
  }
  /* Owner-only reads that legitimately span members, named explicitly so a new
     one cannot appear without this list changing. */
  const allowed = new Set([
    "api/operations/capabilities/route.ts: FROM etsy_connections",
    "api/design-scanner/review-audit/route.ts: FROM etsy_connections",
    /* Owner-only beta administration looks an account UP by its identifier
       (LOWER(user_id) = ?), which is scoping by a different spelling. It is
       listed rather than pattern-matched so a new cross-member read cannot
       appear without this line changing. */
    "api/operations/beta/route.ts: FROM etsy_connections",
    /* Discovery reads the DISTINCT saved niches across every member — grouped,
       counted, and never returning whose watch they are. That is what makes
       twenty members watching one niche cost one search instead of twenty. */
    "api/market/discover/route.ts: FROM niche_watches",
    /* Review collection is SHARED: it reads which shops anyone follows so one
       fetch serves every watcher. It returns shop ids, never whose watch they
       are, and that is the whole reason twenty watchers cost what one costs. */
    "api/design-scanner/cohort-reviews/route.ts: FROM member_shop_watches",
    /* The scheduled brief rebuild reads the DISTINCT saved niches across every
       member, grouped by niche key. Scoping it to one member would defeat its
       purpose: it exists so two members watching "dog mom" share one rebuild
       instead of buying two. It returns niche keys and a watcher COUNT, never
       whose watch they are. */
    "api/market/niche-brief-tick/route.ts: FROM niche_watches",
    /* The owner health view buckets saved niches by brief state. It reads a
       row per DISTINCT niche so one classifier decides the state — writing
       the buckets in SQL instead would be a second copy of that logic, and
       the copy would drift. It returns niche keys and timestamps, never whose
       watch they are, and the response is counts. */
    "api/operations/health/route.ts: FROM niche_watches",
  ]);
  assert.deepEqual(offences.filter(row => !allowed.has(row)), []);
});

test("every member-owned write is scoped by user_id", () => {
  const owned = ["scan_uploads", "scan_history", "niche_watches", "member_shop_watches"];
  const offences = [];
  for (const file of files) {
    const source = strip(read(file));
    for (const table of owned)
      for (const match of source.matchAll(
        new RegExp(`(DELETE FROM|UPDATE) ${table}([\\s\\S]{0,200})`, "g")))
        if (!/user_id\s*=\s*\?/.test(match[2]))
          offences.push(`${rel(file)}: ${match[1]} ${table}`);
  }
  assert.deepEqual(offences, []);
});

test("shared reference analysis carries no member identity", () => {
  const analyze = read(path.join(root, "api/design-scanner/analyze-references/route.ts"));
  const create = analyze.slice(analyze.indexOf("CREATE TABLE IF NOT EXISTS reference_analysis"),
    analyze.indexOf("PRIMARY KEY (image_id"));
  for (const leak of ["user_id", "member", "owner", "email"])
    assert.ok(!create.includes(leak), `shared analysis stores ${leak}`);
});

test("captured artwork keys stay member-scoped", () => {
  const provenance = read(path.join(root, "artwork-provenance.ts"));
  const create = provenance.slice(provenance.indexOf("CREATE TABLE IF NOT EXISTS artwork_provenance"));
  assert.match(create.slice(0, 500), /user_id TEXT NOT NULL/);
});

test("a retired connection cannot publish", () => {
  /* A connection with no token is retired. Nothing may publish through one. */
  const connections = read(path.join(root, "connections/connections-client.tsx"));
  assert.match(connections, /needsReconnect/);
  assert.match(connections, /never offers to delete a connection/);
});

test("owner tools do not leak another member's shop names", () => {
  const review = read(path.join(root, "api/design-scanner/review-audit/route.ts"));
  /* Shop ids appear as concentration counts; names do not appear at all. */
  assert.doesNotMatch(strip(review), /shop_name/);
});

/* ------------------------------------------------------- lifecycle */
import { describe as describeAction, willBeRemoved, EFFECTS, CONFIRMATION_REQUIRED }
  from "../app/data-lifecycle.ts";

test("every removal says what goes and what stays", () => {
  for (const [action, effects] of Object.entries(EFFECTS)) {
    assert.ok(effects.length, `${action} describes nothing`);
    for (const effect of effects) {
      assert.ok(effect.say.length > 20, `${action}: "${effect.say}" is not an explanation`);
      assert.ok(["removed", "retired", "shared-kept"].includes(effect.disposition));
    }
  }
});

test("an Etsy connection is retired, never removed", () => {
  for (const action of ["account-deletion", "etsy-disconnect"]) {
    const connection = describeAction(action)
      .find(effect => /etsy_connections/.test(effect.what));
    assert.ok(connection, `${action} does not mention the Etsy connection`);
    assert.equal(connection.disposition, "retired",
      `${action} hard-deletes an Etsy connection`);
  }
  assert.ok(!willBeRemoved("etsy-disconnect").some(effect => /etsy_connections/.test(effect.what)));
});

test("unwatching does not destroy shared history for everyone else", () => {
  for (const action of ["remove-niche-watch", "remove-shop-watch"]) {
    const shared = describeAction(action).filter(effect => effect.disposition === "shared-kept");
    assert.ok(shared.length, `${action} keeps nothing shared`);
  }
});

test("deleting a scan does not delete the shared analysis it compared against", () => {
  const shared = describeAction("delete-scan")
    .find(effect => /reference_analysis/.test(effect.what));
  assert.equal(shared.disposition, "shared-kept");
});

test("irreversible actions require confirmation", () => {
  assert.ok(CONFIRMATION_REQUIRED.includes("account-deletion"));
  assert.ok(CONFIRMATION_REQUIRED.includes("delete-artwork"));
});

test("the data route describes and never deletes", () => {
  const route = readFileSync(new URL(
    "../app/api/account/data/route.ts", import.meta.url), "utf8");
  for (const write of ["DELETE FROM", "DROP ", "UPDATE "])
    assert.ok(!route.includes(write), `the data route performs ${write}`);
  assert.match(route, /export const GET/);
  assert.doesNotMatch(route, /export const (POST|DELETE)/);
});

test("the Printify route reads only columns printify_connections has", () => {
  /* Measured against the live schema: user_id, encrypted_token, updated_at.
     An earlier version asked for shop_id and shop_name, threw, and told a
     connected member they were not connected. */
  const LIVE = ["user_id", "encrypted_token", "updated_at"];
  const route = readFileSync(new URL(
    "../app/api/connections/printify/route.ts", import.meta.url), "utf8");
  const select = route.slice(route.indexOf("SELECT"), route.indexOf("FROM printify_connections"));
  for (const match of select.matchAll(/\b([a-z_]+)\s+AS\s+/g))
    assert.ok(LIVE.includes(match[1]),
      `printify_connections has no column ${match[1]}`);
});

test("a failed connection lookup is never shown as disconnected", () => {
  const route = readFileSync(new URL(
    "../app/api/connections/printify/route.ts", import.meta.url), "utf8");
  assert.match(route, /connected: null, error: failed/);
  assert.match(route, /A failed lookup is reported, never rendered as "not connected"/);
});

/* --------------------------------------------------- deletion execution */
import { DELETION_PLAN, KEPT, stepsFor, mayDelete, CONFIRMATION_PHRASE,
  RECENT_AUTH_SECONDS } from "../app/deletion-plan.ts";

test("every step is scoped to one member and to one table", () => {
  for (const step of DELETION_PLAN) {
    assert.match(step.sql, /WHERE user_id = \?/, `${step.table} is not member-scoped`);
    /* One bound parameter, so nothing can widen the blast radius. */
    assert.equal((step.sql.match(/\?/g) ?? []).length, 1, `${step.table} binds more than the member`);
    assert.ok(step.say.length > 15, `${step.table} has no explanation`);
  }
});

test("no step touches shared public market data", () => {
  const shared = ["listing_sales_activity", "listing_snapshots", "shop_observations",
    "watched_shops", "shop_reviews", "reference_images", "reference_analysis",
    "niche_watch_history", "shop_sales_intervals", "tm_marks"];
  for (const step of DELETION_PLAN)
    for (const table of shared)
      assert.ok(!step.sql.includes(table),
        `deleting an account would touch shared ${table}`);
});

test("connections are retired, never dropped, with their keys destroyed", () => {
  const retired = stepsFor("retire").map(step => step.table);
  assert.ok(retired.includes("etsy_connections"));
  assert.ok(retired.includes("printify_connections"));
  for (const step of stepsFor("retire"))
    assert.match(step.sql, /^UPDATE/, `${step.table} is deleted rather than retired`);
  const etsy = DELETION_PLAN.find(step => step.table === "etsy_connections");
  assert.match(etsy.sql, /encrypted_access_token = ''/);
  assert.match(etsy.sql, /encrypted_refresh_token = ''/);
  assert.match(etsy.sql, /is_active = 0/);
});

test("what is kept is explained rather than left to be noticed", () => {
  assert.ok(KEPT.length >= 3);
  for (const row of KEPT) assert.ok(row.why.length > 40, `${row.what} has no reason`);
  assert.ok(KEPT.some(row => /public marketplace evidence/.test(row.why)));
});

test("deletion needs the exact phrase and a recent sign-in", () => {
  const now = 2_000_000;
  assert.equal(mayDelete({ phrase: CONFIRMATION_PHRASE, authenticatedAt: now - 60, now }).ok, true);
  assert.equal(mayDelete({ phrase: "delete my goldie data", authenticatedAt: now - 60, now }).ok,
    false, "a near-miss phrase was accepted");
  assert.equal(mayDelete({ phrase: CONFIRMATION_PHRASE, authenticatedAt: 0, now }).ok, false);
  const stale = mayDelete({ phrase: CONFIRMATION_PHRASE,
    authenticatedAt: now - RECENT_AUTH_SECONDS - 10, now });
  assert.equal(stale.ok, false);
  assert.match(stale.because, /Sign in again/);
});

test("an artwork object is removed only when nothing else of the member's uses it", () => {
  const plan = readFileSync(new URL("../app/deletion-plan.ts", import.meta.url), "utf8");
  assert.match(plan, /an object is removed only when the last row referencing it\s*\n?\s*\* goes with it/);
  /* The plan does not blind-delete R2 per provenance row. */
  for (const step of DELETION_PLAN)
    assert.ok(!/ARTWORK|R2/.test(step.sql));
});

test("the plan covers every member-owned table the beta view counts", () => {
  const counted = ["scan_history", "niche_watches", "member_shop_watches",
    "artwork_provenance", "publish_identity"];
  const tables = new Set(DELETION_PLAN.map(step => step.table));
  for (const table of counted)
    assert.ok(tables.has(table), `${table} is counted but never deleted`);
});
