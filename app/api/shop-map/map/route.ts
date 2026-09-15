import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables, performanceFrom } from "@/app/shop-map-listings";
import { buildWorlds, renameWorld, mergeWorlds, type Listing } from "@/app/shop-map-worlds";
import { direction, overbuilt, type WorldPerformance } from "@/app/shop-map-direction";
import { guidance, standout } from "@/app/shop-map-guidance";
import { collapseFacets } from "@/app/niche-classifier";
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
  try {
    return await buildMap(request);
  } catch (error) {
    /* Owner-only surface: a generic 500 tells nobody what broke, and this
       route reads a dozen tables that may not all exist yet on a shop. */
    return NextResponse.json({
      error: error instanceof Error ? error.message : "unknown",
      where: error instanceof Error ? String(error.stack ?? "").split("\n")[1] ?? "" : "",
    }, { status: 500 });
  }
});

async function buildMap(request: Request) {
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
  /*
    NO FALLBACK TIMEZONE, EVER.

    A borrowed default silently moves another member's revenue between months
    and they would have no way to see why their totals disagree with Etsy's.
    Without a confirmed timezone for THIS shop, the money section says so and
    the rest of the map - which has no month boundary in it - still works.
  */
  const timezone = await shopTimezone(user.userId, shopId);
  const month = parameters.get("month") ?? (timezone ? monthOf(now, timezone) ?? "" : "");
  const window = timezone ? monthWindow(month, timezone) : null;

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

  /*
    A CLASSIFIER RESULT OUTRANKS THE LEXICON.

    The deterministic pass found two broad niches because it can only see
    words it was taught. Where a build has stored a classification for a
    listing, that is the better answer and is used as the listing's override -
    which keeps every downstream count, correction and merge working exactly
    as before, with no second code path for financial totals.
  */
  const classified = await db.prepare(
    `SELECT listing_id, primary_niche FROM shop_map_classifications
      WHERE user_id = ? AND shop_id = ? AND primary_niche <> ''`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; primary_niche: string }>()
    .catch(() => ({ results: [] }));
  const rawCounts = new Map<string, number>();
  for (const row of ((classified.results ?? []) as Array<Record<string, unknown>>))
    if (String(row.primary_niche ?? ""))
      rawCounts.set(String(row.primary_niche),
        (rawCounts.get(String(row.primary_niche)) ?? 0) + 1);

  /*
    Facets collapse before anything is counted. The stored build returned
    five Feminist categories split by design format and recipient; merging
    them here costs nothing and does not touch the stored response, which
    stays as the record of what the provider actually said.
  */
  const collapse = collapseFacets([...rawCounts.keys()], rawCounts);
  const rename = new Map<string, string>();
  for (const row of collapse.merged) if (row.into) rename.set(row.from, row.into);
  const dropped = new Set(collapse.merged.filter(row => !row.into).map(row => row.from));

  const classifiedNiches = new Set<string>();
  for (const row of ((classified.results ?? []) as Array<Record<string, unknown>>)) {
    const listingId = Number(row.listing_id);
    const stored = String(row.primary_niche ?? "");
    if (!stored || overrides.has(listingId)) continue;
    /* A dropped category leaves its listings unclassified, which is honest. */
    if (dropped.has(stored)) continue;
    const label = rename.get(stored) ?? stored;
    classifiedNiches.add(label);
    overrides.set(listingId, [`niche:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`]);
  }

  let { worlds, assignments } = buildWorlds(listings, { overrides, classifiedNiches });

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

  /* ------------------------------------------------------- review evidence */
  /*
    Reviews are joined by exact listing id. A review says somebody reviewed:
    it is never a sale and never a sale date.
  */
  const reviewRows = await db.prepare(
    /* The seller's OWN reviews. shop_reviews holds watched competitors. */
    `SELECT listing_id, rating, review, created_at FROM shop_map_own_reviews
      WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; rating: number | null; review: string; created_at: number }>()
    .catch(() => ({ results: [] }));
  const reviewsByListing = new Map<number, Array<{ rating: number | null; review: string; createdAt: number }>>();
  for (const row of ((reviewRows.results ?? []) as Array<Record<string, unknown>>)) {
    const id = Number(row.listing_id);
    reviewsByListing.set(id, [...(reviewsByListing.get(id) ?? []),
      { rating: row.rating === null ? null : Number(row.rating),
        review: String(row.review ?? ""), createdAt: Number(row.created_at) }]);
  }

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
      reviews: world.listingIds.reduce((total, id) =>
        total + (reviewsByListing.get(id)?.length ?? 0), 0),
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

  /* Enough recent trade to make a 90-day view meaningful? */
  const recentOrders = worldPerformance.reduce((sum, world) => sum + world.ordersLast90, 0);
  const recentEnough = recentOrders >= 10;
  const found = direction(worldPerformance);
  const unclassified = assignments.filter(row => row.unclassified).length;

  return NextResponse.json({
    shop: { shopId, shopName: shopRow.shop_name, timezone },
    /* The money section is blocked until this shop's own timezone is set. */
    timezoneNeeded: !timezone,
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
    /* Where to Focus: the instruction, and the arithmetic behind it. */
    standout: standout(worldPerformance,
      guidance(worldPerformance, { period: recentEnough ? "the last 90 days" : "all time" })),
    whereToFocus: guidance(worldPerformance,
      { period: recentEnough ? "the last 90 days" : "all time" }).slice(0, 5),
    pointingHere: found.worldId ? {
      label: found.label, finding: found.finding, reason: found.reason,
    } : { label: "No clear direction yet", finding: found.finding,
      reason: found.reason || "Not enough evidence across the worlds yet." },
    /*
      ONE PERIOD, SAID OUT LOUD.

      The cards showed lifetime revenue on a page headed "This month", so
      $59,960 read as a monthly figure. The default is the last 90 days when
      there is enough recent trade to mean something, and lifetime otherwise -
      labelled either way.
    */
    worldsPeriod: recentEnough ? "Last 90 days" : "Lifetime",
    worlds: worldPerformance
      .filter(world => world.orders > 0 || world.activeListings > 0)
      .sort((a, b) => (recentEnough ? b.revenueLast90Minor - a.revenueLast90Minor
        : b.revenueMinor - a.revenueMinor))
      .map(world => {
        const built = worlds.find(row => row.id === world.worldId);
        const members = built?.listingIds ?? [];
        const reviews = members.flatMap(id => reviewsByListing.get(id) ?? []);
        const recent = reviews.filter(row => row.createdAt >= now - 90 * 86_400);
        return {
          worldId: world.worldId, label: world.label,
          listings: members.length,
          activeListings: world.activeListings,
          period: recentEnough ? "Last 90 days" : "Lifetime",
          orders: recentEnough ? world.ordersLast90 : world.orders,
          revenueMinor: recentEnough ? world.revenueLast90Minor : world.revenueMinor,
          lifetimeOrders: world.orders,
          lifetimeRevenueMinor: world.revenueMinor,
          /* Product families live inside the world as supporting evidence. */
          productFamilies: built?.productFamilies ?? [],
          reviews: { recent: recent.length, lifetimeHeld: reviews.length },
          evidence: built?.evidence ?? "",
        };
      }),
    needsAttention: {
      unclassifiedListings: unclassified,
      missingProductionCosts: costs.filter(cost => cost.confidence === "none").length,
      overbuiltWorlds: overbuilt(worldPerformance),
    },
    classifier: {
      rawNiches: [...rawCounts.keys()],
      collapsed: collapse.merged,
      usedNiches: collapse.kept,
    },
    counts: { listings: rows.length, niches: worlds.length,
      listingsWithSales: [...performance.keys()].length },
    paidProviderCost: 0,
  });
}
