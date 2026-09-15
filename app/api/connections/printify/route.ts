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
  /* A failed lookup is reported, never rendered as "not connected". */
  let failed = "";
  /*
    THE TABLE HAS THREE COLUMNS: user_id, encrypted_token, updated_at.

    A first version of this asked for shop_id and shop_name as well. They do
    not exist, D1 threw, the catch below returned null, and the connections
    screen told a member with a working Printify account that Printify was not
    connected. That is the fourth query in this sweep to name a column its
    table does not have, so the live schema is now reported by the capability
    registry and a test compares this SELECT against it.

    The mapped Printify shop lives on the artwork/provenance side rather than
    on the connection, so it is read from there when it is known.
  */
  const row = await db.prepare(
    `SELECT updated_at AS updatedAt, encrypted_token <> '' AS live
       FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId)
    .first<{ updatedAt: string | null; live: number }>()
    .catch(error => {
      failed = error instanceof Error ? error.message : "lookup failed";
      return null;
    });

  if (failed) return NextResponse.json({ connected: null, error: failed }, { status: 500 });
  if (!row || !row.live) return NextResponse.json({ connected: false });

  const shop = await db.prepare(
    `SELECT printify_shop_id AS shopId FROM artwork_provenance
      WHERE user_id = ? AND printify_shop_id IS NOT NULL
      ORDER BY id DESC LIMIT 1`)
    .bind(user.userId).first<{ shopId: number | null }>().catch(() => null);

  const parsed = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
  return NextResponse.json({
    connected: true,
    shopId: shop?.shopId ?? null,
    shopName: "",
    lastSyncAt: Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null,
  });
});
