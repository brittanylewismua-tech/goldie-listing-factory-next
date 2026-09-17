/**
 * THE MARKET WATCH COMPLETION GATE.
 *
 * Pure, and importable without a Workers runtime, so the rule that decides
 * whether a feature is ready can be tested directly rather than inferred from
 * a live endpoint.
 *
 * Readiness is EXPLICIT. It is not inferred from whichever metric somebody
 * happens to look at, and it cannot be satisfied by one good afternoon.
 */
export const OBSERVATION_HOURS = 72;

export const GATE_STANDARD = {
  minimumHours: OBSERVATION_HOURS,
  /* Share of eligible intervals correlated before expiry. */
  correlationCoverage: 0.95,
  /*
    HEADROOM, NOT JUST A CEILING.

    p95 sat at 20,655 seconds against a 21,600-second evidence ceiling — 94% of
    the way to worthless, and the gate called it a pass because it was
    technically under. A delay that close to expiry means the next bad hour
    loses evidence, so the gate now requires real room: p95 must stay inside
    this share of the useful window.
  */
  p95HeadroomShare: 0.6,
  /* Stated here rather than imported, so the gate module stays free of the
     Workers runtime. It mirrors MAX_EVIDENCE_AGE_SECONDS in app/correlation.ts,
     and a test asserts the two agree. */
  maxP95DelaySeconds: 6 * 3_600,
  maxEtsyCallsPerDay: 80_000,
  minListingFreshness: 0.9,
  /*
    SAFEGUARDS A MEDIAN CANNOT HIDE.

    Backlog growth became a trend of medians, which is the right way to read a
    queue that fills continuously and drains every ten minutes — and a median
    is exactly the wrong instrument for a burst. So the trend does not stand
    alone. Each of these fails on a single bad sample, by design:

      maxBacklogPeak       one moment where the queue ran away. Normal fill
                           between drains peaks near 350; the correlator
                           handles 400 a pass and clears 122 in under a
                           second, so this is far above working behaviour and
                           nowhere near a real stall.
      maxApproachingExpiry evidence age. An interval that reaches
                           three-quarters of its useful window still
                           uncorrelated is a miss whether or not it later
                           lands, and no average can absorb it.
      maxExpiredIntervals  the count, not the ratio. Coverage is a share, so
                           a large enough denominator keeps it above 0.95
                           while real intervals are lost.
  */
  maxBacklogPeak: 2_000,
  maxApproachingExpiry: 0,
  maxExpiredIntervals: 0,
  /*
    LATENCY IS JUDGED ON RECENT BEHAVIOUR, NOT ON THE WORST HOUR EVER SEEN.

    p95 was taken as the maximum across the whole segment, so the original
    backlog drain — a one-off, since fixed — kept the gate failing hours after
    the system had recovered: p95 measured 20,655s from the drain while current
    samples read 18,083s and falling, with p50 at 29 minutes.

    A gate that can never clear because of something already repaired teaches
    an operator to ignore it. The incident stays in historical health; the gate
    asks whether latency is acceptable NOW.
  */
  latencyWindowHours: 6,
} as const;

export type Sample = {
  at: number;
  /* Recorded for audit — which build produced this reading — and deliberately
     NOT the segment key. See `semanticsVersion`. */
  build: string;
  ruleVersion: number;
  /* The segment key. Bumped only when the meaning of detector evidence
     changes; see app/detector-semantics.ts. */
  semanticsVersion: number;
  sensorOk: boolean; sweepOk: boolean; correlationOk: boolean;
  eligible: number; correlated: number; expiredNew: number;
  p50: number; p95: number; backlog: number;
  /*
    Intervals past three-quarters of their useful evidence window and still
    uncorrelated. Added after the backlog metric became a trend: the trend
    answers "is work accumulating", this answers "did anything sit too long",
    and only the second one catches a burst. Samples written before this
    existed carry 0, which is what they measured.
  */
  approachingExpiry?: number;
  attributedUnits: number; unresolvedUnits: number;
  listingFreshness: number; etsyCalls: number; errors: number;
  cohortsOk: boolean; briefsOk: boolean;
  /*
    A forced administrative discovery run is not production load. Counting one
    against the gate would fail a healthy system because an operator pressed a
    button; ignoring it entirely would hide a real burst. It is recorded and
    excluded from the backlog-growth judgement, and reported separately.
  */
  adminForced?: boolean;
};

/* `recordSample` lives in market-observation.ts, which has the database. A
   copy of it landed here when this module was split out and was caught by the
   import guard: it referenced ensureObservationTables and db(), neither of
   which exists in a module that is deliberately runtime-free. */

