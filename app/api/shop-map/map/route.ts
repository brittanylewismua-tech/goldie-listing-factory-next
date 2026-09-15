import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables, performanceFrom } from "@/app/shop-map-listings";
import { buildWorlds, renameWorld, mergeWorlds, type Listing } from "@/app/shop-map-worlds";
import { direction, overbuilt, type WorldPerformance } from "@/app/shop-map-direction";
import { resolveCost, profitState, type CostRule } from "@/app/shop-map-cost-rules";
import { monthWindow, monthOf } from "@/app/finance-month";
import { shopTimezone } from "@/app/finance-store";

/**
 * THE MAP.
 *
 * One month's money, one direction, the worlds, and what needs attention.
 * Everything here is computed from stored rows on every request, so a member
 * correction shows up immediately and nothing is a frozen snapshot.
 *
 * NO PAID CALL. Every grouping and every finding is deterministic.
 */
export const GET = withErrorLog("shop-map-map", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const parameters = new URL(request.url).searchParams;
  const now = Math.floor(Date.now() / 1_000);

  const shopRow = await db.prepare(
    `SELECT shop_id, shop_name FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number; shop_name: string }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);
  const timezone = await shopTimezone(user.userId, shopId) || "America/Los_Angeles";
  const month = parameters.get("month") ?? monthOf(now, timezone) ?? "";
  const window = monthWindow(month, timezone);

  /* ------------------------------------------------------------- listings */
  const listingRows = await db.prepare(
    `SELECT listing_id, title, tags, shop_section, state, created_at, views, favorites,
            product_family
       FROM shop_map_listings WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; title: string; tags: string; shop_section: string;
      state: string; created_at: number | null; views: number | null;
      favorites: number | null; product_family: string }>();
  const rows = listingRows.results ?? [];

  const listings: Listing[] = rows.map(row => ({
    listingId: Number(row.listing_id), title: String(row.title ?? ""),
    tags: (() => { try { return JSON.parse(row.tags || "[]") as string[]; } catch { return []; } })(),
    shopSection: String(row.shop_section ?? ""), productFamily: String(row.product_family ?? ""),
  }));

  /* ---------------------------------------------------------------- sales */
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
    { now, monthFrom: window?.from ?? 0, monthTo: window?.to ?? 0,
      yearFrom: Math.floor(Date.parse(`${month.slice(0, 4)}-01-01T00:00:00Z`) / 1_000) });

  /* --------------------------------------------------------------- worlds */
  const overrideRows = await db.prepare(
    `SELECT listing_id, world_ids FROM shop_map_world_overrides
      WHERE user_id = ? AND shop_id = ? AND reversed_at IS NULL`)
    .bind(user.userId, shopId).all<{ listing_id: number; world_ids: string }>()
    .catch(() => ({ results: [] }));
  const overrides = new Map<number, string[]>();
  for (const row of ((overrideRows.results ?? []) as Array<{ listing_id: number; world_ids: string }>))
    try { overrides.set(Number(row.listing_id), JSON.parse(row.world_ids) as string[]); }
    catch { /* an unreadable override is simply not applied */ }

  let { worlds, assignments } = buildWorlds(listings, { overrides });

  /* Member renames and merges, applied over the automatic grouping. */
  const labelRows = await db.prepare(
    `SELECT world_id, label, merged_into FROM shop_map_world_labels
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).all<{ world_id: string; label: string; merged_into: string }>()
    .catch(() => ({ results: [] }));
  for (const row of ((labelRows.results ?? []) as Array<{ world_id: string; label: string; merged_into: string }>)) {
    if (row.merged_into) worlds = mergeWorlds(worlds, row.merged_into, row.world_id);
    else if (row.label) worlds = renameWorld(worlds, row.world_id, row.label);
  }

  const activeIds = new Set(rows.filter(row => String(row.state) === "active")
    .map(row => Number(row.listing_id)));

  const worldPerformance: WorldPerformance[] = worlds.map(world => {
    const members = world.listingIds.map(id => performance.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const sum = (pick: (row: NonNullable<ReturnType<typeof performance.get>>) => number) =>
      members.reduce((total, row) => total + pick(row), 0);
    return {
      worldId: world.id, label: world.label,
      activeListings: world.listingIds.filter(id => activeIds.has(id)).length,
      orders: sum(row => row.lifetimeOrders), units: sum(row => row.lifetimeUnits),
      revenueMinor: sum(row => row.lifetimeRevenueMinor),
      /* Null until production-cost coverage supports a profit for this world. */
      verifiedProfitMinor: null,
      reviews: 0,
      ordersLast30: sum(row => row.last30Orders), ordersLast90: sum(row => row.last90Orders),
      revenueLast90Minor: sum(row => row.last90RevenueMinor),
      largestOrderMinor: members.reduce((most, row) =>
        Math.max(most, row.largestOrderMinor), 0),
      refundedOrders: sum(row => row.refundedOrders),
    };
  });

  /* --------------------------------------------------------- this month's money */
  const receiptTotals = window ? await db.prepare(
    `SELECT COUNT(*) AS receipts, COALESCE(SUM(subtotal_minor),0) AS subtotal,
            COALESCE(SUM(shipping_minor),0) AS shipping,
            COALESCE(SUM(seller_discount_minor),0) AS discount
       FROM finance_receipts WHERE user_id = ? AND shop_id = ?
         AND source_created_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .first<{ receipts: number; subtotal: number; shipping: number; discount: number }>()
    : null;

  const feeRow = window ? await db.prepare(
    `SELECT COALESCE(SUM(amount_minor),0) AS fees FROM finance_ledger
      WHERE user_id = ? AND shop_id = ? AND bucket = 'cost'
        AND source_created_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to).first<{ fees: number }>() : null;

  const productionRows = window ? await db.prepare(
    `SELECT receipt_id, cost_minor, shipping_minor, canceled, counts_as_etsy_cost
       FROM finance_production WHERE user_id = ? AND shop_id = ?
         AND fulfilled_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .all<{ receipt_id: number | null; cost_minor: number; shipping_minor: number;
      canceled: number; counts_as_etsy_cost: number }>() : { results: [] };

  const ruleRows = await db.prepare(
    `SELECT product_family, cost_minor, shipping_minor, currency, confirmed
       FROM shop_map_cost_rules WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).all<{ product_family: string; cost_minor: number;
      shipping_minor: number; currency: string; confirmed: number }>()
    .catch(() => ({ results: [] }));
  const familyRules = new Map<string, CostRule>();
  for (const row of ((ruleRows.results ?? []) as Array<Record<string, unknown>>))
    familyRules.set(String(row.product_family), {
      productFamily: String(row.product_family), costMinor: Number(row.cost_minor),
      shippingMinor: Number(row.shipping_minor), currency: String(row.currency ?? "USD"),
      confirmedByMember: Boolean(row.confirmed) });

  /* Every receipt in the month needs a cost, matched or not. */
  const monthReceipts = window ? await db.prepare(
    `SELECT receipt_id FROM finance_receipts WHERE user_id = ? AND shop_id = ?
       AND source_created_at BETWEEN ? AND ?`)
    .bind(user.userId, shopId, window.from, window.to)
    .all<{ receipt_id: number }>() : { results: [] };
  const producedBy = new Map<number, { cost: number; shipping: number }>();
  for (const row of ((productionRows.results ?? []) as Array<Record<string, unknown>>))
    if (row.receipt_id && !Number(row.canceled) && Number(row.counts_as_etsy_cost))
      producedBy.set(Number(row.receipt_id),
        { cost: Number(row.cost_minor), shipping: Number(row.shipping_minor) });

  const costs = ((monthReceipts.results ?? []) as Array<{ receipt_id: number }>).map(row => {
    const made = producedBy.get(Number(row.receipt_id));
    return resolveCost({
      receiptId: Number(row.receipt_id), productFamily: "",
      verifiedCostMinor: made ? made.cost : null,
      verifiedShippingMinor: made ? made.shipping : null,
    }, { familyRules });
  });

  const revenue = (receiptTotals?.subtotal ?? 0) + (receiptTotals?.shipping ?? 0)
    - Math.abs(receiptTotals?.discount ?? 0);
  const state = profitState({ grossRevenueMinor: revenue,
    feesMinor: Number(feeRow?.fees ?? 0), costs });

  const found = direction(worldPerformance);
  const unclassified = assignments.filter(row => row.unclassified).length;

  return NextResponse.json({
    shop: { shopId, shopName: shopRow.shop_name, timezone },
    month,
    thisMonth: {
      revenueMinor: revenue,
      etsyFeesMinor: Number(feeRow?.fees ?? 0),
      productionCostMinor: costs.reduce((sum, cost) => sum + cost.costMinor, 0),
      headline: state.headline,
      profitMinor: state.profitMinor,
      accuracy: state.accuracy,
      coverage: { verified: state.verifiedShare, estimated: state.estimatedShare,
        unavailable: state.unavailableShare },
      orders: receiptTotals?.receipts ?? 0,
    },
    pointingHere: found.worldId ? {
      label: found.label, finding: found.finding, reason: found.reason,
    } : { label: "No clear direction yet", finding: found.finding,
      reason: found.reason || "Not enough evidence across the worlds yet." },
    worlds: worldPerformance
      /* A world with no sales AND no active listings is dead weight on a
         phone screen: it cannot be acted on and it pushes down the ones that
         can. It stays in the data, it just is not shown. */
      .filter(world => world.orders > 0 || world.activeListings > 0)
      .sort((a, b) => b.revenueMinor - a.revenueMinor)
      .map(world => ({
        worldId: world.worldId, label: world.label,
        listings: worlds.find(row => row.id === world.worldId)?.listingIds.length ?? 0,
        activeListings: world.activeListings,
        orders: world.orders, units: world.units, revenueMinor: world.revenueMinor,
        recentOrders90: world.ordersLast90,
        evidence: worlds.find(row => row.id === world.worldId)?.evidence ?? "",
      })),
    needsAttention: {
      unclassifiedListings: unclassified,
      missingProductionCosts: costs.filter(cost => cost.confidence === "none").length,
      overbuiltWorlds: overbuilt(worldPerformance),
    },
    counts: { listings: rows.length, worlds: worlds.length,
      listingsWithSales: [...performance.keys()].length },
    paidProviderCost: 0,
  });
});
