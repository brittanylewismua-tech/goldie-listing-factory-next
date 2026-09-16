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
  /* Stated here rather than imported, so the gate module stays free of the
     Workers runtime. It mirrors MAX_EVIDENCE_AGE_SECONDS in app/correlation.ts,
     and a test asserts the two agree. */
  maxP95DelaySeconds: 6 * 3_600,
  maxEtsyCallsPerDay: 80_000,
  minListingFreshness: 0.9,
} as const;

export type Sample = {
  at: number; build: string; ruleVersion: number;
  sensorOk: boolean; sweepOk: boolean; correlationOk: boolean;
  eligible: number; correlated: number; expiredNew: number;
  p50: number; p95: number; backlog: number;
  attributedUnits: number; unresolvedUnits: number;
  listingFreshness: number; etsyCalls: number; errors: number;
  cohortsOk: boolean; briefsOk: boolean;
};

/* `recordSample` lives in market-observation.ts, which has the database. A
   copy of it landed here when this module was split out and was caught by the
   import guard: it referenced ensureObservationTables and db(), neither of
   which exists in a module that is deliberately runtime-free. */

export type GateResult = {
  passes: boolean;
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
      failing: ["no observation samples yet"], measured: {} };

  /*
    SEGMENTED BY BUILD AND RULE VERSION.

    Observing 72 hours across three different correlation rules is not 72 hours
    of evidence about any of them. The newest contiguous run on the current
    build and rule version is the only window that counts, and it is never
    backdated onto old-architecture data.
  */
  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const latest = ordered[ordered.length - 1];
  const segment: Sample[] = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const sample = ordered[index];
    if (sample.build !== latest.build || sample.ruleVersion !== latest.ruleVersion) break;
    segment.unshift(sample);
  }

  const startedAt = segment[0]?.at ?? null;
  const hours = startedAt ? (now - startedAt) / 3_600 : 0;

  const totalEligible = segment.reduce((sum, row) => sum + row.eligible, 0);
  const totalCorrelated = segment.reduce((sum, row) => sum + row.correlated, 0);
  const totalExpired = segment.reduce((sum, row) => sum + row.expiredNew, 0);
  const coverage = totalEligible ? totalCorrelated / (totalCorrelated + totalExpired) : null;
  const worstP95 = Math.max(0, ...segment.map(row => row.p95));
  const peakEtsy = Math.max(0, ...segment.map(row => row.etsyCalls));
  const worstFreshness = Math.min(1, ...segment.map(row => row.listingFreshness));
  const errors = segment.reduce((sum, row) => sum + row.errors, 0);

  /* Backlog growth across the segment, not within one sample. */
  const backlogGrowth = segment.length >= 2
    ? segment[segment.length - 1].backlog - segment[0].backlog : 0;

  const failing: string[] = [];
  if (hours < standard.minimumHours)
    failing.push(`${hours.toFixed(1)} of ${standard.minimumHours} hours observed`);
  if (segment.some(row => !row.sensorOk)) failing.push("a sensor pass failed");
  if (segment.some(row => !row.sweepOk)) failing.push("a listing sweep did not complete");
  if (segment.some(row => !row.correlationOk)) failing.push("a correlation pass failed");
  if (coverage !== null && coverage < standard.correlationCoverage)
    failing.push(`${Math.round(coverage * 100)}% of eligible intervals correlated `
      + `before expiry, below ${Math.round(standard.correlationCoverage * 100)}%`);
  if (worstP95 > standard.maxP95DelaySeconds)
    failing.push(`p95 correlation delay reached ${Math.round(worstP95 / 3_600)}h`);
  if (backlogGrowth > 0 && segment.length >= 3)
    failing.push(`backlog grew by ${backlogGrowth} across the observation`);
  if (errors > 0) failing.push(`${errors} errors recorded`);
  if (peakEtsy > standard.maxEtsyCallsPerDay)
    failing.push(`Etsy usage peaked at ${peakEtsy}`);
  if (worstFreshness < standard.minListingFreshness)
    failing.push(`listing freshness fell to ${Math.round(worstFreshness * 100)}%`);
  if (segment.some(row => !row.cohortsOk)) failing.push("cohort recomputation failed");
  if (segment.some(row => !row.briefsOk)) failing.push("a morning brief failed to build");

  return {
    passes: failing.length === 0,
    segmentStartedAt: startedAt,
    hoursObserved: Number(hours.toFixed(2)),
    samples: segment.length,
    failing,
    measured: {
      correlationCoverage: coverage === null ? null : Number(coverage.toFixed(3)),
      worstP95DelaySeconds: worstP95,
      backlogGrowth,
      peakEtsyCallsPerDay: peakEtsy,
      worstListingFreshness: Number(worstFreshness.toFixed(3)),
      errors,
    },
  };
}

