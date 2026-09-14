/**
 * POLL THE LISTINGS, NOT THE SHOPS.
 *
 * The whole-shop plan died on a measurement: the monitored shops hold a median
 * of 695 listings and one holds 11,202, so enumerating a shop on every sale
 * would cost seven to fifteen calls, thousands of times an hour. Off by two
 * orders of magnitude.
 *
 * The corpus itself is small — about fifteen thousand listings — and Etsy will
 * return a hundred of them in one call. Reading the entire corpus therefore
 * costs about 149 calls, and can be done every ten minutes for around 21,000
 * calls a day. Shop size stops mattering entirely.
 *
 * AND IT ANSWERS THE RIGHT QUESTION. A shop that sold six units while Goldie
 * monitors two of its listings has not defeated the detector; four of those
 * sales were on listings nobody asked about. What matters is whether movement
 * on the monitored listings is caught. The shop counter stays in the design as
 * corroboration and as a hard cap — never as the denominator of a score.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { diffSnapshots, salesLinked, type ListingEvent, type Snapshot } from "@/app/market-events";
import {
  claimLock, ensureMarketTables, fingerprint, flagHotCandidates, latestSnapshots,
  releaseLock, writeEvents, writeSalesActivity, writeSnapshots,
} from "@/app/market-store";

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Measured against production, not read in a document. */
export const BATCH = 100;
/** Every ten minutes, which is what the budget supports at this corpus size. */
export const SWEEP_MINUTES = 10;
/**
 * The poller is not allowed to consume the allowance the Listing Factory needs
 * to publish with. It stops instead of competing.
 */
export const POLL_RESERVE = 20_000;

export type Tier = "watch" | "momentum" | "general" | "cold";

export async function ensurePollTables(): Promise<void> {
  await db().batch([
    /*
      Which listings are polled, and when each was last read.
      Separate from the discovery corpus on purpose: a listing that falls out
      of Etsy's search results has not stopped existing, and dropping it here
      would make selling out — the clearest signal there is — look like a
      disappearance.
    */
    db().prepare(`CREATE TABLE IF NOT EXISTS corpus_poll_state (
      listing_id INTEGER PRIMARY KEY,
      shop_id INTEGER,
      tier TEXT NOT NULL DEFAULT 'general',
      last_polled TEXT,
      polls INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0,
      unavailable_since TEXT
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS corpus_poll_due ON corpus_poll_state (last_polled)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS corpus_poll_tier ON corpus_poll_state (tier, last_polled)`),

    /* Movement with no shop-level sale behind it. Kept, because a manual
       inventory edit is worth knowing about and because throwing it away
       would hide the difference between "no movement" and "movement we
       could not corroborate". */
    db().prepare(`CREATE TABLE IF NOT EXISTS uncorroborated_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      units INTEGER NOT NULL,
      reason TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      previous_observed_at TEXT NOT NULL
    )`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS uncorroborated_recent
         ON uncorroborated_changes (observed_at DESC)`),

    /* One sweep, one row: how long it took, what it cost, what it found. */
    db().prepare(`CREATE TABLE IF NOT EXISTS poll_sweeps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      listings INTEGER NOT NULL DEFAULT 0,
      batches_attempted INTEGER NOT NULL DEFAULT 0,
      batches_completed INTEGER NOT NULL DEFAULT 0,
      baselines INTEGER NOT NULL DEFAULT 0,
      events INTEGER NOT NULL DEFAULT 0,
      corroborated INTEGER NOT NULL DEFAULT 0,
      uncorroborated INTEGER NOT NULL DEFAULT 0,
      units INTEGER NOT NULL DEFAULT 0,
      sold_out INTEGER NOT NULL DEFAULT 0,
      missing INTEGER NOT NULL DEFAULT 0,
      calls INTEGER NOT NULL DEFAULT 0,
      ms INTEGER
    )`),
  ]);
}

/** Every discovered listing joins the polling corpus, and never leaves it. */
export async function adoptCorpus(): Promise<number> {
  const result = await db().prepare(
    `INSERT INTO corpus_poll_state (listing_id, shop_id)
     SELECT listing_id, shop_id FROM sold_watch
     ON CONFLICT(listing_id) DO NOTHING`).run();
  return Number(result.meta?.changes ?? 0);
}

type BatchListing = {
  listing_id?: number; shop_id?: number; state?: string; quantity?: number;
  price?: { amount?: number; divisor?: number };
  num_favorers?: number; views?: number;
  creation_timestamp?: number; original_creation_timestamp?: number;
  last_modified_timestamp?: number; state_timestamp?: number;
  taxonomy_id?: number; title?: string; tags?: string[];
};

const toSnapshot = (row: BatchListing, observedAt: string): Snapshot | null => {
  if (!row.listing_id) return null;
  const price = row.price;
  return {
    listingId: Number(row.listing_id),
    shopId: Number(row.shop_id ?? 0),
    observedAt,
    quantity: row.quantity === undefined ? null : Number(row.quantity),
    state: String(row.state ?? ""),
    priceCents: price?.amount === undefined
      ? null : Math.round((Number(price.amount) / Number(price.divisor || 100)) * 100),
    favorites: row.num_favorers === undefined ? null : Number(row.num_favorers),
    views: row.views === undefined ? null : Number(row.views),
    lastModified: row.last_modified_timestamp === undefined
      ? null : Number(row.last_modified_timestamp),
    /* The true birth date; creation_timestamp resets on renewal. */
    originalCreated: row.original_creation_timestamp === undefined
      ? null : Number(row.original_creation_timestamp),
    taxonomyId: row.taxonomy_id === undefined ? null : Number(row.taxonomy_id),
    titleHash: fingerprint(String(row.title ?? "")),
    tagsHash: fingerprint((row.tags ?? []).join("|")),
    imageHash: "",
  };
};

export async function readBatch(listingIds: number[]): Promise<{
  listings: BatchListing[]; ok: boolean; status: number; ms: number; bytes: number;
}> {
  await waitForEtsyCapacity();
  const started = Date.now();
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/listings/batch` +
    `?listing_ids=${listingIds.join(",")}&currency=USD`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(25_000) },
  );
  await recordEtsyCall(response, "search");
  const text = await response.text();
  const ms = Date.now() - started;
  if (!response.ok) return { listings: [], ok: false, status: response.status, ms, bytes: text.length };
  const body = JSON.parse(text) as { results?: BatchListing[] };
  return { listings: body.results ?? [], ok: true, status: 200, ms, bytes: text.length };
}

