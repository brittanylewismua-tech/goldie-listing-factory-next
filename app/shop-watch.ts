/**
 * WATCHING A SHOP, WITHOUT TURNING IT INTO A SCOREBOARD.
 *
 * A member names a competitor once and Goldie keeps watching. What comes back
 * is not "this shop got eight reviews" — that is an activity counter dressed
 * up as intelligence. It is what the shop is demonstrably selling, what its
 * buyers keep saying, and what repeats across every shop the member watches.
 *
 * THE SAME SHOP IS COLLECTED ONCE. Twenty members watching the same shop cost
 * what one member costs, because the shop record is shared and only the watch
 * is personal. That is also why the shop is resolved to an Etsy id before
 * anything is saved: two members pasting the same shop in different forms
 * must not create two collections.
 *
 * SIGNALS ARE KEPT APART, DELIBERATELY. A shop-sales rise proves the shop
 * sold something. Validated listing movement is what ties a sale to a
 * listing. Reviews prove a purchase happened at some point and reveal
 * language — never when. Favourites are attention. New listings are the shop
 * publishing, not buyers wanting. None of these may quietly stand in for
 * another, and the storage keeps them in separate columns so the code cannot
 * blur them by accident.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import {
  FRESH_HOURS, listingIdFrom, REVIEW_BOOTSTRAP, REVIEW_PAGE, shopNameFrom, WATCH_LIMIT_DEFAULT,
} from "@/app/shop-watch-input";

export {
  FRESH_HOURS, listingIdFrom, REVIEW_BOOTSTRAP, REVIEW_PAGE, shopNameFrom, WATCH_LIMIT_DEFAULT,
} from "@/app/shop-watch-input";

export const watchLimit = (): number => {
  const configured = Number((env as unknown as { SHOP_WATCH_LIMIT?: string }).SHOP_WATCH_LIMIT);
  return Number.isFinite(configured) && configured > 0 ? configured : WATCH_LIMIT_DEFAULT;
};

const db = () => (env as unknown as { DB: D1Database }).DB;


export async function ensureShopWatchTables(): Promise<void> {
  await db().batch([
    /* The shared side: one row per Etsy shop, however many members watch it. */
    db().prepare(`CREATE TABLE IF NOT EXISTS watched_shops (
      shop_id INTEGER PRIMARY KEY,
      shop_name TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL,
      last_refreshed TEXT,
      last_brief TEXT,
      sold_count INTEGER,
      favorers INTEGER,
      active_count INTEGER,
      review_count INTEGER,
      /* Where incremental review fetching resumes from. */
      review_high_water INTEGER NOT NULL DEFAULT 0,
      reviews_bootstrapped INTEGER NOT NULL DEFAULT 0,
      refresh_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      /* WHEN this shop is next due, rather than "whenever the cron fires".
         Twenty minutes wakes the scheduler; it is not a refresh interval. */
      next_refresh_at TEXT
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS watched_shops_due ON watched_shops (next_refresh_at)`),

    /* The personal side: who watches what. The shop is not duplicated. */
    db().prepare(`CREATE TABLE IF NOT EXISTS member_shop_watches (
      user_id TEXT NOT NULL,
      shop_id INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL,
      paused INTEGER NOT NULL DEFAULT 0,
      last_opened TEXT,
      PRIMARY KEY (user_id, shop_id)
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS member_shop_watches_user ON member_shop_watches (user_id)`),

    /* Shop-level totals over time.
       Shop-level, and labelled as such, because
       these numbers can never be split across listings. */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_observations (
      shop_id INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      sold_count INTEGER,
      favorers INTEGER,
      active_count INTEGER,
      review_count INTEGER,
      PRIMARY KEY (shop_id, observed_at)
    )`),

    /* Reviews, deduplicated on the transaction. The timestamp is when the
       review was written, which is NOT when the purchase happened — Etsy
       allows a review up to a hundred days after estimated delivery. */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_reviews (
      transaction_id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      listing_id INTEGER,
      rating INTEGER,
      review TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      language TEXT NOT NULL DEFAULT '',
      ingested_at TEXT NOT NULL
    )`),
    db().prepare(`CREATE INDEX IF NOT EXISTS shop_reviews_shop ON shop_reviews (shop_id, created_at DESC)`),
    db().prepare(`CREATE INDEX IF NOT EXISTS shop_reviews_listing ON shop_reviews (listing_id)`),
  ]);

  /* CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists. */
  for (const column of ["next_refresh_at TEXT"]) {
    try {
      await db().prepare(`ALTER TABLE watched_shops ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(error instanceof Error ? error.message : "")) throw error;
    }
  }
}

/**
 * WHEN IS THIS SHOP NEXT DUE?
 *
 * Inside the six-hour rule, and jittered. Every shop added on the same
 * afternoon would otherwise come due in the same minute forever, and a spike
 * that size would push every other Etsy workload aside four times a day for
 * no benefit at all — nothing about a competitor's shop changes meaningfully
 * between five and six hours.
 */
export function nextRefreshAt(from = Date.now()): string {
  const base = FRESH_HOURS * 3_600_000;
  /* Comfortably inside the window, spread across roughly an hour. */
  const due = from + base * 0.75 + Math.floor(Math.random() * base * 0.15);
  return new Date(due).toISOString();
}

async function etsy(path: string, feature: "search" | "qa" = "search") {
  await waitForEtsyCapacity();
  const response = await fetch(`https://openapi.etsy.com/v3/application/${path}`, {
    headers: { "x-api-key": etsyApiCredential() },
    signal: AbortSignal.timeout(20_000),
  });
  await recordEtsyCall(response, feature);
  if (!response.ok) return null;
  return response.json() as Promise<Record<string, unknown>>;
}

