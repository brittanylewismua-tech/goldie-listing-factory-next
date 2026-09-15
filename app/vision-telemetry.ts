import { env } from "cloudflare:workers";
import { costOf, CEILING_PER_SCAN, type Usage } from "@/app/vision-extraction";

/**
 * EVERY PROVIDER CALL IS RECORDED BEFORE ITS RESULT IS USED.
 *
 * A cost model is a prediction. This is the measurement, and the two are
 * allowed to disagree — which is the point of keeping it. The circuit breaker
 * reads these rows, so the ceiling is enforced by what was actually billed
 * rather than by what the estimate said would be billed.
 */
export async function ensureVisionTables() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS vision_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL,
      model TEXT NOT NULL,
      batched INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      billed_cost REAL NOT NULL DEFAULT 0,
      milliseconds INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 1,
      valid_json INTEGER NOT NULL DEFAULT 0,
      failure TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS vision_breaker (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tripped INTEGER NOT NULL DEFAULT 0,
      because TEXT NOT NULL DEFAULT '',
      tripped_at TEXT)`),
  ]);
  await db.prepare(`CREATE INDEX IF NOT EXISTS vision_calls_when ON vision_calls (created_at)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS vision_calls_who ON vision_calls (user_id, created_at)`).run();
}

export async function recordVisionCall(entry: {
  userId: string; purpose: string; model: string; batched?: boolean;
  usage: Usage; milliseconds: number; attempts: number; validJson: boolean; failure?: string;
}) {
  await ensureVisionTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `INSERT INTO vision_calls
       (user_id, purpose, model, batched, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, billed_cost, milliseconds, attempts, valid_json, failure)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      entry.userId, entry.purpose, entry.model, entry.batched ? 1 : 0,
      entry.usage.input_tokens ?? 0, entry.usage.output_tokens ?? 0,
      entry.usage.cache_read_input_tokens ?? 0, entry.usage.cache_creation_input_tokens ?? 0,
      costOf(entry.usage, { batch: entry.batched }), entry.milliseconds, entry.attempts,
      entry.validJson ? 1 : 0, entry.failure ?? "")
    .run();
}

/**
 * THE BREAKER TRIPS ON MEASURED AVERAGE SCAN COST, NOT ON A SINGLE CALL.
 *
 * One expensive scan is noise — an unusually wordy design, a retry. A rising
 * average across a day's scans is the thing that turns a penny feature into a
 * dollar feature, and it is the only signal worth stopping the product for.
 *
 * Reference ingestion is excluded: it is a once-per-image cost amortized
 * across every member, so counting it against a per-scan ceiling would trip
 * the breaker for doing exactly what it is supposed to do.
 */
export async function scanCostHealth({ window = 200 }: { window?: number } = {}) {
  await ensureVisionTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const recent = await db.prepare(
    `SELECT billed_cost, valid_json, attempts FROM vision_calls
      WHERE purpose = 'scan' ORDER BY id DESC LIMIT ?`)
    .bind(window).all<{ billed_cost: number; valid_json: number; attempts: number }>();
  const rows = recent.results ?? [];
  const scans = rows.length;
  const spend = rows.reduce((sum, row) => sum + row.billed_cost, 0);
  const average = scans ? spend / scans : 0;
  return {
    scans,
    averageScanCost: Number(average.toFixed(6)),
    maximumScanCost: scans ? Number(Math.max(...rows.map(row => row.billed_cost)).toFixed(6)) : 0,
    invalidJson: rows.filter(row => !row.valid_json).length,
    retries: rows.filter(row => row.attempts > 1).length,
    ceiling: CEILING_PER_SCAN,
    /* A handful of scans cannot establish an average worth acting on. */
    overCeiling: scans >= 20 && average > CEILING_PER_SCAN,
  };
}

export async function breakerState(): Promise<{ tripped: boolean; because: string }> {
  await ensureVisionTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(`SELECT tripped, because FROM vision_breaker WHERE id = 1`)
    .first<{ tripped: number; because: string }>();
  return { tripped: Boolean(row?.tripped), because: row?.because ?? "" };
}

export async function tripBreaker(because: string) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `INSERT INTO vision_breaker (id, tripped, because, tripped_at)
     VALUES (1, 1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET tripped = 1, because = excluded.because,
       tripped_at = CURRENT_TIMESTAMP`)
    .bind(because).run();
}

/**
 * Call before spending anything on a member's scan. A tripped breaker stops
 * the paid path; it does not stop the free deterministic work, so a member
 * still gets a trademark check and thumbnail checks while the cost question
 * is settled.
 */
export async function mayRunPaidScan(): Promise<{ allowed: boolean; because: string }> {
  const state = await breakerState();
  if (state.tripped) return { allowed: false, because: state.because };
  const health = await scanCostHealth();
  if (health.overCeiling) {
    const because = `Measured average scan cost ${health.averageScanCost.toFixed(4)} `
      + `exceeded the ${CEILING_PER_SCAN} ceiling over ${health.scans} scans.`;
    await tripBreaker(because);
    return { allowed: false, because };
  }
  return { allowed: true, because: "" };
}

/** Monthly provider total and per-member spend, for the owner view. */
export async function costSummary() {
  await ensureVisionTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const month = await db.prepare(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(billed_cost), 0) AS spend,
            COALESCE(SUM(CASE WHEN valid_json = 0 THEN 1 ELSE 0 END), 0) AS invalid,
            COALESCE(SUM(CASE WHEN attempts > 1 THEN 1 ELSE 0 END), 0) AS retried
       FROM vision_calls WHERE created_at >= date('now', 'start of month')`)
    .first<{ calls: number; spend: number; invalid: number; retried: number }>();
  const byMember = await db.prepare(
    `SELECT user_id, COUNT(*) AS calls, COALESCE(SUM(billed_cost), 0) AS spend
       FROM vision_calls
      WHERE purpose = 'scan' AND created_at >= date('now', 'start of month')
      GROUP BY user_id ORDER BY spend DESC LIMIT 50`)
    .all<{ user_id: string; calls: number; spend: number }>();
  return {
    month: {
      calls: month?.calls ?? 0,
      spend: Number((month?.spend ?? 0).toFixed(4)),
      invalidJson: month?.invalid ?? 0,
      retried: month?.retried ?? 0,
    },
    byMember: (byMember.results ?? []).map(row => ({
      userId: row.user_id, calls: row.calls, spend: Number(row.spend.toFixed(4)),
    })),
    breaker: await breakerState(),
    health: await scanCostHealth(),
  };
}
