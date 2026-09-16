/**
 * WHAT ACTUALLY INVALIDATES DETECTOR EVIDENCE.
 *
 * The observation gate segmented on BUILD MARKER, which meant a styling
 * change, a copy fix or a Shop Map deploy restarted a 72-hour clock measuring
 * something none of them touch. Worse, it means the gate could never pass
 * after launch: shipping anything at all would reset it, and a product that
 * ships resets it every day.
 *
 * So the segment key is this version, bumped by hand, and ONLY when the
 * meaning of the detector's stored evidence changes. The deploy version is
 * still recorded on every sample for audit — you can always see which build
 * produced a reading — it simply does not decide the window.
 *
 * BUMP THIS WHEN, AND ONLY WHEN, ONE OF THESE CHANGES:
 *   - Shop Sensor behaviour
 *   - listing poller behaviour
 *   - polling cadence
 *   - the correlation algorithm
 *   - the evidence-expiration rule
 *   - the attribution hard-cap rule
 *   - the cohort qualification rule
 *   - a schema change that alters what stored detector evidence MEANS
 *   - monitored-corpus configuration that materially changes capacity testing
 *
 * DO NOT BUMP IT FOR normal production load or unrelated work: a member saving
 * a niche, candidates being added or demoted, a listing qualifying, a UI
 * deploy, Shop Map changes, trademark ingest, or member copy. Candidate
 * additions in particular are the system working, not the system changing.
 */
export const DETECTOR_SEMANTICS_VERSION = 1;

/**
 * The history of this version, so "why did the clock restart" always has an
 * answer that is written down rather than reconstructed from git.
 */
export const SEMANTICS_HISTORY: Array<{ version: number; because: string }> = [
  {
    version: 1,
    because: "Local correlation replaced the triggered Etsy inspector. Shop "
      + "intervals are matched against append-only listing events with a "
      + "20-minute earliest-correlation window and a 6-hour evidence expiry.",
  },
];

/** Samples from before this architecture existed can never count. */
export const RETIRED_ARCHITECTURE_VERSION = 0;

export const semanticsNote = (version: number) =>
  SEMANTICS_HISTORY.find(row => row.version === version)?.because
  ?? "an earlier detector architecture";