export type ResolvedShop = { shopId: number; shopName: string; url: string };

/** Turn whatever was pasted into one Etsy shop, or say why not. */
export async function resolveShop(input: string): Promise<
  { ok: true; shop: ResolvedShop; calls: number } | { ok: false; reason: string; calls: number }
> {
  let calls = 0;

  /* A listing URL is a perfectly reasonable thing to paste, and the listing
     knows which shop it belongs to. */
  const listingId = listingIdFrom(input);
  if (listingId) {
    const body = await etsy(`listings/${listingId}?includes=Shop`);
    calls += 1;
    const shop = (body?.shop ?? null) as Record<string, unknown> | null;
    if (!shop?.shop_id) return { ok: false, reason: "That listing could not be read.", calls };
    return {
      ok: true, calls,
      shop: {
        shopId: Number(shop.shop_id),
        shopName: String(shop.shop_name ?? ""),
        url: `https://www.etsy.com/shop/${String(shop.shop_name ?? "")}`,
      },
    };
  }

  const name = shopNameFrom(input);
  if (!name) return { ok: false, reason: "That does not look like an Etsy shop.", calls };

  const found = await etsy(`shops?shop_name=${encodeURIComponent(name)}`);
  calls += 1;
  const results = (found?.results ?? []) as Array<Record<string, unknown>>;
  /*
    findShops matches loosely, so it will happily return neighbours of the
    name that was asked for. Only an exact, case-insensitive match counts —
    saving the wrong shop silently would be worse than failing.
  */
  const exact = results.find(row =>
    String(row.shop_name ?? "").toLowerCase() === name.toLowerCase());
  if (!exact) return { ok: false, reason: `No Etsy shop is named ${name}.`, calls };

  return {
    ok: true, calls,
    shop: {
      shopId: Number(exact.shop_id),
      shopName: String(exact.shop_name ?? name),
      url: `https://www.etsy.com/shop/${String(exact.shop_name ?? name)}`,
    },
  };
}

/* ----------------------------------------------------------------- watches */

export async function addWatch(userId: string, input: string): Promise<
  { ok: true; shop: ResolvedShop; alreadyWatched: boolean; shared: boolean; calls: number }
  | { ok: false; reason: string; calls: number }
