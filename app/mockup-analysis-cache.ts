import { env } from "cloudflare:workers";

/**
 * THE SAME BYTES ARE NEVER ANALYZED TWICE.
 *
 * Identity is the content, not the URL:
 *
 *   user_id + source_image_hash + operation + configuration_version + model_version
 *
 * A URL is where a picture was found, not what it is. The same mockup
 * re-uploaded, renamed, or served from a new CDN path is the same work, and
 * keying on the address would pay for it again each time.
 *
 * Print-area detection and segmentation are separate operations on the same
 * bytes, so they cache separately and neither can satisfy the other.
 */
export const PRINT_AREA_CONFIG_VERSION = 1;
export const SEGMENTATION_CONFIG_VERSION = 1;

export type Operation = "print-area" | "segmentation";

export async function ensureMockupAnalysisTable() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS mockup_analysis_cache (
    user_id TEXT NOT NULL,
    source_image_hash TEXT NOT NULL,
    operation TEXT NOT NULL,
    configuration_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'running',
    payload_json TEXT,
    lease_expires INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, source_image_hash, operation, configuration_version, model_version))`).run();
}

export async function hashBytes(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export type Claim =
  | { hit: true; payload: unknown }
  | { hit: false; claimed: true }
  | { hit: false; claimed: false; because: "another request is already running this" };

const LEASE_SECONDS = 180;

/**
 * Claim the work, or discover somebody already has it.
 *
 * Two identical requests arriving together must produce ONE provider job.
 * The insert is the lock: whoever writes the row runs the call, and the
 * other waits for the result rather than buying a second copy of it.
 *
 * A lease expiry covers a worker that died mid-call, so one crash cannot
 * block that mockup forever.
 */
export async function claimAnalysis(
  { userId, imageHash, operation, configurationVersion, modelVersion }:
  { userId: string; imageHash: string; operation: Operation;
    configurationVersion: number; modelVersion: string },
): Promise<Claim> {
  await ensureMockupAnalysisTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);

  const existing = await db.prepare(
    `SELECT state, payload_json, lease_expires FROM mockup_analysis_cache
      WHERE user_id = ? AND source_image_hash = ? AND operation = ?
        AND configuration_version = ? AND model_version = ?`)
    .bind(userId, imageHash, operation, configurationVersion, modelVersion)
    .first<{ state: string; payload_json: string | null; lease_expires: number }>();

  if (existing?.state === "ready" && existing.payload_json) {
    try { return { hit: true, payload: JSON.parse(existing.payload_json) }; }
    catch { /* a corrupt row is re-run below */ }
  }
  if (existing?.state === "running" && existing.lease_expires > now)
    return { hit: false, claimed: false, because: "another request is already running this" };

  /* Taking the row - by insert, or by taking over an expired lease - is
     taking the job. Only one caller can succeed. */
  const claim = await db.prepare(
    `INSERT INTO mockup_analysis_cache
       (user_id, source_image_hash, operation, configuration_version, model_version,
        state, lease_expires)
     VALUES (?,?,?,?,?,'running',?)
     ON CONFLICT(user_id, source_image_hash, operation, configuration_version, model_version)
       DO UPDATE SET state = 'running', lease_expires = excluded.lease_expires
       WHERE mockup_analysis_cache.lease_expires <= ?
          OR mockup_analysis_cache.state = 'failed'`)
    .bind(userId, imageHash, operation, configurationVersion, modelVersion,
      now + LEASE_SECONDS, now)
    .run();

  return Number(claim.meta.changes) > 0
    ? { hit: false, claimed: true }
    : { hit: false, claimed: false, because: "another request is already running this" };
}

export async function storeAnalysis(
  key: { userId: string; imageHash: string; operation: Operation;
    configurationVersion: number; modelVersion: string },
  payload: unknown,
) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE mockup_analysis_cache SET state = 'ready', payload_json = ?, lease_expires = 0
      WHERE user_id = ? AND source_image_hash = ? AND operation = ?
        AND configuration_version = ? AND model_version = ?`)
    .bind(JSON.stringify(payload), key.userId, key.imageHash, key.operation,
      key.configurationVersion, key.modelVersion)
    .run();
}

/**
 * A FAILURE NEVER BECOMES A CACHE ENTRY.
 *
 * Storing a failed result would serve the failure back forever without ever
 * paying to find out whether it was transient. The row is marked failed so
 * the next request re-runs it, and the lease is dropped so that can happen
 * immediately.
 */
export async function failAnalysis(
  key: { userId: string; imageHash: string; operation: Operation;
    configurationVersion: number; modelVersion: string },
) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE mockup_analysis_cache SET state = 'failed', payload_json = NULL, lease_expires = 0
      WHERE user_id = ? AND source_image_hash = ? AND operation = ?
        AND configuration_version = ? AND model_version = ?`)
    .bind(key.userId, key.imageHash, key.operation, key.configurationVersion, key.modelVersion)
    .run();
}
