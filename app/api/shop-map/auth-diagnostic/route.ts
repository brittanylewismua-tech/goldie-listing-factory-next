import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyConnection } from "@/app/api/etsy/client";
import { ensureScopeColumn } from "@/app/shop-map-auth";

/**
 * WHY DOES SHOP MAP STILL THINK IT CANNOT READ SALES?
 *
 * The capability check answers yes or no, which is the right answer for a
 * page and the wrong one for diagnosing a grant that should have worked. This
 * shows the three things that decide it: which Etsy shops are connected and
 * which is active, what scopes each connection recorded, and exactly what
 * Etsy says when the receipts endpoint is actually called.
 *
 * It reads one receipt's worth of metadata at most, and reports no buyer
 * fields — only the status, and the count Etsy reports.
 */
export const GET = withErrorLog("shop-map-auth-diagnostic", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureScopeColumn();
  const db = (env as unknown as { DB: D1Database }).DB;
  const rows = await db
    .prepare(
      `SELECT shop_id, shop_name, is_active, scopes, scopes_checked_at, updated_at
         FROM etsy_connections WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC`)
    .bind(user.userId)
    .all<{
      shop_id: number; shop_name: string; is_active: number;
      scopes: string | null; scopes_checked_at: string | null; updated_at: string;
    }>();

  let receipts: Record<string, unknown> = { attempted: false };
  try {
    const connection = await etsyConnection(user.userId);
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${connection.shopId}/receipts?limit=1`,
      {
        headers: {
          "x-api-key": (env as unknown as { ETSY_API_KEY: string }).ETSY_API_KEY,
          authorization: `Bearer ${connection.token}`,
        },
        signal: AbortSignal.timeout(15_000),
      });
    const text = await response.text();
    let parsed: { count?: number; error?: string } | null = null;
    try { parsed = JSON.parse(text) as { count?: number; error?: string }; } catch { /* below */ }
    receipts = {
      attempted: true,
      shopId: connection.shopId,
      status: response.status,
      /* The count only. Receipts carry buyer names and addresses and none of
         them are read here. */
      count: parsed?.count ?? null,
      /* Etsy's own words when it refuses, which is what names the missing
         scope. */
      message: response.ok ? null : (parsed?.error ?? text.slice(0, 200)),
    };
  } catch (error) {
    receipts = { attempted: true, error: error instanceof Error ? error.message : "failed" };
  }

  return NextResponse.json({
    connections: (rows.results ?? []).map(row => ({
      shopId: Number(row.shop_id),
      shopName: row.shop_name,
      active: row.is_active === 1,
      recordedScopes: row.scopes,
      scopesCheckedAt: row.scopes_checked_at,
      updatedAt: row.updated_at,
    })),
    receipts,
  });
});
