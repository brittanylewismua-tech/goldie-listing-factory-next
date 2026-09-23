import { catalogActions } from "@/app/shop-map-actions";
import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { env } from "cloudflare:workers";
import { ensureListingTables, performanceFrom } from "@/app/shop-map-listings";
import { buildWorlds, renameWorld, mergeWorlds, type Listing } from "@/app/shop-map-worlds";
import { direction, overbuilt, type WorldPerformance } from "@/app/shop-map-direction";
import { guidance, standout, DIRECTION_BASIS, SHOP_MAP_MIN_RECENT_ORDERS } from "@/app/shop-map-guidance";
import { collapseFacets } from "@/app/niche-classifier";
import { rejectAsNiche } from "@/app/shop-map-identity";
import { listingDisplay, listingPhoto } from "@/app/etsy-listing-display";
import { etsyConnection, etsyFetch } from "@/app/api/etsy/client";
import { readFinancialMonth } from "@/app/financial-month-read";
import { monthWindow, monthOf } from "@/app/finance-month";
import { shopTimezone } from "@/app/finance-store";
import { explainGrouping } from "@/app/niche-grouping-explained";
import { describePlacement } from "@/app/listing-placement";
import { freshnessNote, isStale, financialAsOf } from "@/app/finance-freshness";

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
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  try {
    return await buildMap(request);
  } catch (error) {
    /* Owner-only surface: a generic 500 tells nobody what broke, and this
       route reads a dozen tables that may not all exist yet on a shop. */
    return NextResponse.json({
      error: "Your shop data could not be loaded. Please try again.",
    }, { status: 500 });
  }
});