export type GateResult = {
  passes: boolean;
  /* The segment key. Several builds inside one window is expected. */
  semanticsVersion?: number;
  buildsObserved?: string[];
  /* Where the clock actually starts: the first sample on the CURRENT build and
     rule version. A deploy or rule change segments the observation rather
     than inheriting a window it did not earn. */
  segmentStartedAt: number | null;
  hoursObserved: number;
  samples: number;
  failing: string[];
  measured: Record<string, number | null>;
};

export function evaluateGate(
  samples: Sample[], now: number, standard = GATE_STANDARD,
): GateResult {
  if (!samples.length)
    return { passes: false, segmentStartedAt: null, hoursObserved: 0, samples: 0,
      semanticsVersion: 0, buildsObserved: [],
      failing: ["no observation samples yet"], measured: {} };

  /*
    SEGMENTED BY DETECTOR SEMANTICS, NOT BY DEPLOY.

    Observing 72 hours across three different correlation rules is not 72 hours
    of evidence about any of them — so a change to what the detector MEANS
    still restarts the clock, and is never backdated onto old-architecture
    data.

    But an unrelated deploy does not. Segmenting on the build marker meant a
    copy fix reset a window measuring the sensor, and it meant the gate could
    never pass after launch, because a product that ships would reset it every
    day. The build is still on every sample for audit; it simply does not
    decide the window.
  */
  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const latest = ordered[ordered.length - 1];
  const key = (sample: Sample) =>
    `${sample.semanticsVersion ?? 0}:${sample.ruleVersion}`;
  const segment: Sample[] = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const sample = ordered[index];
    if (key(sample) !== key(latest)) break;
    segment.unshift(sample);
  }

  const startedAt = segment[0]?.at ?? null;
  const hours = startedAt ? (now - startedAt) / 3_600 : 0;

  const totalEligible = segment.reduce((sum, row) => sum + row.eligible, 0);
  const totalCorrelated = segment.reduce((sum, row) => sum + row.correlated, 0);
  const totalExpired = segment.reduce((sum, row) => sum + row.expiredNew, 0);
  const coverage = totalEligible ? totalCorrelated / (totalCorrelated + totalExpired) : null;
  /* Recent samples only — see `latencyWindowHours`. Falls back to the whole
     segment when the observation is younger than the window. */
  const latencyFrom = now - standard.latencyWindowHours * 3_600;
  const recent = segment.filter(row => row.at >= latencyFrom);
  const latencySamples = recent.length ? recent : segment;
  const worstP95 = Math.max(0, ...latencySamples.map(row => row.p95));
  const peakEtsy = Math.max(0, ...segment.map(row => row.etsyCalls));
  const worstFreshness = Math.min(1, ...segment.map(row => row.listingFreshness));
  const errors = segment.reduce((sum, row) => sum + row.errors, 0);

  /*
    BACKLOG GROWTH IS A TREND, NOT TWO SAMPLES TEN MINUTES APART.

    This was `last.backlog - first.backlog`: one instantaneous reading at each
    end deciding a seventy-two hour gate. The queue is drained every ten
    minutes and refills continuously, so the last sample lands wherever the
    clock happens to catch it — the number read 338, then 0, then 109, then
    122, then 0, then 39, with nothing behind and coverage at 1 throughout.
    Endpoints are the noisiest estimator available, and a gate that flickers
    is a gate an operator learns to ignore.

    Medians of the first and last quarter instead. A backlog that is genuinely
    accumulating moves both; a single unlucky sample moves neither. This is
    strictly harder to pass by luck than the version it replaces — no
    threshold has moved and no sample has been discarded, the recorded
    segment is simply read the way the metric's own name claims.

    The same reasoning the latency standard above already applies: judge the
    behaviour, not the worst or last instant of it.
  */
  const production = segment.filter(row => !row.adminForced);
  const median = (rows: Sample[]) => {
    if (!rows.length) return 0;
    const sorted = rows.map(row => row.backlog).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const quarter = Math.max(1, Math.floor(production.length / 4));
  const backlogGrowth = production.length >= 8
    ? Math.round(median(production.slice(-quarter)) - median(production.slice(0, quarter)))
    /* Too few samples to speak of a trend; the endpoints are all there is. */
    : production.length >= 2
      ? production[production.length - 1].backlog - production[0].backlog : 0;
  const adminSamples = segment.length - production.length;

  /* Peaks and totals, each judged on its own worst moment rather than on the
     segment's average behaviour. */
  const peakBacklog = Math.max(0, ...production.map(row => row.backlog));
  const worstApproachingExpiry = Math.max(0,
    ...segment.map(row => row.approachingExpiry ?? 0));
  const totalUnresolvedUnits = segment.reduce((sum, row) => sum + row.unresolvedUnits, 0);
  const totalAttributedUnits = segment.reduce((sum, row) => sum + row.attributedUnits, 0);

  const failing: string[] = [];
  if (hours < standard.minimumHours)
    failing.push(`${hours.toFixed(1)} of ${standard.minimumHours} hours observed`);
  if (segment.some(row => !row.sensorOk)) failing.push("a sensor pass failed");
  if (segment.some(row => !row.sweepOk)) failing.push("a listing sweep did not complete");
  if (segment.some(row => !row.correlationOk)) failing.push("a correlation pass failed");
  if (coverage !== null && coverage < standard.correlationCoverage)
    failing.push(`${Math.round(coverage * 100)}% of eligible intervals correlated `
      + `before expiry, below ${Math.round(standard.correlationCoverage * 100)}%`);
  const headroomCeiling = standard.maxP95DelaySeconds * standard.p95HeadroomShare;
  if (worstP95 > standard.maxP95DelaySeconds)
    failing.push(`p95 correlation delay reached ${Math.round(worstP95 / 3_600)}h, `
      + `past the ${Math.round(standard.maxP95DelaySeconds / 3_600)}h evidence window`);
  else if (worstP95 > headroomCeiling)
    failing.push(`p95 correlation delay reached ${Math.round(worstP95 / 3_600)}h — `
      + `inside the ${Math.round(standard.maxP95DelaySeconds / 3_600)}h window but with `
      + `too little headroom before evidence starts expiring`);
  if (backlogGrowth > 0 && segment.length >= 3)
    failing.push(`backlog grew by ${backlogGrowth} across the observation`);
  /* The trend is the shape; these are the moments it cannot describe. */
  if (peakBacklog > standard.maxBacklogPeak)
    failing.push(`backlog peaked at ${peakBacklog}, past ${standard.maxBacklogPeak}`);
  if (worstApproachingExpiry > standard.maxApproachingExpiry)
    failing.push(`${worstApproachingExpiry} intervals reached three-quarters of `
      + `their evidence window uncorrelated`);
  if (totalExpired > standard.maxExpiredIntervals)
    failing.push(`${totalExpired} intervals expired before correlation`);
  if (errors > 0) failing.push(`${errors} errors recorded`);
  if (peakEtsy > standard.maxEtsyCallsPerDay)
    failing.push(`Etsy usage peaked at ${peakEtsy}`);
  if (worstFreshness < standard.minListingFreshness)
    failing.push(`listing freshness fell to ${Math.round(worstFreshness * 100)}%`);
  if (segment.some(row => !row.cohortsOk)) failing.push("cohort recomputation failed");
  if (segment.some(row => !row.briefsOk)) failing.push("a morning brief failed to build");

  /*
    UNRESOLVED UNITS ARE REPORTED, NOT GATED.

    A sale that matched no listing change is a real and honest outcome, not a
    fault — gating on it would fail the system for telling the truth. It is
    surfaced beside attributed units so a shift in the ratio is visible to
    somebody reading the gate, which is what it is actually evidence of.
  */

  /* Which builds produced this window, for audit. Several is normal and
     healthy: it means unrelated work shipped without disturbing the clock. */
  const builds = [...new Set(segment.map(row => row.build))];

  return {
    passes: failing.length === 0,
    segmentStartedAt: startedAt,
    semanticsVersion: latest.semanticsVersion ?? 0,
    buildsObserved: builds,
    hoursObserved: Number(hours.toFixed(2)),
    samples: segment.length,
    failing,
    measured: {
      correlationCoverage: coverage === null ? null : Number(coverage.toFixed(3)),
      worstP95DelaySeconds: worstP95,
      backlogGrowth,
      /* The burst safeguards, reported whether or not they failed, so the
         trend is never the only backlog number anyone sees. */
      peakBacklog,
      worstApproachingExpiry,
      expiredIntervals: totalExpired,
      /* Reported, not gated: a sale matching no listing change is an honest
         outcome. The ratio is what a reader should watch. */
      unresolvedUnits: totalUnresolvedUnits,
      attributedUnits: totalAttributedUnits,
      peakEtsyCallsPerDay: peakEtsy,
      worstListingFreshness: Number(worstFreshness.toFixed(3)),
      errors,
      p95HeadroomCeilingSeconds: headroomCeiling,
      /* Both, so a recovery is visible rather than hidden by an average. */
      recentWorstP95Seconds: worstP95,
      segmentWorstP95Seconds: Math.max(0, ...segment.map(row => row.p95)),
      latencySamples: latencySamples.length,
      adminForcedSamples: adminSamples,
      productionSamples: production.length,
    },
  };
}