/**
 * THE SHOP COUNTER IS A GATE AND A CEILING, NEVER A NUMBER.
 *
 * A quantity drop only becomes a sale if the shop's own sold count rose over a
 * window covering it, and the units credited across all of that shop's
 * listings can never exceed the increase. Whatever is left over stays
 * unresolved — and, crucially, does not count against this detector, because
 * it belongs to listings nobody asked us to watch.
 */
async function intervalFor(
  shopId: number, fromIso: string, toIso: string,
): Promise<{ id: number; soldDelta: number; remaining: number } | null> {
  const row = await db().prepare(
    `SELECT i.id, i.sold_delta,
            i.sold_delta - COALESCE(
              (SELECT SUM(a.units) FROM listing_sales_activity a WHERE a.interval_id = i.id), 0)
              AS remaining
       FROM shop_sales_intervals i
      WHERE i.shop_id = ?
        AND i.to_observed >= ?
        AND i.from_observed <= ?
      ORDER BY i.to_observed DESC LIMIT 1`)
    .bind(shopId, fromIso, toIso)
    .first<{ id: number; sold_delta: number; remaining: number }>();
  if (!row) return null;
  return {
    id: Number(row.id),
    soldDelta: Number(row.sold_delta),
    remaining: Math.max(0, Number(row.remaining)),
  };
}

export type SweepResult = {
  listings: number; batchesAttempted: number; batchesCompleted: number;
  baselines: number; events: number; corroborated: number; uncorroborated: number;
  units: number; soldOut: number; missing: number; calls: number; ms: number;
  medianBatchMs: number | null; medianBatchBytes: number | null;
  room: number; skipped?: string;
};

/**
 * One slice of the corpus.
 *
 * Ordered by how long since each listing was read, so a bounded sweep still
 * covers everything in rotation rather than favouring the same listings.
 */
