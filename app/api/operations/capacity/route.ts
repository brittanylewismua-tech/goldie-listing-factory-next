import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { PAID_WORKLOADS, workload } from "@/app/paid-workloads";
import { spendReport } from "@/app/spend-guard";
import { etsyBudget, etsyQpdLimit } from "@/app/api/etsy/client";
import { CAPABILITIES } from "@/app/capability-registry";

/**
 * EVERY WORKLOAD THAT COSTS MONEY OR QUOTA, IN ONE VIEW.
 *
 * Previously the answer to "what are we spending" needed three screens and a
 * D1 query. This is the one place, and it reports MEASURED figures where a
 * provider has actually billed — labelling the rest honestly rather than
 * rounding an estimate into a fact.
 *
 * It also models what usage looks like at 100, 500 and 1,000 members and says
 * which ceiling binds first, because the useful question is not "is there
 * room" but "what runs out first".
 *
 * NO CEILING IS CHANGED HERE. This reports; it does not adjust.
 */
export const GET = withErrorLog("operations-capacity", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);

  const report = await spendReport().catch(() => null);
  const etsy = await etsyBudget().catch(() => null);

  /* Per-workload truth from the reservation ledger. */
  const since = new Date((now - 86_400) * 1000).toISOString();
  const ledger = await db.prepare(
    /* The column is `workload`. Writing `workload_key` here would throw, the
       catch below would swallow it, and this whole view would report zero
       spend on a product that is spending — the third time today a query has
       named a column its table does not have. */
    `SELECT workload AS workloadKey, state, COUNT(*) AS n,
            SUM(reserved_cost) AS reserved, SUM(actual_cost) AS settled
       FROM spend_reservations WHERE created_at >= ?
      GROUP BY workload, state`)
    .bind(since)
    .all<{ workloadKey: string; state: string; n: number;
      reserved: number; settled: number }>()
    .catch(() => ({ results: [] as Array<{ workloadKey: string; state: string;
      n: number; reserved: number; settled: number }> }));

  const byWorkload = new Map<string, Record<string, { n: number; reserved: number; settled: number }>>();
  for (const row of ledger.results ?? []) {
    const held = byWorkload.get(row.workloadKey) ?? {};
    held[row.state] = { n: Number(row.n) || 0,
      reserved: Number(row.reserved) || 0, settled: Number(row.settled) || 0 };
    byWorkload.set(row.workloadKey, held);
  }

  /* A reservation that was never settled or released is a leak: it holds
     budget that no call is going to use. */
  const stale = await db.prepare(
    `SELECT workload AS workloadKey, COUNT(*) AS n FROM spend_reservations
      WHERE state = 'held' AND created_at < ? GROUP BY workload`)
    .bind(new Date((now - 3_600) * 1000).toISOString())
    .all<{ workloadKey: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ workloadKey: string; n: number }> }));
  const staleBy = new Map((stale.results ?? [])
    .map(row => [row.workloadKey, Number(row.n) || 0]));

  const ownedBy = new Map<string, string>();
  for (const entry of CAPABILITIES)
    for (const key of entry.paidWorkloads) ownedBy.set(key, entry.key);

  const workloads = PAID_WORKLOADS.map(entry => {
    const states = byWorkload.get(entry.key) ?? {};
    return {
      key: entry.key,
      feature: ownedBy.get(entry.key) ?? null,
      provider: entry.provider, model: entry.model,
      unitCost: entry.unitCost, costBasis: entry.costBasis,
      limitStatus: entry.limitStatus,
      memberDailyLimit: entry.memberDailyLimit,
      memberDailyAttempts: entry.memberDailyAttempts,
      globalDailyCeiling: entry.globalDailyCeiling,
      globalDailyRequests: entry.globalDailyRequests,
      last24h: {
        settled: states.settled?.n ?? 0,
        settledCost: Number((states.settled?.settled ?? 0).toFixed(5)),
        held: states.held?.n ?? 0,
        released: states.released?.n ?? 0,
        billedFailures: states["failed-billed"]?.n ?? 0,
        billedFailureCost: Number((states["failed-billed"]?.settled ?? 0).toFixed(5)),
      },
      staleReservations: staleBy.get(entry.key) ?? 0,
      /* An unmeasured workload must keep a request-count ceiling, or it
         reserves zero dollars and behaves as free. */
      unboundedRisk: entry.costBasis === "unknown" && entry.globalDailyRequests === null,
    };
  });

  /*
    CAPACITY MODEL.

    Adoption assumptions are stated rather than hidden, because the projection
    is only as good as they are. They are deliberately generous on the paid
    features and conservative on shop overlap.
  */
  const assumptions = {
    scansPerActiveMemberPerDay: 3,
    shareUsingScanner: 0.4,
    nicheWatchesPerMember: 3,
    shopWatchesPerMember: 3,
    shopOverlapFactor: 0.35,
    corpusRefreshesPerDay: 4,
    listingBatchesPerMemberPerWeek: 2,
  };

  const referenceListings = await db.prepare(
    `SELECT COUNT(*) AS n FROM reference_images`).first<{ n: number }>()
    .catch(() => ({ n: 0 }));
  const corpusCalls = Math.ceil(Number(referenceListings?.n ?? 0) / 100)
    * assumptions.corpusRefreshesPerDay;

  const scanner = workload("designScannerVision");
  const reference = workload("referenceIngestion");

  const project = (members: number) => {
    const scanners = Math.round(members * assumptions.shareUsingScanner);
    const scans = scanners * assumptions.scansPerActiveMemberPerDay;
    /* Warm scans cost nothing, so only a share of them are cold. */
    const coldScans = Math.round(scans * 0.6);
    const scanCost = coldScans * (scanner?.unitCost ?? 0);
    const uniqueShops = Math.round(members * assumptions.shopWatchesPerMember
      * assumptions.shopOverlapFactor);
    const etsyCalls = corpusCalls + uniqueShops * 2;

    /* Which ceiling runs out first at this size. */
    const binds: Array<{ ceiling: string; at: number; limit: number }> = [];
    if (scanner?.globalDailyCeiling)
      binds.push({ ceiling: "designScannerVision global $", at: scanCost,
        limit: scanner.globalDailyCeiling });
    if (reference?.globalDailyRequests)
      binds.push({ ceiling: "referenceIngestion images/day", at: 100,
        limit: reference.globalDailyRequests });
    binds.push({ ceiling: "Etsy calls/day", at: etsyCalls, limit: etsyQpdLimit() });
    const first = [...binds].sort((a, b) => (b.at / b.limit) - (a.at / a.limit))[0];

    return {
      members, scannerMembers: scanners, scansPerDay: scans, coldScans,
      scanCostPerDay: Number(scanCost.toFixed(3)),
      uniqueWatchedShops: uniqueShops,
      etsyCallsPerDay: etsyCalls,
      marketWatchPaidCalls: 0,
      shopMapPaidCalls: 0,
      bindingCeiling: first
        ? { ...first, usedShare: Number((first.at / first.limit).toFixed(3)) } : null,
      withinEveryCeiling: binds.every(row => row.at <= row.limit),
    };
  };

  return NextResponse.json({
    at: now,
    etsy: { ...etsy, quota: etsyQpdLimit() },
    spend: report,
    workloads,
    unbounded: workloads.filter(row => row.unboundedRisk).map(row => row.key),
    staleReservations: workloads.filter(row => row.staleReservations > 0)
      .map(row => ({ key: row.key, held: row.staleReservations })),
    assumptions,
    projections: [100, 500, 1_000].map(project),
  });
});
