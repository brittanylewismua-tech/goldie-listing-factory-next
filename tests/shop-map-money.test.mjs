import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("D1419: the ledger window respects Etsy's measured 31-day cap", () => {
  const route = readFileSync(new URL(
    "../app/api/shop-map/financial-survey/route.ts", import.meta.url), "utf8");
  /* Measured, not assumed: a 90-day request answers 400 naming the cap. */
  assert.match(route, /31\s*days/);
  const days = Number((route.match(/LEDGER_WINDOW_DAYS = (\d+)/) ?? [])[1]);
  assert.ok(days > 0 && days <= 31, `ledger window of ${days} days exceeds Etsy's cap`);
  /* The fallback that masked the real error must not come back. */
  assert.doesNotMatch(route, /ledger-entries\?limit=\$\{limit\}`\)/);
});
