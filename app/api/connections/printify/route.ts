import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "cloudflare:workers";

/**
 * Whether Printify is connected, and which shop it points at.
 *
 * NO TOKEN LEAVES THIS ROUTE. The stored value is encrypted and is never read
 * into the response — the only thing reported is whether a row exists.
 */
export const GET = withErrorLog("connections-printify", async () => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT shop_id AS shopId, shop_name AS shopName, updated_at AS updatedAt,
            encrypted_token <> '' AS live
       FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId)
    .first<{ shopId: number | null; shopName: string | null;
      updatedAt: string | null; live: number }>()
    .catch(() => null);

  if (!row || !row.live) return NextResponse.json({ connected: false });
  const parsed = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
  return NextResponse.json({
    connected: true,
    shopId: row.shopId ?? null,
    shopName: row.shopName ?? "",
    lastSyncAt: Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null,
  });
});
