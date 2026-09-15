import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";
import { performanceFrom } from "@/app/shop-map-performance";
import { repeatedPhrases } from "@/app/shop-map-worlds";

/**
 * WHY 132 LISTINGS HAVE NO NICHE.
 *
 * Free: the stored classification rows and the listings themselves already
 * hold the answer. Guessing at the reason would be its own small dishonesty
 * when the record is right there.
 *
 * Ranked by what they actually earned, because a listing carrying $4,000 and
 * no category is a different problem from a draft nobody finished.
 */
export const GET = withErrorLog("shop-map-unclassified", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);
  const now = Math.floor(Date.now() / 1_000);

  const listingRows = await db.prepare(
    `SELECT listing_id, title, tags, shop_section, state FROM shop_map_listings
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; title: string; tags: string; shop_section: string; state: string }>();
  const listings = listingRows.results ?? [];

  const classifiedRows = await db.prepare(
    `SELECT listing_id, primary_niche, confidence FROM shop_map_classifications
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; primary_niche: string; confidence: string }>()
    .catch(() => ({ results: [] }));
  const classified = new Map<number, { niche: string; confidence: string }>();
  for (const row of ((classifiedRows.results ?? []) as Array<Record<string, unknown>>))
    classified.set(Number(row.listing_id), {
      niche: String(row.primary_niche ?? ""), confidence: String(row.confidence ?? "") });

  const saleRows = await db.prepare(
    `SELECT listing_id, quantity, price_minor, sold_at, refunded
       FROM shop_map_listing_sales WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; quantity: number; price_minor: number;
      sold_at: number; refunded: number }>();
  const performance = performanceFrom(
    (saleRows.results ?? []).map(row => ({
      listingId: Number(row.listing_id), quantity: Number(row.quantity),
      priceMinor: Number(row.price_minor), soldAt: Number(row.sold_at),
      refunded: Boolean(row.refunded) })),
    { now, monthFrom: 0, monthTo: now, yearFrom: 0 });

  /*
    The exact reason, read from the record rather than assumed. A listing the
    model never mentioned is a different failure from one whose label was
    thrown out, and they need different fixes.
  */
  const reasons: Record<string, number> = {};
  const unclassified = [];
  for (const row of listings) {
    const listingId = Number(row.listing_id);
    const held = classified.get(listingId);
    if (held?.niche) continue;
    const reason = !held
      ? "model omitted the listing"
      : held.confidence === "low" ? "low confidence"
      : "label rejected by validation";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    const stats = performance.get(listingId);
    unclassified.push({
      listingId, title: String(row.title ?? ""), state: String(row.state ?? ""),
      reason,
      lifetimeRevenueMinor: stats?.lifetimeRevenueMinor ?? 0,
      lifetimeOrders: stats?.lifetimeOrders ?? 0,
      revenueLast90Minor: stats?.last90RevenueMinor ?? 0,
      active: String(row.state ?? "") === "active",
    });
  }

  /* Highest-earning first: that is where the missing map costs something. */
  unclassified.sort((a, b) =>
    b.lifetimeRevenueMinor - a.lifetimeRevenueMinor
    || b.lifetimeOrders - a.lifetimeOrders
    || b.revenueLast90Minor - a.revenueLast90Minor
    || Number(b.active) - Number(a.active));

  /* Repeated wording inside the unclassified set — candidates, not categories. */
  const candidates = repeatedPhrases(unclassified.map(row => ({
    listingId: row.listingId, title: row.title, tags: [], shopSection: "",
    productFamily: "" })), 4).slice(0, 25);

  return NextResponse.json({
    unclassifiedListings: unclassified.length,
    reasons,
    totals: {
      orders: unclassified.reduce((sum, row) => sum + row.lifetimeOrders, 0),
      revenueMinor: unclassified.reduce((sum, row) => sum + row.lifetimeRevenueMinor, 0),
      activeListings: unclassified.filter(row => row.active).length,
    },
    highestEarning: unclassified.slice(0, 25),
    /* Deterministic only. Nothing here is stored as a category. */
    repeatedPhraseCandidates: candidates.map(row => ({
      phrase: row.phrase, listings: row.listingIds.length })),
    reminder: "Read from the stored response and listing data. No provider call.",
  });
});
