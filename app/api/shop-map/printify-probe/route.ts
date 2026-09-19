import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "../../../printify-call.ts";

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

  /*
    The same row decrypts fine through /api/printify, so a failure here is a
    difference in how this route reached the secret, not a damaged token.
    Reported rather than thrown, because "could not be decrypted safely" tells
    nobody which of the two it was.
  */
  const secret = (env as unknown as { PRINTIFY_TOKEN_KEY?: string }).PRINTIFY_TOKEN_KEY ?? "";
  let token = "";
  try {
    token = await decryptPrintifyToken(connection.encrypted_token, secret);
  } catch (error) {
    return NextResponse.json({
      step: "decrypt",
      error: error instanceof Error ? error.message : "failed",
      secretPresent: Boolean(secret),
      secretLength: secret.length,
      secretLooksHex: /^[a-f0-9]{64}$/i.test(secret),
      storedParts: String(connection.encrypted_token ?? "").split(".").length,
      storedLength: String(connection.encrypted_token ?? "").length,
    }, { status: 500 });
  }
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };
  const call = async (path: string) => {
    const started = Date.now();
    const response = await printifyCall(`https://api.printify.com/v1${path}`, {
      headers, signal: AbortSignal.timeout(20_000),
    }, { feature: "qa", userId: user.userId });
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

  /*
    SEVERAL ORDERS, NOT ONE.

    The first probe read a single order from whichever shop came back first,
    found no external identifiers, and nearly became a design decision. It was
    reading seven samples in a shop that was not hers. Identifiers have to be
    judged across a run of real orders, and reported as how many of them carry
    each field rather than as a yes or no from one.
  */
  const wanted = Math.min(20, Math.max(1, Number(new URL(request.url).searchParams.get("orders")) || 10));
  const page = await call(`/shops/${shopId}/orders.json?limit=${wanted}`);
  const body = (page.parsed as { data?: Array<Record<string, unknown>>; total?: number; last_page?: number } | null);
  const rows = body?.data ?? [];

  const carrying = (field: string) =>
    rows.filter(row => row[field] !== undefined && row[field] !== null && row[field] !== "").length;

  const orderTypes: Record<string, number> = {};
  for (const row of rows) {
    const kind = String((row.metadata as { order_type?: string } | undefined)?.order_type ?? "unknown");
    orderTypes[kind] = (orderTypes[kind] ?? 0) + 1;
  }

  /* One representative order's shape, with anything personal withheld. */
  const sample = rows.find(row =>
    String((row.metadata as { order_type?: string } | undefined)?.order_type ?? "") !== "sample") ?? rows[0];

  return NextResponse.json({
    shopId,
    orderAccess: {
      status: page.status,
      usable: page.status === 200,
      ms: page.ms,
      totalOrders: body?.total ?? null,
      lastPage: body?.last_page ?? null,
      inspected: rows.length,
      body: page.status === 200 ? undefined : page.parsed ?? page.text,
    },
    orderTypes,
    /* How many of the inspected orders carry each identifier. A field that is
       present on none of them cannot be the basis of the matcher. */
    identifierCoverage: {
      external_id: carrying("external_id"),
      shop_order_id: carrying("shop_order_id"),
      app_order_id: carrying("app_order_id"),
      id: carrying("id"),
      skusOnLineItems: rows.filter(row =>
        (row.line_items as Array<{ metadata?: { sku?: string } }> | undefined)
          ?.some(item => item.metadata?.sku)).length,
    },
    sampleOrderType: sample
      ? (sample.metadata as { order_type?: string } | undefined)?.order_type ?? null : null,
    orderShape: sample ? shapeOf(sample) : null,
  });
});
