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
      `SELECT shop_id, shop_name, is_active, scopes FROM etsy_connections
        WHERE user_id = ? ORDER BY is_active DESC, shop_name ASC`)
    .bind(user.userId)
    .all<{ shop_id: number; shop_name: string; is_active: number; scopes: string | null }>();

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
      authorizeSalesUrl: issued
        ? `/api/shop-map/connect-sales?for=${encodeURIComponent(issued.handle)}`
        : null,
    });
  }
  return NextResponse.json({ connections });
});
