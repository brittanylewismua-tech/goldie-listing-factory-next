import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { runtime } from "@/app/mastermind/access";

/**
 * DOES ETSY ACTUALLY GIVE US A SALES COUNT?
 *
 * A second opinion says listings/batch supports `includes=Shop`, that the shop
 * it returns carries `transaction_sold_count` — Etsy's own cumulative sales
 * figure — and that a `currency` parameter will normalise prices. If all three
 * are true, the board can stop inferring sales from stock and start reading
 * them, which would be a straight upgrade.
 *
 * None of that is being taken on faith in either direction. The published
 * OpenAPI document is truncated where these endpoints live, and the last time
 * an API capability was assumed rather than checked it cost a night's work. So
 * this asks Etsy, with real listing ids off our own watch list, and prints
 * exactly what comes back: the field names on the shop object, whether the
 * count is there, and whether the currency parameter changes anything.
 */
export const GET = withErrorLog("stock-probe", async (_request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = runtime().DB!;
  const rows = (await db.prepare(
    "SELECT listing_id FROM sold_watch WHERE favorites > 0 LIMIT 3").all())
    .results as unknown as { listing_id: number }[];
  const ids = rows.map(r => r.listing_id);
  if (!ids.length) return NextResponse.json({ error: "No watched listings yet." }, { status: 503 });

  const ask = async (query: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application/${query}`, {
      headers: { "x-api-key": etsyApiCredential() },
      signal: AbortSignal.timeout(20000),
    });
    await recordEtsyCall(response, "qa");
    const body = await response.text();
    return { status: response.status, body };
  };

  const withShop = await ask(
    `listings/batch?listing_ids=${ids.join(",")}&includes=Shop`);
  const withCurrency = await ask(
    `listings/batch?listing_ids=${ids.join(",")}&includes=Shop&currency=USD`);

  const parse = (raw: { status: number; body: string }) => {
    if (raw.status !== 200) return { status: raw.status, error: raw.body.slice(0, 300) };
    let payload: { results?: Record<string, unknown>[] };
    try { payload = JSON.parse(raw.body); } catch { return { status: raw.status, error: "not json" }; }
    const first = payload.results?.[0] ?? {};
    const shop = (first.shop ?? null) as Record<string, unknown> | null;
    return {
      status: raw.status,
      shopReturned: shop !== null,
      shopFields: shop ? Object.keys(shop).sort() : [],
      transactionSoldCount: shop ? shop.transaction_sold_count ?? null : null,
      price: first.price ?? null,
      quantity: first.quantity ?? null,
    };
  };

  return NextResponse.json({
    askedAbout: ids,
    includesShop: parse(withShop),
    includesShopWithCurrency: parse(withCurrency),
  });
});
