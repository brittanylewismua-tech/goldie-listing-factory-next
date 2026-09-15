/**
 * A CAPTURE THAT SURVIVES THE REQUEST THAT ASKED FOR IT.
 *
 * The first version fired the capture without awaiting it, so a publish could
 * return successfully while the worker was torn down mid-fetch and the artwork
 * was never stored. Nothing would report that: the listing published, the
 * seller saw success, and the one piece of evidence that cannot be recreated
 * later was silently gone.
 *
 * So publishing now writes a durable job and returns. A worker on the clock
 * does the fetching, with attempts, backoff, the last error, and a permanent
 * failure state that is visible rather than assumed. Capture still cannot
 * block a publish — it just cannot depend on an untracked promise either.
 */
import { env } from "cloudflare:workers";
import { captureProductArtwork, type CaptureOutcome } from "@/app/artwork-provenance";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Four attempts over roughly half an hour, then it is somebody's problem. */
export const MAX_ATTEMPTS = 4;
const BACKOFF_SECONDS = [30, 120, 600];

export async function ensureCaptureQueue(): Promise<void> {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS artwork_capture_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      printify_shop_id INTEGER NOT NULL,
      printify_product_id TEXT NOT NULL,
      etsy_listing_id INTEGER,
      batch_id TEXT NOT NULL DEFAULT '',
      because TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'queued',
      outcome TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      queued_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    /* One live job per product per reason: a publish retried three times
       should not queue the same capture three times. */
    db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS artwork_capture_jobs_once
      ON artwork_capture_jobs (user_id, printify_product_id, because)`),
    db().prepare(`CREATE INDEX IF NOT EXISTS artwork_capture_jobs_due
      ON artwork_capture_jobs (state, next_attempt_at)`),
  ]);
}

/**
 * Record the intention to capture, durably, before the caller returns.
 *
 * Cheap on purpose — one insert — because it sits inside a publish somebody is
 * waiting on.
 */
export async function queueCapture(
  { userId, shopId, productId, listingId = null, batchId = "", because }:
    {
      userId: string; shopId: number; productId: string;
      listingId?: number | null; batchId?: string; because: string;
    },
): Promise<void> {
  await ensureCaptureQueue();
  await db().prepare(
    `INSERT INTO artwork_capture_jobs
       (user_id, printify_shop_id, printify_product_id, etsy_listing_id, batch_id,
        because, next_attempt_at, queued_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, printify_product_id, because) DO UPDATE SET
       /* A repeat request can teach an existing job the listing id it lacked,
          and revive one that had been parked. */
       etsy_listing_id = COALESCE(artwork_capture_jobs.etsy_listing_id, excluded.etsy_listing_id),
       state = CASE WHEN artwork_capture_jobs.state = 'failed' THEN 'queued'
                    ELSE artwork_capture_jobs.state END,
       attempts = CASE WHEN artwork_capture_jobs.state = 'failed' THEN 0
                       ELSE artwork_capture_jobs.attempts END`)
    .bind(userId, shopId, productId, listingId, batchId, because,
      new Date().toISOString(), new Date().toISOString())
    .run();
}

/** Outcomes that will never succeed on a retry. */
const FINAL: CaptureOutcome[] = ["no-print-image", "too-large", "already-held", "captured"];

export type QueuePass = {
  taken: number; captured: number; alreadyHeld: number;
  retrying: number; failed: number; skipped: number; ms: number;
};

export async function runCaptureQueue({ maxJobs = 12 } = {}): Promise<QueuePass> {
  await ensureCaptureQueue();
  const started = Date.now();
  const pass: QueuePass = {
    taken: 0, captured: 0, alreadyHeld: 0, retrying: 0, failed: 0, skipped: 0, ms: 0,
  };

  const now = new Date().toISOString();
  const due = await db().prepare(
    `SELECT id, user_id, printify_shop_id, printify_product_id, etsy_listing_id,
            batch_id, because, attempts
       FROM artwork_capture_jobs
      WHERE state IN ('queued', 'retrying') AND next_attempt_at <= ?
      ORDER BY queued_at ASC LIMIT ?`).bind(now, maxJobs)
    .all<{
      id: number; user_id: string; printify_shop_id: number; printify_product_id: string;
      etsy_listing_id: number | null; batch_id: string; because: string; attempts: number;
    }>();

  /* One token read per member, not per job. */
  const tokens = new Map<string, string | null>();
  const tokenFor = async (userId: string) => {
    if (tokens.has(userId)) return tokens.get(userId) ?? null;
    const row = await db()
      .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
      .bind(userId).first<{ encrypted_token: string }>();
    const token = row
      ? await decryptPrintifyToken(
        row.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY)
        .catch(() => null)
      : null;
    tokens.set(userId, token);
    return token;
  };

  for (const job of due.results ?? []) {
    pass.taken += 1;
    const token = await tokenFor(job.user_id);
    if (!token) {
      await db().prepare(
        `UPDATE artwork_capture_jobs SET state = 'failed', last_error = 'No Printify connection',
                completed_at = ? WHERE id = ?`).bind(new Date().toISOString(), job.id).run();
      pass.failed += 1;
      continue;
    }

    const result = await captureProductArtwork({
      userId: job.user_id, shopId: job.printify_shop_id,
      productId: job.printify_product_id, token, because: job.because,
      batchId: job.batch_id, listingId: job.etsy_listing_id,
    });

    const attempts = job.attempts + 1;
    const settled = FINAL.includes(result.outcome);
    if (settled) {
      await db().prepare(
        `UPDATE artwork_capture_jobs
            SET state = 'done', outcome = ?, attempts = ?, last_error = ?, completed_at = ?
          WHERE id = ?`)
        .bind(result.outcome, attempts, result.note ?? "", new Date().toISOString(), job.id).run();
      if (result.outcome === "captured") pass.captured += 1;
      else if (result.outcome === "already-held") pass.alreadyHeld += 1;
      else pass.skipped += 1;
      continue;
    }

    if (attempts >= MAX_ATTEMPTS) {
      /*
        Parked, loudly. A permanently failed capture is a design Goldie will
        never be able to prove anything about, so it stays visible in the
        health view rather than disappearing from the queue.
      */
      await db().prepare(
        `UPDATE artwork_capture_jobs
            SET state = 'failed', outcome = ?, attempts = ?, last_error = ?, completed_at = ?
          WHERE id = ?`)
        .bind(result.outcome, attempts, result.note ?? "", new Date().toISOString(), job.id).run();
      pass.failed += 1;
      continue;
    }

    const wait = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
    await db().prepare(
      `UPDATE artwork_capture_jobs
          SET state = 'retrying', outcome = ?, attempts = ?, last_error = ?, next_attempt_at = ?
        WHERE id = ?`)
      .bind(result.outcome, attempts, result.note ?? "",
        new Date(Date.now() + wait * 1000).toISOString(), job.id).run();
    pass.retrying += 1;
  }

  pass.ms = Date.now() - started;
  return pass;
}

/**
 * NOTHING PUBLISHED MAY LEAVE THE EVIDENCE PIPELINE.
 *
 * The queue is durable once a row exists, but the insert that creates it can
 * fail — and its failure is deliberately swallowed so a publish never breaks.
 * That leaves one gap: a listing published successfully with no job and no
 * capture, invisible forever.
 *
 * So the publish record itself is the source of truth. Anything Goldie
 * published that has neither a completed capture nor a live job is adopted
 * into the queue here. A swallowed error becomes a delay rather than a hole.
 */
export async function adoptPublishedWithoutCapture({ limit = 200 } = {}): Promise<number> {
  await ensureCaptureQueue();
  const result = await db().prepare(
    `INSERT INTO artwork_capture_jobs
       (user_id, printify_shop_id, printify_product_id, etsy_listing_id, because,
        next_attempt_at, queued_at)
     SELECT links.user_id,
            COALESCE((SELECT shop_id FROM etsy_connections c
                       WHERE c.user_id = links.user_id AND c.is_active = 1), 0),
            links.printify_product_id,
            links.etsy_listing_id,
            'reconciled-published-without-capture',
            ?, ?
       FROM etsy_listing_links links
      WHERE links.etsy_listing_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM artwork_provenance p
           WHERE p.user_id = links.user_id
             AND p.printify_product_id = links.printify_product_id)
        AND NOT EXISTS (
          SELECT 1 FROM artwork_capture_jobs j
           WHERE j.user_id = links.user_id
             AND j.printify_product_id = links.printify_product_id
             AND j.state IN ('queued', 'retrying', 'done'))
      LIMIT ?
     ON CONFLICT(user_id, printify_product_id, because) DO NOTHING`)
    .bind(new Date().toISOString(), new Date().toISOString(), limit)
    .run();
  return Number(result.meta?.changes ?? 0);
}

/** What the queue is doing, and what it has given up on. */
export async function captureQueueHealth(): Promise<Record<string, unknown>> {
  await ensureCaptureQueue();
  const states = await db().prepare(
    `SELECT state, COUNT(*) AS n FROM artwork_capture_jobs GROUP BY state`)
    .all<{ state: string; n: number }>();
  const outcomes = await db().prepare(
    `SELECT outcome, COUNT(*) AS n FROM artwork_capture_jobs
      WHERE outcome <> '' GROUP BY outcome ORDER BY n DESC`)
    .all<{ outcome: string; n: number }>();
  const stuck = await db().prepare(
    `SELECT printify_product_id, last_error, attempts FROM artwork_capture_jobs
      WHERE state = 'failed' ORDER BY completed_at DESC LIMIT 8`).all();
  /*
    The figure that would have hidden the gap: published listings with nothing
    holding their design. It is computed from the publish records rather than
    from the queue, because a queue that lost a row cannot report its own loss.
  */
  const orphans = await db().prepare(
    `SELECT COUNT(*) AS n,
            MIN(links.updated_at) AS oldest
       FROM etsy_listing_links links
      WHERE links.etsy_listing_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM artwork_provenance p
           WHERE p.user_id = links.user_id
             AND p.printify_product_id = links.printify_product_id)`)
    .first<{ n: number; oldest: string | null }>().catch(() => null);
  const withoutJob = await db().prepare(
    `SELECT COUNT(*) AS n FROM etsy_listing_links links
      WHERE links.etsy_listing_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM artwork_provenance p
           WHERE p.user_id = links.user_id
             AND p.printify_product_id = links.printify_product_id)
        AND NOT EXISTS (
          SELECT 1 FROM artwork_capture_jobs j
           WHERE j.user_id = links.user_id
             AND j.printify_product_id = links.printify_product_id)`)
    .first<{ n: number }>().catch(() => null);
  const byState = Object.fromEntries(
    (states.results ?? []).map(row => [row.state, Number(row.n)]));

  return {
    byState,
    byOutcome: Object.fromEntries((outcomes.results ?? []).map(row => [row.outcome, Number(row.n)])),
    publishedWithoutCapture: Number(orphans?.n ?? 0),
    missingCaptureJob: Number(withoutJob?.n ?? 0),
    captureBacklog: Number(byState.queued ?? 0) + Number(byState.retrying ?? 0),
    oldestMissingSince: orphans?.oldest ?? null,
    /* The alert that matters: artwork Goldie tried and failed to keep. */
    permanentlyMissing: stuck.results ?? [],
  };
}
