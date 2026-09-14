/**
 * EVERY LISTING IN THE SHOP, NOT THE TWO WE HAPPENED TO FIND.
 *
 * The corpus was built by discovery: search Etsy, keep what came back. That
 * gave 2.2 listings per shop, and the consequence showed up the moment
 * attribution ran — a shop sold six, Goldie tracked two listings, and four
 * units were unexplainable by construction. No amount of cleverness in the
 * attribution rules can fix a hole in the denominator.
 *
 * So detection is separated from relevance. This enumerates every active
 * listing in the shops already monitored, cheaply, so that when a shop sells
 * something there is a real chance the listing that sold is one we can see.
 * Whether a listing belongs in any member's watch is a different question,
 * asked later, of the listings that turn out to matter.
 *
 * NO NEW SHOPS. Only shops already in the corpus are enumerated. This widens
 * what is known about the shops being watched; it does not widen the watch.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Etsy's maximum page for this endpoint. */
export const PAGE = 100;
/**
 * A shop with more listings than this is enumerated to the cap and marked
 * partial rather than complete. Ten calls is a reasonable ceiling for one
 * shop; a shop with four thousand listings would otherwise eat the allowance
 * on its own, and its baseline would be stale before it finished.
 */
export const MAX_PAGES_PER_SHOP = 10;

export type ShopListing = {
  listingId: number;
  shopId: number;
  state: string;
  quantity: number | null;
  created: number | null;
  originalCreated: number | null;
  updated: number | null;
  endingAt: number | null;
  url: string;
  title: string;
  taxonomyId: number | null;
};

export async function ensureBaselineTables(): Promise<void> {
  await db().batch([
    /*
      What Goldie knows exists in a shop. Rows are never deleted: a listing
      that vanishes from the active response has either sold out, been
      deactivated, or expired, and telling those apart is the entire point —
      deleting the row would destroy the question.
    */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_listings (
      listing_id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      quantity INTEGER,
      created INTEGER,
      original_created INTEGER,
      updated INTEGER,
      ending_at INTEGER,
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      taxonomy_id INTEGER,
      first_seen TEXT NOT NULL,
      last_seen_active TEXT,
      last_observed TEXT NOT NULL,
      missing_since TEXT
    )`),
    db().prepare(`CREATE INDEX IF NOT EXISTS shop_listings_shop ON shop_listings (shop_id)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS shop_listings_missing ON shop_listings (shop_id, missing_since)`),

    /* How complete each shop's picture is, and when it became so. An interval
       that began before its shop was complete can never be judged against it. */
    db().prepare(`CREATE TABLE IF NOT EXISTS shop_baselines (
      shop_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'none',
      next_offset INTEGER NOT NULL DEFAULT 0,
      listings_known INTEGER NOT NULL DEFAULT 0,
      pages_read INTEGER NOT NULL DEFAULT 0,
      truncated INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      refreshed_at TEXT,
      last_error TEXT NOT NULL DEFAULT ''
    )`),
    db().prepare(`CREATE INDEX IF NOT EXISTS shop_baselines_state ON shop_baselines (state, completed_at)`),
  ]);
}

type ActiveListing = {
  listing_id?: number; shop_id?: number; state?: string; quantity?: number;
  creation_timestamp?: number; original_creation_timestamp?: number;
  last_modified_timestamp?: number; ending_timestamp?: number;
  url?: string; title?: string; taxonomy_id?: number;
};

const toShopListing = (row: ActiveListing, shopId: number): ShopListing | null => {
  if (!row.listing_id) return null;
  return {
    listingId: Number(row.listing_id),
    shopId: Number(row.shop_id ?? shopId),
    state: String(row.state ?? "active"),
    quantity: row.quantity === undefined ? null : Number(row.quantity),
    created: row.creation_timestamp === undefined ? null : Number(row.creation_timestamp),
    /* The true birth date. creation_timestamp resets on renewal. */
    originalCreated: row.original_creation_timestamp === undefined
      ? null : Number(row.original_creation_timestamp),
    updated: row.last_modified_timestamp === undefined ? null : Number(row.last_modified_timestamp),
    endingAt: row.ending_timestamp === undefined ? null : Number(row.ending_timestamp),
    url: String(row.url ?? ""),
    title: String(row.title ?? ""),
    taxonomyId: row.taxonomy_id === undefined ? null : Number(row.taxonomy_id),
  };
};

/** One page of a shop's active listings. */
export async function readShopPage(
  shopId: number, offset: number,
): Promise<{ listings: ShopListing[]; total: number; ok: boolean; status: number }> {
  await waitForEtsyCapacity();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active` +
    `?limit=${PAGE}&offset=${offset}`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) },
  );
  await recordEtsyCall(response, "search");
  if (!response.ok) return { listings: [], total: 0, ok: false, status: response.status };
  const body = await response.json() as { count?: number; results?: ActiveListing[] };
  const listings = (body.results ?? [])
    .map(row => toShopListing(row, shopId))
    .filter((row): row is ShopListing => row !== null);
  return { listings, total: Number(body.count ?? 0), ok: true, status: response.status };
};

