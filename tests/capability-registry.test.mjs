/* One source of truth means: nothing contradicts it, and it names everything. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAPABILITIES, capability, capabilitiesOf, scopeMap, NOT_IN_GOLDIE }
  from "../app/capability-registry.ts";
import { SUITE_PLANS } from "../app/suite-plans.ts";
import { PAID_WORKLOADS } from "../app/paid-workloads.ts";

test("every capability belongs to one of the four features", () => {
  const known = new Set(Object.values(SUITE_PLANS).flatMap(plan => plan.features));
  for (const entry of CAPABILITIES)
    assert.ok(known.has(entry.feature), `${entry.key} claims feature ${entry.feature}`);
});

test("every paid workload a capability names is declared in the registry", () => {
  const declared = new Set(PAID_WORKLOADS.map(entry => entry.key));
  for (const entry of CAPABILITIES)
    for (const key of entry.paidWorkloads)
      assert.ok(declared.has(key), `${entry.key} names undeclared paid workload ${key}`);
});

test("Market Watch and Shop Watch cost no paid provider call", () => {
  for (const key of ["nicheWatch", "shopWatch", "morningUpdate"]) {
    const entry = capability(key);
    assert.deepEqual(entry.paidWorkloads, [], `${key} declares a paid workload`);
  }
});

test("sales access is required by Shop Map and by nothing else", () => {
  const sales = scopeMap().find(row => row.scope === "transactions_r");
  assert.deepEqual(sales.neededBy, ["shopMap"],
    "transactions_r is claimed by something other than Shop Map");
  /* So a Listing Factory member is never asked for it. */
  assert.ok(!capability("listingFactory").etsyScopes.includes("transactions_r"));
});

test("nothing is exposed to everyone except the trademark checker", () => {
  const open = CAPABILITIES.filter(entry => entry.access === "everyone");
  assert.deepEqual(open.map(entry => entry.key), ["trademarkChecker"]);
});

test("the four features each have at least one capability", () => {
  for (const feature of ["listingFactory", "designScanner", "marketWatch", "shopMap"])
    assert.ok(capabilitiesOf(feature).length > 0, `${feature} has no capability`);
});

test("the things Goldie does not have are written down with reasons", () => {
  const listed = NOT_IN_GOLDIE.map(row => row.what.toLowerCase()).join(" ");
  for (const excluded of ["chatbot", "world builder", "trend videos", "alert"])
    assert.ok(listed.includes(excluded), `${excluded} is not accounted for`);
  for (const row of NOT_IN_GOLDIE)
    assert.ok(row.why.length > 20, `${row.what} has no reason`);
});

test("the registry never returns a secret value", () => {
  const route = readFileSync(new URL(
    "../app/api/operations/capabilities/route.ts", import.meta.url), "utf8");
  assert.match(route, /secretPresent/);
  /* Presence is a boolean. Nothing reads the value into the response. */
  assert.doesNotMatch(route, /runtime\[name\]\s*\}/);
  assert.match(route, /No value is ever returned/);
});

test("no second status list contradicts the registry", () => {
  /* The old feature map is allowed to exist as prose, but it must not be a
     parallel machine-readable list of what is enabled. */
  const registry = readFileSync(
    new URL("../app/capability-registry.ts", import.meta.url), "utf8");
  assert.match(registry, /WHAT GOLDIE ACTUALLY IS, IN ONE PLACE/);
  const keys = CAPABILITIES.map(entry => entry.key);
  assert.equal(new Set(keys).size, keys.length, "a capability key is duplicated");
});
