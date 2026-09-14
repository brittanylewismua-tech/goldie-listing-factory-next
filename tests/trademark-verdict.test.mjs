/**
 * HOW LOUD THE ANSWER IS.
 *
 * A checker that shouts at everything gets ignored, and one that whispers at
 * a real problem costs somebody their shop. These fix which is which.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { check, withRegister } from "../app/trademark-check.ts";

const hit = extra => ({
  mark: "COZY SEASON", owner: "Someone Else LLC", registration: "1234567",
  classes: ["025"], registered: true, exact: false, ...extra,
});

test("the phrase being somebody's registered mark is the serious case", () => {
  const out = withRegister(check("cozy season"), [hit({ exact: true })], true);
  assert.equal(out.risk, "high");
  assert.match(out.summary, /live registered trademark/);
  assert.match(out.summary, /Someone Else LLC/);
});

test("a multi-word mark sitting inside the phrase is serious too", () => {
  const out = withRegister(check("cozy season sweatshirt"), [hit({})], true);
  assert.equal(out.risk, "high");
  assert.match(out.summary, /contains/);
});

test("one ordinary registered word is a caution, not an alarm", () => {
  const out = withRegister(check("love always wins"), [hit({ mark: "LOVE" })], true);
  assert.equal(out.risk, "caution");
  assert.match(out.summary, /does not stop you using it/);
});

test("a pending application is never dressed up as a registration", () => {
  const out = withRegister(check("cozy season"), [hit({ exact: true, registered: false })], true);
  assert.notEqual(out.risk, "high");
});

test("a curated hit stays the headline even when the register agrees", () => {
  const curated = check("bluey birthday");
  assert.equal(curated.risk, "high");
  const out = withRegister(curated, [hit({ mark: "BLUEY", exact: false })], true);
  assert.equal(out.summary, curated.summary);
});

test("nothing found leaves the careful wording alone", () => {
  const out = withRegister(check("mountains at dawn"), [], true);
  assert.equal(out.risk, "clear");
  assert.doesNotMatch(out.summary, /safe/i);
  assert.equal(out.register.length, 0);
});

test("the answer says whether the register was fully loaded", () => {
  assert.equal(withRegister(check("anything"), [], false).registerReady, false);
  assert.equal(withRegister(check("anything"), [], true).registerReady, true);
});
