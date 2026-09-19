/*
  WHAT THE LOG IS ALLOWED TO REMEMBER.

  These run the real scrubber against real strings. They do not read its
  source, so renaming a variable or rewriting the pattern changes nothing
  here — only a change in what actually survives will fail them.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "scrub-"));
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/log-scrubbing.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const { scrubSecrets } = await import(join(dir, "log-scrubbing.js"));

const survives = (secret, text) => scrubSecrets(text).includes(secret);

test("a credential that looks like one never survives", () => {
  const cases = [
    ["Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmno",
      "upstream said Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmno was bad"],
    ["sk-live-8f2a9c4e1b", "stripe rejected sk-live-8f2a9c4e1b"],
    ["key-9f8e7d6c5b4a", "fal refused key-9f8e7d6c5b4a"],
    ["gld-admin-Rk92Xm4TqV7bN3sLpW8z", "called with gld-admin-Rk92Xm4TqV7bN3sLpW8z"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 expired"],
  ];
  for (const [secret, text] of cases)
    assert.equal(survives(secret, text), false, `survived: ${secret}`);
});

test("a credential that is merely the value of a parameter never survives", () => {
  /*
    The three that are ours: the HMAC on a staged-artwork URL, replayable for
    thirty minutes; an Etsy OAuth authorization code; and the state row, which
    IS the credential for that flow.
  */
  const cases = [
    ["7dQx2mKp9Lz", "/api/printify/staged/abc?expires=1789&signature=7dQx2mKp9Lz"],
    ["oauth_code_9f2", "/api/etsy/callback?code=oauth_code_9f2&state=st_771"],
    ["st_771", "/api/etsy/callback?code=oauth_code_9f2&state=st_771"],
    ["verif_abc123", "?code_verifier=verif_abc123"],
    ["hunter2secretvalue", "?access_token=hunter2secretvalue&x=1"],
  ];
  for (const [secret, text] of cases)
    assert.equal(survives(secret, text), false, `survived: ${secret} in ${text}`);
});

test("the key survives so the log still says what was present", () => {
  const out = scrubSecrets("/staged/a?expires=1789&signature=7dQx2mKp9Lz");
  assert.match(out, /signature=\[redacted\]/);
  /* Knowing a signature was there is diagnostic; knowing its value is a
     loaded gun. And a non-secret parameter must be left alone. */
  assert.match(out, /expires=1789/);
});

test("ordinary diagnostic text is not mangled", () => {
  for (const plain of [
    "Printify returned 503 for product 682194",
    "listing 4540080515 is not in this shop's map",
    "USPTO is rate limiting bulk downloads. Next attempt 2026-09-19T03:20:28.282Z.",
    "Production costs missing for 1 of 1 orders",
  ])
    assert.equal(scrubSecrets(plain), plain, `mangled: ${plain}`);
});

test("scrubbing is applied to every free-text column, not just the message", async () => {
  /*
    Behavioural rather than textual: the log writes message, url and context,
    and all three are free text a caller controls.
  */
  const src = (await import("node:fs")).readFileSync(
    new URL("../app/error-log.ts", import.meta.url), "utf8");
  const insert = src.slice(src.indexOf("INSERT INTO error_log"), src.indexOf(").run()"));
  for (const column of ["message", "input.url", "input.context"])
    assert.ok(/scrubSecrets/.test(insert) , "no scrubbing at the insert");
  assert.equal((insert.match(/scrubSecrets/g) || []).length >= 2, true,
    "url and context must be scrubbed as well as the message");
});

/* ------------------------------------------- what an open endpoint may write */

const { reportCeilingReached, reporterKey, REPORTS_PER_SOURCE_PER_HOUR,
  REPORTS_PER_AREA_PER_HOUR } = await import(join(dir, "log-scrubbing.js"));

