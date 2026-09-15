import { env } from "cloudflare:workers";
import {
  decide, stillOwns, settleFailure, nextAttemptAt, reopen,
  type Row, type Decision,
} from "@/app/mockup-analysis-policy";

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
    /* Fencing token. A worker finishes only the claim it still owns. */
    generation INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_failure TEXT NOT NULL DEFAULT '',
    reopened_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, source_image_hash, operation, configuration_version, model_version))`).run();
}

export async function hashBytes(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export type Key = {
  userId: string; imageHash: string; operation: Operation;
  configurationVersion: number; modelVersion: string;
};

const bindKey = (key: Key) =>
  [key.userId, key.imageHash, key.operation, key.configurationVersion, key.modelVersion];

const WHERE_KEY = `user_id = ? AND source_image_hash = ? AND operation = ?
        AND configuration_version = ? AND model_version = ?`;

async function readRow(key: Key): Promise<Row | null> {
  await ensureMockupAnalysisTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT state, payload_json, generation, lease_expires, attempts,
            next_attempt_at, last_failure, reopened_by
       FROM mockup_analysis_cache WHERE ${WHERE_KEY}`)
    .bind(...bindKey(key))
    .first<{
      state: string; payload_json: string | null; generation: number;
      lease_expires: number; attempts: number; next_attempt_at: number;
      last_failure: string; reopened_by: string;
    }>();
  if (!row) return null;
  let payload: unknown = null;
  try { payload = row.payload_json ? JSON.parse(row.payload_json) : null; } catch { /* re-run */ }
  return {
    state: row.state as Row["state"], payload, generation: row.generation,
    leaseExpires: row.lease_expires, attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at, lastFailure: row.last_failure,
    reopenedBy: row.reopened_by,
  };
}

/**
 * Decide, then claim atomically.
 *
 * The UPDATE is conditioned on the generation that was read, so of two
 * requests arriving together exactly one wins and the other is told to poll.
 * Nothing here starts a second provider call.
 */
export async function claimAnalysis(key: Key): Promise<Decision> {
  const now = Math.floor(Date.now() / 1000);
  const row = await readRow(key);
  const decision = decide(row, now);
  if (decision.action !== "call") return decision;

  const db = (env as unknown as { DB: D1Database }).DB;
  const claimed = row
    ? await db.prepare(
        `UPDATE mockup_analysis_cache
            SET state = 'running', generation = ?, lease_expires = ?, attempts = ?
          WHERE ${WHERE_KEY} AND generation = ?`)
        .bind(decision.generation, decision.leaseExpires, decision.attempt,
          ...bindKey(key), row.generation).run()
    : await db.prepare(
        `INSERT INTO mockup_analysis_cache
           (user_id, source_image_hash, operation, configuration_version, model_version,
            state, generation, lease_expires, attempts)
         VALUES (?,?,?,?,?,'running',?,?,?)
         ON CONFLICT(user_id, source_image_hash, operation, configuration_version, model_version)
           DO NOTHING`)
        .bind(...bindKey(key), decision.generation, decision.leaseExpires, decision.attempt).run();

  return Number(claimed.meta.changes) > 0
    ? decision
    : { action: "pending", because: "This image is already being analyzed." };
}

/** Store a result, but only while this worker still owns the claim. */
export async function storeAnalysis(key: Key, generation: number, payload: unknown) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const written = await db.prepare(
    `UPDATE mockup_analysis_cache
        SET state = 'ready', payload_json = ?, lease_expires = 0
      WHERE ${WHERE_KEY} AND generation = ?`)
    .bind(JSON.stringify(payload), ...bindKey(key), generation).run();
  /* A late worker whose lease was taken over writes nothing. */
  return Number(written.meta.changes) > 0;
}

/**
 * A FAILURE NEVER BECOMES A CACHE ENTRY, AND NEVER RETRIES IMMEDIATELY.
 *
 * It is spaced by jittered backoff, counted against the attempt ceiling, and
 * becomes a visible terminal state rather than an endless paid loop.
 */
export async function failAnalysis(
  key: Key, generation: number, { billed = 0, because = "" }: { billed?: number; because?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const row = await readRow(key);
  if (!stillOwns(row, generation)) return null;
  const settlement = settleFailure({ attempts: row!.attempts, billed });
  const retryAt = settlement.nextState === "failed" ? nextAttemptAt(row!.attempts, now) : 0;
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE mockup_analysis_cache
        SET state = ?, payload_json = NULL, lease_expires = 0,
            next_attempt_at = ?, last_failure = ?
      WHERE ${WHERE_KEY} AND generation = ?`)
    .bind(settlement.nextState, retryAt, because, ...bindKey(key), generation).run();
  return { ...settlement, retryAt };
}

/** Deliberately reopen a terminal failure. Grants exactly one more attempt. */
export async function reopenAnalysis(key: Key, by: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = await readRow(key);
  if (!row || row.state !== "terminal") return false;
  const next = reopen(row, by, now);
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE mockup_analysis_cache
        SET state = 'failed', attempts = ?, next_attempt_at = ?, reopened_by = ?
      WHERE ${WHERE_KEY} AND generation = ?`)
    .bind(next.attempts, next.nextAttemptAt, by, ...bindKey(key), row.generation).run();
  return true;
}
