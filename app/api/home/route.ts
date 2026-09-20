import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { memberUsage } from "@/app/spend-guard";
import { registerSize } from "@/app/trademark-register";
import { watchesFor } from "@/app/niche-watch-store";
import { dayInShopTimezone, isStale } from "@/app/finance-freshness";
import { ensureListingTables } from "@/app/shop-map-listings";

/**
 * STATUS WORTH A MEMBER'S ATTENTION, AND NOTHING ELSE.
 *
 * Every number here is one a seller would act on. Cron activity, queue depth,
 * API usage and health counters are deliberately absent — they belong to the
 * owner view. An empty counter is also absent: "0 drafts" occupies the same
 * space as a real answer and says less than nothing.
 *
 * Each block is computed independently and a failure in one drops that block
 * rather than the page.
 */
export const GET = withErrorLog("home-status", async () => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const owner = isOwner(user);
  const now = Math.floor(Date.now() / 1000);
  const blocks: Record<string, unknown> = {};
  let activeShopId: number | null = null;

  /* The shop's own timezone, so a date on Home reads the same as the same
     date on Shop Map rather than shifting by a day. */
  const timezoneForMember = String((await db.prepare(
    `SELECT timezone FROM etsy_connections
      WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ timezone: string }>()
    .catch(() => null))?.timezone ?? "UTC");

  /* Connections: only mentioned when something needs the member's attention. */
  try {
    const rows = await db.prepare(
      `SELECT shop_id AS shopId, shop_name AS shopName, is_active AS active,
              encrypted_access_token <> '' AS live
         FROM etsy_connections WHERE user_id = ?`)
      .bind(user.userId).all<{ shopId: number; shopName: string; active: number; live: number }>();
    const shops = rows.results ?? [];
    const broken = shops.filter(row => !row.live);
    const active = shops.find(row => row.active === 1) ?? shops.find(row => row.live);
    if (!shops.length) blocks.connections = { needs: "etsy", say: "Connect your Etsy shop to begin." };
    else if (broken.length)
      blocks.connections = { needs: "reconnect",
        say: `${broken.length} shop${broken.length === 1 ? "" : "s"} need reconnecting.`,
        shops: broken.map(row => row.shopName) };
    else if (active) {
      activeShopId = Number(active.shopId);
      blocks.connections = { needs: null, activeShop: active.shopName, connected: true };
    }
  } catch { /* the block is dropped, the page is not */ }

  /* This month, from Shop Map's own rollups. Profit unavailable stays
     unavailable — it is a correct state, not a gap to fill with a zero. */
  try {
    /*
      THE ROLLUP IS A PAYLOAD, NOT A ROW OF COLUMNS.

      This asked for revenue_minor, currency, profit_minor, profit_complete,
      orders and period — none of which exist. `finance_rollups` stores one
      `payload_json` per month. The query threw on every request, the catch
      dropped the block, and Home has never once shown This Month.
    */
    const row = await db.prepare(
      `SELECT payload_json AS payload, month, computed_at AS computedAt
         FROM finance_rollups
        WHERE user_id = ? ORDER BY month DESC LIMIT 1`)
      .bind(user.userId)
      .first<{ payload: string; month: string; computedAt: number }>();
    if (row) {
      /*
        THE NAMES THE ROLLUP ACTUALLY WRITES.

        `revenueMinor`, `orders` and `profitMinor` do not exist in the payload.
        The rollup writes `grossSellerRevenueMinor`, `coverage.receipts` and
        `knownOperatingProfitMinor` — so after the query was fixed, Home still
        rendered "$0.00 from 0 orders" for a month with a $26.49 sale. An
        unexplained zero is worse than a missing block: it looks like an answer.
      */
      const parsed = JSON.parse(row.payload) as {
        grossSellerRevenueMinor?: number; currency?: string;
        coverage?: { receipts?: number };
        knownOperatingProfitMinor?: number | null };
      const profit = parsed.knownOperatingProfitMinor;
      blocks.thisMonth = {
        month: row.month,
        revenueMinor: Number(parsed.grossSellerRevenueMinor) || 0,
        currency: parsed.currency ?? "USD",
        orders: Number(parsed.coverage?.receipts) || 0,
        /* Null unless every completeness condition held. Never zero. */
        profitMinor: profit ?? null,
        profitAvailable: profit !== null && profit !== undefined,
        /*
          THE SAME FIGURE IN TWO PLACES, ONE OF THEM HONEST ABOUT ITS AGE.

          Home reads the rollup; Shop Map computes from the imported sales.
          They agree today, but they are different ages, and only Shop Map
          said so. A rollup is built when the shop is reconciled, not on a
          clock, so this line can be days old and look like a figure computed
          a second ago.
        */
        stale: isStale(Number(row.computedAt ?? 0), Math.floor(Date.now() / 1_000)),
        asOfDay: dayInShopTimezone(Number(row.computedAt ?? 0), timezoneForMember),
      };
    }
  } catch { /* Shop Map may not be set up for this member */ }

  /* The first thing a seller wants to know is which listings customers chose.
     Sales lead when they exist; favourites are the honest fallback for a shop
     without a sale in the last 30 days. */
  try {
    await ensureListingTables();
    const soldSince = now - 30 * 86_400;
    const result = await db.prepare(
      `SELECT l.listing_id AS listingId, l.title, l.image_url AS imageUrl,
              COALESCE(l.favorites, 0) AS favorites,
              COALESCE(SUM(CASE WHEN s.refunded = 0 AND s.sold_at >= ?
                THEN s.quantity ELSE 0 END), 0) AS sales,
              COALESCE(SUM(CASE WHEN s.refunded = 0 AND s.sold_at >= ?
                THEN s.quantity * s.price_minor ELSE 0 END), 0) AS revenueMinor,
              MAX(CASE WHEN s.refunded = 0 AND s.sold_at >= ? THEN s.currency END) AS currency
         FROM shop_map_listings l
         LEFT JOIN shop_map_listing_sales s
           ON s.user_id = l.user_id AND s.shop_id = l.shop_id
          AND s.listing_id = l.listing_id
        WHERE l.user_id = ? AND (? IS NULL OR l.shop_id = ?)
        GROUP BY l.user_id, l.shop_id, l.listing_id
        ORDER BY sales DESC, favorites DESC, l.title ASC
        LIMIT 3`)
      .bind(soldSince, soldSince, soldSince, user.userId, activeShopId, activeShopId)
      .all<{ listingId: number; title: string; imageUrl: string; favorites: number;
        sales: number; revenueMinor: number; currency: string | null }>();
    const listings = (result.results ?? []).map(row => ({
      listingId: Number(row.listingId), title: String(row.title ?? "Untitled listing"),
      imageUrl: String(row.imageUrl ?? ""), favorites: Number(row.favorites ?? 0),
      sales: Number(row.sales ?? 0), revenueMinor: Number(row.revenueMinor ?? 0),
      currency: String(row.currency ?? "USD"),
    }));
    if (listings.length) blocks.topListings = {
      period: "Last 30 days",
      rankedBy: listings.some(listing => listing.sales > 0) ? "sales" : "favorites",
      listings,
    };
  } catch { /* A new shop can still use every tool below. */ }

  /* Watched niches carrying something new since the last brief. */
  try {
    const saved = await watchesFor(user.userId);
    const moved: Array<{ phrase: string; newly: number }> = [];
    for (const watch of saved) {
      const rows = await db.prepare(
        `SELECT payload_json AS payload FROM niche_watch_history
          WHERE niche_key = ? ORDER BY observed_at DESC LIMIT 1`)
        .bind(watch.key).first<{ payload: string }>();
      if (!rows) continue;
      try {
        const parsed = JSON.parse(rows.payload) as { newSinceLastBrief?: number };
        const newly = Number(parsed.newSinceLastBrief ?? 0);
        if (newly > 0) moved.push({ phrase: watch.phrase, newly });
      } catch { /* skip */ }
    }
    if (moved.length) blocks.niches = moved;
  } catch { /* skip */ }

  /* Scans left today. Shown because it is a limit the member can hit. */
  try {
    const usage = await memberUsage(user.userId, "designScannerVision");
    if (usage.remaining !== null)
      blocks.scansLeft = { remaining: usage.remaining, limit: usage.limit };
  } catch { /* skip */ }

  /* Drafts in flight, only when there are some. */
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) AS open FROM publish_identity
        WHERE user_id = ? AND published_at IS NULL`)
      .bind(user.userId).first<{ open: number }>();
    if (Number(row?.open ?? 0) > 0) blocks.factory = { openDrafts: Number(row!.open) };
  } catch { /* skip */ }

  /* The register's loading state, because a member checking a phrase against a
     half-loaded register is getting a partial answer and has a right to know. */
  try {
    const size = await registerSize(db);
    const loading = size.files.some(file =>
      file.state === "waiting" || file.state === "partial");
    blocks.trademark = { marks: size.marks, loading };
  } catch { /* skip */ }

  return NextResponse.json({ blocks, owner, at: now });
});