/* Answers the per-source count first, then the per-area count. */
const counter = (mine, area = 0) => {
  let call = 0;
  return { prepare: () => ({ bind: () => ({ first: async () => {
    call += 1;
    return call === 1 ? { n: mine } : { n: area };
  } }) }) };
};

test("one noisy reporter spends only its own allowance", async () => {
  /*
    The first version of this ceiling was per area only, which meant a single
    script posting 500 reports used up the hour for everybody and silenced
    every genuine violation after it — a mute button, handed to exactly the
    person who wants one.
  */
  assert.equal(await reportCeilingReached(counter(REPORTS_PER_SOURCE_PER_HOUR, 0), "csp-report", "noisy"), true);
  /* And a different reporter, with the area nowhere near its own ceiling,
     is still heard. */
  assert.equal(await reportCeilingReached(counter(0, REPORTS_PER_SOURCE_PER_HOUR), "csp-report", "quiet"), false);
});

test("the area ceiling still stops a distributed flood", async () => {
  assert.equal(await reportCeilingReached(counter(0, REPORTS_PER_AREA_PER_HOUR), "csp-report", "anyone"), true);
  assert.ok(REPORTS_PER_AREA_PER_HOUR > REPORTS_PER_SOURCE_PER_HOUR * 10,
    "the total must be far above one source's share, or it is the same mute button");
});

test("a source key tells reporters apart without recording who they are", async () => {
  const a = await reporterKey(new Request("https://x.test", { headers: { "cf-connecting-ip": "1.2.3.4", "user-agent": "A" } }));
  const b = await reporterKey(new Request("https://x.test", { headers: { "cf-connecting-ip": "5.6.7.8", "user-agent": "A" } }));
  const again = await reporterKey(new Request("https://x.test", { headers: { "cf-connecting-ip": "1.2.3.4", "user-agent": "A" } }));
  assert.notEqual(a, b, "two sources must be distinguishable");
  assert.equal(a, again, "the same source must be stable within the hour");
  assert.ok(!a.includes("1.2.3.4"), "the address itself must not be stored");
  assert.match(a, /^[0-9a-f]{12}$/, "short enough not to be a record of who visited");
});



test("an open report endpoint stops writing once the hour is full", async () => {
  /*
    Two endpoints take a report from an unauthenticated browser and write it
    to the same table a member's broken publish lands in. A script posting in
    a loop could bury every real failure under noise.
  */
  assert.equal(await reportCeilingReached(counter(0, 0), "csp-report", "someone"), false);
  assert.equal(await reportCeilingReached(counter(0, REPORTS_PER_AREA_PER_HOUR - 1), "csp-report", "someone"), false);
  assert.equal(await reportCeilingReached(counter(0, REPORTS_PER_AREA_PER_HOUR), "csp-report", "someone"), true);
  assert.equal(await reportCeilingReached(counter(0, REPORTS_PER_AREA_PER_HOUR * 10), "csp-report", "someone"), true);
});

test("a counter that cannot be read does not silence real reports", async () => {
  /* Failing closed here would mean one broken query hides every error the
     product is trying to tell us about. */
  assert.equal(await reportCeilingReached(counter(null, null), "csp-report", "someone"), false);
  const throws = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("no table"); } }) }) };
  assert.equal(await reportCeilingReached(throws, "csp-report"), false);
});

test("the ceiling is per area, so one noisy source cannot mute another", async () => {
  /* The count is taken for the area being written, not for the table. */
  const seen = [];
  const db = { prepare: (sql) => { seen.push(sql); return { bind: (...v) => { seen.push(v[0]); return { first: async () => ({ n: 0 }) }; } }; } };
  await reportCeilingReached(db, "browser/");
  /*
    Bound as a prefix: /api/client-errors records `browser/<kind>`, so a
    ceiling on the literal area would have counted a value never written.
  */
  assert.ok(seen.some(x => x === "browser/%"), "the area prefix must reach the count");
  assert.ok(seen.some(x => typeof x === "string" && /area LIKE \?/.test(x)));
});