> {
  await ensureShopWatchTables();

  const held = await db()
    .prepare(`SELECT COUNT(*) AS n FROM member_shop_watches WHERE user_id = ?`)
    .bind(userId).first<{ n: number }>();
  const limit = watchLimit();
  /* Checked before Etsy is asked anything, so hitting the limit costs
     nothing. */
  if (Number(held?.n ?? 0) >= limit)
    return { ok: false, reason: `You are watching ${limit} shops, which is the limit.`, calls: 0 };

  const resolved = await resolveShop(input);
  if (!resolved.ok) return resolved;
  const { shop } = resolved;
  const now = new Date().toISOString();

  const shopWrite = await db()
    .prepare(
      `INSERT INTO watched_shops (shop_id, shop_name, url, added_at)
       VALUES (?,?,?,?)
       ON CONFLICT(shop_id) DO UPDATE SET shop_name = excluded.shop_name, url = excluded.url`)
    .bind(shop.shopId, shop.shopName, shop.url, now)
    .run();
  /* No new row means somebody already watches this shop, and its collection
     is already running. The second member costs nothing. */
  const shared = Number(shopWrite.meta?.changes ?? 0) === 0;

  const watchWrite = await db()
    .prepare(
      `INSERT INTO member_shop_watches (user_id, shop_id, label, added_at)
       VALUES (?,?,?,?)
       ON CONFLICT(user_id, shop_id) DO NOTHING`)
    .bind(userId, shop.shopId, shop.shopName, now)
    .run();

  return {
    ok: true, shop, shared, calls: resolved.calls,
    alreadyWatched: Number(watchWrite.meta?.changes ?? 0) === 0,
  };
}

export async function removeWatch(userId: string, shopId: number): Promise<void> {
  await db().prepare(`DELETE FROM member_shop_watches WHERE user_id = ? AND shop_id = ?`)
    .bind(userId, shopId).run();
  /*
    The shared shop row stays even when the last member drops it. Its
    observations and reviews are the history that makes the next watch of that
    shop instant instead of empty, and deleting them to save a few rows would
    throw away the only thing that cannot be re-fetched.
  */
}

export async function watchesFor(userId: string): Promise<Array<{
  shopId: number; shopName: string; url: string; addedAt: string;
  lastRefreshed: string | null; stale: boolean;
}>> {
  await ensureShopWatchTables();
  const cutoff = new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString();
  const rows = await db().prepare(
    `SELECT w.shop_id, s.shop_name, s.url, w.added_at, s.last_refreshed
       FROM member_shop_watches w JOIN watched_shops s ON s.shop_id = w.shop_id
      WHERE w.user_id = ? AND w.paused = 0
      ORDER BY w.added_at ASC`).bind(userId)
    .all<{ shop_id: number; shop_name: string; url: string; added_at: string; last_refreshed: string | null }>();
  return (rows.results ?? []).map(row => ({
    shopId: Number(row.shop_id),
    shopName: row.shop_name,
    url: row.url,
    addedAt: row.added_at,
    lastRefreshed: row.last_refreshed,
    /* Etsy's six-hour rule is about what may be DISPLAYED, so staleness is a
       property the caller has to see before it renders anything. */
    stale: !row.last_refreshed || row.last_refreshed < cutoff,
  }));
}

/* -------------------------------------------------------------- collection */

/**
 * WHAT SHOP WATCH IS ALLOWED TO SPEND.
 *
 * It is the newest workload and the least urgent: a brief is generated once a
 * morning, so nothing here justifies competing with the detector, the sensor,
 * or a member publishing a batch. It stops instead.
 */
export const SHOP_WATCH_RESERVE = 55_000;

export async function shopWatchRoom(): Promise<number> {
  const used = await db().prepare(
    `SELECT COALESCE(SUM(calls), 0) AS n FROM etsy_api_usage_buckets WHERE bucket >= ?`)
    .bind(new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 13))
    .first<{ n: number }>();
  return Math.max(0, 80_000 - SHOP_WATCH_RESERVE - Number(used?.n ?? 0));
}

