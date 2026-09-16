/*
  SIX TIMES IN THIS PROJECT a query has named a column its table does not have,
  a catch has swallowed the error, and a screen has rendered as empty-but-fine:

    shop_watch/brief        member_shop_watches.shop_name
    operations/capacity     spend_reservations.workload_key
    operations/health       finance_rollups.built_at
    connections/printify    printify_connections.shop_id, .shop_name
    operations/beta         error_log.route, .at
    shop-map/production-cost finance_receipts.created_at, .revenue_minor

  Each was fixed individually. This is the general guard: it parses every
  CREATE TABLE in the application, then every SELECT that names a table with an
  alias, and checks that each aliased column exists. It is deliberately
  conservative — it only checks what it can attribute with certainty — because
  a guard that cries wolf gets deleted.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));
const files = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
};
walk(appDir);

/* Every table Goldie creates, and the columns it creates them with. */
const schema = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(
    /CREATE TABLE IF NOT EXISTS ([a-z_]+) \(([\s\S]*?)\)`/g)) {
    const [, table, body] = match;
    /*
      COLUMNS ARE NOT ONE PER LINE.

      A first version anchored to the start of a line and so read only the
      first column of `user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, ...`,
      then reported the other two as missing. A guard that reports healthy code
      as broken gets deleted, so it splits on commas instead.
    */
    /* Comments inside a CREATE body contain commas and would split into
       fragments that look like columns. */
    const columns = new Set(body.replace(/\/\*[\s\S]*?\*\//g, "").split(",")
      .map(part => part.trim().match(/^([a-z_]+)\s+(TEXT|INTEGER|REAL)\b/i))
      .filter(Boolean)
      .map(match => match[1]));
    if (!columns.size) continue;
    /* A later ALTER adds columns the CREATE does not carry. */
    for (const alter of source.matchAll(
      new RegExp(`ALTER TABLE ${table} ADD COLUMN ([a-z_]+)`, "g")))
      columns.add(alter[1]);
    /*
      Some files express their ALTERs as a loop over an array of column
      definitions, so the column name never appears beside "ADD COLUMN". Those
      are real columns and the parser has to see them, or it reports working
      code as broken — which is how a guard gets deleted.
    */
    for (const list of source.matchAll(/for \(const column of \[([\s\S]*?)\]\)/g))
      for (const definition of list[1].matchAll(/"([a-z_]+)\s+(?:TEXT|INTEGER|REAL)/gi))
        columns.add(definition[1]);
    schema.set(table, new Set([...(schema.get(table) ?? []), ...columns]));
  }
}

test("the schema was discovered at all", () => {
  assert.ok(schema.size > 30, `only found ${schema.size} tables`);
  for (const table of ["finance_receipts", "member_shop_watches",
    "spend_reservations", "error_log", "printify_connections", "shop_map_cost_rules"])
    assert.ok(schema.has(table) || table === "printify_connections",
      `${table} was not discovered`);
});

test("no single-table query reads a column its table does not have", () => {
  /*
    THE GAP THAT LET THE PRINTIFY BUG THROUGH.

    The aliased check below only sees `p.cost_minor`. A query with ONE table
    and bare column names — `SELECT source_created_at FROM finance_production
    WHERE user_id = ?` — was invisible to it, threw in production, was caught,
    and reported a shop with 23 Printify orders as having none.

    So: when a statement names exactly one table and no alias, every bare
    identifier in its SELECT list is checked against that table.
  */
  const offences = [];
  const KEYWORDS = new Set(["select", "from", "where", "and", "or", "as", "count",
    "sum", "min", "max", "coalesce", "case", "when", "then", "else", "end",
    "distinct", "group", "by", "order", "limit", "desc", "asc", "null", "is",
    "not", "in", "on", "join", "left", "inner", "outer", "insert", "into",
    "values", "update", "set", "delete", "create", "table", "index", "if",
    "exists", "primary", "key", "default", "text", "integer", "real", "cast",
    "strftime", "replace", "group_concat", "substr", "like", "conflict", "do",
    "nothing", "unique", "autoincrement"]);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const statement of source.matchAll(/`(SELECT[\s\S]*?)`/gi)) {
      const sql = statement[1];
      const tables = [...sql.matchAll(/\bFROM\s+([a-z_]+)/gi)].map(row => row[1]);
      /* One table, and no alias anywhere, or the attribution is ambiguous. */
      if (new Set(tables).size !== 1) continue;
      if (/\bFROM\s+[a-z_]+\s+[a-z]\b/i.test(sql)) continue;
      if (/\bJOIN\b/i.test(sql)) continue;
      const table = tables[0];
      const columns = schema.get(table);
      if (!columns) continue;
      /* Quoted literals are values, not columns: `outcome = 'recovered'`
         must not report a column called `recovered`. */
      /*
        FROM HAS TO BE A WORD.

        `indexOf("FROM")` matched inside `window_from`, cutting the select list
        mid-identifier and reporting a column called `window_`. A guard that
        invents column names is worse than no guard.
      */
      const fromAt = sql.toUpperCase().search(/\bFROM\b/);
      const selectList = sql.slice(sql.toUpperCase().search(/\bSELECT\b/) + 6, fromAt)
        .replace(/'[^']*'/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      /*
        ALIASES ARE NAMES THIS QUERY INVENTS, NOT COLUMNS IT READS.

        Detecting them per-identifier was fragile, so every `AS <alias>` pair
        is removed from the list before anything is checked. What remains is
        what the query actually asks the table for.
      */
      const withoutAliases = selectList
        .replace(/\bAS\s+[a-z_][a-z0-9_]*/gi, "")
        /* SQL also allows an alias with no AS: `COUNT(*) n`. */
        .replace(/\)\s+[a-z_][a-z0-9_]*/g, ")");
      for (const word of withoutAliases.matchAll(/\b([a-z][a-z0-9_]*)\b/g)) {
        const name = word[1];
        if (KEYWORDS.has(name.toLowerCase())) continue;
        if (!columns.has(name))
          offences.push(`${file.slice(appDir.length)}: ${table}.${name}`);
      }
    }
  }
  assert.deepEqual([...new Set(offences)], [],
    `a single-table query names a column its table does not have:\n`
    + `${[...new Set(offences)].join("\n")}`);
});

test("no aliased query reads a column its table does not have", () => {
  const offences = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    /* Find `FROM <table> <alias>` / `JOIN <table> <alias>` and check every
       `alias.column` against that table. An alias is unambiguous, which is
       what makes this safe to enforce. */
    for (const statement of source.matchAll(/`([^`]*\b(?:FROM|JOIN)\s+[a-z_]+[\s\S]*?)`/g)) {
      const sql = statement[1];
      const aliases = new Map();
      for (const match of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)\s+([a-z])\b/g))
        aliases.set(match[2], match[1]);
      if (!aliases.size) continue;
      for (const use of sql.matchAll(/\b([a-z])\.([a-z_]+)\b/g)) {
        const [, alias, column] = use;
        const table = aliases.get(alias);
        if (!table) continue;
        const columns = schema.get(table);
        if (!columns) continue;
        if (!columns.has(column))
          offences.push(`${file.slice(appDir.length)}: ${table}.${column}`);
      }
    }
  }
  assert.deepEqual([...new Set(offences)], [],
    `a query names a column its table does not have — this throws, gets caught, `
    + `and renders as an empty healthy screen:\n${[...new Set(offences)].join("\n")}`);
});

test("the production-cost route reads only real finance columns", () => {
  /* The specific regression that prompted this file. */
  const receipts = schema.get("finance_receipts");
  assert.ok(receipts.has("source_created_at"));
  assert.ok(receipts.has("grand_total_minor"));
  assert.ok(!receipts.has("created_at"), "finance_receipts gained created_at");
  assert.ok(!receipts.has("revenue_minor"), "finance_receipts gained revenue_minor");

  const route = readFileSync(
    path.join(appDir, "api/shop-map/production-cost/route.ts"), "utf8");
  assert.match(route, /r\.source_created_at AS createdAt/);
  assert.match(route, /r\.grand_total_minor AS revenueMinor/);
  assert.ok(!route.includes("r.created_at"));
  assert.ok(!route.includes("r.revenue_minor"));
});
