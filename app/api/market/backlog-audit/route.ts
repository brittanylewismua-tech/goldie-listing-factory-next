import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { MAX_EVIDENCE_AGE_SECONDS } from "@/app/correlation";

/**
 * WHAT THE FAILED ARCHITECTURE COST, COUNTED RATHER THAN ESTIMATED.
 *
 * The old inspector left 31,694 intervals waiting and a p95 delay of 37
 * hours. Most of that work can never produce evidence — Etsy shows current
 * stock, so a sale unobserved for a day is simply gone.
 *
 * Nothing here deletes anything. The backlog is the record of what happened
 * and it stays. What this does is CLASSIFY it, so that expired work stops
 * being counted as current demand, stops being retried, and stops consuming
 * Etsy calls chasing evidence that no longer exists.
 */
export const maxDuration = 300;

/*
  THE CORRELATION STATE IS CHECKED FIRST.

  The correlation worker sets `inspected_at` so that everything downstream
  keeps working, which meant a correlated interval that matched no listing
  change was being filed as "completed-after-expiry" — a claim about the old
  inspector that was not true of it. A correlated interval with nothing to
  credit is a shop sale no listing change explains, which is a different and
  much less alarming fact.
*/
const CLASSES = `
  CASE
    WHEN i.correlation_state = 'expired' THEN 'expired-before-inspection'
    WHEN i.correlation_state IN ('correlated','conflicted') AND i.resolved_units > 0
      THEN 'correlated-with-evidence'
    WHEN i.correlation_state IN ('correlated','conflicted')
      THEN 'correlated-no-listing-change'
    WHEN i.inspected_at IS NOT NULL AND i.resolved_units > 0 THEN 'inspector-with-evidence'
    WHEN i.inspected_at IS NOT NULL THEN 'inspector-completed-after-expiry'
    WHEN (? - CAST(strftime('%s', REPLACE(i.to_observed,' ','T')) AS INTEGER)) > ? THEN 'expired-before-inspection'
    ELSE 'timely-and-eligible'
  END`;

export const GET = withErrorLog("market-backlog-audit", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);

  const intervals = await db.prepare(
    `SELECT ${CLASSES} AS class, COUNT(*) AS n,
            SUM(i.sold_delta) AS soldUnits,
            SUM(COALESCE(i.resolved_units, 0)) AS attributed
       FROM shop_sales_intervals i
      GROUP BY class ORDER BY n DESC`)
    .bind(now, MAX_EVIDENCE_AGE_SECONDS)
    .all<{ class: string; n: number; soldUnits: number; attributed: number }>()
    .catch(error => ({ results: [], error: error instanceof Error ? error.message : "failed" }));

  const failure = (intervals as { error?: string }).error;
  if (failure) return NextResponse.json({ error: failure }, { status: 500 });

  const jobs = await db.prepare(
    `SELECT state, COUNT(*) AS n FROM inspection_jobs GROUP BY state`)
    .all<{ state: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ state: string; n: number }> }));

  const byClass = new Map((intervals.results ?? []).map(row => [row.class, row]));
  const expired = byClass.get("expired-before-inspection");
  const late = byClass.get("inspector-completed-after-expiry");

  /*
    THE HONEST NUMBER: shop-level sales that were detected and can never be
    attributed to a listing, because nobody looked in time.
  */
  const lostUnits = Number(expired?.soldUnits ?? 0) + Number(late?.soldUnits ?? 0)
    - Number(late?.attributed ?? 0);

  return NextResponse.json({
    at: now,
    maxEvidenceAgeSeconds: MAX_EVIDENCE_AGE_SECONDS,
    intervals: intervals.results ?? [],
    inspectionJobs: jobs.results ?? [],
    signalsLost: {
      intervals: Number(expired?.n ?? 0) + Number(late?.n ?? 0),
      shopLevelUnits: Math.max(0, lostUnits),
      note: "Shop-level sales that were observed but can never be attributed to "
        + "a listing. Etsy shows current stock, not history, so evidence older "
        + "than the useful window is gone rather than delayed.",
    },
    preserved: "Nothing is deleted. Expired work is closed so it stops being "
      + "retried, counted as current demand, or spending Etsy calls.",
  });
});

/** Close every expired interval, once, so the queue stops lying about demand. */
export const POST = withErrorLog("market-backlog-retire", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const cutoff = new Date((now - MAX_EVIDENCE_AGE_SECONDS) * 1000).toISOString();

  /* Marked expired, never deleted, and never re-queued. */
  const closed = await db.prepare(
    `UPDATE shop_sales_intervals
        SET correlated_at = ?, correlation_state = 'expired'
      WHERE correlated_at IS NULL AND inspected_at IS NULL AND to_observed < ?`)
    .bind(now, cutoff).run();

  /* Their inspection jobs are retired with a reason rather than left queued,
     so the inspector cannot pick them up again. */
  const retired = await db.prepare(
    `UPDATE inspection_jobs
        SET state = 'retired', error = 'evidence expired before inspection',
            finished_at = ?
      WHERE state IN ('queued','running')
        AND interval_id IN (SELECT id FROM shop_sales_intervals
                             WHERE correlation_state = 'expired')`)
    .bind(new Date(now * 1000).toISOString()).run();

  return NextResponse.json({
    intervalsClosed: Number(closed.meta?.changes ?? 0),
    jobsRetired: Number(retired.meta?.changes ?? 0),
    deleted: 0,
  });
});
