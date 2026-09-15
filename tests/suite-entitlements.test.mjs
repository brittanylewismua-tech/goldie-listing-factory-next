/*
  One answer to "can this member use this", in every state a member can be in.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allows, planChange, SUITE_PLANS, LIVE_CHECKOUT_ENABLED, GRACE_DAYS,
} from "../app/suite-plans.ts";

const NOW = 1_800_000_000;
const ent = (over = {}) => ({ state: "active", plan: "full_suite", until: null, ...over });

test("private beta reaches every feature", () => {
  for (const feature of ["listingFactory", "designScanner", "marketWatch",
    "shopMap", "trademarkStandalone", "trademarkAtPublish"])
    assert.equal(allows(ent({ state: "beta", plan: null }), feature, NOW).ok, true);
});

test("the Listing Factory plan does not reach the suite features", () => {
  const factory = ent({ plan: "listing_factory" });
  assert.equal(allows(factory, "listingFactory", NOW).ok, true);
  assert.equal(allows(factory, "trademarkAtPublish", NOW).ok, true);
  for (const feature of ["designScanner", "marketWatch", "shopMap", "trademarkStandalone"]) {
    const verdict = allows(factory, feature, NOW);
    assert.equal(verdict.ok, false, `${feature} was reachable`);
    assert.equal(verdict.upgrade, "full_suite");
  }
});

test("cancelled access lasts to the end of the paid period", () => {
  const paidUntil = NOW + 10 * 86_400;
  assert.equal(allows(ent({ state: "canceled", until: paidUntil }), "shopMap", NOW).ok, true);
  assert.equal(allows(ent({ state: "canceled", until: NOW - 1 }), "shopMap", NOW).ok, false);
});

test("a failed payment gets a grace window, not an immediate lockout", () => {
  const due = NOW - 3 * 86_400;
  assert.equal(allows(ent({ state: "past_due", until: due }), "shopMap", NOW).ok, true);
  const expired = NOW - (GRACE_DAYS + 2) * 86_400;
  const locked = allows(ent({ state: "past_due", until: expired }), "shopMap", NOW);
  assert.equal(locked.ok, false);
  assert.match(locked.because, /payment method/);
});

test("no entitlement reaches nothing", () => {
  const verdict = allows(ent({ state: "none", plan: null }), "listingFactory", NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.because, /not active/);
});

test("a founding customer keeps access without a price attached", () => {
  assert.equal(allows(ent({ state: "grandfathered", plan: "full_suite" }), "shopMap", NOW).ok, true);
  assert.equal(allows(ent({ state: "grandfathered", plan: "listing_factory" }), "shopMap", NOW).ok, false);
});

test("upgrading is immediate and downgrading waits for the paid period", () => {
  const periodEnd = NOW + 20 * 86_400;
  assert.deepEqual(planChange("listing_factory", "full_suite", periodEnd),
    { effective: "immediate", at: null });
  assert.deepEqual(planChange("full_suite", "listing_factory", periodEnd),
    { effective: "period-end", at: periodEnd });
});

test("prices live in configuration, not in the interface", () => {
  assert.equal(SUITE_PLANS.listing_factory.monthly, 19);
  assert.equal(SUITE_PLANS.full_suite.monthly, 47);
  /* Yearly is undecided. Null, never zero: zero renders as free. */
  assert.equal(SUITE_PLANS.listing_factory.yearly, null);
  assert.equal(SUITE_PLANS.full_suite.yearly, null);
});

test("live checkout is off during private beta", () => {
  assert.equal(LIVE_CHECKOUT_ENABLED, false);
});

test("no price is hard-coded in any page or client component", () => {
  const files = ["app/design-scanner/design-scanner-client.tsx",
    "app/market-watch/market-watch-client.tsx"];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\$\s?(19|47)\b/, `${file} hard-codes a price`);
  }
});