export async function pollSweep(
  { maxBatches = 40 }: { maxBatches?: number } = {},
): Promise<SweepResult> {
  await ensureMarketTables();
  await ensurePollTables();
  const started = Date.now();
  const result: SweepResult = {
    listings: 0, batchesAttempted: 0, batchesCompleted: 0, baselines: 0, events: 0,
    corroborated: 0, uncorroborated: 0, units: 0, soldOut: 0, missing: 0,
    calls: 0, ms: 0, medianBatchMs: null, medianBatchBytes: null, room: 0,
  };

  const holder = crypto.randomUUID();
  if (!(await claimLock("listing-poller", holder, 300)))
    return { ...result, skipped: "A sweep was already running." };

  try {
    await adoptCorpus();

    const used = await db().prepare(
      `SELECT COALESCE(SUM(calls), 0) AS n FROM etsy_api_usage_buckets WHERE bucket >= ?`)
      .bind(new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 13))
      .first<{ n: number }>();
    const room = Math.max(0, 80_000 - POLL_RESERVE - Number(used?.n ?? 0));
    result.room = room;
    if (room <= 0) {
      result.ms = Date.now() - started;
      result.skipped = "No room left under the daily reserve.";
      return result;
    }
    const budget = Math.min(maxBatches, room);

    const sweepRow = await db().prepare(
      `INSERT INTO poll_sweeps (started_at) VALUES (?)`)
      .bind(new Date(started).toISOString()).run();
    const sweepId = Number(sweepRow.meta?.last_row_id ?? 0);

    const times: number[] = [];
    const sizes: number[] = [];

    for (let batch = 0; batch < budget; batch += 1) {
      const due = await db().prepare(
        `SELECT listing_id, shop_id FROM corpus_poll_state
          ORDER BY last_polled IS NULL DESC, last_polled ASC LIMIT ?`)
        .bind(BATCH)
        .all<{ listing_id: number; shop_id: number | null }>();
      const rows = due.results ?? [];
      if (!rows.length) break;
      const ids = rows.map(row => Number(row.listing_id));

      result.batchesAttempted += 1;
      const answer = await readBatch(ids);
      result.calls += 1;
      times.push(answer.ms);
      sizes.push(answer.bytes);

      if (!answer.ok) {
        /*
          A FAILED BATCH IS RETRIED, NOT SKIPPED.

          last_polled is deliberately not advanced, so these listings stay at
          the front of the queue and the next sweep picks them up. Marking them
          read would quietly age them out of the rotation.
        */
        continue;
      }
      result.batchesCompleted += 1;

      const observedAt = new Date().toISOString();
      const snapshots: Snapshot[] = [];
      for (const listing of answer.listings) {
        const snapshot = toSnapshot(listing, observedAt);
        if (snapshot) snapshots.push(snapshot);
      }
      result.listings += snapshots.length;

      /* A listing Etsy would not return at all is counted, never guessed at. */
      const answered = new Set(snapshots.map(snapshot => snapshot.listingId));
      const silent = ids.filter(id => !answered.has(id));
      result.missing += silent.length;

      const baselines = await latestSnapshots(snapshots.map(snapshot => snapshot.listingId));
      const events: ListingEvent[] = [];
      for (const snapshot of snapshots) {
        const before = baselines.get(snapshot.listingId);
        /* A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT. */
        if (!before) { result.baselines += 1; continue; }
        events.push(...diffSnapshots(before, snapshot));
      }
      result.soldOut += events.filter(event => event.type === "listing_sold_out").length;

      const written = await writeEvents(events, "listing-poller", null);
      result.events += written.written;

      /* Corroborate shop by shop, because the cap belongs to the shop. */
      const byShop = new Map<number, ListingEvent[]>();
      for (const event of events) {
        const list = byShop.get(event.shopId) ?? [];
        list.push(event);
        byShop.set(event.shopId, list);
      }
      for (const [shopId, shopEvents] of byShop) {
        const window = shopEvents[0];
        const interval = await intervalFor(shopId, window.previousObservedAt, window.observedAt);
        const candidates = salesLinked(shopEvents, interval?.remaining ?? 0, snapshots.length);
        if (interval && candidates.linked.length) {
          await writeSalesActivity(candidates.linked, interval.id);
          await flagHotCandidates(candidates.linked.map(row => ({
            listingId: row.listingId, shopId: row.shopId, reason: row.reason,
          })));
          result.corroborated += candidates.linked.length;
          result.units += candidates.linked.reduce((sum, row) => sum + row.units, 0);
        } else {
          /*
            Movement with nothing behind it. Not a sale, not discarded — a
            manual edit, a restock, or a sale in a window the sensor has not
            caught up with. Keeping it is what lets the two be told apart later.
          */
          const uncorroborated = shopEvents.filter(event =>
            event.type === "aggregate_quantity_decreased" || event.type === "listing_sold_out");
          if (uncorroborated.length) {
            const insert = db().prepare(
              `INSERT INTO uncorroborated_changes
                 (listing_id, shop_id, units, reason, observed_at, previous_observed_at)
               VALUES (?,?,?,?,?,?)`);
            await db().batch(uncorroborated.map(event => insert.bind(
              event.listingId, event.shopId, Math.abs(Number(event.delta ?? 1)),
              event.type, event.observedAt, event.previousObservedAt)));
            result.uncorroborated += uncorroborated.length;
          }
        }
      }

      await writeSnapshots(snapshots);

      const mark = db().prepare(
        `UPDATE corpus_poll_state
            SET last_polled = ?, polls = polls + 1,
                misses = CASE WHEN ? THEN misses + 1 ELSE 0 END,
                unavailable_since = CASE WHEN ? THEN COALESCE(unavailable_since, ?) ELSE NULL END
          WHERE listing_id = ?`);
      const marks = ids.map(id => {
        const silentOne = !answered.has(id);
        return mark.bind(observedAt, silentOne ? 1 : 0, silentOne ? 1 : 0, observedAt, id);
      });
      for (let index = 0; index < marks.length; index += 100)
        await db().batch(marks.slice(index, index + 100));
    }

    const median = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    result.medianBatchMs = median(times);
    result.medianBatchBytes = median(sizes);
    result.ms = Date.now() - started;

    await db().prepare(
      `UPDATE poll_sweeps
          SET finished_at = ?, listings = ?, batches_attempted = ?, batches_completed = ?,
              baselines = ?, events = ?, corroborated = ?, uncorroborated = ?, units = ?,
              sold_out = ?, missing = ?, calls = ?, ms = ?
        WHERE id = ?`)
      .bind(new Date().toISOString(), result.listings, result.batchesAttempted,
        result.batchesCompleted, result.baselines, result.events, result.corroborated,
        result.uncorroborated, result.units, result.soldOut, result.missing,
        result.calls, result.ms, sweepId)
      .run();

    return result;
  } finally {
    await releaseLock("listing-poller", holder);
  }
}

