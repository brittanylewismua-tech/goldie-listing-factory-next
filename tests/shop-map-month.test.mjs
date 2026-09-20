/*
  "2026-09" UNDER THE SHOP NAME.

  Seen on the deployed Shop Map. The fifth time this product has put an
  internal value in front of a member because nothing stood between them:
  three database column names on the account page, a UTC timestamp in the
  scanner's refusal, Stripe's own subscription statuses, and this.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { monthName } from "../app/shop-map-month.ts";

test("a month is named, not printed as a key", () => {
  assert.equal(monthName("2026-09"), "September 2026");
  assert.equal(monthName("2026-01"), "January 2026");
  assert.equal(monthName("2025-12"), "December 2025");
});

test("the month is read in UTC, so a timezone cannot shift it", () => {
  /* Built from a local Date, "2026-01" west of UTC becomes December 2025 —
     a figure filed under the wrong month, which is the one mistake a
     finance view must not make. */
  assert.equal(monthName("2026-01"), "January 2026");
  assert.equal(monthName("2026-12"), "December 2026");
});

test("anything unparseable is shown as it came, not guessed", () => {
  /* A wrong month is worse than an odd-looking one. */
  for (const odd of ["", "September", "2026", "2026-13", "2026-00", "not-a-month"])
    assert.equal(monthName(odd), odd);
  assert.equal(monthName(undefined), "");
});

test("the page renders it through the function", () => {
  const source = readFileSync(new URL(
    "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
  assert.match(source, /monthName\(shown\.month\)/);
  assert.ok(!/<p>\{shown\.month\}<\/p>/.test(source));
});
