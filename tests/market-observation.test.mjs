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
  semanticsVersion: 1,
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

test("an unrelated deploy does NOT restart the clock", () => {
  /*
    The whole point. A styling change, a Shop Map deploy or a copy fix ships a
    new build marker and touches nothing the detector means — so the window
    must survive it. Segmenting on build made the gate unpassable for any
    product that ships.
  */
  const before = Array.from({ length: 70 }, (unused, index) =>
    sample({ at: NOW - (72 - index) * 3_600, build: "D1400" }));
  const after = Array.from({ length: 2 }, (unused, index) =>
    sample({ at: NOW - (2 - index) * 3_600, build: "D1538" }));
  const gate = evaluateGate([...before, ...after], NOW);
  assert.equal(gate.samples, 72, "an unrelated deploy reset the observation");
  assert.ok(gate.hoursObserved >= 71);
  assert.equal(gate.passes, true, gate.failing.join("; "));
  /* And the builds are still recorded, for audit. */
  assert.deepEqual([...gate.buildsObserved].sort(), ["D1400", "D1538"]);
});

test("a detector-semantics change DOES restart the clock", () => {
  const old = Array.from({ length: 70 }, (unused, index) =>
    sample({ at: NOW - (72 - index) * 3_600, semanticsVersion: 1 }));
  const fresh = Array.from({ length: 2 }, (unused, index) =>
    sample({ at: NOW - (2 - index) * 3_600, semanticsVersion: 2 }));
  const gate = evaluateGate([...old, ...fresh], NOW);
  assert.equal(gate.samples, 2, "a semantics change inherited an old window");
  assert.equal(gate.passes, false);
  assert.equal(gate.semanticsVersion, 2);
});

test("samples from the retired architecture can never count", () => {
  const retired = Array.from({ length: 70 }, (unused, index) =>
    sample({ at: NOW - (72 - index) * 3_600, semanticsVersion: 0 }));
  const current = Array.from({ length: 3 }, (unused, index) =>
    sample({ at: NOW - (3 - index) * 3_600, semanticsVersion: 1 }));
  const gate = evaluateGate([...retired, ...current], NOW);
  assert.equal(gate.samples, 3);
});

test("normal production load never restarts the clock", () => {
  /* A member saving a niche, candidates added, a listing qualifying — all of
     these change counts inside a sample and none of them changes the key. */
  const busy = Array.from({ length: 80 }, (unused, index) =>
    sample({ at: NOW - (80 - index) * 3_600,
      build: index % 7 === 0 ? `D${1500 + index}` : "D1538",
      eligible: 100 + index * 3, correlated: 100 + index * 3 }));
  const gate = evaluateGate(busy, NOW);
  assert.equal(gate.samples, 80);
  assert.equal(gate.passes, true, gate.failing.join("; "));
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
  assert.match(source.replace(/\s+/g, " "),
    /never backdated onto old-architecture\s*data/);
  assert.match(source, /SEGMENTED BY DETECTOR SEMANTICS, NOT BY DEPLOY/);
});