/**
 * WHAT SIZE OF BATCH DOES ETSY ACTUALLY ACCEPT?
 *
 * Documented is not measured, and the whole cost model rests on this number.
 * Asks for one over the assumed limit as well, because a silently truncated
 * answer would look like success and quietly halve the corpus.
 */
export async function measureBatchLimit(): Promise<{
  hundred: { status: number; returned: number; ms: number; bytes: number };
  overLimit: { status: number; returned: number; ms: number; bytes: number };
  corpusSize: number; callsPerSweep: number; sweepsPerDay: number; callsPerDay: number;
}> {
  await ensurePollTables();
  await adoptCorpus();
  const rows = await db().prepare(
    `SELECT listing_id FROM corpus_poll_state LIMIT 101`).all<{ listing_id: number }>();
  const ids = (rows.results ?? []).map(row => Number(row.listing_id));

  const hundred = await readBatch(ids.slice(0, 100));
  const overLimit = await readBatch(ids.slice(0, 101));
  const size = await db().prepare(
    `SELECT COUNT(*) AS n FROM corpus_poll_state`).first<{ n: number }>();

  const corpusSize = Number(size?.n ?? 0);
  const callsPerSweep = Math.ceil(corpusSize / BATCH);
  const sweepsPerDay = Math.floor((24 * 60) / SWEEP_MINUTES);
  return {
    hundred: { status: hundred.status, returned: hundred.listings.length, ms: hundred.ms, bytes: hundred.bytes },
    overLimit: { status: overLimit.status, returned: overLimit.listings.length, ms: overLimit.ms, bytes: overLimit.bytes },
    corpusSize, callsPerSweep, sweepsPerDay, callsPerDay: callsPerSweep * sweepsPerDay,
  };
}

