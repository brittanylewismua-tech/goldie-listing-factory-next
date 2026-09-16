/*
  "200 listings added across 211 shops" shipped in a report. A set of 200
  listings cannot contain 211 shops, and a member who spots that stops
  believing every other number on the page.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invariants, watchingLine } from "../app/discovery-counts.ts";

const stage = (over = {}) => ({ examined: 300, accepted: 298, acceptedShops: 211,
  selected: 200, selectedShops: 158, inserted: 200, insertedShops: 158,
  awaitingBaseline: 200, monitoring: 0, withEvidence: 0, ...over });

test("a healthy set of stages breaks nothing", () => {
  assert.deepEqual(invariants(stage(), 158), []);
});

test("shops can never exceed listings, at any stage", () => {
  const cases = [
    [{ acceptedShops: 400 }, 158, /accepted shops/],
    [{ selectedShops: 250 }, 158, /selected shops/],
    [{ insertedShops: 250 }, 158, /inserted shops/],
    [{}, 500, /monitored shops/],
  ];
  for (const [over, monitoredShops, expected] of cases) {
    const broken = invariants(stage(over), monitoredShops);
    assert.ok(broken.length, `${JSON.stringify(over)} passed`);
    assert.ok(broken.some(row => expected.test(row.rule)),
      broken.map(row => row.rule).join("; "));
  }
});

test("the exact shipped bug is caught", () => {
  /* 200 inserted, 211 shops — the number that appeared in a report. */
  const broken = invariants(stage({ inserted: 200, insertedShops: 211 }), 211);
  assert.ok(broken.some(row => /inserted shops/.test(row.rule)));
  assert.ok(broken.some(row => row.detail.includes("211 shops across 200 listings")));
});

test("each stage narrows the one before it", () => {
  for (const [over, expected] of [
    [{ accepted: 400 }, /accepted ≤ examined/],
    [{ selected: 350 }, /selected ≤ accepted/],
    [{ inserted: 250 }, /inserted ≤ selected/],
  ]) {
    const broken = invariants(stage(over), 158);
    assert.ok(broken.some(row => expected.test(row.rule)),
      `${JSON.stringify(over)}: ${broken.map(row => row.rule).join("; ")}`);
  }
});

test("a violation is reported, never thrown away", () => {
  const source = readFileSync(
    new URL("../app/discovery-counts.ts", import.meta.url), "utf8");
  assert.match(source, /Returned rather than thrown/);
  const route = readFileSync(new URL(
    "../app/api/market/discover/route.ts", import.meta.url), "utf8");
  assert.match(route, /invariantViolations: broken/);
});

test("the member-facing line uses the monitored set and says watching", () => {
  assert.equal(watchingLine({ watching: 0, shops: 0 }), "");
  const line = watchingLine({ watching: 200, shops: 158 });
  assert.match(line, /watching 200 listings across 158 shops/);
  for (const banned of ["moving", "momentum", "selling", "sold", "found"])
    assert.ok(!line.toLowerCase().includes(banned), `the line said "${banned}"`);
});

test("the cap is applied where the counts are taken", () => {
  const store = readFileSync(
    new URL("../app/niche-candidate-store.ts", import.meta.url), "utf8");
  assert.match(store, /THE CAP IS APPLIED HERE AND THE SELECTED SET IS RETURNED/);
  assert.match(store, /const selected = found\.slice\(0, GROWTH\.maxCandidatesPerNiche\);/);
  assert.match(store, /selectedShops: new Set\(selected\.map\(row => row\.shopId\)\)\.size/);
  /* And nothing takes a shop count from the uncapped pool any more. */
  const route = readFileSync(new URL(
    "../app/api/market/discover/route.ts", import.meta.url), "utf8");
  assert.ok(!route.includes("uniqueShops: new Set(found"),
    "the route still counts shops from the accepted pool");
});

test("the watched shop count comes from one query over the watched rows", () => {
  const store = readFileSync(
    new URL("../app/niche-candidate-store.ts", import.meta.url), "utf8");
  assert.match(store, /THE SHOP COUNT IS OF THE MONITORED SET, NOT THE LARGEST STATE/);
  assert.match(store, /COUNT\(DISTINCT shop_id\) AS shops, COUNT\(\*\) AS listings/);
  assert.ok(!store.includes("Math.max(shops,"), "the shop count is still a max across states");
});

test("state counts sum to the candidates that exist", () => {
  const store = readFileSync(
    new URL("../app/niche-candidate-store.ts", import.meta.url), "utf8");
  /* `total` is the sum of the per-state counts, so it cannot disagree. */
  assert.match(store, /Object\.values\(byState\)\.reduce\(\(sum, value\) => sum \+ value, 0\)/);
});

test("the per-niche cap bounds the pool, not one batch", () => {
  /* Measured: with a 200 cap, repeated discovery reached 259, 359 and 353
     candidates. A cap that only limits one run is not a cap. */
  const store = readFileSync(
    new URL("../app/niche-candidate-store.ts", import.meta.url), "utf8");
  assert.match(store, /THE CAP BOUNDS THE POOL, NOT THE BATCH/);
  assert.match(store, /SELECT COUNT\(\*\) AS n FROM niche_candidates/);
  assert.match(store, /const room = Math\.max\(0, GROWTH\.maxCandidatesPerNiche - Number/);
  assert.match(store, /const selected = found\.slice\(0, room\);/);
  /* And a full niche says so instead of reporting a mysterious zero. */
  assert.match(store, /atCap: true/);
});

test("a niche at its cap reports that, not an unexplained zero", () => {
  const route = readFileSync(new URL(
    "../app/api/market/discover/route.ts", import.meta.url), "utf8");
  assert.match(route, /atNicheCap: outcome\.atCap/);
});