test("every standard is enforced, and named when it fails", () => {
  const cases = [
    [{ sensorOk: false }, /sensor pass failed/],
    [{ sweepOk: false }, /listing sweep did not complete/],
    [{ correlationOk: false }, /correlation pass failed/],


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

test("a p95 past the evidence window fails, measured on recent samples", () => {
  /* Broken in the LAST hour, since latency is now judged on recent behaviour:
     a single bad sample forty hours ago is an incident, not a current state. */
  const samples = window(80).map((row, index) => ({
    ...row, p95: index > 76 ? GATE_STANDARD.maxP95DelaySeconds + 10 : 4_000,
  }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /p95 correlation delay/.test(line)),
    gate.failing.join("; "));
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

test("the detector-semantics version is documented and hand-bumped", () => {
  const source = readFileSync(
    new URL("../app/detector-semantics.ts", import.meta.url), "utf8");
  assert.match(source, /BUMP THIS WHEN, AND ONLY WHEN/);
  assert.match(source, /DO NOT BUMP IT FOR normal production load/);
  /* Every version has a written reason. */
  assert.match(source, /SEMANTICS_HISTORY/);
  const history = source.slice(source.indexOf("SEMANTICS_HISTORY"));
  assert.match(history, /because:/);
});

test("the sample carries the build for audit but not as the key", () => {
  const gate = readFileSync(
    new URL("../app/observation-gate.ts", import.meta.url), "utf8");
  assert.match(gate, /SEGMENTED BY DETECTOR SEMANTICS, NOT BY DEPLOY/);
  assert.match(gate, /\$\{sample\.semanticsVersion \?\? 0\}:\$\{sample\.ruleVersion\}/);
  /* The build is never part of the key. */
  const keyLine = gate.slice(gate.indexOf("const key ="), gate.indexOf("const segment"));
  assert.ok(!keyLine.includes("build"), "the build is still part of the segment key");
});

test("a p95 close to the evidence ceiling fails for lack of headroom", () => {
  /* Measured: p95 20,655s against a 21,600s window — 94% of the way to
     worthless — and the gate passed it because it was technically under. */
  const near = window(80).map(row => ({ ...row, p95: 20_655 }));
  const gate = evaluateGate(near, NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /too little headroom/.test(line)),
    gate.failing.join("; "));

  const comfortable = window(80).map(row => ({ ...row, p95: 6_000 }));
  assert.equal(evaluateGate(comfortable, NOW).passes, true);
});

test("past the window and merely close to it read differently", () => {
  const past = window(80).map(row => ({ ...row, p95: 30_000 }));
  const gate = evaluateGate(past, NOW);
  assert.ok(gate.failing.some(line => /past the 6h evidence window/.test(line)));
});

test("a forced admin run does not fail the backlog condition", () => {
  /* An operator pressing discover spikes the backlog by design. */
  const samples = window(80).map((row, index) => ({
    ...row,
    adminForced: index === 40,
    backlog: index === 40 ? 5_000 : 50,
  }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.measured.adminForcedSamples, 1);
  assert.ok(!gate.failing.some(line => /backlog grew/.test(line)),
    gate.failing.join("; "));
});

test("a real production backlog rise still fails", () => {
  const samples = window(80).map((row, index) => ({ ...row, backlog: 50 + index * 10 }));
  const gate = evaluateGate(samples, NOW);
  assert.ok(gate.failing.some(line => /backlog grew/.test(line)));
});

test("a progressing ingest queue is not reported as stale", () => {
  /* Measured: the register moved 177,626 → 184,306 marks with a file
     completing that morning, and health called it stale purely because 88
     files were still queued. Progressing, backlogged and stalled are three
     different states. */
  const route = readFileSync(new URL(
    "../app/api/operations/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /MEASURED CADENCE, NOT AN ASSUMPTION/);
  assert.match(route, /MAX\(finished\) AS at FROM tm_ingest_files WHERE state = 'done'/);
  assert.match(route, /progressing: Boolean\(lastAt && sinceLast < 36 \* 3_600\)/);
  /* A queue that has genuinely stopped is still broken. */
  assert.match(route, /sinceLast > 36 \* 3_600 \? "broken"/);
});

test("an incomplete register still blocks a clean trademark claim", () => {
  const route = readFileSync(new URL(
    "../app/api/operations/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /registerComplete: incomplete === 0 && Number\(marks\?\.n \?\? 0\) > 0/);
});

test("a partly-read ingest file is resumed before a newer daily file starts", () => {
  /* Strict priority meant a daily file always beat the backfile, and a new
     daily file arrives every day — so 88 historical files had no path to
     running at all. */
  const tick = readFileSync(new URL(
    "../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  assert.match(tick, /DAILY FIRST, BUT NOT DAILY FOREVER/);
  assert.match(tick, /WHERE state = 'partial' AND \(retry_after IS NULL OR retry_after <= \?\)\s+ORDER BY priority ASC/);
  assert.match(tick, /const next = resuming \?\?/);
});

test("latency is judged on recent behaviour, not the worst hour ever seen", () => {
  /* Measured: the original backlog drain left p95 at 20,655s in the segment
     while current samples read 18,083s and falling. A gate that can never
     clear because of something already repaired teaches an operator to
     ignore it. */
  const samples = window(80).map((row, index) => ({
    ...row,
    /* One terrible hour, long ago; everything since is comfortable. */
    p95: index === 2 ? 21_000 : 4_000,
  }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.passes, true, gate.failing.join("; "));
  assert.equal(gate.measured.recentWorstP95Seconds, 4_000);
  assert.equal(gate.measured.segmentWorstP95Seconds, 21_000,
    "the incident is no longer visible at all");
});

test("latency that is bad NOW still fails", () => {
  const samples = window(80).map((row, index) => ({
    ...row, p95: index > 74 ? 21_000 : 4_000,
  }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.passes, false);
  assert.ok(gate.failing.some(line => /p95 correlation delay/.test(line)));
});

test("a young observation falls back to the whole segment", () => {
  const samples = window(2).map(row => ({ ...row, p95: 21_000 }));
  const gate = evaluateGate(samples, NOW);
  assert.equal(gate.measured.latencySamples, 2);
  assert.ok(gate.failing.some(line => /p95/.test(line)));
});

test("the backfile gets a turn once the daily queue is empty", () => {
  /* Measured after the first attempt: 26 done, 88 waiting, and no historical
     file completed across two days while daily files kept completing. */
  const tick = readFileSync(new URL(
    "../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  assert.match(tick, /RESUMING A PARTIAL FILE WAS NOT ENOUGH/);
  assert.match(tick, /const preferHistorical = Number\(dailyWaiting\?\.n \?\? 0\) === 0;/);
  assert.match(tick, /ORDER BY priority DESC, name DESC/);
  /* Daily still wins while any daily file is waiting. */
  assert.match(tick, /WHERE state = 'waiting' AND priority <= 2/);
});

test("one unlucky sample does not fail the backlog condition", () => {
  /*
    backlogGrowth was last.backlog - first.backlog: two instantaneous readings
    ten minutes apart deciding a seventy-two hour gate. Measured on production
    across one segment, with nothing actually behind and coverage at 1
    throughout, the number read 338, then 0, then 109, then 122, then 0, then
    39 — depending only on whether the sampler caught the queue before or
    after the ten-minute drain.
  */
  const samples = window(80).map(row => ({ ...row, backlog: 0 }));
  samples[samples.length - 1].backlog = 400;
  const gate = evaluateGate(samples, NOW);
  assert.ok(!gate.failing.some(line => /backlog grew/.test(line)),
    "a single spiky reading at the end must not decide the gate");
});

test("a backlog that is genuinely accumulating still fails", () => {
  /* The condition must be harder to pass by luck, not easier. */
  const samples = window(80).map((row, index) => ({ ...row, backlog: index * 12 }));
  const gate = evaluateGate(samples, NOW);
  assert.ok(gate.failing.some(line => /backlog grew/.test(line)),
    "a rising backlog must still fail");
});

test("a backlog that drains to nothing is not called growth", () => {
  /* The mirror case: a segment that starts badly and recovers. */
  const samples = window(80).map((row, index) => ({ ...row, backlog: Math.max(0, 400 - index * 8) }));
  const gate = evaluateGate(samples, NOW);
  assert.ok(!gate.failing.some(line => /backlog grew/.test(line)));
});

test("a burst the median hides still fails the gate", () => {
  /*
    The whole risk of turning backlog growth into a trend of medians: a median
    is the wrong instrument for a burst. Each of these fails on one bad
    sample, which is exactly what the trend cannot do.
  */
  const flat = () => window(80).map(row => ({ ...row, backlog: 0 }));

  const runaway = flat();
  runaway[40].backlog = 9_000;
  let gate = evaluateGate(runaway, NOW);
  assert.ok(!gate.failing.some(line => /backlog grew/.test(line)),
    "the trend correctly sees no growth");
  assert.ok(gate.failing.some(line => /backlog peaked at 9000/.test(line)),
    "one moment where the queue ran away must still fail");

  const aged = flat();
  aged[12].approachingExpiry = 37;
  gate = evaluateGate(aged, NOW);
  assert.ok(gate.failing.some(line =>
    /37 intervals reached three-quarters of their evidence window/.test(line)),
    "evidence that sat too long must fail whether or not it later landed");

  const lost = flat();
  lost[60].expiredNew = 4;
  gate = evaluateGate(lost, NOW);
  assert.ok(gate.failing.some(line => /4 intervals expired before correlation/.test(line)),
    "a count of lost intervals must fail even while the coverage share stays high");
});

test("coverage as a share cannot absorb real losses", () => {
  /* 60 lost intervals against a large denominator keeps coverage at 0.99 —
     above the 0.95 standard — while sixty pieces of evidence are gone. */
  const samples = window(80).map(row => ({ ...row, backlog: 0,
    eligible: 500, correlated: 500, expiredNew: 0 }));
  samples[30].expiredNew = 60;
  const gate = evaluateGate(samples, NOW);
  assert.ok(gate.measured.correlationCoverage > 0.95, "coverage stays above the bar");
  assert.ok(gate.failing.some(line => /60 intervals expired before correlation/.test(line)),
    "the count must fail where the ratio does not");
});

test("unresolved units are reported, never gated", () => {
  /* A sale matching no listing change is an honest outcome. Failing the gate
     on it would fail the system for telling the truth. */
  const samples = window(80).map(row => ({ ...row, backlog: 0,
    unresolvedUnits: 900, attributedUnits: 10 }));
  const gate = evaluateGate(samples, NOW);
  assert.ok(!gate.failing.some(line => /unresolved/i.test(line)));
  assert.equal(gate.measured.unresolvedUnits, 900 * 80);
  assert.equal(gate.measured.attributedUnits, 10 * 80);
});

test("every safeguard the trend cannot see is reported, failing or not", () => {
  const gate = evaluateGate(window(80).map(row => ({ ...row, backlog: 0 })), NOW);
  for (const field of ["backlogGrowth", "peakBacklog", "worstApproachingExpiry",
    "expiredIntervals", "correlationCoverage", "worstP95DelaySeconds",
    "worstListingFreshness", "unresolvedUnits", "errors"])
    assert.ok(field in gate.measured, `${field} is not reported`);
});
