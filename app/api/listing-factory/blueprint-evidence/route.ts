import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { productFamily } from "@/app/product-type-utils";
import { productFactsFor } from "@/app/product-facts";
import { printifyCall } from "../../../printify-call.ts";

/**
 * WHAT THE RECORD ACTUALLY SHOWS.
 *
 * The mapping table is only worth the evidence under it, so this looks for
 * that evidence rather than assuming it. It reads ONE account - the caller's
 * own batches - and never another member's publishing history.
 *
 * A blueprint id is accepted only when a stored Printify product id still
 * resolves to a live product that names it. A blueprint guessed from a
 * similar title is not evidence; it is the same title-matching this work
 * exists to replace, wearing a number.
 *
 * READ ONLY. Nothing is published, drafted, or written.
 */
const UNSUPPORTED_TITLE_CLASSES = [
  "sunglass", "tattoo", "keychain", "key chain", "pin", "patch", "magnet",
  "coaster", "napkin", "balloon", "garland", "backdrop", "candle",
  "invitation", "veil", "fan", "sash", "banner", "tapestry", "decor",
];

/*
  WHOLE WORDS ONLY.

  A substring match reported 1,066 enamel-pin sightings that were all the
  colour "Light Pink", and two sunglasses that were something else. Evidence
  gathered that way would have produced a mapping table for products this
  account has never sold.
*/
const classOf = (title: string) => {
  const words = title.toLocaleLowerCase().split(/[^a-z]+/).filter(Boolean);
  const joined = ` ${words.join(" ")} `;
  return UNSUPPORTED_TITLE_CLASSES.find(name => joined.includes(` ${name} `)) ?? "";
};

export const GET = withErrorLog("listing-factory-blueprint-evidence", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  /* The caller's own batches. Never a scan across members. */
  const batches = await db.prepare(
    `SELECT id, product_title, state_json, created_at
       FROM listing_batches WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500`)
    .bind(user.userId)
    .all<{ id: string; product_title: string; state_json: string; created_at: string }>();

  type Sighting = {
    titleClass: string; productTitle: string; printifyProductId: string;
    etsyListingId: string; family: string; when: string;
  };
  const sightings: Sighting[] = [];
  const everyTitle = new Set<string>();

  for (const batch of batches.results ?? []) {
    let state: Record<string, unknown> = {};
    try { state = JSON.parse(batch.state_json || "{}") as Record<string, unknown>; }
    catch { /* an unreadable row is not evidence */ }
    /* Titles and ids can sit at several depths; walk rather than guess. */
    const titles: string[] = [];
    const productIds = new Set<string>();
    const listingIds = new Set<string>();
    const walk = (value: unknown, depth = 0) => {
      if (depth > 6 || !value) return;
      if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
      if (typeof value !== "object") return;
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (typeof item === "string" || typeof item === "number") {
          const text = String(item);
          if (/title|name|blueprint/i.test(key) && text.length > 2 && text.length < 160) titles.push(text);
          if (/^(printify_?product_?id|productId)$/i.test(key)) productIds.add(text);
          if (/listing_?id/i.test(key) && /^\d{6,}$/.test(text)) listingIds.add(text);
        } else walk(item, depth + 1);
      }
    };
    walk(state);
    if (batch.product_title) titles.push(batch.product_title);

    for (const title of titles) {
      everyTitle.add(title);
      const titleClass = classOf(title);
      if (!titleClass) continue;
      sightings.push({
        titleClass, productTitle: title,
        printifyProductId: [...productIds][0] ?? "",
        etsyListingId: [...listingIds][0] ?? "",
        family: productFamily(title), when: batch.created_at,
      });
    }
  }

  /* Resolve blueprint ids only where a stored product id still exists. */
  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  const token = stored
    ? await decryptPrintifyToken(
        stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY)
    : "";

  const resolved: Array<{
    titleClass: string; printifyProductId: string; blueprintId: number | null;
    blueprintTitleSnapshot: string; evidence: string;
  }> = [];
  const shopId = 1374648;
  for (const sighting of sightings.slice(0, 40)) {
    if (!token || !sighting.printifyProductId) {
      resolved.push({ titleClass: sighting.titleClass,
        printifyProductId: sighting.printifyProductId, blueprintId: null,
        blueprintTitleSnapshot: sighting.productTitle,
        evidence: "historicalEvidence: unavailable - no stored Printify product id" });
      continue;
    }
    const response = await printifyCall(
      `https://api.printify.com/v1/shops/${shopId}/products/${sighting.printifyProductId}.json`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000) },
      { feature: "qa", userId: user.userId }).catch(() => null);
    if (!response?.ok) {
      resolved.push({ titleClass: sighting.titleClass,
        printifyProductId: sighting.printifyProductId, blueprintId: null,
        blueprintTitleSnapshot: sighting.productTitle,
        evidence: `historicalEvidence: unavailable - product ${response ? response.status : "unreachable"}` });
      continue;
    }
    const product = await response.json() as { blueprint_id?: number; title?: string };
    resolved.push({
      titleClass: sighting.titleClass, printifyProductId: sighting.printifyProductId,
      blueprintId: Number(product.blueprint_id ?? 0) || null,
      blueprintTitleSnapshot: String(product.title ?? sighting.productTitle),
      evidence: product.blueprint_id
        ? "exact - live Printify product names this blueprint"
        : "historicalEvidence: unavailable - product carries no blueprint id",
    });
  }

  const byClass: Record<string, { sightings: number; exactBlueprintIds: number[] }> = {};
  for (const sighting of sightings) {
    const held = byClass[sighting.titleClass] ?? { sightings: 0, exactBlueprintIds: [] };
    held.sightings += 1;
    byClass[sighting.titleClass] = held;
  }
  for (const row of resolved)
    if (row.blueprintId && byClass[row.titleClass]
        && !byClass[row.titleClass].exactBlueprintIds.includes(row.blueprintId))
      byClass[row.titleClass].exactBlueprintIds.push(row.blueprintId);

  return NextResponse.json({
    what: "Historical evidence for the unsupported product types, from this account only.",
    batchesRead: (batches.results ?? []).length,
    distinctTitlesSeen: everyTitle.size,
    sightingsOfUnsupportedClasses: sightings.length,
    byClass,
    resolved,
    /* Everything Listing Factory has actually handled, so the supported set
       can be checked against reality rather than against the noun list. */
    supportedFamiliesSeen: [...new Set([...everyTitle]
      .map(title => productFamily(title)).filter(Boolean))],
    unmappedTitlesSeen: [...everyTitle]
      .filter(title => !productFactsFor(title).mapped).slice(0, 60),
    reminder: "Read only. One account. No blueprint inferred from a similar title.",
  });
});
