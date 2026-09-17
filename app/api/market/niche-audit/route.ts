import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { GROWTH } from "@/app/niche-candidates";

/**
 * DOES THE CANDIDATE CORPUS ADD UP?
 *
 * Discovery reports what one run did. This asks whether the pools it writes
 * into are internally consistent, which is a different question and the one
 * that catches arithmetic drift: a cap that only bounds a single batch, a
 * shop count taken from the wrong set, provenance that stopped being written,
 * a listing sitting in a niche twice.
 *
 * Every number here is counted from `niche_candidates` itself rather than
 * accumulated by the code being checked, so the two can disagree — which is
 * the entire point of having it.
 *
 * READ ONLY. Owner only. No writes, no provider calls, no Etsy calls.
 */
export const GET = withErrorLog("market-niche-audit", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const db = (env as unknown as { DB: D1Database }).DB;

  /*
    AN AUDIT THAT CANNOT COMPLETE SAYS SO. IT DOES NOT ANSWER.

    Two versions of this were wrong in the same direction. The first caught
    every query failure into an empty result, so a parameter-count mismatch
    returned no pools and the checks reading those pools reported FALSE — the
    instrument broken, speaking in the voice of a finding. The second
    collected the failures and still returned a 200 with a `trustworthy`
    flag, which is better only if somebody reads the flag.

    There is no partial answer here. Every query is required; if any of them
    fails the whole response is an error, because a reconciliation report
    that is missing a query is not a weaker report — it is not a report.
  */
  class AuditIncomplete extends Error {}
  const ask = async <T>(label: string, sql: string, ...bind: unknown[]) => {
    try { return await db.prepare(sql).bind(...bind).all<T>(); }
    catch (error) {
      throw new AuditIncomplete(
        `${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const one = async <T>(label: string, sql: string, ...bind: unknown[]) => {
    try { return await db.prepare(sql).bind(...bind).first<T>(); }
    catch (error) {
      throw new AuditIncomplete(
        `${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  try {

  /* The watched set is what a cap is a cap ON. */
  const WATCHED = ["awaiting-baseline", "monitoring", "momentum", "repeated-momentum"];
  const marks = WATCHED.map(() => "?").join(",");

  const perNiche = await ask<{
    nicheKey: string; rows: number; listings: number; shops: number;
    watched: number; watchedShops: number;
    missingPhrase: number; missingQuery: number; missingDiscoveredAt: number;
  }>("per-niche",
    `SELECT niche_key AS nicheKey,
            COUNT(*) AS rows,
            COUNT(DISTINCT listing_id) AS listings,
            COUNT(DISTINCT shop_id) AS shops,
            SUM(CASE WHEN state IN (${marks}) THEN 1 ELSE 0 END) AS watched,
            COUNT(DISTINCT CASE WHEN state IN (${marks}) THEN shop_id END) AS watchedShops,
            SUM(CASE WHEN original_phrase IS NULL OR TRIM(original_phrase) = ''
                     THEN 1 ELSE 0 END) AS missingPhrase,
            SUM(CASE WHEN discovery_query IS NULL OR TRIM(discovery_query) = ''
                     THEN 1 ELSE 0 END) AS missingQuery,
            SUM(CASE WHEN discovered_at IS NULL OR discovered_at = 0
                     THEN 1 ELSE 0 END) AS missingDiscoveredAt
       FROM niche_candidates
      GROUP BY niche_key
      ORDER BY niche_key`,
    /* Two uses of `marks` above, so two sets of bindings. The first version
       bound three and the whole query failed. */
    ...WATCHED, ...WATCHED);

  const byState = await ask<{ state: string; n: number }>("by-state",
    `SELECT state, COUNT(*) AS n FROM niche_candidates GROUP BY state ORDER BY state`);

  /*
    A listing in one niche twice. The table's own key should make this
    impossible, so a non-zero answer means the key is not what it is believed
    to be — which is worth asking rather than assuming.
  */
  const duplicates = await ask<{ nicheKey: string; listingId: number; n: number }>("duplicates",
    `SELECT niche_key AS nicheKey, listing_id AS listingId, COUNT(*) AS n
       FROM niche_candidates GROUP BY niche_key, listing_id HAVING COUNT(*) > 1
      LIMIT 20`);

  const totals = await one<{ rows: number; listings: number; shops: number }>("totals",
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT listing_id) AS listings,
            COUNT(DISTINCT shop_id) AS shops FROM niche_candidates`);

  /* The same listing legitimately appears in more than one niche; this says
     how much of the corpus that accounts for, so a listing total that looks
     short against the row total has an explanation rather than a mystery. */
  const shared = await one<{ n: number }>("shared-listings",
    `SELECT COUNT(*) AS n FROM (
       SELECT listing_id FROM niche_candidates
        GROUP BY listing_id HAVING COUNT(DISTINCT niche_key) > 1)`);

  const pools = (perNiche.results ?? []).map(row => ({
    nicheKey: row.nicheKey,
    rows: Number(row.rows) || 0,
    distinctListings: Number(row.listings) || 0,
    distinctShops: Number(row.shops) || 0,
    watched: Number(row.watched) || 0,
    watchedShops: Number(row.watchedShops) || 0,
    /* The cap applies to the watched set. */
    cap: GROWTH.maxCandidatesPerNiche,
    withinCap: (Number(row.watched) || 0) <= GROWTH.maxCandidatesPerNiche,
    provenanceComplete: Number(row.missingPhrase) === 0
      && Number(row.missingQuery) === 0 && Number(row.missingDiscoveredAt) === 0,
    missing: {
      originalPhrase: Number(row.missingPhrase) || 0,
      discoveryQuery: Number(row.missingQuery) || 0,
      discoveredAt: Number(row.missingDiscoveredAt) || 0,
    },
    /* Rows whose listing appears twice under this niche. Should be zero. */
    duplicateListings: (duplicates.results ?? [])
      .filter(dup => dup.nicheKey === row.nicheKey).length,
  }));

  const watchedTotal = pools.reduce((sum, pool) => sum + pool.watched, 0);
  const rowTotal = pools.reduce((sum, pool) => sum + pool.rows, 0);

  return NextResponse.json({
    pools,
    byState: Object.fromEntries((byState.results ?? [])
      .map(row => [row.state, Number(row.n) || 0])),
    totals: {
      rows: Number(totals?.rows ?? 0),
      distinctListings: Number(totals?.listings ?? 0),
      distinctShops: Number(totals?.shops ?? 0),
      listingsInMoreThanOneNiche: Number(shared?.n ?? 0),
    },
    /* The checks, stated as answers rather than left to be worked out. */
    reconciles: {
      poolRowsSumToTotal: rowTotal === Number(totals?.rows ?? -1),
      everyPoolWithinCap: pools.every(pool => pool.withinCap),
      noDuplicateListingsInAnyPool: (duplicates.results ?? []).length === 0,
      provenanceCompleteEverywhere: pools.every(pool => pool.provenanceComplete),
      watchedSumMatchesWatchedStates: watchedTotal === WATCHED
        .reduce((sum, state) => sum + (Object.fromEntries((byState.results ?? [])
          .map(row => [row.state, Number(row.n) || 0]))[state] ?? 0), 0),
    },
    watchedTotal,
    cap: GROWTH.maxCandidatesPerNiche,
  });
  } catch (error) {
    if (error instanceof AuditIncomplete)
      return NextResponse.json({
        error: "This audit could not be completed, so no reconciliation is reported.",
        because: error.message,
      }, { status: 500 });
    throw error;
  }
});
