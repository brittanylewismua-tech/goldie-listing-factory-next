import { env } from "cloudflare:workers";

/**
 * Design Scanner's member-owned tables, created at deploy rather than by the
 * first member who presses Scan.
 *
 * The DDL is stated once, here, and the scan route calls this rather than
 * carrying its own copy — two definitions of one table is how a column gets
 * added in one place and missed in the other.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureScannerTables() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS scan_uploads (
      user_id TEXT NOT NULL,
      artwork_hash TEXT NOT NULL,
      version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      provider_cost REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, artwork_hash, version))`),
    db().prepare(`CREATE TABLE IF NOT EXISTS scan_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      artwork_hash TEXT NOT NULL,
      niche TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS scan_history_member ON scan_history (user_id, created_at DESC)`),
    db().prepare(`CREATE TABLE IF NOT EXISTS reference_analysis (
      image_id INTEGER NOT NULL,
      analysis_version INTEGER NOT NULL,
      listing_id INTEGER NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      provider_cost REAL NOT NULL DEFAULT 0,
      analyzed_at INTEGER NOT NULL,
      PRIMARY KEY (image_id, analysis_version))`),
  ]);
}
