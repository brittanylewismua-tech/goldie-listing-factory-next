/*
  Search says what to watch. It never says what is moving.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVIDENCE_STATES, ACTIVE_STATES, GROWTH, priorityFor, pollerCostFor,
  maxCorpusFor, shouldRemove, stillNeeded, GATHERING,
} from "../app/niche-candidates.ts";

const NOW = 1_800_000_000;
const candidate = (over = {}) => ({ nicheKey: "dog+mom", listingId: 1, shopId: 2,
  discoveryQuery: "dog mom", discoveredAt: NOW - 86_400, searchPage: 0,
  listingState: "active", state: "monitoring", baselinedAt: NOW - 86_400,
  lastPolledAt: NOW - 600, priority: 10, lastQualifyingAt: null,
  lastAvailabilityCheck: NOW - 600, removedReason: "", ...over });

test("only observed movement can be shown as evidence", () => {
  assert.deepEqual(EVIDENCE_STATES, ["momentum", "repeated-momentum"]);
  for (const state of ["discovered", "awaiting-baseline", "monitoring"])
    assert.ok(!EVIDENCE_STATES.includes(state),
      `${state} could be displayed as evidence`);
});

test("a discovered candidate is not yet monitored", () => {
  assert.ok(!ACTIVE_STATES.includes("discovered"),
    "a search result is being polled before it is baselined");
  assert.ok(ACTIVE_STATES.includes("awaiting-baseline"));
});

test("nothing in the candidate model reads search rank or favourites", () => {
  const code = readFileSync(new URL("../app/niche-candidates.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  /* The ban is on reading a SEARCH signal, not on the English word: retention
     ordering is legitimately called a rank and reads none of these. */
  for (const banned of ["favorit", "favourit", "searchrank", "search_rank",
    "score", "review_count", "relevance", "views"])
    assert.ok(!code.toLowerCase().includes(banned),
      `candidate qualification reads ${banned}`);
  /* And nothing reads a rank off the candidate itself. */
  assert.doesNotMatch(code, /candidate\.(rank|score|favorites|views)\b/);
});

test("evidence outranks interest, and interest outranks novelty", () => {
  const repeated = priorityFor({ watchers: 1, hasPriorEvidence: true, repeated: true });
  const prior = priorityFor({ watchers: 1, hasPriorEvidence: true, repeated: false });
  const popular = priorityFor({ watchers: 4, hasPriorEvidence: false, repeated: false });
  const plain = priorityFor({ watchers: 1, hasPriorEvidence: false, repeated: false });
  assert.ok(repeated > prior);
  assert.ok(prior > popular);
  assert.ok(popular > plain);
});

test("polling cost is linear in the corpus and stated in calls", () => {
  assert.deepEqual(pollerCostFor(1_000), { callsPerSweep: 10, callsPerDay: 1_440 });
  assert.deepEqual(pollerCostFor(25_000), { callsPerSweep: 250, callsPerDay: 36_000 });
  assert.deepEqual(pollerCostFor(50_000), { callsPerSweep: 500, callsPerDay: 72_000 });
});

test("the corpus ceiling comes from the call budget, not from a guess", () => {
  /* 80,000 a day, a quarter reserved for everything else, 144 sweeps. */
  const ceiling = maxCorpusFor(80_000);
  assert.equal(ceiling, Math.floor((60_000 / 144) * 100));
  assert.ok(ceiling >= GROWTH.maxActiveMonitored,
    "the configured maximum exceeds what the budget supports");
});

test("a listing that left Etsy is removed with its reason", () => {
  const gone = shouldRemove(candidate({ listingState: "removed" }), NOW);
  assert.equal(gone.remove, true);
  assert.match(gone.reason, /gone from Etsy/);
  assert.equal(gone.to, "unavailable");
});