async function buildMap(request: Request) {
  const access = await requireFeatureApi("shopMap");
  if (!access.ok) return access.response;
  const user = access.user;

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const parameters = new URL(request.url).searchParams;
  const now = Math.floor(Date.now() / 1_000);
  const soldDays=[30,90,365].includes(Number(parameters.get("days")))?Number(parameters.get("days")):90;

  const shopRow = await db.prepare(
    `SELECT c.shop_id, c.shop_name, COALESCE(p.image_url, '') AS image_url, COALESCE(p.updated_at,0) AS profile_updated_at
       FROM etsy_connections c
       LEFT JOIN shop_map_shop_profiles p
         ON p.user_id = c.user_id AND p.shop_id = c.shop_id
      WHERE c.user_id = ? AND c.is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number; shop_name: string; image_url: string; profile_updated_at:number }>();
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
    `SELECT listing_id, title, tags, shop_section, state, created_at, views, favorites, image_url,
            product_family
       FROM shop_map_listings WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId)
    .all<{ listing_id: number; title: string; tags: string; shop_section: string;
      state: string; created_at: number | null; views: number | null;
      favorites: number | null; image_url: string; product_family: string }>();
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
    Captured here, before the classifier loop writes its own results into
    the same map. After that line every classified listing looks like an
    override, and a listing the member never touched would be described
    back to them as their own correction.
  */
  const correctedIds = new Set(overrides.keys());

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
    /*
      A label the gate refuses gets no override at all.

      Pointing a listing at a niche that is never created left it neither in
      a niche nor unclassified: 235 + 38 came to 273 against 293, and twenty
      listings simply disappeared from the map's own arithmetic.
    */
    if (rejectAsNiche(label)) continue;
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

  /* --------------------------------------------- one listing, if asked for */
  const askedRaw = new URL(request.url).searchParams.get("listingId") ?? "";
  const asked = /^[0-9]{1,15}$/.test(askedRaw) ? Number(askedRaw) : 0;
  const askedFound = asked
    ? (() => {
        const world = worlds.find(row => row.listingIds.includes(asked));
        const known = listings.some(row => row.listingId === asked);
        return known ? { world } : null;
      })()
    : null;
  const reasonFor = new Map<number, string>();
  if (asked && askedFound) {
    const stored = await db.prepare(
      `SELECT evidence FROM shop_map_classifications
        WHERE user_id = ? AND shop_id = ? AND listing_id = ? LIMIT 1`)
      .bind(user.userId, shopId, asked).first<{ evidence: string }>();
    if (stored?.evidence) reasonFor.set(asked, String(stored.evidence));
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
  const financial = timezone ? await readFinancialMonth(user.userId,shopId,month,timezone) : null;
  const profit = financial?.knownOperatingProfitMinor ?? null;
  const productionCoverage = financial?.coverage.productionCoverage ?? 0;
  /* How many orders are holding the profit figure back. The share is what the
     coverage bar needs; the count is what a member can act on. */
  const missingCosts = financial
    ? Math.round((1 - productionCoverage) * (financial.coverage.receipts ?? 0)) : 0;

  /*
    THE UNCLASSIFIED PART OF THE SHOP, COUNTED.

    Not a remainder to be inferred: its orders, revenue and reviews are
    summed the same way a niche's are, so the two halves can be added and
    checked against the shop's own totals.
  */
  const unclassifiedIds = assignments.filter(row => row.unclassified)
    .map(row => row.listingId);
  const unclassifiedSet = new Set(unclassifiedIds);
  const sumOver = (ids: number[], pick: (row: NonNullable<ReturnType<typeof performance.get>>) => number) =>
    ids.reduce((total, id) => {
      const row = performance.get(id);
      return total + (row ? pick(row) : 0);
    }, 0);
  const stateOf = new Map<number, string>(
    rows.map(row => [Number(row.listing_id), String(row.state)]));
  const unclassifiedByState: Record<string, number> = {};
  for (const id of unclassifiedIds) {
    const state = stateOf.get(id) ?? "unknown";
    unclassifiedByState[state] = (unclassifiedByState[state] ?? 0) + 1;
  }
  const unclassified = {
    listings: unclassifiedIds.length,
    byState: unclassifiedByState,
    activeListings: unclassifiedIds.filter(id => activeIds.has(id)).length,
    orders: sumOver(unclassifiedIds, row => row.lifetimeOrders),
    units: sumOver(unclassifiedIds, row => row.lifetimeUnits),
    revenueMinor: sumOver(unclassifiedIds, row => row.lifetimeRevenueMinor),
    refundedOrders: sumOver(unclassifiedIds, row => row.refundedOrders),
    refundedMinor: sumOver(unclassifiedIds, row => row.refundedMinor),
    reviews: unclassifiedIds.reduce((total, id) =>
      total + (reviewsByListing.get(id)?.length ?? 0), 0),
    ordersLast30: sumOver(unclassifiedIds, row => row.last30Orders),
    revenueLast30Minor: sumOver(unclassifiedIds, row => row.last30RevenueMinor),
    ordersLast90: sumOver(unclassifiedIds, row => row.last90Orders),
    revenueLast90Minor: sumOver(unclassifiedIds, row => row.last90RevenueMinor),
  };

  /* The whole shop: every listing, classified or not. */
  const everyId = rows.map(row => Number(row.listing_id));
  const shopTotals = {
    listings: everyId.length,
    activeListings: everyId.filter(id => activeIds.has(id)).length,
    orders: sumOver(everyId, row => row.lifetimeOrders),
    revenueMinor: sumOver(everyId, row => row.lifetimeRevenueMinor),
    ordersLast90: sumOver(everyId, row => row.last90Orders),
    revenueLast90Minor: sumOver(everyId, row => row.last90RevenueMinor),
    reviews: everyId.reduce((total, id) =>
      total + (reviewsByListing.get(id)?.length ?? 0), 0),
  };

  const coverage = {
    activeListings: shopTotals.activeListings
      ? 1 - unclassified.activeListings / shopTotals.activeListings : 1,
    recentRevenue: shopTotals.revenueLast90Minor
      ? 1 - unclassified.revenueLast90Minor / shopTotals.revenueLast90Minor : 1,
    recentOrders: shopTotals.ordersLast90
      ? 1 - unclassified.ordersLast90 / shopTotals.ordersLast90 : 1,
  };

  /*
    HOW CURRENT THE MONEY IS, SAID OUT LOUD.

    The financial view already refused profit with staleness as its FIRST
    reason while the member's own card said only that production costs were
    missing — true, but not the first thing wrong with the number. The import
    is not on a clock, so a figure can be days old and look new.
  */
  const sourceRows = await db.prepare(
    `SELECT source, refreshed_at, last_error FROM finance_sources WHERE user_id = ? AND shop_id = ?`)
    .bind(user.userId, shopId).all<{ source: string; refreshed_at: number; last_error: string }>();
  const asOf = financialAsOf((sourceRows.results ?? [])
    .map(row => ({ source: row.source, refreshedAt: Number(row.refreshed_at), lastError: row.last_error })));
  const nowSeconds = Math.floor(Date.now() / 1_000);

  /* Enough recent trade to make a 90-day view meaningful? */
  const recentOrders = worldPerformance.reduce((sum, world) => sum + world.ordersLast90, 0);
  const recentEnough = recentOrders >= 10;
  const found = direction(worldPerformance);
  const totalsFor=(days:number)=>{
    const totals=new Map<number,{sales:number;revenueMinor:number}>();
    for(const sale of saleRows.results??[]){
      if(Number(sale.refunded)||Number(sale.sold_at)<now-days*86400||Number(sale.sold_at)>now)continue;
      const id=Number(sale.listing_id),previous=totals.get(id)??{sales:0,revenueMinor:0};
      previous.sales+=Number(sale.quantity??0);
      previous.revenueMinor+=Number(sale.quantity??0)*Number(sale.price_minor??0);
      totals.set(id,previous);
    }
    return totals;
  };
  const sales90=totalsFor(90), selectedSales=totalsFor(soldDays);
  const selectedIds=[...new Set([...sales90.keys(),...selectedSales.keys(),...rows.filter(row=>row.state==="active").map(row=>Number(row.listing_id))])].slice(0,100);
  let displayUnavailable=false;
  if(selectedIds.some(id=>!rows.find(row=>Number(row.listing_id)===id)?.image_url)||!shopRow.image_url||Number(shopRow.profile_updated_at)<now-6*3600){
    try{
      const connection=await etsyConnection(user.userId);
      if(!shopRow.image_url||Number(shopRow.profile_updated_at)<now-6*3600){
        const profile=await etsyFetch<{icon_url_fullxfull?:string}>(`/shops/${shopId}`,connection.token,"finance");
        shopRow.image_url=profile.icon_url_fullxfull||shopRow.image_url;
        await db.prepare(`INSERT INTO shop_map_shop_profiles(user_id,shop_id,image_url,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id,shop_id) DO UPDATE SET image_url=excluded.image_url,updated_at=excluded.updated_at`)
          .bind(user.userId,shopId,shopRow.image_url,now).run();
      }
      const display=await listingDisplay(selectedIds,"finance",connection.token);
      for(const [id,listing] of display){
        const row=rows.find(row=>Number(row.listing_id)===id);
        const photo=listingPhoto(listing);
        if(row){row.image_url=photo||row.image_url;row.title=listing.title||row.title;
          if(typeof listing.num_favorers==="number")row.favorites=listing.num_favorers;
          if(typeof listing.views==="number")row.views=listing.views;
          await db.prepare(`UPDATE shop_map_listings SET image_url=?,title=?,favorites=?,views=? WHERE user_id=? AND shop_id=? AND listing_id=?`)
            .bind(row.image_url,row.title,row.favorites,row.views,user.userId,shopId,id).run();
        }
        if(!shopRow.image_url&&listing.shop?.icon_url_fullxfull){
          shopRow.image_url=listing.shop.icon_url_fullxfull;
          await db.prepare(`INSERT INTO shop_map_shop_profiles(user_id,shop_id,image_url,updated_at) VALUES(?,?,?,?)
            ON CONFLICT(user_id,shop_id) DO UPDATE SET image_url=excluded.image_url,updated_at=excluded.updated_at`)
            .bind(user.userId,shopId,shopRow.image_url,now).run();
        }
      }
    }catch{displayUnavailable=true;}
  }
  const soldRows=(totals:Map<number,{sales:number;revenueMinor:number}>)=>rows.map(row=>({
    listingId:Number(row.listing_id),title:String(row.title||"Listing details unavailable"),
    imageUrl:String(row.image_url||""),favorites:row.favorites===null?null:Number(row.favorites),
    sales:totals.get(Number(row.listing_id))?.sales??0,revenueMinor:totals.get(Number(row.listing_id))?.revenueMinor??0,
  })).filter(row=>row.sales>0).sort((a,b)=>b.sales-a.sales||b.revenueMinor-a.revenueMinor);
  const soldListings=soldRows(selectedSales);
  const themeListings=(ids:number[])=>rows.filter(row=>ids.includes(Number(row.listing_id)))
    .map(row=>({listingId:Number(row.listing_id),title:String(row.title),imageUrl:row.image_url,
      favorites:row.favorites,sales:sales90.get(Number(row.listing_id))?.sales??0,state:row.state}))
    .sort((a,b)=>b.sales-a.sales||Number(b.state==="active")-Number(a.state==="active"));

  return NextResponse.json({
    catalogActions: catalogActions(rows, saleRows.results ?? [], now),
    shop: { shopId, shopName: shopRow.shop_name, imageUrl: shopRow.image_url, timezone },
    /* The money section is blocked until this shop's own timezone is set. */
    timezoneNeeded: !timezone,
    month,
    thisMonth: {
      revenueMinor: financial?.grossSellerRevenueMinor ?? null,
      etsyFeesMinor: financial ? financial.etsyTransactionFeesMinor+financial.etsyProcessingFeesMinor+financial.etsyListingFeesMinor+financial.etsyAdvertisingFeesMinor+financial.etsyOtherFeesMinor : null,
      productionCostMinor: financial && productionCoverage===1 ? financial.productionCostMinor+financial.productionShippingMinor : null,
      refundsMinor: financial?.refundsMinor ?? null,
      adjustmentsMinor: financial?.adjustmentsMinor ?? null,
      currency: financial?.currency ?? "USD",
      /* D1780 · "Profit unavailable" reads as a broken feature. The number is
         being withheld deliberately, because it would be wrong, and the thing
         withholding it is usually one order whose production cost nobody
         knows. Naming the count turns a dead end into a task. */
      headline: profit === null
        ? (missingCosts === 1 ? "One order's cost is missing" : missingCosts > 1
            ? `${missingCosts} order costs are missing` : "Profit not worked out yet")
        : financial?.manualCostCount ? "Profit with your entered costs" : "Verified profit",
      label: profit === null ? "unavailable" : "verified",
      salesAsOf: asOf, salesStale: isStale(asOf, nowSeconds),
      freshness: asOf ? freshnessNote({asOf,nowSeconds,timezone:timezone||"UTC"})
        : "The financial refresh is incomplete. Refresh your numbers to try again.",
      profitMinor: profit,
      accuracy: profit===null ? (missingCosts > 0
        ? `Revenue and Etsy fees are exact. The profit is held back until every order's production cost is known - ${missingCosts} ${missingCosts === 1 ? "is" : "are"} missing, usually an order that was not placed through Printify. Enter what ${missingCosts === 1 ? "it" : "they"} cost and the figure completes.`
        : "Profit is held back until orders, Etsy charges, refunds, adjustments and production costs for this period are all accounted for.") : `Includes sales, Etsy fees, refunds, adjustments, and production costs.${financial?.manualCostCount ? ` ${financial.manualCostCount} order costs were entered by you.` : ""}`,
      coverage: {verified:productionCoverage,estimated:0,unavailable:1-productionCoverage},
      orders: financial?.coverage.receipts ?? 0,
    },

    /* Where to Focus: the instruction, and the arithmetic behind it. */
    standout: standout(worldPerformance,
      guidance(worldPerformance, { period: recentEnough ? "the last 90 days" : "all time",
        shop: shopTotals }), coverage),
    directionWindowDays: 90,
    /*
      Active listings are a "now" measure while orders are a 90-day window, so
      a listing published last week has not had 90 days to earn. Stated rather
      than hidden, because it makes revenue-per-listing read low for a niche
      that is being actively built.
    */
    directionBasis: DIRECTION_BASIS,
    directionCaveat: "Orders and revenue cover the last 90 days. Active listings "
      + "are a snapshot of your catalogue as it stands today.",
    directionMinimumRecentOrders: SHOP_MAP_MIN_RECENT_ORDERS,
    coverage,
    unclassifiedPerformance: unclassified,
    shopTotals,
    soldListings: { period: `Last ${soldDays} days`, days:soldDays, listings: soldListings },
    topListings: soldRows(sales90).slice(0,3), displayUnavailable,
    /* Unclassified is a card, not a footnote: it is part of the shop. */
    unclassifiedCard: {
      worldId: "unclassified", label: "Unclassified", memberListings:themeListings(unclassifiedIds),
      listings: unclassified.listings, activeListings: unclassified.activeListings,
      period: "Last 90 days",
      orders: unclassified.ordersLast90, units:unclassifiedIds.reduce((n,id)=>n+(sales90.get(id)?.sales??0),0), lifetimeUnits:unclassifiedIds.reduce((n,id)=>n+(performance.get(id)?.lifetimeUnits??0),0), revenueMinor: unclassified.revenueLast90Minor,
      lifetimeOrders: unclassified.orders, lifetimeRevenueMinor: unclassified.revenueMinor,
      reviews: { recent: 0, lifetimeHeld: unclassified.reviews },
      productFamilies: [],
      evidence: "These could not be matched to a niche.",
    },
    whereToFocus: guidance(worldPerformance,
      { period: recentEnough ? "the last 90 days" : "all time", shop: shopTotals }).slice(0, 5),
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
    /* The cards lead with the last 90 days; lifetime rides along as history. */
    worldsPeriod: "Last 90 days",
    worlds: worldPerformance
      .filter(world => world.orders > 0 || world.activeListings > 0)
      .sort((a, b) => b.revenueLast90Minor - a.revenueLast90Minor
        || b.revenueMinor - a.revenueMinor)
      .map(world => {
        const built = worlds.find(row => row.id === world.worldId);
        const members = built?.listingIds ?? [];
        const reviews = members.flatMap(id => reviewsByListing.get(id) ?? []);
        const recent = reviews.filter(row => row.createdAt >= now - 90 * 86_400);
        return {
          worldId: world.worldId, label: world.label, memberListings:themeListings(members),
          listings: members.length,
          activeListings: world.activeListings,
          period: "Last 90 days",
          orders: world.ordersLast90,
          units:members.reduce((n,id)=>n+(sales90.get(id)?.sales??0),0),
          lifetimeUnits:members.reduce((n,id)=>n+(performance.get(id)?.lifetimeUnits??0),0),
          revenueMinor: world.revenueLast90Minor,
          lifetimeOrders: world.orders,
          lifetimeRevenueMinor: world.revenueMinor,
          /* Product families live inside the world as supporting evidence. */
          productFamilies: built?.productFamilies ?? [],
          reviews: { recent: recent.length, lifetimeHeld: reviews.length },
          evidence: built?.evidence ?? "",
        };
      }),
    needsAttention: {
      unclassifiedListings: unclassified.listings,
      unclassifiedPerformance: {
        orders: unclassified.orders, revenueMinor: unclassified.revenueMinor,
        reviews: unclassified.reviews, activeListings: unclassified.activeListings,
      },
      missingProductionCosts: Math.max(0,(financial?.coverage.receipts??0)-(financial?.coverage.matchedReceipts??0)),
      overbuiltWorlds: overbuilt(worldPerformance),
    },
    classifier: {
      rawNiches: [...rawCounts.keys()],
      collapsed: collapse.merged,
      usedNiches: collapse.kept,
    },
    /*
      THE SAME DECISIONS, WRITTEN FOR THE PERSON WHOSE SHOP IT IS.

      `classifier` above is the operator's view and stays that way. This is
      the member's: plain sentences, no prompts, no model names, no scores,
      no internal rule wording. Built on the server so the page never
      handles that vocabulary at all.
    */
    /*
      ONE LISTING, AND WHY IT SITS WHERE IT SITS.

      Deliberately answered by the map itself rather than by an endpoint of
      its own. A second pipeline that resolved placement separately could
      disagree with the map it is explaining — a member told a listing is in
      one niche while the niche beside it counts the listing somewhere else —
      and that is a worse failure than the extra work of recomputing. The
      answer below is read out of the same worlds the page renders, after
      every override, rename and merge has been applied.
    */
    placement: asked ? (askedFound ? describePlacement({
      listingId: asked,
      title: listings.find(row => row.listingId === asked)?.title ?? "",
      tags: String(rows.find(row => Number(row.listing_id) === asked)?.tags ?? ""),
      nicheId: askedFound.world?.id ?? "",
      nicheLabel: askedFound.world?.label ?? "",
      corrected: correctedIds.has(asked),
      storedReason: reasonFor.get(asked) ?? "",
    }) : null) : undefined,
    grouping: {
      found: rawCounts.size,
      shown: collapse.kept.length,
      notes: explainGrouping(collapse.merged),
    },
    counts: { listings: rows.length, niches: worlds.length,
      listingsWithSales: [...performance.keys()].length },
    paidProviderCost: 0,
  });
}
