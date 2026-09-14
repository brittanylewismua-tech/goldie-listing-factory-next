/**
 * A DIAGNOSTIC MUST NOT READ OTHER PEOPLE'S ROWS.
 *
 * The first version of this endpoint selected every connection in the table.
 * It was owner-only, which is exactly the reasoning that made it feel safe,
 * and it printed other members' shop names into an investigation report.
 * Owner access is a reason to write a narrower query, not a wider one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../app/api/shop-map/connection-forensics/route.ts", import.meta.url), "utf8");

test("every row this endpoint returns belongs to the caller", () => {
  const selects = [...source.matchAll(/SELECT[\s\S]*?FROM etsy_connections[\s\S]*?`/g)]
    .map(match => match[0]);
  assert.ok(selects.length > 0, "the endpoint must query connections");
  for (const select of selects)
    assert.match(select, /WHERE[\s\S]*user_id/,
      `a connection query without a user_id filter: ${select.slice(0, 90)}`);
});

test("a shop connected by somebody else is a count, never a name", () => {
  assert.match(source, /COUNT\(\*\) AS n FROM etsy_connections WHERE shop_id = \? AND user_id <> \?/);
  assert.doesNotMatch(source, /SELECT shop_name[\s\S]{0,120}user_id <> \?/);
});

test("no token column is ever selected", () => {
  assert.doesNotMatch(source, /encrypted_access_token|encrypted_refresh_token/);
});
