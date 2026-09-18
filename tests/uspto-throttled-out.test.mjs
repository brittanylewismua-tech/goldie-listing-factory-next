/*
  "WAITING" IS NOT AN OUTCOME.

  A 429 is the other side asking for time, so a rate limit is deliberately
  excluded from the repeated-failure limit — a throttled file goes back in the
  queue with a longer delay rather than being parked.

  Which left a file USPTO refuses indefinitely with no terminal state at all.
  It sat at "waiting" forever, and a backfile cannot be called accounted for
  while any file is in a state meaning "we will ask again, someday".
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "backoff-"));
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/uspto-backoff.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const { throttledOut, throttledOutNote, RATE_LIMIT_STRIKE_CEILING, backoffMinutes,
  isRateLimit } = await import(join(dir, "uspto-backoff.js"));
const route = readFileSync(new URL("../app/api/trademark/ingest-tick/route.ts",
  import.meta.url), "utf8");

test("a throttled file eventually gets a final answer", () => {
  assert.equal(throttledOut(RATE_LIMIT_STRIKE_CEILING - 1), false);
  assert.equal(throttledOut(RATE_LIMIT_STRIKE_CEILING), true);
  assert.equal(throttledOut(RATE_LIMIT_STRIKE_CEILING + 5), true);
});

test("the ceiling is far beyond a nightly quota or a weekend", () => {
  /* Summing the escalating backoff to the ceiling must exceed a full day, or
     a quota that resets overnight would park files that were never broken. */
  let minutes = 0;
  for (let strike = 1; strike <= RATE_LIMIT_STRIKE_CEILING; strike += 1)
    minutes += backoffMinutes(strike);
  assert.ok(minutes > 24 * 60,
    `ceiling reached after only ${Math.round(minutes / 60)}h of refusals`);
});

test("the parked note says why and for how long, not just 'failed'", () => {
  const note = throttledOutNote(RATE_LIMIT_STRIKE_CEILING);
  assert.match(note, /USPTO refused this file \d+ times across about \d+ hours\./);
  assert.match(note, /can be requeued by hand/,
    "a parked file must be findable and recoverable, not lost");
  assert.ok(note.length <= 300, "the note column truncates at 300");
});

test("only a rate limit can be throttled out, and it stops retrying when it is", () => {
  assert.match(route, /const givenUp = limited && throttledOut\(strikes\)/,
    "a non-rate-limit failure has its own parking rule and must not use this one");
  assert.match(route,
    /permanent \|\| exhausted \|\| givenUp \? "skipped" : "waiting"/);
  assert.match(route, /limited && !givenUp \? retryAfter\(strikes\) : null/,
    "a file that has been given up on must not carry a next-attempt time, or "
    + "it would read as still queued");
});

test("a rate limit is still not counted as a repeated failure", () => {
  /* The distinction the ceiling is built on top of, not a replacement for. */
  assert.match(route, /const exhausted = !limited && repeats >= REPEATED_FAILURE_LIMIT/);
  assert.equal(isRateLimit("USPTO answered 429"), true);
  assert.equal(isRateLimit("Not a zip"), false);
});

test("the member-facing warning is not affected by parking", () => {
  /* Parking a file makes the register FINAL, not COMPLETE. The incomplete
     warning is driven by whether anything is still waiting or partial. */
  const register = readFileSync(new URL("../app/trademark-check.ts",
    import.meta.url), "utf8");
  assert.match(register,
    /return !size\.files\.some\(file => file\.state === "waiting" \|\| file\.state === "partial"\)/,
    "a skipped file must not make the register claim to be ready");
});
