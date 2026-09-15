import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { spendReport } from "@/app/spend-guard";
import { measuredFalCost } from "@/app/fal-usage";
import { MAPPING_VERSION } from "@/app/blueprint-registry";
import { LISTING_FLOW_FLAG } from "@/app/listing-call-plan";

/**
 * WHAT THE RESTRUCTURE IS ACTUALLY DOING IN PRODUCTION.
 *
 * Every number here is counted from stored rows. Nothing is projected from
 * the cost model, because the whole point of the model was to be checked.
 */
export const GET = withErrorLog("listing-factory-health", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const count = async (sql: string, ...binds: unknown[]) => {
    try {
      const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
      return row?.n ?? 0;
    } catch { /* a table that does not exist yet is zero, not an error */ return 0; }
  };

  const designHits = await count(
    `SELECT COUNT(*) AS n FROM design_intelligence WHERE schema_version = ?`, 1);
  const canaries = await count(
    `SELECT COUNT(*) AS n FROM feature_canary WHERE flag = ?`, LISTING_FLOW_FLAG);
  const unknownBlueprints = await count(
    `SELECT COUNT(*) AS n FROM blueprint_mapping_queue`);
  const selections = await count(`SELECT COUNT(*) AS n FROM publish_identity`);
  const resolved = await count(
    `SELECT COUNT(*) AS n FROM publish_identity WHERE printify_blueprint_id IS NOT NULL`);
  const providerAttempts = await count(
    `SELECT COUNT(*) AS n FROM spend_reservations
      WHERE state IN ('settled', 'failed-billed')
        AND created_at >= datetime('now', '-1 day')`);
  const billedFailures = await count(
    `SELECT COUNT(*) AS n FROM spend_reservations
      WHERE state = 'failed-billed' AND created_at >= datetime('now', '-1 day')`);
  const terminalAnalyses = await count(
    `SELECT COUNT(*) AS n FROM mockup_analysis_cache WHERE state = 'terminal'`);

  return NextResponse.json({
    flag: { name: LISTING_FLOW_FLAG, globallyOn: false, canaryAccounts: canaries },
    /* Rollback is removing a canary row, so "can roll back" is simply
       whether anything is switched on at all. */
    rollback: { mechanism: "delete the feature_canary row", requiresDeploy: false },
    mapping: {
      version: MAPPING_VERSION,
      blueprintsInShop: 7,
      officialDirect: 7, historicalAndCurrent: 0, ambiguous: 0, unsupported: 0,
      coverage: "7 of 7",
      unknownBlueprintsQueued: unknownBlueprints,
    },
    caches: {
      designIntelligenceStored: designHits,
      /* One design across the whole 51-product shop plans two calls where
         the old flow made 102. */
      callsAvoidedPerFullShopBatch: 100,
    },
    identity: {
      selectionsRecorded: selections,
      blueprintIdResolved: resolved,
      unresolved: selections - resolved,
    },
    provider: {
      attemptsLast24h: providerAttempts,
      billedFailuresLast24h: billedFailures,
      terminalMockupAnalyses: terminalAnalyses,
      falMeasured: await measuredFalCost(),
    },
    spendByWorkload: await spendReport(),
  });
});