/** The detector's own metrics, over monitored listings rather than whole shops. */
export async function detectorHealth(days = 7): Promise<Record<string, unknown>> {
  await ensurePollTables();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const fresh = new Date(Date.now() - SWEEP_MINUTES * 2 * 60_000).toISOString();

  const [corpus, sweeps, activity, uncorroborated, soldOut] = await Promise.all([
    db().prepare(
      `SELECT COUNT(*) AS listings,
              SUM(CASE WHEN last_polled IS NOT NULL THEN 1 ELSE 0 END) AS polled,
              SUM(CASE WHEN last_polled >= ? THEN 1 ELSE 0 END) AS fresh,
              SUM(CASE WHEN unavailable_since IS NOT NULL THEN 1 ELSE 0 END) AS unavailable,
              MIN(last_polled) AS oldest
         FROM corpus_poll_state`).bind(fresh).first<Record<string, number | string>>(),
    db().prepare(
      `SELECT COUNT(*) AS sweeps,
              COALESCE(SUM(batches_attempted),0) AS attempted,
              COALESCE(SUM(batches_completed),0) AS completed,
              COALESCE(SUM(calls),0) AS calls,
              COALESCE(SUM(events),0) AS events,
              COALESCE(SUM(baselines),0) AS baselines,
              COALESCE(AVG(ms),0) AS avg_ms
         FROM poll_sweeps WHERE started_at >= ?`).bind(since).first<Record<string, number>>(),
    db().prepare(
      `SELECT COUNT(*) AS events, COALESCE(SUM(units),0) AS units,
              COUNT(DISTINCT listing_id) AS listings
         FROM listing_sales_activity WHERE observed_at >= ?`).bind(since).first<Record<string, number>>(),
    db().prepare(
      `SELECT COUNT(*) AS n FROM uncorroborated_changes WHERE observed_at >= ?`)
      .bind(since).first<{ n: number }>(),
    db().prepare(
      `SELECT COUNT(*) AS n FROM listing_events
        WHERE type = 'listing_sold_out' AND observed_at >= ?`).bind(since).first<{ n: number }>(),
  ]);

  const listings = Number(corpus?.listings ?? 0);
  const attempted = Number(sweeps?.attempted ?? 0);
  const baselined = Number(corpus?.polled ?? 0);
  return {
    monitoredListings: listings,
    withBaseline: baselined,
    withBaselinePercent: listings ? Math.round((baselined / listings) * 1000) / 10 : 0,
    freshWithinTwoSweeps: Number(corpus?.fresh ?? 0),
    freshnessPercent: listings
      ? Math.round((Number(corpus?.fresh ?? 0) / listings) * 1000) / 10 : 0,
    oldestPoll: corpus?.oldest ?? null,
    currentlyUnavailable: Number(corpus?.unavailable ?? 0),
    sweeps: Number(sweeps?.sweeps ?? 0),
    batchesAttempted: attempted,
    batchesCompleted: Number(sweeps?.completed ?? 0),
    batchCompletionPercent: attempted
      ? Math.round((Number(sweeps?.completed ?? 0) / attempted) * 1000) / 10 : 0,
    changesDetected: Number(sweeps?.events ?? 0),
    baselinesEstablished: Number(sweeps?.baselines ?? 0),
    corroboratedSalesEvents: Number(activity?.events ?? 0),
    unitsAttributedToMonitoredListings: Number(activity?.units ?? 0),
    listingsWithAttribution: Number(activity?.listings ?? 0),
    uncorroboratedChanges: Number(uncorroborated?.n ?? 0),
    soldOutTransitions: Number(soldOut?.n ?? 0),
    callsPerCompleteSweep: Math.ceil(listings / BATCH),
    projectedDailyCalls: Math.ceil(listings / BATCH) * Math.floor((24 * 60) / SWEEP_MINUTES),
    averageSweepMs: Math.round(Number(sweeps?.avg_ms ?? 0)),
  };
}
