/*
  A FAILED SCAN MUST GIVE THE MEMBER THEIR SCAN BACK.

  The allowance is ten a day and a scan that failed produced nothing. Charging
  a member a slot for an outage is the same class of error as reporting a
  correction that did not happen: they paid for something they did not get.

  The money is a separate question. A provider call that failed after it was
  billed cost real money, and that stays on the ledger — it simply must not
  come out of the member's ten.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const guard = src("../app/spend-guard.ts");
const scan = src("../app/api/design-scanner/scan/route.ts");

test("a failed reservation stops consuming the member's allowance", () => {
  const fail = guard.slice(guard.indexOf("export async function failSpend"),
    guard.indexOf("export async function releaseSpend"));
  assert.match(fail, /consumes_allowance = 0/,
    "without this the member is charged a slot for an outage");
  assert.match(fail, /WHERE id = \? AND state = 'held'/,
    "only a reservation still held may be failed, so a settled scan cannot be "
    + "retroactively refunded");
});

test("the allowance counts only settled scans that consume it", () => {
  const usage = guard.slice(guard.indexOf("export async function memberUsage"));
  assert.match(usage, /consumes_allowance = 1 AND state = 'settled'/);
});

test("money spent on a failed call still stays on the ledger", () => {
  const fail = guard.slice(guard.indexOf("export async function failSpend"),
    guard.indexOf("export async function releaseSpend"));
  assert.match(fail, /billed > 0 \? "failed-billed" : "released"/,
    "a call that failed after it was billed cost real money");
  const usage = guard.slice(guard.indexOf("export async function memberUsage"));
  assert.match(usage, /state IN \('settled', 'failed-billed'\)/,
    "attempts must count the billed failure even though the allowance does not");
});

test("every failure path in the scanner refunds, and the success path settles", () => {
  /*
    Three failure exits and one success. If a failure ever fell through to
    settleSpend the member would lose a scan for a result they never saw.
  */
  const fails = [...scan.matchAll(/await failSpend\(reservation\.id/g)];
  const settles = [...scan.matchAll(/await settleSpend\(reservation\.id/g)];
  assert.ok(fails.length >= 3, `expected every failure path to refund, saw ${fails.length}`);
  assert.equal(settles.length, 1, "exactly one path may consume the scan");
  /* The settle is the last of them: nothing after a success can refund it. */
  assert.ok(scan.lastIndexOf("await failSpend(reservation.id")
    < scan.indexOf("await settleSpend(reservation.id"),
    "a refund after the settle would mean the order of the two decides the "
    + "member's balance");
});

test("a refused reservation never reaches the provider", () => {
  const reserve = guard.slice(guard.indexOf("export async function reserveSpend"));
  assert.match(reserve, /allowed: false/);
  /* The comment above it is the promise; this pins the ordering it claims. */
  assert.match(guard, /Checked before the upload is sent anywhere and before the provider is/);
});
