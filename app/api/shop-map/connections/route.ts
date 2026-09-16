import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "cloudflare:workers";
import { ensureScopeColumn } from "@/app/shop-map-auth";
import { issueTarget } from "@/app/shop-map-targets";

/**
 * EVERY SHOP THIS MEMBER HAS CONNECTED, AND A LINK FOR EACH.
 *
 * Shop Map is per shop, not per member: a seller with three shops has three
 * sets of numbers. This lists them with each one's sales-permission state and
 * an opaque handle for authorising that specific shop — the handle is issued
 * here, by the server, against a connection it has already confirmed belongs
 * to the caller, so nothing downstream has to trust a shop id from a browser.
 */
export const GET = withErrorLog("shop-map-connections", async () => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  await ensureScopeColumn();
  const db = (env as unknown as { DB: D1Database }).DB;
  const rows = await db
    .prepare(
      `SELECT shop_id, shop_name, is_active, scopes, encrypted_access_token <> '' AS live
         FROM etsy_connections
        WHERE user_id = ? ORDER BY live DESC, is_active DESC, shop_name ASC`)
    .bind(user.userId)
    .all<{ shop_id: number; shop_name: string; is_active: number; scopes: string | null; live: number }>();

  /*
    WHEN EACH SHOP LAST ACTUALLY SYNCED.

    The page said "Last successful sync: not yet" for a shop with 3,155
    ingested receipts, because nothing ever filled the field in. `not yet` is a
    claim, and it was false.
  */
  const synced = await db.prepare(
    `SELECT shop_id AS shopId, MAX(refreshed_at) AS at FROM finance_sources
      WHERE user_id = ? GROUP BY shop_id`)
    .bind(user.userId).all<{ shopId: number; at: number }>()
    .catch(() => ({ results: [] as Array<{ shopId: number; at: number }> }));
  const lastSync = new Map((synced.results ?? [])
    .map(row => [Number(row.shopId), Number(row.at) || 0]));

  const connections = [];
  for (const row of rows.results ?? []) {
    const issued = await issueTarget(user.userId, Number(row.shop_id));
    connections.push({
      shopId: Number(row.shop_id),
      shopName: String(row.shop_name ?? ""),
      /* Which shop the Listing Factory publishes to. Authorising sales access
         does not change it, and this is here so the page can say so. */
      activeForListingFactory: row.is_active === 1,
      canReadSales: Boolean(row.scopes?.split(/\s+/).includes("transactions_r")),
      /* A shop that was disconnected keeps its place in the list so it can be
         reconnected rather than re-added from scratch. */
      needsReconnect: row.live === 0,
      lastSyncAt: lastSync.get(Number(row.shop_id)) ?? null,
      authorizeSalesUrl: issued
        ? `/api/shop-map/connect-sales?for=${encodeURIComponent(issued.handle)}`
        : null,
    });
  }
  return NextResponse.json({ connections });
});