export async function writeShopListings(rows: ShopListing[]): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const insert = db().prepare(
    `INSERT INTO shop_listings
       (listing_id, shop_id, state, quantity, created, original_created, updated,
        ending_at, url, title, taxonomy_id, first_seen, last_seen_active, last_observed, missing_since)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
     ON CONFLICT(listing_id) DO UPDATE SET
       state = excluded.state, quantity = excluded.quantity,
       updated = excluded.updated, ending_at = excluded.ending_at,
       url = excluded.url, title = excluded.title, taxonomy_id = excluded.taxonomy_id,
       last_seen_active = excluded.last_seen_active,
       last_observed = excluded.last_observed,
       /* Seen again, so whatever it was doing while missing is over. */
       missing_since = NULL`);
  const statements = rows.map(row => insert.bind(
    row.listingId, row.shopId, row.state, row.quantity, row.created, row.originalCreated,
    row.updated, row.endingAt, row.url, row.title, row.taxonomyId, now, now, now));
  for (let index = 0; index < statements.length; index += 100)
    await db().batch(statements.slice(index, index + 100));
}

export type BaselineResult = {
  shopId: number; pages: number; listings: number;
  complete: boolean; truncated: boolean; calls: number; error?: string;
};

/**
 * Enumerate one shop to the end, or to the page cap.
 *
 * Resumable: the offset it reached is stored, so a shop interrupted halfway
 * continues rather than starting again. A first enumeration establishes a
 * baseline and nothing else — no event, no sale, no movement. Comparing a
 * shop against nothing has invented sales in this codebase before.
 */
export async function baselineShop(
  shopId: number, { maxPages = MAX_PAGES_PER_SHOP }: { maxPages?: number } = {},
): Promise<BaselineResult> {
  await ensureBaselineTables();
  const held = await db()
    .prepare(`SELECT next_offset, pages_read FROM shop_baselines WHERE shop_id = ?`)
    .bind(shopId)
    .first<{ next_offset: number; pages_read: number }>();

  let offset = Number(held?.next_offset ?? 0);
  let pages = 0;
  let calls = 0;
  let listings = 0;
  let complete = false;
  let truncated = false;
  let total = 0;

  while (pages < maxPages) {
    const page = await readShopPage(shopId, offset);
    calls += 1;
    if (!page.ok) {
      await db().prepare(
        `INSERT INTO shop_baselines (shop_id, state, next_offset, last_error)
         VALUES (?, 'partial', ?, ?)
         ON CONFLICT(shop_id) DO UPDATE SET state = 'partial', next_offset = excluded.next_offset,
           last_error = excluded.last_error`)
        .bind(shopId, offset, `Etsy answered ${page.status}`).run();
      return { shopId, pages, listings, complete: false, truncated: false, calls,
        error: `Etsy answered ${page.status}` };
    }
    total = page.total;
    await writeShopListings(page.listings);
    listings += page.listings.length;
    pages += 1;
    offset += PAGE;
    /* A short page is the end of the shop; there is no next page to ask for. */
    if (page.listings.length < PAGE) { complete = true; break; }
    if (offset >= total) { complete = true; break; }
  }
  if (!complete) truncated = true;

  const known = await db()
    .prepare(`SELECT COUNT(*) AS n FROM shop_listings WHERE shop_id = ?`)
    .bind(shopId).first<{ n: number }>();

  const now = new Date().toISOString();
  await db().prepare(
    `INSERT INTO shop_baselines
       (shop_id, state, next_offset, listings_known, pages_read, truncated, completed_at, refreshed_at, last_error)
     VALUES (?,?,?,?,?,?,?,?,'')
     ON CONFLICT(shop_id) DO UPDATE SET
       state = excluded.state, next_offset = excluded.next_offset,
       listings_known = excluded.listings_known,
       pages_read = shop_baselines.pages_read + excluded.pages_read,
       truncated = excluded.truncated,
       /* completed_at is set once and never moved: it is the moment from which
          this shop's intervals become judgeable, and rewriting it would let a
          refresh silently make old intervals look eligible. */
       completed_at = COALESCE(shop_baselines.completed_at, excluded.completed_at),
       refreshed_at = excluded.refreshed_at, last_error = ''`)
    .bind(shopId, complete ? "complete" : "partial", complete ? 0 : offset,
      Number(known?.n ?? listings), pages, truncated ? 1 : 0,
      complete ? now : null, now)
    .run();

  return { shopId, pages, listings, complete, truncated, calls };
}

