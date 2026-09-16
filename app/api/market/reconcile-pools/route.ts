import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { GROWTH, selectRetained, ACTIVE_STATES, type Candidate }
  from "@/app/niche-candidates";

/**
 * BRING EXISTING POOLS DOWN TO THE CAP.
 *
 * Fixing the insertion logic stopped pools growing past 200. It did nothing
 * about the ones already over it: halloween held 359, teacher 353,
 * bachelorette 259. A configured limit that the stored data ignores is not a
 * limit, and the member-facing count was reading those inflated pools.
 *
 * NOTHING IS DELETED. Excess candidates are demoted to `over-cap`, keeping
 * their discovery provenance, their baseline and any qualifying history, so
 * they remain auditable and can return if the pool has room.
 *
 * DETERMINISTIC. Same pool, same outcome, whatever order the rows arrive in —
 * evidence first, then longest-observed, then earliest discovered, then
 * lowest listing id.
 */
export const maxDuration = 300;

export const POST = withErrorLog("market-reconcile-pools", async (request: Request) => {
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const dryRun = new URL(request.url).searchParams.get("apply") !== "1";
  const marks = ACTIVE_STATES.map(() => "?").join(",");

  const niches = await db.prepare(
    `SELECT niche_key AS key, COUNT(*) AS active
       FROM niche_candidates WHERE state IN (${marks})
      GROUP BY niche_key HAVING active > ?`)
    .bind(...ACTIVE_STATES, GROWTH.maxCandidatesPerNiche)
    .all<{ key: string; active: number }>()
    .catch(error => ({ results: [], error: error instanceof Error ? error.message : "failed" }));

  const failure = (niches as { error?: string }).error;
  if (failure) return NextResponse.json({ error: failure }, { status: 500 });

  const report: unknown[] = [];
  let demotedTotal = 0;

  for (const niche of niches.results ?? []) {
    const rows = await db.prepare(
      `SELECT listing_id AS listingId, shop_id AS shopId, state,
              discovered_at AS discoveredAt, baselined_at AS baselinedAt,
              last_qualifying_at AS lastQualifyingAt
         FROM niche_candidates
        WHERE niche_key = ? AND state IN (${marks})`)
      .bind(niche.key, ...ACTIVE_STATES)
      .all<{ listingId: number; shopId: number; state: string;
        discoveredAt: number; baselinedAt: number | null;
        lastQualifyingAt: number | null }>();

    const pool = (rows.results ?? []).map(row => ({
      nicheKey: niche.key, listingId: Number(row.listingId),
      shopId: Number(row.shopId), discoveryQuery: "", searchPage: 0,
      discoveredAt: Number(row.discoveredAt) || 0,
      listingState: "", state: row.state as Candidate["state"],
      baselinedAt: row.baselinedAt === null ? null : Number(row.baselinedAt),
      lastPolledAt: null, priority: 0,
      lastQualifyingAt: row.lastQualifyingAt === null ? null : Number(row.lastQualifyingAt),
      lastAvailabilityCheck: null, removedReason: "",
    })) as Candidate[];

    const { keep, demote } = selectRetained(pool, GROWTH.maxCandidatesPerNiche);

    if (!dryRun && demote.length) {
      const insert = db.prepare(
        `UPDATE niche_candidates
            SET state = 'over-cap',
                removed_reason = 'the niche pool was over its configured limit'
          WHERE niche_key = ? AND listing_id = ?`);
      const statements = demote.map(row => insert.bind(niche.key, row.listingId));
      for (let index = 0; index < statements.length; index += 25)
        await db.batch(statements.slice(index, index + 25));
      demotedTotal += demote.length;
    }

    report.push({
      niche: niche.key,
      activeBefore: pool.length,
      keeping: keep.length,
      demoting: demote.length,
      /* Evidence is never in the demoted set. Asserted, not assumed. */
      evidenceDemoted: demote.filter(row =>
        row.state === "momentum" || row.state === "repeated-momentum"
        || row.lastQualifyingAt).length,
      keepShops: new Set(keep.map(row => row.shopId)).size,
    });
  }

  /* What every pool looks like afterwards, including the ones already inside
     the cap, so the proof covers all seven rather than the ones that moved. */
  const after = await db.prepare(
    `SELECT niche_key AS key,
            SUM(CASE WHEN state IN (${marks}) THEN 1 ELSE 0 END) AS active,
            COUNT(DISTINCT CASE WHEN state IN (${marks}) THEN shop_id END) AS activeShops,
            SUM(CASE WHEN state = 'over-cap' THEN 1 ELSE 0 END) AS overCap,
            COUNT(*) AS total
       FROM niche_candidates GROUP BY niche_key`)
    .bind(...ACTIVE_STATES, ...ACTIVE_STATES)
    .all<{ key: string; active: number; activeShops: number; overCap: number; total: number }>()
    .catch(() => ({ results: [] as Array<{ key: string; active: number;
      activeShops: number; overCap: number; total: number }> }));

  const pools = (after.results ?? []).map(row => ({
    niche: row.key, active: Number(row.active), activeShops: Number(row.activeShops),
    demotedOverCap: Number(row.overCap), totalRetained: Number(row.total),
    withinCap: Number(row.active) <= GROWTH.maxCandidatesPerNiche,
    shopsWithinListings: Number(row.activeShops) <= Number(row.active),
  }));

  return NextResponse.json({
    dryRun, cap: GROWTH.maxCandidatesPerNiche,
    nichesOverCap: (niches.results ?? []).length,
    demoted: demotedTotal,
    deleted: 0,
    report,
    pools,
    /* The two invariants this exists to establish. */
    allWithinCap: pools.every(row => row.withinCap),
    allShopsWithinListings: pools.every(row => row.shopsWithinListings),
  });
});
