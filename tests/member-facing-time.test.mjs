/*
  A REFUSAL TOLD THE MEMBER A MACHINE TIMESTAMP.

  "You have used all 10 scans for today. One becomes available again at
  2026-09-18T02:15:29.000Z." Seen on the deployed product while running the
  scanner's remaining live cases. The same mistake as rendering a database
  column name on the account page, which this product has now made three
  times: an internal value passed straight through into member-facing copy.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whenFreed } from "../app/member-time.ts";

const now = Date.UTC(2026, 8, 17, 20, 15, 0);
const inMinutes = n => new Date(now + n * 60_000).toISOString();

test("a member is told how long, not when in UTC", () => {
  assert.equal(whenFreed(inMinutes(45), now), "in about 45 minutes");
  assert.equal(whenFreed(inMinutes(60), now), "in about an hour");
  assert.equal(whenFreed(inMinutes(360), now), "in about 6 hours");
  assert.equal(whenFreed(inMinutes(1), now), "in about a minute");
  assert.equal(whenFreed(inMinutes(2000), now), "tomorrow");
});

test("a missing or past time says shortly rather than nothing", () => {
  assert.equal(whenFreed(null, now), "shortly");
  assert.equal(whenFreed(inMinutes(-5), now), "shortly");
  assert.equal(whenFreed("not a date", now), "shortly");
});

test("no ISO timestamp is interpolated into a member-facing message", () => {
  const source = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  assert.ok(!/available again at \$\{/.test(source),
    "the raw value must not be pasted into the sentence");
  assert.match(source, /whenFreed\(usage\.oldestLeavesWindowAt\)/);
});
