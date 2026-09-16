import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";

/**
 * TWO REPORTS CANNOT BOTH BE TRUE.
 *
 * Earlier production work proved 23 Printify orders, 22 exact receipt matches
 * through `metadata.shop_order_id`, and $336.09 of exact production cost. The
 * new cost-correction route reports an empty reconciliation window and no
 * Printify production rows at all.
 *
 * Rather than guess which is wrong, this reads every candidate source and
 * reports what each one actually contains, scoped and unscoped, so the
 * disagreement resolves into a fact.
 *
 * NO TOKEN IS READ OR RETURNED. Connection state is a boolean from SQL.
 */
export const maxDuration = 120;

export const GET = withErrorLog("shop-map-printify-audit", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const ask = async <T>(sql: string, ...args: unknown[]) =>
    db.prepare(sql).bind(...args).all<T>()
      .catch(error => ({ results: [] as T[],
        error: error instanceof Error ? error.message : "failed" }));

  /* Which tables exist at all — a replaced table is one of the hypotheses. */
  const tables = await ask<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND (name LIKE '%printify%' OR name LIKE '%production%'
            OR name LIKE '%finance%' OR name LIKE '%reconcil%')
      ORDER BY name`);

  /* Who the member is, from the connection rows. */
  const etsy = await ask<{ shopId: number; shopName: string; active: number; live: number }>(
    `SELECT shop_id AS shopId, shop_name AS shopName, is_active AS active,
            encrypted_access_token <> '' AS live
       FROM etsy_connections WHERE user_id = ?`, user.userId);
  const printify = await ask<{ live: number; updatedAt: string }>(
    `SELECT encrypted_token <> '' AS live, updated_at AS updatedAt
       FROM printify_connections WHERE user_id = ?`, user.userId);

  /*
    finance_production, BOTH WAYS.

    Scoped to this member, and unscoped — because "the data was written under
    another connection" is one of the explanations, and only an unscoped count
    can tell it apart from "the data was never written".
  */
  const mine = await ask<{ n: number; shops: number; oldest: number; newest: number;
    cost: number; withReceipt: number }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT shop_id) AS shops,
            MIN(COALESCE(fulfilled_at, ingested_at)) AS oldest,
            MAX(COALESCE(fulfilled_at, ingested_at)) AS newest,
            COALESCE(SUM(cost_minor + shipping_minor), 0) AS cost,
            SUM(CASE WHEN receipt_id IS NOT NULL AND receipt_id > 0 THEN 1 ELSE 0 END) AS withReceipt
       FROM finance_production WHERE user_id = ?`, user.userId);
  const everyone = await ask<{ n: number; users: number; shops: number }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users,
            COUNT(DISTINCT shop_id) AS shops FROM finance_production`);
  const byUser = await ask<{ userId: string; n: number; shops: number }>(
    `SELECT user_id AS userId, COUNT(*) AS n, COUNT(DISTINCT shop_id) AS shops
       FROM finance_production GROUP BY user_id`);

  const receipts = await ask<{ n: number; shops: number; oldest: number; newest: number;
    matched: number }>(
    /* Receipts DO have source_created_at; production does not. The two tables
       spell their timestamps differently and a blanket replacement crossed
       them over. */
    `SELECT COUNT(*) AS n, COUNT(DISTINCT shop_id) AS shops,
            MIN(source_created_at) AS oldest, MAX(source_created_at) AS newest,
            SUM(CASE WHEN match_status = 'matched' THEN 1 ELSE 0 END) AS matched
       FROM finance_receipts WHERE user_id = ?`, user.userId);

  /* The reconciliation window rows — "never created" is a hypothesis. */
  const windows = await ask<{ n: number; kinds: string }>(
    `SELECT COUNT(*) AS n, GROUP_CONCAT(DISTINCT state) AS kinds
       FROM finance_windows WHERE user_id = ?`, user.userId);
  const sources = await ask<{ source: string; refreshedAt: number; highWater: number }>(
    `SELECT source, refreshed_at AS refreshedAt, high_water AS highWater,
            last_error AS lastError
       FROM finance_sources WHERE user_id = ?`, user.userId);

  /* Any older table that might still hold the 23 orders. */
  const legacy: Record<string, unknown> = {};
  for (const candidate of ["printify_orders", "shop_map_production",
    "printify_order_links", "finance_production_v1"]) {
    if (!(tables.results ?? []).some(row => row.name === candidate)) continue;
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${candidate}`)
      .first<{ n: number }>().catch(() => null);
    legacy[candidate] = Number(row?.n ?? 0);
  }

  return NextResponse.json({
    member: user.userId,
    tablesPresent: (tables.results ?? []).map(row => row.name),
    etsyConnections: etsy.results ?? [],
    printifyConnected: Boolean((printify.results ?? [])[0]?.live),
    financeProduction: {
      /* If this is 0 and `everyone` is not, the rows belong to another
         user id — a scoping failure rather than missing data. */
      mine: (mine.results ?? [])[0] ?? null,
      everyone: (everyone.results ?? [])[0] ?? null,
      byUser: byUser.results ?? [],
    },
    financeReceipts: (receipts.results ?? [])[0] ?? null,
    reconciliationWindows: (windows.results ?? [])[0] ?? null,
    ingestionSources: sources.results ?? [],
    legacyTables: legacy,
    errors: [tables, etsy, printify, mine, everyone, receipts, windows, sources]
      .map(result => (result as { error?: string }).error)
      .filter(Boolean),
  });
});