test("a candidate that never moves is demoted, one that moved is kept", () => {
  const old = candidate({ baselinedAt: NOW - 40 * 86_400 });
  assert.equal(shouldRemove(old, NOW).remove, true);
  const proven = candidate({ baselinedAt: NOW - 400 * 86_400, lastQualifyingAt: NOW - 86_400 });
  assert.equal(shouldRemove(proven, NOW).remove, false,
    "evidence that cannot be re-collected was dropped for being old");
});

test("a sold-out listing is still worth watching", () => {
  assert.equal(shouldRemove(candidate({ listingState: "sold_out" }), NOW).remove, false);
});

test("dropping one watch never removes a candidate somebody else needs", () => {
  for (const [held, expected] of [
    [{ otherWatchers: 3, inScannerCohort: false, hasEvidence: false }, /other watches use it/],
    [{ otherWatchers: 0, inScannerCohort: true, hasEvidence: false }, /Design Scanner cohort/],
    [{ otherWatchers: 0, inScannerCohort: false, hasEvidence: true }, /cannot be re-collected/],
  ]) {
    const verdict = stillNeeded(held);
    assert.equal(verdict.needed, true);
    assert.match(verdict.because, expected);
  }
  const free = stillNeeded({ otherWatchers: 0, inScannerCohort: false, hasEvidence: false });
  assert.equal(free.needed, false);
});

test("the gathering message promises evidence, not search results", () => {
  assert.match(GATHERING, /once they actually move/);
  assert.match(GATHERING, /not because a search returned them/);
});

test("growth limits are all configurable numbers, not inline constants", () => {
  for (const key of ["maxCandidatesPerNiche", "maxNewCandidatesPerDay",
    "maxActiveMonitored", "demoteAfterDaysWithoutEvidence", "searchPagesPerNiche",
    "refreshDiscoveryEveryHours"])
    assert.equal(typeof GROWTH[key], "number", `${key} is not configurable`);
});

test("discovery groups niches so shared watches cost one search", () => {
  const route = readFileSync(
    new URL("../app/api/market/discover/route.ts", import.meta.url), "utf8");
  assert.match(route, /GROUP BY niche_key/);
  assert.match(route, /COUNT\(\*\) AS watchers/);
  /* And it never returns who is watching. */
  assert.ok(!route.includes("user_id AS"), "discovery returns watcher identity");
});

test("discovery uses the same matcher as the cohort", () => {
  const route = readFileSync(
    new URL("../app/api/market/discover/route.ts", import.meta.url), "utf8");
  assert.match(route, /from "@\/app\/niche-cohort"/);
  assert.match(route, /relates\(shape, terms\)/);
  /* Which is what rejects service listings and requires every term. */
  const cohort = readFileSync(new URL("../app/niche-cohort.ts", import.meta.url), "utf8");
  assert.match(cohort, /isServiceListing/);
  assert.match(cohort, /const required = terms\.length;/);
});

test("the corpus ceiling is checked before Etsy is asked anything", () => {
  const route = readFileSync(
    new URL("../app/api/market/discover/route.ts", import.meta.url), "utf8");
  const ceiling = route.indexOf("maxActiveMonitored");
  const firstFetch = route.indexOf("await fetch(");
  assert.ok(ceiling > 0 && ceiling < firstFetch,
    "the corpus ceiling is checked after the calls it is meant to prevent");
});

test("rediscovery revives a demoted candidate rather than resetting it", () => {
  const store = readFileSync(
    new URL("../app/niche-candidate-store.ts", import.meta.url), "utf8");
  assert.match(store, /REDISCOVERY REVIVES, IT DOES NOT RESET/);
  assert.match(store, /THEN 'awaiting-baseline' ELSE niche_candidates\.state END/);
  /* discovered_at is not in the DO UPDATE list, so the first sighting stands. */
  const upsert = store.slice(store.indexOf("ON CONFLICT(niche_key, listing_id)"),
    store.indexOf("const statements"));
  assert.ok(!upsert.includes("discovered_at = excluded"),
    "rediscovery rewrites the original discovery date");
});

