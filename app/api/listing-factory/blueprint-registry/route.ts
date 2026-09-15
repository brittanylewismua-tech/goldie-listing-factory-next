import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { productFamily } from "@/app/product-type-utils";
import { classifyBlueprint, MAPPING_VERSION } from "@/app/blueprint-registry";

/**
 * THE REAL SUPPORTED SET.
 *
 * Not a noun list: the blueprint ids actually present in the connected
 * Printify shop. That is where a wrong category would cost a live listing,
 * and it is the only set whose size is a fact rather than a guess.
 *
 * READ ONLY. Enumerates, classifies, and reports. Publishing stays gated on
 * the registry regardless of what this returns.
 */
export const GET = withErrorLog("listing-factory-blueprint-registry", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const pages = Math.min(10, Math.max(1, Number(new URL(request.url).searchParams.get("pages")) || 4));
  const db = (env as unknown as { DB: D1Database }).DB;
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const token = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  const shopId = 1374648;
  const seen = new Map<number, { title: string; products: number }>();
  for (let page = 1; page <= pages; page += 1) {
    const response = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/products.json?limit=50&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (!response?.ok) break;
    const body = await response.json() as
      { data?: Array<{ blueprint_id?: number; title?: string }> };
    const rows = body.data ?? [];
    if (!rows.length) break;
    for (const product of rows) {
      const id = Number(product.blueprint_id ?? 0);
      if (!id) continue;
      const held = seen.get(id) ?? { title: String(product.title ?? ""), products: 0 };
      held.products += 1;
      seen.set(id, held);
    }
    if (rows.length < 50) break;
  }

  /*
    The product title names the design, not the blank, so the blueprint's own
    title is fetched from the catalog. Mapping on a design title would repeat
    the mistake the whole restructure exists to remove.
  */
  const registry = [];
  for (const [blueprintId, held] of seen) {
    const catalog = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${blueprintId}.json`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const blueprint = catalog?.ok
      ? await catalog.json() as { title?: string; brand?: string; model?: string }
      : null;
    const blueprintTitle = String(blueprint?.title ?? "");
    registry.push({
      blueprintId,
      blueprintTitle,
      brand: String(blueprint?.brand ?? ""),
      productsInShop: held.products,
      productFamily: productFamily(blueprintTitle),
      ...classifyBlueprint(blueprintTitle),
      mappingVersion: MAPPING_VERSION,
      verifiedAt: new Date().toISOString(),
    });
  }

  const counts = registry.reduce((into, row) => {
    into[row.status] = (into[row.status] ?? 0) + 1;
    return into;
  }, {} as Record<string, number>);

  return NextResponse.json({
    what: "Blueprint ids actually present in the connected Printify shop.",
    blueprintsFound: registry.length,
    productsScanned: [...seen.values()].reduce((sum, held) => sum + held.products, 0),
    counts,
    registry: registry.sort((a, b) => b.productsInShop - a.productsInShop),
    mappingVersion: MAPPING_VERSION,
    reminder: "Read only. Publishing stays gated on registry status.",
  });
});
