import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL(
  "../app/api/listing-factory/canary/route.ts", import.meta.url), "utf8");

test("the canary can only ever enrol the caller", () => {
  /* No parameter names another member, so this cannot switch someone
     else's shop onto an unproven publishing path. */
  assert.match(route, /user\.userId/);
  assert.doesNotMatch(route, /parameters\.get\("user|targetUser|forUser/);
});

test("rollback is a delete and needs no deploy", () => {
  assert.match(route, /action === "disable"/);
  assert.match(route, /DELETE FROM feature_canary/);
  assert.match(route, /No deploy/);
});

test("only the owner may touch it", () => {
  assert.match(route, /isOwner\(user\)/);
});

test("the unmapped route is one of two safe options", () => {
  assert.match(route, /=== "stop" \? "stop" : "legacy"/);
});
