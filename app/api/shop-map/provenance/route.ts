import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { captureProductArtwork, provenanceHealth } from "@/app/artwork-provenance";
import { captureQueueHealth } from "@/app/artwork-capture-queue";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { printifyCall } from "../../../printify-call.ts";

/**
 * WHAT GOLDIE CAN NOW PROVE ABOUT A DESIGN.
 *
 * Reports how much artwork has been preserved and how the capture queue is
 * doing. With ?backfill=1 it walks a connected shop's whole catalogue and
 * gives every product an outcome.
 *
 * EVERY PRODUCT IS ACCOUNTED FOR. The first backfill reported "50 found, 23
 * captured, 2 skipped" and left twenty-five products unexplained — and fifty
 * is suspiciously exactly one page. A product with no recorded outcome is
 * indistinguishable from one that was never tried, which is the shape of a gap
 * nobody notices until the evidence is needed.
 */
export const GET = withErrorLog("shop-map-provenance", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const health = await provenanceHealth(user.userId);
  if (!parameters.get("backfill"))
    return NextResponse.json({ ...health, queue: await captureQueueHealth() });

  const shopId = Number(parameters.get("printify")) || 1374648;

  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const token = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  /* Paged to the end, with what Printify says the total is, so the numbers can
     be checked against something rather than trusted. */
  const products: Array<{ id?: string }> = [];
  let pagesRead = 0;
  let lastPage = 0;
  let reportedTotal = 0;
  for (let page = 1; page <= 20; page += 1) {
    const response = await printifyCall(
      `https://api.printify.com/v1/shops/${shopId}/products.json?limit=50&page=${page}`,
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000),
      }, { feature: "qa", userId: user.userId });
    if (!response.ok) break;
    const body = await response.json() as {
      data?: Array<{ id?: string }>; last_page?: number; total?: number;
    };
    pagesRead += 1;
    lastPage = Number(body.last_page ?? lastPage);
    reportedTotal = Number(body.total ?? reportedTotal);
    products.push(...(body.data ?? []));
    if (!body.data?.length || page >= Number(body.last_page ?? 1)) break;
  }

  const outcomes: Record<string, number> = {};
  const examples: Record<string, Array<{ productId: string; note?: string }>> = {};
  for (const product of products) {
    if (!product.id) {
      outcomes["no-product-id"] = (outcomes["no-product-id"] ?? 0) + 1;
      continue;
    }
    const capture = await captureProductArtwork({
      userId: user.userId, shopId, productId: String(product.id), token,
      because: "connected-shop-backfill",
    });
    outcomes[capture.outcome] = (outcomes[capture.outcome] ?? 0) + 1;
    const held = examples[capture.outcome] ?? [];
    if (held.length < 3) {
      held.push({ productId: capture.productId, note: capture.note });
      examples[capture.outcome] = held;
    }
  }

  const accounted = Object.values(outcomes).reduce((sum, count) => sum + count, 0);

  return NextResponse.json({
    before: health,
    pagination: {
      pageSize: 50,
      pagesRead,
      lastPageReported: lastPage,
      productsReportedByPrintify: reportedTotal,
      productsEvaluated: products.length,
      /* Disagreement here means the backfill did not see the whole catalogue,
         and it says so rather than reporting a total it never reached. */
      sawEverything: reportedTotal === 0 || products.length >= reportedTotal,
    },
    outcomes,
    outcomesAccountFor: accounted,
    unaccountedFor: products.length - accounted,
    examples,
    after: await provenanceHealth(user.userId),
    queue: await captureQueueHealth(),
  });
});
