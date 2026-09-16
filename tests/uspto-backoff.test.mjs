/*
  THE BACKFILE STOPPED ON 2026-09-14 AND THE STATUS SAID "88 WAITING".

  USPTO was answering 429. The tick put the file straight back in the queue,
  so it was re-asked every twenty minutes for two days against an API that was
  rate limiting for exactly that reason — and the only thing anyone could read
  was a queue length, which is true and says nothing.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRateLimit, backoffMinutes, retryAfter, blockedExplanation,
  FIRST_BACKOFF_MINUTES, MAX_BACKOFF_MINUTES } from "../app/uspto-backoff.ts";

test("a rate limit is told apart from a bad file", () => {
  assert.equal(isRateLimit("USPTO answered 429 for apc18840407-20251231-88.zip"), true);
  assert.equal(isRateLimit("USPTO answered 503 for apc.zip"), true);
  assert.equal(isRateLimit("Not a zip"), false);
  assert.equal(isRateLimit("USPTO answered 404 for apc.zip"), false,
    "a missing file must not be retried forever as though it were transient");
});

test("backoff escalates while refusals continue, and is capped", () => {
  assert.equal(backoffMinutes(1), FIRST_BACKOFF_MINUTES);
  assert.equal(backoffMinutes(2), FIRST_BACKOFF_MINUTES * 2);
  assert.equal(backoffMinutes(3), FIRST_BACKOFF_MINUTES * 4);
  assert.equal(backoffMinutes(50), MAX_BACKOFF_MINUTES);
  assert.ok(MAX_BACKOFF_MINUTES < 24 * 60,
    "a cap past a daily quota reset costs the backfile a whole day");
});

test("the first retry is far later than the twenty-minute cron", () => {
  const now = Date.UTC(2026, 8, 16, 6, 0, 0);
  const after = new Date(retryAfter(1, now)).getTime();
  assert.ok(after - now >= 20 * 60_000 * 1.5,
    "retrying inside a cron interval is the hammering this replaces");
});

test("a blocked file explains itself instead of saying waiting", () => {
  const text = blockedExplanation("USPTO answered 429 for a.zip", "2026-09-16T07:00:00.000Z");
  assert.match(text, /rate limiting/);
  assert.match(text, /2026-09-16T07:00:00.000Z/);
  assert.equal(blockedExplanation("Not a zip", "x"), "",
    "only the other side asking for time is described that way");
});

test("the tick will not pick a file that is still under backoff", () => {
  const source = readFileSync(
    new URL("../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  const selects = source.match(/WHERE state = 'waiting'[^`]*/g) ?? [];
  assert.ok(selects.length >= 2);
  for (const clause of selects)
    assert.match(clause, /retry_after IS NULL OR retry_after <= \?/,
      "every queue selection must honour the backoff");
});

test("a success clears the backoff so one bad hour is not permanent", () => {
  const source = readFileSync(
    new URL("../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  assert.match(source, /retry_after = NULL, strikes = 0/);
});

test("the status endpoint reports a stalled queue as stalled", () => {
  const source = readFileSync(
    new URL("../app/api/trademark/register-status/route.ts", import.meta.url), "utf8");
  assert.match(source, /blocked/);
  assert.match(source, /Stalled/);
});
