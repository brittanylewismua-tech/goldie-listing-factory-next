/*
  A permanent historical fact must never become a permanent broken status, and
  readiness must not be inferable from one good afternoon.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateGate, GATE_STANDARD, OBSERVATION_HOURS } from "../app/observation-gate.ts";

const NOW = 1_800_000_000;
const sample = (over = {}) => ({ at: NOW - 3_600, build: "D1532", ruleVersion: 1,
  sensorOk: true, sweepOk: true, correlationOk: true,
  eligible: 100, correlated: 100, expiredNew: 0, p50: 900, p95: 1_800,
  backlog: 50, attributedUnits: 40, unresolvedUnits: 60,
  listingFreshness: 0.97, etsyCalls: 30_000, errors: 0,
  cohortsOk: true, briefsOk: true, ...over });

/* A full window of healthy samples, one an hour. */
const window = (hours, over = {}) =>
  Array.from({ length: hours }, (unused, index) =>
    sample({ at: NOW - (hours - index) * 3_600, ...over }));

test("no samples means not ready, never ready-by-default", () => {
  const gate = evaluateGate([], NOW);
  assert.equal(gate.passes, false);
  assert.match(gate.failing[0], /no observation samples/);
});

test("a good afternoon does not pass a 72-hour gate", () => {
  const gate = evaluateGate(window(6), NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /of 72 hours observed/.test(line)));
});

test("72 healthy hours on one build and rule version passes", () => {
  const gate = evaluateGate(window(80), NOW);
  assert.equal(gate.passes, true, gate.failing.join("; "));
  assert.ok(gate.hoursObserved >= OBSERVATION_HOURS);
});

test("a deploy segments the clock rather than inheriting it", () => {
  /* 70 hours on the old build, then 2 on the new one, is 2 hours of evidence.
     Timestamps must not overlap, or "latest" is ambiguous. */
  const old = Array.from({ length: 70 }, (unused, index) =>
    sample({ at: NOW - (72 - index) * 3_600, build: "D1400" }));
  const fresh = Array.from({ length: 2 }, (unused, index) =>
    sample({ at: NOW - (2 - index) * 3_600 }));
  const gate = evaluateGate([...old, ...fresh], NOW);
  assert.equal(gate.passes, false);
  assert.equal(gate.samples, 2, "the gate counted samples from another build");
  assert.ok(gate.hoursObserved < 3);
});

test("a rule-version change segments the clock too", () => {
  const old = Array.from({ length: 70 }, (unused, index) =>
    sample({ at: NOW - (73 - index) * 3_600, ruleVersion: 0 }));
  const fresh = Array.from({ length: 3 }, (unused, index) =>
    sample({ at: NOW - (3 - index) * 3_600 }));
  const gate = evaluateGate([...old, ...fresh], NOW);
  assert.equal(gate.samples, 3);
  assert.equal(gate.passes, false);
});

test("the gate cannot be backdated onto old-architecture data", () => {
  const source = readFileSync(
    new URL("../app/observation-gate.ts", import.meta.url), "utf8");
  assert.match(source.replace(/\s+/g, " "), /never backdated onto old-architecture data/);
  assert.match(source, /SEGMENTED BY BUILD AND RULE VERSION/);
});

test("every standard is enforced, and named when it fails", () => {
  const cases = [
    [{ sensorOk: false }, /sensor pass failed/],
    [{ sweepOk: false }, /listing sweep did not complete/],
    [{ correlationOk: false }, /correlation pass failed/],

    [{ p95: GATE_STANDARD.maxP95DelaySeconds + 10 }, /p95 correlation delay/],
    [{ errors: 3 }, /3 errors recorded/],
    [{ etsyCalls: 90_000 }, /Etsy usage peaked/],
    [{ listingFreshness: 0.5 }, /listing freshness fell/],
    [{ cohortsOk: false }, /cohort recomputation failed/],
    [{ briefsOk: false }, /morning brief failed/],
  ];
  for (const [broken, expected] of cases) {
    const samples = window(80);
    samples[40] = { ...samples[40], ...broken };
    const gate = evaluateGate(samples, NOW);
    assert.equal(gate.passes, false, `${JSON.stringify(broken)} passed the gate`);
    assert.ok(gate.failing.some(line => expected.test(line)),
      `${JSON.stringify(broken)} produced: ${gate.failing.join("; ")}`);
  }
});

