import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

/**
 * CAN THE CONNECTION WE ALREADY HAVE READ ORDERS?
 *
 * Printify's personal access tokens carry scopes, and the connection was made
 * for publishing products. Whether it can also read orders decides whether
 * Shop Map needs a second credential from every member — which is a real cost
 * in signups — or whether the existing one already covers it.
 *
 * Asked of the live API rather than the documentation, and reported with the
 * shape of what came back: which identifiers exist for matching an Etsy
 * receipt to a Printify order, and whether line-item costs are present.
 *
 * NOTHING PERSONAL IS REPORTED. Orders carry buyer names and addresses; this
 * reports field names, types and counts, never values from those fields.
 */
const PERSONAL = new Set([
  "address_to", "first_name", "last_name", "email", "phone",
  "address1", "address2", "city", "zip", "region", "company",
]);

/** Field names and types only, with anything personal reduced to "present". */
const shapeOf = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value))
    return value.length ? [shapeOf(value[0], depth + 1)] : [];
  if (typeof value !== "object") return typeof value;
  if (depth > 3) return "object";
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) =>
      [key, PERSONAL.has(key) ? "present (not read)" : shapeOf(inner, depth + 1)]));
};

export const GET = withErrorLog("shop-map-printify-probe", async (request: Request) => {
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
    const started = Date.now();
    const response = await fetch(`https://api.printify.com/v1${path}`, {
      headers, signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* reported as text below */ }
    return { path, status: response.status, ms: Date.now() - started, parsed, text: parsed ? "" : text.slice(0, 300) };
  };

  const shops = await call("/shops.json");
  const shopId = Number(new URL(request.url).searchParams.get("shop"))
    || Number((shops.parsed as Array<{ id?: number }> | null)?.[0]?.id ?? 0);
  if (!shopId)
    return NextResponse.json({ shops: { status: shops.status, body: shops.parsed ?? shops.text } });

  /* One page, one order. Enough to answer the question and nothing more. */
  const firstPage = await call(`/shops/${shopId}/orders.json?limit=1`);
  const orders = (firstPage.parsed as { data?: unknown[]; last_page?: number; total?: number } | null);
  const sample = (orders?.data ?? [])[0] as Record<string, unknown> | undefined;

  return NextResponse.json({
    shopId,
    orderAccess: {
      status: firstPage.status,
      /* 401 or 403 means Shop Map needs a wider Printify credential; 200
         means the connection we already have is enough. */
      usable: firstPage.status === 200,
      ms: firstPage.ms,
      totalOrders: orders?.total ?? null,
      lastPage: orders?.last_page ?? null,
      body: firstPage.status === 200 ? undefined : firstPage.parsed ?? firstPage.text,
    },
    /* The identifiers reconciliation depends on, reported as present or not. */
    matchIdentifiers: sample ? {
      id: typeof sample.id,
      external_id: typeof sample.external_id,
      shop_order_id: typeof sample.shop_order_id,
      metadata: shapeOf(sample.metadata),
      created_at: typeof sample.created_at,
      status: typeof sample.status,
    } : null,
    orderShape: sample ? shapeOf(sample) : null,
  });
});