type ReviewRow = {
  transaction_id?: number; listing_id?: number; shop_id?: number;
  rating?: number; review?: string; create_timestamp?: number;
  created_timestamp?: number; update_timestamp?: number; language?: string;
};

/**
 * Reviews since we last looked, and no further back.
 *
 * A busy shop holds six figures of reviews — one measured at 181,811 — so
 * pulling a history to find four new ones would be indefensible. Etsy honours
 * `min_created` (measured: the same shop's count fell from 181,811 to 53 for a
 * three-day window), so the high-water mark is all that is ever needed after
 * the first pull.
 */
export async function ingestReviews(
  shopId: number, { bootstrap = false, maxCalls = 8 }: { bootstrap?: boolean; maxCalls?: number } = {},
): Promise<{ fetched: number; stored: number; duplicates: number; calls: number; highWater: number }> {
  const state = await db()
    .prepare(`SELECT review_high_water, reviews_bootstrapped FROM watched_shops WHERE shop_id = ?`)
    .bind(shopId)
    .first<{ review_high_water: number; reviews_bootstrapped: number }>();
  const since = Number(state?.review_high_water ?? 0);

  /* The first pull is capped at the most recent few hundred; after that the
     high-water mark keeps it to whatever is genuinely new. */
  const pages = bootstrap || !state?.reviews_bootstrapped
    ? Math.min(maxCalls, Math.ceil(REVIEW_BOOTSTRAP / REVIEW_PAGE))
    : maxCalls;

  let fetched = 0;
  let stored = 0;
  let calls = 0;
  let highWater = since;

  for (let page = 0; page < pages; page += 1) {
    const window = since > 0 ? `&min_created=${since}` : "";
    const body = await etsy(
      `shops/${shopId}/reviews?limit=${REVIEW_PAGE}&offset=${page * REVIEW_PAGE}${window}`);
    calls += 1;
    if (!body) break;
    const rows = (body.results ?? []) as ReviewRow[];
    if (!rows.length) break;
    fetched += rows.length;

    const now = new Date().toISOString();
    const insert = db().prepare(
      `INSERT INTO shop_reviews
         (transaction_id, shop_id, listing_id, rating, review, created_at, updated_at, language, ingested_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(transaction_id) DO NOTHING`);
    const statements = rows
      /* The transaction is the identity: the same review arriving again — a
         re-run, an overlapping window, an edited review — must not become a
         second piece of evidence. */
      .filter(row => row.transaction_id)
      .map(row => {
        const created = Number(row.create_timestamp ?? row.created_timestamp ?? 0);
        if (created > highWater) highWater = created;
        return insert.bind(
          Number(row.transaction_id), shopId,
          row.listing_id === undefined ? null : Number(row.listing_id),
          row.rating === undefined ? null : Number(row.rating),
          String(row.review ?? ""), created,
          row.update_timestamp === undefined ? null : Number(row.update_timestamp),
          String(row.language ?? ""), now);
      });
    for (let index = 0; index < statements.length; index += 100) {
      const results = await db().batch(statements.slice(index, index + 100));
      for (const result of results) stored += Number(result.meta?.changes ?? 0);
    }
    if (rows.length < REVIEW_PAGE) break;
  }

  await db().prepare(
    `UPDATE watched_shops SET review_high_water = ?, reviews_bootstrapped = 1 WHERE shop_id = ?`)
    .bind(highWater, shopId).run();

  return { fetched, stored, duplicates: fetched - stored, calls, highWater };
}

export type ShopRefresh = {
  shopId: number; calls: number; reviewsStored: number; reviewsDuplicate: number;
  soldDelta: number | null; recentListings: number; error?: string;
};

/**
 * One shop, refreshed.
 *
 * Shop totals, the most recently modified page of its listings, and whatever
 * reviews are new. Deliberately NOT a full enumeration: the monitored shops
 * hold a median of 695 listings and one holds 11,202, and re-reading that on
 * a schedule is what killed the whole-shop plan.
 */