test("expiry outrunning correlation fails the coverage standard", () => {
  /* Coverage is measured across the whole segment, so one bad hour does not
     fail it and a sustained shortfall does. */
  const samples = window(80).map(row => ({ ...row, correlated: 80, expiredNew: 20 }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /before expiry, below 95%/.test(line)),
    gate.failing.join("; "));
  assert.equal(gate.measured.correlationCoverage, 0.8);
});

test("a growing backlog fails the gate", () => {
  const samples = window(80).map((row, index) => ({ ...row, backlog: 50 + index * 10 }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /backlog grew/.test(line)));
});

test("the health probe reports current work, not the incident", () => {
  const route = readFileSync(new URL(
    "../app/api/operations/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /await probe\("correlation"/);
  assert.match(route, /await probe\("historicalLoss"/);
  assert.match(route, /await probe\("observationGate"/);
  assert.ok(!route.includes('probe("inspectionBacklog"'),
    "the probe that was permanently broken is still there");
  /* And the incident probe is never a failure state. */
  const incident = route.slice(route.indexOf('probe("historicalLoss"'),
    route.indexOf('probe("observationGate"'));
  assert.match(incident, /state: "ok"/);
});

test("the incident is recorded once and not recomputed as the new path works", () => {
  const source = readFileSync(
    new URL("../app/market-observation.ts", import.meta.url), "utf8");
  assert.match(source, /if \(held\) return held;/);
  assert.match(source, /must not drift as\s*\n?\s*\* the new one works/);
});

test("the gate's delay standard agrees with the correlation window", () => {
  const gate = readFileSync(new URL("../app/observation-gate.ts", import.meta.url), "utf8");
  const correlation = readFileSync(new URL("../app/correlation.ts", import.meta.url), "utf8");
  const declared = Number(gate.match(/maxP95DelaySeconds: (\d+) \* 3_600/)[1]);
  const actual = Number(correlation.match(/MAX_EVIDENCE_AGE_SECONDS = (\d+) \* 3_600/)[1]);
  assert.equal(declared, actual,
    "the gate would accept a delay past the useful evidence window");
});

test("the observation sample reads columns poll_sweeps actually has", () => {
  /* A probe that throws and is caught records a false failure against a
     healthy workload, which is worse than no probe. */
  const poller = readFileSync(new URL("../app/listing-poller.ts", import.meta.url), "utf8");
  const create = poller.slice(poller.indexOf("CREATE TABLE IF NOT EXISTS poll_sweeps"));
  const columns = new Set([...create.slice(0, 900)
    .matchAll(/^\s*([a-z_]+)\s+(TEXT|INTEGER|REAL)/gm)].map(match => match[1]));
  assert.ok(columns.has("listings") && columns.has("finished_at"));
  assert.ok(!columns.has("listings_read"));

  const route = readFileSync(new URL(
    "../app/api/market/observe/route.ts", import.meta.url), "utf8");
  const select = route.slice(route.indexOf("SELECT finished_at"),
    route.indexOf("FROM poll_sweeps"));
  for (const match of select.matchAll(/\b([a-z_]+)(?:\s+AS\s+\w+)?\s*[,\s]/g))
    if (/^[a-z_]+$/.test(match[1]) && match[1] !== "select")
      assert.ok(columns.has(match[1]),
        `the observation reads poll_sweeps.${match[1]}, which does not exist`);
});