/**
 * WHAT WOULD THIS COST?
 *
 * Sampled, not guessed: a handful of shops are enumerated for real and the
 * rest of the estimate follows from what they turned out to hold. Reported
 * before the backfill runs, so the decision to run it is made against a number
 * rather than an intention.
 */
export async function estimateBackfill(
  { sample = 12 }: { sample?: number } = {},
): Promise<{
  shopsNeedingBaseline: number; shopsComplete: number;
  sampledShops: number; sampledListings: number; medianListingsPerShop: number;
  estimatedListings: number; estimatedCalls: number;
  callsUsedLast24h: number; projectedDailyCalls: number; ceiling: number; safe: boolean;
  hoursAtCurrentRate: number;
}> {
  await ensureBaselineTables();

  const counts = await db().prepare(
    `SELECT
       (SELECT COUNT(DISTINCT shop_id) FROM sold_watch WHERE shop_id IS NOT NULL) AS shops,
       (SELECT COUNT(*) FROM shop_baselines WHERE state = 'complete') AS complete`)
    .first<{ shops: number; complete: number }>();

  /* Sample the shops that matter most: the ones already seen selling. */
  const sampleShops = await db().prepare(
    `SELECT DISTINCT i.shop_id FROM shop_sales_intervals i
       LEFT JOIN shop_baselines b ON b.shop_id = i.shop_id
      WHERE b.shop_id IS NULL OR b.state <> 'complete'
      LIMIT ?`).bind(sample).all<{ shop_id: number }>();

  const sizes: number[] = [];
  let calls = 0;
  for (const row of sampleShops.results ?? []) {
    const page = await readShopPage(Number(row.shop_id), 0);
    calls += 1;
    if (page.ok) sizes.push(page.total);
  }
  sizes.sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const mean = sizes.length ? sizes.reduce((sum, n) => sum + n, 0) / sizes.length : 0;

  const needing = Math.max(0, Number(counts?.shops ?? 0) - Number(counts?.complete ?? 0));
  const estimatedListings = Math.round(needing * mean);
  /* Pages, capped per shop, and never fewer than one call per shop. */
  const callsPerShop = Math.max(1, Math.min(MAX_PAGES_PER_SHOP, Math.ceil(mean / PAGE)));
  const estimatedCalls = needing * callsPerShop;

  const used = await db().prepare(
    `SELECT COALESCE(SUM(calls), 0) AS n FROM etsy_api_usage_buckets WHERE bucket >= ?`)
    .bind(new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 13))
    .first<{ n: number }>();
  const callsUsed = Number(used?.n ?? 0) + calls;
  /* The sensor at full rate is the workload the backfill must not starve. */
  const sensorDaily = 19_296;
  const projected = callsUsed + sensorDaily;

  return {
    shopsNeedingBaseline: needing,
    shopsComplete: Number(counts?.complete ?? 0),
    sampledShops: sizes.length,
    sampledListings: sizes.reduce((sum, n) => sum + n, 0),
    medianListingsPerShop: median,
    estimatedListings,
    estimatedCalls,
    callsUsedLast24h: callsUsed,
    projectedDailyCalls: projected,
    ceiling: 80_000,
    /* The backfill is spread over days, so the question is whether a day's
       slice fits beside everything else, not whether the whole job does. */
    safe: projected + Math.min(estimatedCalls, 10_000) < 80_000,
    hoursAtCurrentRate: Math.round((estimatedCalls / 3_000) * 10) / 10,
  };
}

/**
 * HOW MUCH ROOM IS LEFT TODAY, AFTER EVERYONE ELSE.
 *
 * The allowance belongs to the Etsy application, and the Listing Factory
 * publishing a batch matters more than a backfill finishing an hour sooner.
 * The backfill therefore gets whatever is left after a reserve for the
 * workloads that cannot wait, and it stops rather than competing.
 */