test("a niche being watched says gathering, not unsupported", () => {
  const route = readFileSync(new URL(
    "../app/api/market-watch/niches/route.ts", import.meta.url), "utf8");
  assert.match(route, /GATHERING IS NOT THE SAME AS UNSUPPORTED/);
  /* Only while nothing has moved — never shown beside real evidence. */
  assert.match(route, /summary\.moving === 0 && watching > 0 \? GATHERING : null/);

  const client = readFileSync(new URL(
    "../app/market-watch/market-watch-client.tsx", import.meta.url), "utf8");
  assert.match(client, /\{view\.gathering && listings\.length === 0 &&/);
  assert.match(client, /!view\.gathering && !summary\?\.meaningfulMomentum/);
});

test("candidate counts are shown as watching, never as momentum", () => {
  const client = readFileSync(new URL(
    "../app/market-watch/market-watch-client.tsx", import.meta.url), "utf8");
  const block = client.slice(client.indexOf("view.gathering && listings.length"),
    client.indexOf("!view.gathering &&"));
  assert.match(block, /Market Watch is watching \$\{view\.candidates\.watching\} listings/);
  for (const banned of ["moving", "momentum", "selling", "sold"])
    assert.ok(!block.toLowerCase().includes(banned),
      `candidates were described as "${banned}"`);
});

/* ------------------------------------------------- over-cap reconciliation */
import { selectRetained, carriesEvidence, RETAINED_STATES } from "../app/niche-candidates.ts";

test("evidence is never demoted to fit a cap", () => {
  /* It cannot be collected again; it is the reason the pool exists. */
  const pool = [
    candidate({ listingId: 1, state: "repeated-momentum", lastQualifyingAt: NOW }),
    candidate({ listingId: 2, state: "momentum", lastQualifyingAt: NOW }),
    ...Array.from({ length: 10 }, (unused, index) =>
      candidate({ listingId: 100 + index, state: "awaiting-baseline" })),
  ];
  const { keep, demote } = selectRetained(pool, 3);
  assert.equal(keep.length, 3);
  assert.ok(keep.some(row => row.listingId === 1));
  assert.ok(keep.some(row => row.listingId === 2));
  for (const row of demote) assert.equal(carriesEvidence(row), false);
});

test("reconciliation is deterministic across runs and input order", () => {
  const pool = Array.from({ length: 20 }, (unused, index) =>
    candidate({ listingId: 500 - index, discoveredAt: NOW - index * 60,
      baselinedAt: index % 3 === 0 ? NOW - index * 120 : null }));
  const first = selectRetained(pool, 7).keep.map(row => row.listingId);
  const second = selectRetained([...pool].reverse(), 7).keep.map(row => row.listingId);
  assert.deepEqual(first, second, "the answer depends on input order");
});

test("the longest-observed candidate outranks a newer one", () => {
  const older = candidate({ listingId: 1, baselinedAt: NOW - 10 * 86_400 });
  const newer = candidate({ listingId: 2, baselinedAt: NOW - 60 });
  const { keep } = selectRetained([newer, older], 1);
  assert.equal(keep[0].listingId, 1);
});

test("an unbaselined candidate falls back to discovery order", () => {
  const early = candidate({ listingId: 9, baselinedAt: null, discoveredAt: NOW - 86_400 });
  const late = candidate({ listingId: 1, baselinedAt: null, discoveredAt: NOW - 60 });
  const { keep } = selectRetained([late, early], 1);
  assert.equal(keep[0].listingId, 9);
});

test("demotion keeps the row, it never deletes it", () => {
  assert.ok(RETAINED_STATES.includes("over-cap"));
  /* And an over-cap candidate is not active, so it cannot be displayed. */
  const active = readFileSync(new URL("../app/niche-candidates.ts", import.meta.url), "utf8");
  const activeBlock = active.slice(active.indexOf("ACTIVE_STATES"), active.indexOf("RETAINED_STATES"));
  assert.ok(!activeBlock.includes("over-cap"));
});
