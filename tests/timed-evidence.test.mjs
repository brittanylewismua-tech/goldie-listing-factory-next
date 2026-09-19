/*
  THE PRODUCT WATCHES ITS OWN CLOCKS.

  The 72-hour observation gate and the USPTO backfile finish on their own
  schedule. Reading them from a health view means the moment either finished
  is captured only if somebody happened to be looking, and a desktop reminder
  that needs an app left open and a person to approve a browser is not
  automation — it is supervision wearing automation's name.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./strip-comments.mjs";

/*
  Comments stripped. Counting ".catch(" in raw source counted the one inside
  the comment explaining why a catch was removed — the fourth guard tonight
  to trip on its own explanation. Any test that greps source strips comments
  first; the reasons live in comments and the reasons quote the rules.
*/
const strip = stripComments;
const read = (p) => strip(readFileSync(new URL(p, import.meta.url), "utf8"));
const tick = read("../app/api/operations/evidence-tick/route.ts");
const view = read("../app/api/operations/evidence/route.ts");
const cron = read("../scripts/add-scheduled-handler.mjs");
const matrix = read("../app/access-matrix.ts");

test("the tick runs on the worker's own clock, not a person's", () => {
  assert.match(cron, /run\("\/api\/operations\/evidence-tick"\)/);
  /* The slow clock, and last, so it cannot delay the work it measures. */
  /* The slow clock begins where the ten-minute branch returns. Anchored on
     code rather than on a comment heading, which stripping removed. */
  const slowClock = cron.slice(cron.indexOf("/api/operations/migrate"));
  assert.ok(slowClock.includes("/api/operations/evidence-tick"));
  assert.ok(slowClock.indexOf("/api/operations/evidence-tick")
    > slowClock.indexOf("/api/trademark/ingest-tick"),
    "the measurement must queue behind the work");
});

test("the tick is reachable only from inside the worker", () => {
  assert.match(tick, /!request\.headers\.get\("cf-connecting-ip"\)/,
    "Cloudflare stamps that header only on requests that crossed the network, "
    + "so there is no secret to leak");
  assert.match(tick, /status: 404/);
});

test("a finished clock is recorded once and can never be restated", () => {
  assert.match(tick, /INSERT OR IGNORE INTO evidence_outcomes/,
    "the first moment a clock finished is the record");
  assert.match(tick, /kind TEXT PRIMARY KEY/,
    "one row per clock, ever");
  assert.doesNotMatch(tick, /UPDATE evidence_outcomes|DELETE FROM evidence_outcomes/);
});

test("the tick records the gate's verdict rather than forming its own", () => {
  assert.match(tick, /passes: gate\.passes/);
  assert.match(tick, /failing: gate\.failing/);
  assert.match(tick, /Boolean\(gate\.passes\)/);
  /* No threshold arithmetic of its own — that would be a second opinion
     competing with the gate. */
  assert.doesNotMatch(tick, /GATE_STANDARD|>=\s*0\.9|p95\s*[<>]/);
  /* The property: it forwards the gate's own verdict and never recomputes
     one. Previously this matched the sentence in the comment that says so. */
  assert.match(tick, /failing: gate\.failing/);
  assert.doesNotMatch(tick, /hoursObserved\s*>=\s*\d+\s*&&/,
    "a second pass/fail rule here would compete with the gate");
});

test("the gate only settles at the full standard, read from the gate itself", () => {
  assert.match(tick, /gate\.hoursObserved >= OBSERVATION_HOURS/);
  assert.match(tick, /import \{ OBSERVATION_HOURS \} from "@\/app\/observation-gate"/,
    "a literal 72 here could drift from the standard it claims to enforce");
});

test("a changed segment start is visible in the history", () => {
  assert.match(tick, /segmentStartedAt: gate\.segmentStartedAt/,
    "a reset is the most important thing to notice and the easiest to miss");
});

test("the backfile settles only when no file is waiting or partial", () => {
  assert.match(tick, /file\.state === "waiting" \|\| file\.state === "partial"/);
  assert.match(tick, /if \(size && !unfinished\)/,
    "'waiting' is not a final outcome");
  /* Final and complete are recorded as different facts. */
  assert.match(tick, /registerIsComplete\(size\), backfileSample/);
  assert.match(tick, /parkedFiles: registerParkedFiles\(size\)/);
});

test("the tick makes no provider call and has no member surface", () => {
  assert.doesNotMatch(tick, /fal\.run|openrouter|anthropic\.com|reserveSpend/);
  assert.doesNotMatch(tick, /getChatGPTUser/);
  assert.match(matrix, /"\/api\/operations\/evidence-tick"|OWNER_PREFIXES/,
    "operations routes are owner-prefixed");
});

test("the view refuses rather than reporting an empty record it could not read", () => {
  assert.match(view, /class EvidenceUnavailable extends Error/);
  assert.match(view, /returned no result set/);
  assert.match(view, /status: 500/);
  assert.match(view, /would not mean anything/);
  /* The only catch is the one that reads a stored payload. */
  const catches = [...view.matchAll(/\.catch\(/g)].length;
  assert.equal(catches, 1, `expected one deliberate catch, found ${catches}`);
});

test("nothing settled yet is a state, not an error", () => {
  assert.match(view, /settled: outcomes\.length/);
  /* An empty outcome list must be reported as a count, not as an error. */
  assert.doesNotMatch(view, /outcomes\.length === 0[\s\S]{0,80}status: (4|5)\d\d/,
    "no outcomes yet must not become a failure response");
});
