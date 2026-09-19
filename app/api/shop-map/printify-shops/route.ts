import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "../../../printify-call.ts";

/**
 * WHICH PRINTIFY SHOP IS THE ETSY ONE?
 *
 * The first order probe found seven orders with no external identifiers, which
 * looked like a problem with Printify's data and was more likely a problem
 * with the shop it asked: a Printify account can hold several shops, and a
 * manual or sample shop tells you nothing about how Etsy-channel orders are
 * shaped.
 *
 * NOTHING PERSONAL IS READ. Per shop: identity, channel, how many orders, and
 * when the most recent one was created. No buyer fields are touched.
 */
export const GET = withErrorLog("shop-map-printify-shops", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const connection = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!connection) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });

  const token = await decryptPrintifyToken(
    connection.encrypted_token,
    (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };
  const call = async (path: string) => {
    const response = await printifyCall(`https://api.printify.com/v1${path}`, {
      headers, signal: AbortSignal.timeout(20_000),
    }, { feature: "connections", userId: user.userId });
    if (!response.ok) return { ok: false, status: response.status, body: null as unknown };
    return { ok: true, status: 200, body: await response.json() as unknown };
  };

  const shops = await call("/shops.json");
  const list = (shops.body ?? []) as Array<{ id?: number; title?: string; sales_channel?: string }>;

  const reported = [];
  for (const shop of list) {
    const id = Number(shop.id ?? 0);
    if (!id) continue;
    /* One page, newest first, purely to count and date them. */
    const orders = await call(`/shops/${id}/orders.json?limit=1`);
    const page = (orders.body ?? {}) as { data?: Array<Record<string, unknown>>; total?: number };
    const newest = (page.data ?? [])[0];
    const channel = String(shop.sales_channel ?? "");
    reported.push({
      shopId: id,
      title: String(shop.title ?? ""),
      salesChannel: channel,
      /* Printify names the channel; anything else is a guess, so it is only
         ever reported as an appearance. */
      appearsEtsyConnected: /etsy/i.test(channel) || /etsy/i.test(String(shop.title ?? "")),
      orderCount: page.total ?? null,
      mostRecentOrder: newest ? String(newest.created_at ?? "") : null,
      /* The identifiers reconciliation would use, on THIS shop's newest order. */
      newestOrderIdentifiers: newest ? {
        external_id: typeof newest.external_id,
        shop_order_id: typeof newest.shop_order_id,
        app_order_id: typeof newest.app_order_id,
        orderType: (newest.metadata as { order_type?: string } | undefined)?.order_type ?? null,
      } : null,
    });
  }

  return NextResponse.json({ shops: reported });
});
