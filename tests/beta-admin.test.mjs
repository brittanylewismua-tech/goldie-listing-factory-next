/*
  Beta administration decides access. It must never become a way to read a
  member's work.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const ROUTE = read("app/api/operations/beta/route.ts");
const STORE = read("app/entitlements.ts");
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("no token or fragment of one can be returned", () => {
  const code = strip(ROUTE);
  /* Presence is a boolean produced in SQL; the encrypted value is never
     selected into a variable, let alone a response. */
  assert.match(code, /encrypted_access_token <> ''/);
  assert.match(code, /encrypted_token <> '' AS live/);
  assert.doesNotMatch(code, /decrypt|encrypted_access_token AS|encrypted_token AS (?!live)/);
});

test("it shows counts, never a member's content", () => {
  const code = strip(ROUTE);
  /* Word boundaries: "title" lives inside "entitlement", and matching a bare
     substring made this fail on the one identifier the file is about. */
  for (const leak of ["payload_json", "result_json", "image_url", "artwork_key",
    "review", "title", "revenue", "profit"])
    assert.doesNotMatch(code, new RegExp(`\\b${leak}\\b`),
      `beta admin can read ${leak}`);
  /* What it does read is countable. */
  for (const counted of ["scan_history", "niche_watches", "member_shop_watches",
    "artwork_provenance"])
    assert.match(code, new RegExp(`COUNT\\(\\*\\) AS n FROM ${counted}`));
});

test("it cannot impersonate anybody", () => {
  const code = strip(ROUTE);
  for (const banned of ["setCookie", "signInAs", "impersonat", "assumeUser", "session"])
    assert.ok(!code.toLowerCase().includes(banned.toLowerCase()),
      `beta admin references ${banned}`);
});

test("it sends no email or invitation", () => {
  const code = strip(ROUTE);
  for (const banned of ["resend", "sendMail", "RESEND_API_KEY", "invite"])
    assert.ok(!code.toLowerCase().includes(banned.toLowerCase()));
});

test("every change requires a reason and writes an audit row", () => {
  assert.match(ROUTE, /if \(reason\.length < 3\)/);
  assert.match(ROUTE, /Give a reason for this change/);
  assert.match(STORE, /INSERT INTO entitlement_audit/);
  /* Actor, member, previous, next, timestamp and reason — all six. */
  assert.match(STORE, /\(at, actor, member, member_email, previous_json, next_json, reason\)/);
});

test("the audit is append-only", () => {
  const code = strip(STORE);
  for (const write of ["UPDATE entitlement_audit", "DELETE FROM entitlement_audit"])
    assert.ok(!code.includes(write), `the audit is mutated by ${write}`);
});

test("an unknown access state is refused", () => {
  assert.match(ROUTE, /allowed\.includes\(state\)/);
  assert.match(ROUTE, /Unknown access state/);
});

test("beta capacity does not need a database console", () => {
  assert.match(ROUTE, /capacity: \{ granted: roster\.length, target: 20 \}/);
  assert.match(STORE, /export async function betaRoster/);
});

test("the error list reads columns error_log actually has", () => {
  const log = read("app/error-log.ts");
  const create = log.slice(log.indexOf("CREATE TABLE IF NOT EXISTS error_log"));
  const columns = new Set([...create.slice(0, 700)
    .matchAll(/^\s*([a-z_]+)\s+(text|integer|real)/gim)].map(match => match[1]));
  assert.ok(columns.has("area") && columns.has("created_at"));
  assert.ok(!columns.has("route"));
  for (const block of ROUTE.match(/SELECT[\s\S]{0,160}?FROM error_log/g) ?? [])
    for (const match of block.matchAll(/\b([a-z_]+)(?:\s+AS\s+\w+)?\s*[,\n]/g))
      if (columns.size && /^[a-z_]+$/.test(match[1]) && match[1] !== "select")
        assert.ok(columns.has(match[1]) || ["message"].includes(match[1]),
          `beta admin reads error_log.${match[1]}, which does not exist`);
});

test("granting is owner-only on both verbs", () => {
  const guards = ROUTE.match(/isOwner\(user\)/g) ?? [];
  assert.ok(guards.length >= 2, "a verb is not owner-gated");
});
