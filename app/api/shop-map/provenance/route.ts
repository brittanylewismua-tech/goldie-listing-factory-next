import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { captureProductArtwork, provenanceHealth } from "@/app/artwork-provenance";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

/**
 * WHAT GOLDIE CAN NOW PROVE ABOUT A DESIGN.
 *
 * Reports how much artwork has been preserved, and — with ?backfill=1 — takes
 * a copy of every product that still exists in a connected Printify shop.
 * That backfill is a one-way door in the useful direction: a product captured
 * today survives the seller deleting it tomorrow, which is precisely what did
 * not happen for the history already lost.
 */
export const GET = withErrorLog("shop-map-provenance", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const health = await provenanceHealth(user.userId);
  if (!parameters.get("backfill")) return NextResponse.json(health);

  const shopId = Number(parameters.get("printify")) || 1374648;
  const limit = Math.min(60, Math.max(1, Number(parameters.get("limit")) || 25));

  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const token = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  /* Everything the shop still holds. A product that is already gone cannot be
     captured, and saying so is the honest half of this answer. */
  const products: Array<{ id?: string }> = [];
  for (let page = 1; page <= 6 && products.length < limit; page += 1) {
    const response = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/products.json?limit=50&page=${page}`,
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000),
      });
    if (!response.ok) break;
    const body = await response.json() as { data?: Array<{ id?: string }>; last_page?: number };
    products.push(...(body.data ?? []));
    if (!body.data?.length || page >= Number(body.last_page ?? 1)) break;
  }

  const captures = [];
  for (const product of products.slice(0, limit)) {
    if (!product.id) continue;
    captures.push(await captureProductArtwork({
      userId: user.userId, shopId, productId: String(product.id), token,
      because: "connected-shop-backfill",
    }));
  }

  return NextResponse.json({
    before: health,
    productsFound: products.length,
    captured: captures.filter(row => row.captured).length,
    skipped: captures.filter(row => !row.captured).map(row => ({ productId: row.productId, note: row.note })).slice(0, 8),
    after: await provenanceHealth(user.userId),
  });
});