export async function refreshShop(shopId: number): Promise<ShopRefresh> {
  await ensureShopWatchTables();
  const result: ShopRefresh = {
    shopId, calls: 0, reviewsStored: 0, reviewsDuplicate: 0,
    soldDelta: null, recentListings: 0,
  };

  try {
    const shop = await etsy(`shops/${shopId}`);
    result.calls += 1;
    if (!shop) throw new Error("Etsy would not return the shop.");

    const soldCount = Number(shop.transaction_sold_count ?? 0);
    const reviewCount = Number(shop.review_count ?? 0);
    const previous = await db()
      .prepare(`SELECT sold_count, review_count FROM watched_shops WHERE shop_id = ?`)
      .bind(shopId).first<{ sold_count: number | null; review_count: number | null }>();

    const observedAt = new Date().toISOString();
    await db().batch([
      db().prepare(
        `INSERT INTO shop_observations (shop_id, observed_at, sold_count, favorers, active_count, review_count)
         VALUES (?,?,?,?,?,?) ON CONFLICT(shop_id, observed_at) DO NOTHING`)
        .bind(shopId, observedAt, soldCount, Number(shop.num_favorers ?? 0),
          Number(shop.listing_active_count ?? 0), reviewCount),
      db().prepare(
        `UPDATE watched_shops
            SET sold_count = ?, favorers = ?, active_count = ?, review_count = ?,
                last_refreshed = ?, next_refresh_at = ?, refresh_failures = 0, last_error = ''
          WHERE shop_id = ?`)
        .bind(soldCount, Number(shop.num_favorers ?? 0),
          Number(shop.listing_active_count ?? 0), reviewCount, observedAt,
          nextRefreshAt(), shopId),
    ]);
    if (previous?.sold_count !== null && previous?.sold_count !== undefined)
      result.soldDelta = soldCount - Number(previous.sold_count);

    /* The front page of the shop, which Etsy returns most-recently-modified
       first — measured on an eleven-thousand-listing shop. Anything the shop
       has just changed or just published is here. */
    const recent = await etsy(`shops/${shopId}/listings/active?limit=100`);
    result.calls += 1;
    result.recentListings = ((recent?.results ?? []) as unknown[]).length;

    /*
      Reviews are fetched only when the shop's own review count has moved.
      Asking anyway would be the single most wasteful call in the system.
    */
    const reviewsMoved = previous?.review_count === null || previous?.review_count === undefined
      ? true : reviewCount > Number(previous.review_count);
    if (reviewsMoved) {
      const reviews = await ingestReviews(shopId);
      result.calls += reviews.calls;
      result.reviewsStored = reviews.stored;
      result.reviewsDuplicate = reviews.duplicates;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    /*
      A failed refresh must never damage what is already known. The previous
      observations, reviews and brief stay exactly as they were; only the
      failure count and the reason are written.
    */
    await db().prepare(
      `UPDATE watched_shops SET refresh_failures = refresh_failures + 1, last_error = ?
        WHERE shop_id = ?`).bind(message.slice(0, 300), shopId).run();
    return { ...result, error: message };
  }
}

/**
 * Refresh whatever has actually come due, within budget.
 *
 * Called every twenty minutes and expected to do nothing most of the time.
 */
export async function refreshPass(
  /* A small slice per firing, so due shops spread across the hour instead of
     arriving as one spike. */
  { maxShops = 8, maxCalls = 40 }: { maxShops?: number; maxCalls?: number } = {},
): Promise<{ shops: number; calls: number; failures: number; skipped?: string }> {
  await ensureShopWatchTables();
  const room = await shopWatchRoom();
  if (room <= 0) return { shops: 0, calls: 0, failures: 0, skipped: "No room under the reserve." };
  const budget = Math.min(maxCalls, room);

  /*
    ONLY WHAT IS ACTUALLY DUE.

    The cron wakes every twenty minutes; that is not how often a shop is
    refreshed. A shop carries its own due time, and most firings will find
    nothing to do — which is the point.
  */
  const now = new Date().toISOString();
  const due = await db().prepare(
    `SELECT shop_id FROM watched_shops
      WHERE next_refresh_at IS NULL OR next_refresh_at <= ?
      ORDER BY next_refresh_at IS NULL DESC, next_refresh_at ASC LIMIT ?`)
    .bind(now, maxShops).all<{ shop_id: number }>();

  let calls = 0;
  let shops = 0;
  let failures = 0;
  for (const row of due.results ?? []) {
    if (calls >= budget) break;
    const refreshed = await refreshShop(Number(row.shop_id));
    calls += refreshed.calls;
    shops += 1;
    if (refreshed.error) failures += 1;
  }
  return { shops, calls, failures };
}

/**
 * OPENING SHOP WATCH REFRESHES ONLY WHAT IS STALE.
 *
 * Etsy's rule is about what may be displayed, so a member opening a shop
 * whose evidence has aged past six hours has to wait for a read. A member
 * opening one refreshed forty minutes ago must not pay for a pointless call.
 */
export async function refreshIfStale(shopId: number): Promise<{ refreshed: boolean; calls: number }> {
  await ensureShopWatchTables();
  const cutoff = new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString();
  const row = await db()
    .prepare(`SELECT last_refreshed FROM watched_shops WHERE shop_id = ?`)
    .bind(shopId).first<{ last_refreshed: string | null }>();
  if (row?.last_refreshed && row.last_refreshed >= cutoff) return { refreshed: false, calls: 0 };
  const result = await refreshShop(shopId);
  return { refreshed: true, calls: result.calls };
}

/** Shop Watch's own meter, kept apart from every other workload. */
export async function shopWatchHealth(): Promise<Record<string, unknown>> {
  await ensureShopWatchTables();
  const cutoff = new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString();
  const now = new Date().toISOString();
  const [shops, watchers, reviews] = await Promise.all([
    db().prepare(
      `SELECT COUNT(*) AS shops,
              SUM(CASE WHEN last_refreshed >= ? THEN 1 ELSE 0 END) AS fresh,
              SUM(CASE WHEN last_refreshed IS NULL OR last_refreshed < ? THEN 1 ELSE 0 END) AS stale,
              SUM(CASE WHEN refresh_failures > 0 THEN 1 ELSE 0 END) AS failing,
              SUM(CASE WHEN next_refresh_at IS NULL OR next_refresh_at <= ? THEN 1 ELSE 0 END) AS due,
              MIN(next_refresh_at) AS soonest
         FROM watched_shops`).bind(cutoff, cutoff, now).first<Record<string, number | string>>(),
    db().prepare(
      `SELECT COUNT(*) AS watches, COUNT(DISTINCT user_id) AS members,
              COUNT(DISTINCT shop_id) AS distinct_shops
         FROM member_shop_watches`).first<Record<string, number>>(),
    db().prepare(`SELECT COUNT(*) AS n FROM shop_reviews`).first<{ n: number }>(),
  ]);
  const watches = Number(watchers?.watches ?? 0);
  const distinct = Number(watchers?.distinct_shops ?? 0);
  return {
    uniqueWatchedShops: Number(shops?.shops ?? 0),
    memberWatches: watches,
    members: Number(watchers?.members ?? 0),
    /* What sharing is actually saving: watches that cost no extra collection. */
    duplicateWatchesReused: Math.max(0, watches - distinct),
    freshWithinSixHours: Number(shops?.fresh ?? 0),
    staleShops: Number(shops?.stale ?? 0),
    shopsFailingRefresh: Number(shops?.failing ?? 0),
    /* Most firings should find nothing due. A number that climbs means the
       slice per firing is too small for the number of shops being watched. */
    dueNow: Number(shops?.due ?? 0),
    nextDueAt: shops?.soonest ?? null,
    reviewsHeld: Number(reviews?.n ?? 0),
    watchLimitPerMember: watchLimit(),
    reserveBelowCeiling: SHOP_WATCH_RESERVE,
  };
}
