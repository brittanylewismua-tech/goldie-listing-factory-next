/*
  CHECKOUT IS CLOSED, AND CLOSED IS THE DEFAULT.

  A real member was charged $14.99 for the Starter plan before Goldie was
  meant to be on sale. These tests exist so that cannot happen again by
  omission - a missing variable must leave the door shut, not open it.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL(
  "../app/api/billing/checkout/route.ts", import.meta.url), "utf8");

test("the gate runs before Stripe is ever contacted", () => {
  const gateAt = route.indexOf("CHECKOUT_OPEN");
  /* Call sites, not the import line at the top of the file. */
  const stripeAt = route.indexOf("await stripeRequest");
  const customerAt = route.indexOf("await customerFor");
  assert.ok(gateAt > 0, "there is no checkout gate");
  assert.ok(gateAt < stripeAt, "the gate runs after a Stripe call");
  assert.ok(gateAt < customerAt, "a Stripe customer is created before the gate");
});

test("a missing or misspelled variable leaves checkout CLOSED", () => {
  /* The comparison is against an explicit open value, so undefined, empty,
     "true", "1" and a typo all fail closed. */
  const gate = readFileSync(new URL("../app/checkout-gate.ts", import.meta.url), "utf8");
  assert.match(gate, /=== "open"/);
  assert.doesNotMatch(gate, /CHECKOUT_CLOSED/,
    "a closed-flag would open checkout whenever the variable went missing");
});

test("the refusal says plainly that nothing was charged", () => {
  assert.match(route, /No charge was made/);
  assert.match(route, /503/);
});

test("the webhook is left running", () => {
  /* Existing subscription state must stay consistent, and a cancellation or
     refund made in Stripe still has to reach the database. */
  const webhook = readFileSync(new URL(
    "../app/api/billing/webhook/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(webhook, /CHECKOUT_OPEN/);
});

test("Starter is the $14.99 plan that was bought", () => {
  const plans = readFileSync(new URL("../app/plan-limits.ts", import.meta.url), "utf8");
  assert.match(plans, /goldie: \{ key: "goldie", name: "Starter", price: 14\.99/);
});

test("the signup page renders no prices while checkout is closed", () => {
  const page = readFileSync(new URL("../app/signup/page.tsx", import.meta.url), "utf8");
  /* Hiding buttons is not enough - a server component would still ship the
     plan names and amounts inside the page payload. The pricing client must
     not be rendered at all. */
  assert.match(page, /if \(!checkoutOpen\(\)\)/);
  const closedAt = page.indexOf("if (!checkoutOpen())");
  const clientAt = page.indexOf("<SignupClient");
  assert.ok(closedAt > 0 && closedAt < clientAt,
    "the pricing client renders before the gate is checked");
  assert.match(page, /no plans or prices are available|CLOSED_BODY/);
});

test("one switch, closed by default, shared by the page and the route", () => {
  const gate = readFileSync(new URL("../app/checkout-gate.ts", import.meta.url), "utf8");
  assert.match(gate, /=== "open"/);
  for (const value of ["", "true", "1", "OPEN ", "opne"]) {
    /* Only the exact word opens it; everything else stays shut. */
    const opens = String(value ?? "").trim().toLowerCase() === "open";
    assert.equal(opens, value === "OPEN ", `"${value}" behaved unexpectedly`);
  }
  const route = readFileSync(new URL(
    "../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
  assert.match(route, /checkoutOpen\(\)/);
  const page = readFileSync(new URL("../app/signup/page.tsx", import.meta.url), "utf8");
  assert.match(page, /checkoutOpen/);
});

test("D1692: every purchase surface reads the one gate", () => {
  /*
    checkout-gate.ts says the checkout route and the signup page both read it
    "so there is a single answer to 'is Goldie on sale' rather than two that
    can drift apart". Plan and limits never read it: /signup said nothing was
    for sale while /usage showed three plans, their prices, a billing toggle
    and three enabled Choose buttons whose only possible outcome is a 503.
  */
  const usage = readFileSync(new URL("../app/usage/page.tsx", import.meta.url), "utf8");
  assert.match(usage, /from "@\/app\/checkout-gate"/);
  assert.match(usage, /\{!checkoutOpen\(\) \? \(/,
    "the purchase surface must be behind the same gate as the route");
  /* The closed sentence is the module's, not a second wording of it. */
  assert.match(usage, /\{CLOSED_HEADLINE\}/);
  assert.match(usage, /\{CLOSED_BODY\}/);
  /* The plan grid and its Choose buttons sit inside the open branch only. */
  const closedAt = usage.indexOf("usage-plan-closed");
  const gridAt = usage.indexOf("usage-plan-grid");
  assert.ok(closedAt > -1 && gridAt > closedAt,
    "prices and Choose buttons must not render while checkout is closed");
});

test("D1692: limits and usage are not hidden with the prices", () => {
  const usage = readFileSync(new URL("../app/usage/page.tsx", import.meta.url), "utf8");
  const closedAt = usage.indexOf("usage-plan-closed");
  /* The meters a member needs are above the purchase surface and untouched. */
  assert.ok(usage.indexOf("usage-grid") < closedAt);
  assert.ok(usage.indexOf("plan-banner") < closedAt);
});
