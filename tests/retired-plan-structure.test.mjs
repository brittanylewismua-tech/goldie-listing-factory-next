/*
  THE RETIRED PLAN STRUCTURE MUST NOT REACH A MEMBER.

  Starter at $14.99, Pro at $24.99 and Scale at $39.99 are retired. The
  intended direction is a $19 Listing Factory plan and a $47 full suite, and
  yearly is undecided — so the old numbers are not merely old, they describe
  something that will not exist. Checkout is closed and no page shows them any
  more; these hold the surfaces a page crawl cannot see.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("a billing email cannot price itself from our own constants", () => {
  const email = read("../app/trial-reminder.ts");
  /*
    money() fell back to planAmount() when Stripe did not supply an amount, so
    a stale constant could be sent to someone as the figure their card is
    about to be charged.
  */
  const body = email.slice(email.indexOf("function money("));
  assert.doesNotMatch(body, /planAmount/,
    "Stripe is the only thing that knows what will actually be taken");
  assert.match(email, /Trial reminder needs the amount Stripe will charge\./);
  assert.match(email, /amount: number;/, "the amount must not be optional");
});

test("a billing email names no retired tier", () => {
  const email = read("../app/trial-reminder.ts");
  const html = email.slice(email.indexOf("export function trialReminderHtml"));
  for (const tier of ["Starter", "Scale", "Listing Factory Pro"])
    assert.ok(!html.includes(tier), `retired tier in a billing email: ${tier}`);
});

test("a missing Stripe amount schedules nothing rather than guessing", () => {
  const hook = read("../app/api/billing/webhook/route.ts");
  const at = hook.indexOf("await scheduleTrialReminder");
  const before = hook.slice(Math.max(0, at - 500), at);
  assert.match(before, /if\(!\(Number\(price\?\.unit_amount\)>0\)\)/,
    "an email that guesses the charge is worse than no email");
});

test("no member-facing page renders a retired price or tier", () => {
  /*
    The purchase surface is behind the closed gate; this catches anything that
    might render one outside it.
  */
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const next = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (/\.tsx$/.test(entry.name)) pages.push(next);
    }
  };
  walk("../app");
  const offences = [];
  for (const page of pages) {
    const source = read(page);
    /* The plan constants may be imported for limits; a literal price may not
       be written into a member's page. */
    for (const price of ["14.99", "24.99", "39.99", "$149", "$249", "$399"])
      if (source.includes(price)) offences.push(`${page} — ${price}`);
  }
  assert.deepEqual(offences, [], `retired prices written into pages:\n${offences.join("\n")}`);
});

test("the plan constants stay reachable for existing entitlements", () => {
  /* Removing them would strip limits from anyone already carrying a plan key;
     the rule is that they must not be SHOWN, not that they must not exist. */
  const limits = read("../app/plan-limits.ts");
  assert.match(limits, /export const PLANS/);
  assert.match(limits, /LEGACY_PLANS/);
});
