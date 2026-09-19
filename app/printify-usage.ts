/**
 * WHAT THE PRINTIFY LEDGER CAN HONESTLY SAY.
 *
 * Two rules, and the second matters more than the first:
 *
 *   1. Report what was recorded — by feature, by endpoint category, by status
 *      class, with retries counted apart from first attempts.
 *   2. Report the moment measurement began, and refuse to imply anything about
 *      what came before it. Every call Printify served before this shipped is
 *      unmeasured, not zero, and a reader who cannot tell those apart will
 *      draw a false conclusion from a true table.
 */
export type PrintifyUsage = {
  measuring: boolean;
  measuringSince: number | null;
  windowFrom: number;
  /* The window starts at whichever is later: the requested window, or the
     moment the meter existed. Anything earlier is not a zero. */
  effectiveFrom: number;
  calls: number;
  retries: number;
  byFeature: Array<{ feature: string; calls: number }>;
  byCategory: Array<{ category: string; calls: number }>;
  byStatus: Array<{ status: string; calls: number }>;
  before: "unmeasured";
  note: string;
};

export async function printifyUsage(db: D1Database, from: number): Promise<PrintifyUsage> {
  const start = await db.prepare(
    `SELECT started_at AS startedAt FROM printify_meter_start WHERE id = 1`)
    .first<{ startedAt: number }>().catch(() => null);
  const since = Number(start?.startedAt) || null;
  const effectiveFrom = since ? Math.max(from, since) : from;

  const group = async (column: string) => {
    const rows = await db.prepare(
      `SELECT ${column} AS key, COUNT(*) AS calls FROM printify_api_calls
        WHERE at >= ? GROUP BY ${column} ORDER BY calls DESC`)
      .bind(effectiveFrom).all<{ key: string; calls: number }>().catch(() => ({ results: [] }));
    return (rows.results ?? []).map(row => ({ key: String(row.key), calls: Number(row.calls) || 0 }));
  };

  const totals = await db.prepare(
    `SELECT COUNT(*) AS calls, SUM(CASE WHEN attempt > 1 THEN 1 ELSE 0 END) AS retries
       FROM printify_api_calls WHERE at >= ?`)
    .bind(effectiveFrom).first<{ calls: number; retries: number }>().catch(() => null);

  const [features, categories, statuses] = await Promise.all([
    group("feature"), group("category"),
    /* The status class, not the status: 200 and 201 answer the same question
       and a table of individual codes hides the one that matters. */
    group("CASE WHEN status = 0 THEN 'no-response' ELSE (status / 100) || 'xx' END"),
  ]);

  return {
    measuring: Boolean(since),
    measuringSince: since,
    windowFrom: from,
    effectiveFrom,
    calls: Number(totals?.calls) || 0,
    retries: Number(totals?.retries) || 0,
    byFeature: features.map(row => ({ feature: row.key, calls: row.calls })),
    byCategory: categories.map(row => ({ category: row.key, calls: row.calls })),
    byStatus: statuses.map(row => ({ status: row.key, calls: row.calls })),
    before: "unmeasured",
    note: since
      ? "Printify calls made before measurement began are unmeasured, not zero."
      : "Printify metering has not recorded its first call yet.",
  };
}
