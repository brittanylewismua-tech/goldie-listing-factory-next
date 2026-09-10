export type DraftCreationPhase =
  | "preparing"
  | "staged"
  | "prepared"
  | "queued"
  | "uploaded"
  | "creating"
  | "created"
  | "succeeded";

const PHASE_PERCENT: Record<DraftCreationPhase, number> = {
  preparing: 8,
  staged: 24,
  prepared: 32,
  queued: 40,
  uploaded: 58,
  creating: 76,
  created: 90,
  succeeded: 100,
};

export function laterDraftCreationPhase(current: DraftCreationPhase | undefined, next: DraftCreationPhase) {
  return !current || PHASE_PERCENT[next] > PHASE_PERCENT[current] ? next : current;
}

export function measuredDraftCreationPercent(phases: Record<string, DraftCreationPhase>, total: number) {
  if (total <= 0) return 0;
  const values = Object.values(phases).map((phase) => PHASE_PERCENT[phase]);
  const missing = Math.max(0, total - values.length);
  return Math.min(100, Math.round((values.reduce((sum, value) => sum + value, 0) + missing * 3) / total));
}

/** Printify does not expose byte-level or product-build percentages. Keep a
 * bounded visible estimate moving between verified stages, without ever
 * claiming completion before every result exists. */
export function nextVisibleDraftCreationPercent(current: number, measured: number, complete: boolean) {
  if (complete) return 100;
  const floor = Math.max(3, Math.min(94, measured));
  if (current < floor) return Math.min(floor, current + Math.max(1, Math.ceil((floor - current) / 4)));
  return Math.min(94, floor + 28, current + 1);
}