export const BACKFILL_RESERVE = 30_000;

export async function backfillRoom(): Promise<{ used: number; room: number }> {
  const used = await db().prepare(
    `SELECT COALESCE(SUM(calls), 0) AS n FROM etsy_api_usage_buckets WHERE bucket >= ?`)
    .bind(new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 13))
    .first<{ n: number }>();
  const spent = Number(used?.n ?? 0);
  return { used: spent, room: Math.max(0, 80_000 - BACKFILL_RESERVE - spent) };
}

export type BackfillPass = {
  shopsDone: number; shopsPartial: number; listings: number; calls: number;
  ms: number; room: number; stopped?: string;
};

/**
 * Baseline shops, most important first.
 *
 * Shops already seen selling come first, then shops with an interval waiting
 * on inspection, then everyone else. A shop that has never sold anything is
 * the cheapest one to be late about.
 */
export async function backfillPass(
  { maxCalls = 60 }: { maxCalls?: number } = {},
): Promise<BackfillPass> {
  await ensureBaselineTables();
  const started = Date.now();
  const pass: BackfillPass = {
    shopsDone: 0, shopsPartial: 0, listings: 0, calls: 0, ms: 0, room: 0,
  };

  const { room } = await backfillRoom();
  pass.room = room;
  if (room <= 0) {
    pass.ms = Date.now() - started;
    pass.stopped = "No room left under the daily reserve.";
    return pass;
  }
  const budget = Math.min(maxCalls, room);

  const queue = await db().prepare(
    `SELECT s.shop_id,
            CASE
              WHEN EXISTS (SELECT 1 FROM shop_sales_intervals i
                            WHERE i.shop_id = s.shop_id AND i.inspected_at IS NULL) THEN 0
              WHEN EXISTS (SELECT 1 FROM shop_sales_intervals i
                            WHERE i.shop_id = s.shop_id) THEN 1
              ELSE 2
            END AS priority
       FROM (SELECT DISTINCT shop_id FROM sold_watch WHERE shop_id IS NOT NULL) s
       LEFT JOIN shop_baselines b ON b.shop_id = s.shop_id
      WHERE b.shop_id IS NULL OR b.state <> 'complete'
      ORDER BY priority ASC
      LIMIT 200`)
    .all<{ shop_id: number; priority: number }>();

  for (const row of queue.results ?? []) {
    if (pass.calls >= budget) break;
    const result = await baselineShop(Number(row.shop_id), {
      maxPages: Math.min(MAX_PAGES_PER_SHOP, budget - pass.calls),
    });
    pass.calls += result.calls;
    pass.listings += result.listings;
    if (result.complete) pass.shopsDone += 1;
    else pass.shopsPartial += 1;
  }

  pass.ms = Date.now() - started;
  return pass;
}

/** Every listing Goldie believes exists in a shop, seen or currently missing. */
export async function knownListings(shopId: number): Promise<Array<{
  listingId: number; state: string; quantity: number | null;
  updated: number | null; missingSince: string | null;
}>> {
  const rows = await db().prepare(
    `SELECT listing_id, state, quantity, updated, missing_since
       FROM shop_listings WHERE shop_id = ?`).bind(shopId)
    .all<{ listing_id: number; state: string; quantity: number | null;
           updated: number | null; missing_since: string | null }>();
  return (rows.results ?? []).map(row => ({
    listingId: Number(row.listing_id),
    state: String(row.state ?? ""),
    quantity: row.quantity === null ? null : Number(row.quantity),
    updated: row.updated === null ? null : Number(row.updated),
    missingSince: row.missing_since,
  }));
}

/** Was this shop fully known before the moment in question? */
export async function baselineCompleteBefore(
  shopId: number, isoMoment: string,
): Promise<boolean> {
  const row = await db().prepare(
    `SELECT completed_at FROM shop_baselines WHERE shop_id = ? AND state = 'complete'`)
    .bind(shopId).first<{ completed_at: string | null }>();
  return Boolean(row?.completed_at && row.completed_at <= isoMoment);
}

export async function markMissing(shopId: number, listingIds: number[]): Promise<void> {
  if (!listingIds.length) return;
  const now = new Date().toISOString();
  const marks = listingIds.map(() => "?").join(",");
  await db().prepare(
    `UPDATE shop_listings
        SET missing_since = COALESCE(missing_since, ?), last_observed = ?
      WHERE shop_id = ? AND listing_id IN (${marks})`)
    .bind(now, now, shopId, ...listingIds)
    .run();
}
