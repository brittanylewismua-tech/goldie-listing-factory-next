import { env } from "cloudflare:workers";

/**
 * WHAT FAL ACTUALLY CHARGED.
 *
 * Never store the artwork, the prompt, the credential, the member's identity
 * or the model's output — only what it cost and how big it was. The point is
 * a bill that can be queried, not a record of what anybody designed.
 */
export async function ensureFalUsageTable() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS fal_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workload TEXT NOT NULL DEFAULT 'listingIntelligenceVision',
    model TEXT NOT NULL,
    cost_usd REAL NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS fal_usage_when ON fal_usage (created_at)`).run();
}

export async function recordFalUsage(
  entry: { model: string; cost: number; inputTokens: number; outputTokens: number; workload?: string },
) {
  await ensureFalUsageTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `INSERT INTO fal_usage (workload, model, cost_usd, input_tokens, output_tokens)
     VALUES (?,?,?,?,?)`)
    .bind(entry.workload ?? "listingIntelligenceVision", entry.model,
      entry.cost, entry.inputTokens, entry.outputTokens)
    .run();
}

/**
 * The measured unit cost, once there is enough of it to mean anything.
 *
 * Reported with its sample size so a mean over three calls is not mistaken
 * for a price. Until this returns a figure, the registry keeps saying the
 * cost is unknown, which is the honest answer.
 */
export async function measuredFalCost(workloadKey = "listingIntelligenceVision") {
  await ensureFalUsageTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS spend,
            COALESCE(AVG(cost_usd), 0) AS mean, COALESCE(MAX(cost_usd), 0) AS worst,
            COALESCE(AVG(input_tokens), 0) AS meanInput,
            COALESCE(AVG(output_tokens), 0) AS meanOutput
       FROM fal_usage WHERE workload = ?`)
    .bind(workloadKey)
    .first<{ calls: number; spend: number; mean: number; worst: number; meanInput: number; meanOutput: number }>();
  const calls = row?.calls ?? 0;
  return {
    calls,
    totalSpend: Number((row?.spend ?? 0).toFixed(4)),
    meanCost: Number((row?.mean ?? 0).toFixed(6)),
    worstCost: Number((row?.worst ?? 0).toFixed(6)),
    meanInputTokens: Math.round(row?.meanInput ?? 0),
    meanOutputTokens: Math.round(row?.meanOutput ?? 0),
    /* Thirty calls is not a lot, but it is enough to stop guessing. */
    enoughToQuote: calls >= 30,
  };
}
