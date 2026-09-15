import { env } from "cloudflare:workers";

/**
 * THE FINANCIAL TABLES.
 *
 * Source rows are immutable except when the source itself confirms a change:
 * an Etsy entry that Etsy later updates gets its updated timestamp and its
 * new amount, and nothing else ever rewrites it. Corrections live beside the
 * source as adjustments, so the imported record and the human judgment about
 * it are always separable.
 *
 * NO BUYER DATA ANYWHERE. Not a name, not an address, not a message. The
 * arithmetic does not need them and storing them would put personal data in a
 * table whose whole purpose is to be summed and displayed.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureFinanceTables() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_ledger (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      receipt_id INTEGER,
      transaction_id INTEGER,
      raw_type TEXT NOT NULL DEFAULT '',
      normalized_type TEXT NOT NULL DEFAULT '',
      bucket TEXT NOT NULL DEFAULT 'neither',
      attribution TEXT NOT NULL DEFAULT 'shop',
      amount_minor INTEGER NOT NULL DEFAULT 0,
      divisor INTEGER NOT NULL DEFAULT 100,
      currency TEXT NOT NULL DEFAULT 'USD',
      source_created_at INTEGER NOT NULL,
      source_updated_at INTEGER,
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, source_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_receipts (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      receipt_id INTEGER NOT NULL,
      subtotal_minor INTEGER NOT NULL DEFAULT 0,
      shipping_minor INTEGER NOT NULL DEFAULT 0,
      tax_minor INTEGER NOT NULL DEFAULT 0,
      seller_discount_minor INTEGER NOT NULL DEFAULT 0,
      marketplace_discount_minor INTEGER NOT NULL DEFAULT 0,
      grand_total_minor INTEGER NOT NULL DEFAULT 0,
      divisor INTEGER NOT NULL DEFAULT 100,
      currency TEXT NOT NULL DEFAULT 'USD',
      canceled INTEGER NOT NULL DEFAULT 0,
      refunded INTEGER NOT NULL DEFAULT 0,
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      match_method TEXT NOT NULL DEFAULT '',
      match_rejection TEXT NOT NULL DEFAULT '',
      safe_for_profit INTEGER NOT NULL DEFAULT 0,
      source_created_at INTEGER NOT NULL,
      source_updated_at INTEGER,
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, receipt_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_production (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      printify_order_id TEXT NOT NULL,
      receipt_id INTEGER,
      printify_product_id TEXT NOT NULL DEFAULT '',
      blueprint_id INTEGER,
      variant_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 0,
      cost_minor INTEGER NOT NULL DEFAULT 0,
      shipping_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT '',
      canceled INTEGER NOT NULL DEFAULT 0,
      refunded INTEGER NOT NULL DEFAULT 0,
      reprint INTEGER NOT NULL DEFAULT 0,
      counts_as_etsy_cost INTEGER NOT NULL DEFAULT 1,
      orphan_kind TEXT NOT NULL DEFAULT '',
      fulfilled_at INTEGER,
      ingested_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, printify_order_id))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_windows (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      window_from INTEGER NOT NULL,
      window_to INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, window_from, window_to))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_sources (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL DEFAULT 0,
      high_water INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, shop_id, source))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_adjustments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      receipt_id INTEGER,
      printify_order_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      estimated INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      reverses TEXT,
      reversed_by TEXT,
      created_at INTEGER NOT NULL)`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_rollups (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      rule_version INTEGER NOT NULL,
      computed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, shop_id, month))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS finance_shop_settings (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      timezone TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, shop_id))`),
  ]);
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS finance_ledger_when
       ON finance_ledger (user_id, shop_id, source_created_at)`).run();
  await db().prepare(
    `CREATE INDEX IF NOT EXISTS finance_production_receipt
       ON finance_production (user_id, shop_id, receipt_id)`).run();
}

export async function shopTimezone(userId: string, shopId: number): Promise<string> {
  const row = await db().prepare(
    `SELECT timezone FROM finance_shop_settings WHERE user_id = ? AND shop_id = ?`)
    .bind(userId, shopId).first<{ timezone: string }>();
  return String(row?.timezone ?? "");
}

export async function setShopTimezone(userId: string, shopId: number, timezone: string) {
  await ensureFinanceTables();
  await db().prepare(
    `INSERT INTO finance_shop_settings (user_id, shop_id, timezone) VALUES (?,?,?)
     ON CONFLICT(user_id, shop_id) DO UPDATE SET timezone = excluded.timezone`)
    .bind(userId, shopId, timezone).run();
}

/** Counters for the owner health view. All from stored rows. */
export async function financialHealth(userId: string, shopId: number) {
  const one = async (sql: string) => {
    try {
      const row = await db().prepare(sql).bind(userId, shopId).first<{ n: number }>();
      return row?.n ?? 0;
    } catch { return 0; }
  };
  const sources = await db().prepare(
    `SELECT source, refreshed_at, last_error FROM finance_sources WHERE user_id = ? AND shop_id = ?`)
    .bind(userId, shopId).all<{ source: string; refreshed_at: number; last_error: string }>()
    .catch(() => ({ results: [] }));
  return {
    receiptsIngested: await one(`SELECT COUNT(*) AS n FROM finance_receipts WHERE user_id = ? AND shop_id = ?`),
    ledgerRowsIngested: await one(`SELECT COUNT(*) AS n FROM finance_ledger WHERE user_id = ? AND shop_id = ?`),
    productionRowsIngested: await one(`SELECT COUNT(*) AS n FROM finance_production WHERE user_id = ? AND shop_id = ?`),
    exactMatches: await one(`SELECT COUNT(*) AS n FROM finance_receipts WHERE user_id = ? AND shop_id = ? AND match_status = 'fully-matched'`),
    partialMatches: await one(`SELECT COUNT(*) AS n FROM finance_receipts WHERE user_id = ? AND shop_id = ? AND match_status = 'partially-matched'`),
    unmatchedReceipts: await one(`SELECT COUNT(*) AS n FROM finance_receipts WHERE user_id = ? AND shop_id = ? AND match_status = 'unmatched'`),
    ambiguousMatches: await one(`SELECT COUNT(*) AS n FROM finance_receipts WHERE user_id = ? AND shop_id = ? AND match_status = 'ambiguous'`),
    unmatchedPrintifyOrders: await one(`SELECT COUNT(*) AS n FROM finance_production WHERE user_id = ? AND shop_id = ? AND receipt_id IS NULL`),
    incompleteWindows: await one(`SELECT COUNT(*) AS n FROM finance_windows WHERE user_id = ? AND shop_id = ? AND state IN ('pending', 'failed')`),
    failedWindows: await one(`SELECT COUNT(*) AS n FROM finance_windows WHERE user_id = ? AND shop_id = ? AND state = 'failed'`),
    adjustments: await one(`SELECT COUNT(*) AS n FROM finance_adjustments WHERE user_id = ? AND shop_id = ? AND reversed_by IS NULL`),
    rollupsStored: await one(`SELECT COUNT(*) AS n FROM finance_rollups WHERE user_id = ? AND shop_id = ?`),
    sources: (sources.results ?? []) as Array<{ source: string; refreshed_at: number; last_error: string }>,
  };
}
