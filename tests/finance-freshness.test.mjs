/*
  D1684 · The month's money is computed from imported sales, and the import is
  not on a clock. A figure days old looked exactly like one computed a minute
  ago, while the financial view was already refusing profit with staleness as
  its FIRST reason.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "freshness-"));
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/finance-freshness.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const { salesAsOf, isStale, freshnessNote, STALE_AFTER_SECONDS } =
  await import(join(dir, "finance-freshness.js"));

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const DAY = 86_400;
const now = 1_789_700_000;

test("a figure is only as current as its OLDEST input", () => {
  assert.equal(salesAsOf([{ refreshedAt: now }, { refreshedAt: now - 5 * DAY },
    { refreshedAt: now - DAY }]), now - 5 * DAY);
});

test("a source with no refresh time cannot make the figure look fresh", () => {
  assert.equal(salesAsOf([{ refreshedAt: 0 }, { refreshedAt: now - 2 * DAY }]),
    now - 2 * DAY);
  assert.equal(salesAsOf([]), 0, "no sources is a different state, not a fresh one");
});

test("stale is the same day used to call a source stale elsewhere", () => {
  assert.equal(STALE_AFTER_SECONDS, DAY);
  const financial = src("../app/financial-month-read.ts");
  assert.match(financial, /<=STALE_AFTER_SECONDS/,
    "two definitions of stale would let the card and the reason disagree");
  assert.equal(isStale(now - DAY - 1, now), true);
  assert.equal(isStale(now - DAY + 1, now), false);
  assert.equal(isStale(0, now), false);
});

test("a stale figure says what is missing from it", () => {
  const note = freshnessNote({ asOf: now - 3 * DAY, nowSeconds: now,
    timezone: "America/Los_Angeles" });
  assert.match(note, /Worked out from your sales up to /);
  assert.match(note, /Anything sold since then is not in this figure yet\./);
});

test("a current figure states its date without a warning", () => {
  const note = freshnessNote({ asOf: now - 600, nowSeconds: now,
    timezone: "America/Los_Angeles" });
  assert.match(note, /^Worked out from your sales up to /);
  assert.ok(!/not in this figure/.test(note));
});

test("no imported sales says nothing rather than guessing a date", () => {
  assert.equal(freshnessNote({ asOf: 0, nowSeconds: now, timezone: "UTC" }), "");
});

test("an unusable timezone does not cost the member the sentence", () => {
  const note = freshnessNote({ asOf: now - 3 * DAY, nowSeconds: now,
    timezone: "Not/AZone" });
  assert.match(note, /Worked out from your sales up to /);
});

test("no source name reaches the member", () => {
  const note = freshnessNote({ asOf: now - 3 * DAY, nowSeconds: now, timezone: "UTC" });
  for (const name of ["ledger", "own-reviews", "payments", "printify",
    "receipts", "refunds", "transactions", "finance_"])
    assert.ok(!note.toLowerCase().includes(name), `source name in the sentence: ${name}`);
  const client = src("../app/shop-map/shop-map-client.tsx");
  assert.ok(!/staleSources/.test(client),
    "the page must never handle the list of source names");
});

test("the sentence is built on the server and rendered beside the figure", () => {
  const map = src("../app/api/shop-map/map/route.ts");
  assert.match(map, /freshness: freshnessNote\(/);
  assert.match(map, /salesStale: isStale\(asOf, nowSeconds\)/);
  const client = src("../app/shop-map/shop-map-client.tsx");
  assert.match(client, /className="shop-map-freshness"/);
  assert.match(client, /data-stale=\{month\.salesStale \? "yes" : "no"\}/);
  /* Beside the figure, not in a footer far from the number it qualifies. */
  const accuracy = client.indexOf('className="shop-map-accuracy"');
  const fresh = client.indexOf('className="shop-map-freshness"');
  assert.ok(accuracy > -1 && fresh > accuracy && fresh - accuracy < 900,
    "the currency of a figure belongs next to the figure");
});

test("the same figure does not sit on two pages at two different ages", () => {
  const home = src("../app/api/home/route.ts");
  assert.match(home, /computed_at AS computedAt/,
    "Home reads the rollup, so the rollup's own age is what it must report");
  assert.match(home, /stale: isStale\(Number\(row\.computedAt \?\? 0\)/);
  assert.match(home, /dayInShopTimezone\(Number\(row\.computedAt \?\? 0\), timezoneForMember\)/,
    "a date on Home must read as the same date on Shop Map, not shift by a day");
  const status = src("../app/home/home-status.tsx");
  assert.match(status, /blocks\.thisMonth\.stale && blocks\.thisMonth\.asOfDay/,
    "a current figure needs no note; a stale one does");
  /* Both pages decide staleness with one rule. */
  const map = src("../app/api/shop-map/map/route.ts");
  for (const file of [home, map])
    assert.match(file, /from "@\/app\/finance-freshness"/);
});
