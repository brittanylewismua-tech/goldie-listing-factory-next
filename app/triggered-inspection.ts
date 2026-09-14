/**
 * LOOK AT THE SHOP THAT JUST SOLD SOMETHING, NOW.
 *
 * The sensor knows a shop's counter moved. It does not know which listing. So
 * this reads every listing Goldie tracks in that shop, compares each against
 * its last stored snapshot, and tries to explain the increase with evidence.
 *
 * WHAT IT WILL NOT DO. It will not spread the unexplained remainder across
 * listings by views, favourites, age, popularity or judgement. If a shop sold
 * three and only one listing moved, one unit is credited and two stay
 * unresolved, permanently, in a column that says so. That number is the honest
 * measure of this system and hiding it would be the easiest lie in the
 * product.
 *
 * TIMING IS THE WHOLE GAME. Etsy shows current stock, not a history, so the
 * evidence expires: a seller restocking over the top of a sale erases it. The
 * inspection is enqueued the moment the sensor sees movement and the delay
 * between the two is recorded, because that delay is what decides how much can
 * ever be caught.
 */
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { diffSnapshots, salesLinked, type ListingEvent, type Snapshot } from "@/app/market-events";
import {
  claimLock, closeInterval, ensureMarketTables, fingerprint, flagHotCandidates,
  latestSnapshots, releaseLock, writeEvents, writeSalesActivity, writeSnapshots,
} from "@/app/market-store";

const db = () => (env as unknown as { DB: D1Database }).DB;

const BATCH = 100;
/** A shop with more tracked listings than this is read in several calls. */
const MAX_LISTINGS_PER_SHOP = 300;
const MAX_ATTEMPTS = 4;

/**
 * VARIATION-LEVEL INVENTORY IS BUILT BUT OFF.
 *
 * `listings/batch/inventory` answers 200 for other people's listings when the
 * call is signed with the connected seller's OAuth token — measured, not
 * assumed. That is a materially different posture from an app-key read, so it
 * stays behind this flag until Etsy confirms in writing that it is inside the
 * granted authorisation. Aggregate quantity is the production path and the
 * feature does not depend on the flag ever being turned on.
 */
export const variationInventoryEnabled = (): boolean =>
  String((env as unknown as { MARKET_VARIATION_INVENTORY?: string })
    .MARKET_VARIATION_INVENTORY ?? "").toLowerCase() === "on";

type EtsyListing = {
  listing_id?: number; shop_id?: number; quantity?: number; state?: string;
  price?: { amount?: number; divisor?: number };
  num_favorers?: number; views?: number;
  last_modified_timestamp?: number; original_creation_timestamp?: number;
  taxonomy_id?: number; title?: string; tags?: string[];
  images?: Array<{ url_570xN?: string; listing_image_id?: number }>;
};

const toSnapshot = (listing: EtsyListing, observedAt: string): Snapshot | null => {
  if (!listing.listing_id) return null;
  const price = listing.price;
  return {
    listingId: Number(listing.listing_id),
    shopId: Number(listing.shop_id ?? 0),
    observedAt,
    quantity: listing.quantity === undefined ? null : Number(listing.quantity),
    state: String(listing.state ?? ""),
    priceCents: price?.amount === undefined
      ? null
      : Math.round((Number(price.amount) / Number(price.divisor || 100)) * 100),
    favorites: listing.num_favorers === undefined ? null : Number(listing.num_favorers),
    views: listing.views === undefined ? null : Number(listing.views),
    lastModified: listing.last_modified_timestamp === undefined
      ? null : Number(listing.last_modified_timestamp),
    /* The true birth date. creation_timestamp resets on renewal and has made
       four-month-old listings look new before. */
    originalCreated: listing.original_creation_timestamp === undefined
      ? null : Number(listing.original_creation_timestamp),
    taxonomyId: listing.taxonomy_id === undefined ? null : Number(listing.taxonomy_id),
    titleHash: fingerprint(String(listing.title ?? "")),
    tagsHash: fingerprint((listing.tags ?? []).join("|")),
    imageHash: fingerprint(String(listing.images?.[0]?.listing_image_id ?? "")),
  };
};

async function readListings(listingIds: number[]): Promise<{ listings: EtsyListing[]; calls: number }> {
  const listings: EtsyListing[] = [];
  let calls = 0;
  for (let index = 0; index < listingIds.length; index += BATCH) {
    const slice = listingIds.slice(index, index + BATCH);
    await waitForEtsyCapacity();
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/listings/batch` +
      `?listing_ids=${slice.join(",")}&includes=Images&currency=USD`,
      { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) },
    );
    await recordEtsyCall(response, "search");
    calls += 1;
    if (!response.ok) continue;
    const body = await response.json() as { results?: EtsyListing[] };
    listings.push(...(body.results ?? []));
  }
  return { listings, calls };
}

export type InspectionResult = {
  intervalId: number;
  shopId: number;
  listingsInspected: number;
  baselinesEstablished: number;
  eventsCreated: number;
  duplicatesPrevented: number;
  unitsObserved: number;
  unitsAttributed: number;
  unitsUnresolved: number;
  conflicted: boolean;
  calls: number;
  delayMs: number;
  ms: number;
};

/** Inspect one queued interval. Safe to run twice; the second run changes nothing. */
export async function inspectInterval(intervalId: number): Promise<InspectionResult | null> {
  const started = Date.now();
  const interval = await db()
    .prepare(
      `SELECT id, shop_id, from_observed, to_observed, sold_delta
         FROM shop_sales_intervals WHERE id = ?`)
    .bind(intervalId)
    .first<{
      id: number; shop_id: number; from_observed: string;
      to_observed: string; sold_delta: number;
    }>();
  if (!interval) return null;

  /* Sold-out listings are the point, not an omission: a listing that sold out
     since the last look is the clearest evidence there is, and filtering to
     active ones would throw exactly those away. */
  const tracked = await db()
    .prepare(
      `SELECT listing_id FROM sold_watch WHERE shop_id = ?
        ORDER BY last_read DESC LIMIT ?`)
    .bind(interval.shop_id, MAX_LISTINGS_PER_SHOP)
    .all<{ listing_id: number }>();
  const listingIds = (tracked.results ?? []).map(row => Number(row.listing_id));
  if (!listingIds.length) {
    await closeInterval(interval.id, 0, interval.sold_delta, false);
    return {
      intervalId, shopId: interval.shop_id, listingsInspected: 0, baselinesEstablished: 0,
      eventsCreated: 0, duplicatesPrevented: 0, unitsObserved: interval.sold_delta,
      unitsAttributed: 0, unitsUnresolved: interval.sold_delta, conflicted: false,
      calls: 0, delayMs: Date.now() - Date.parse(interval.to_observed), ms: Date.now() - started,
    };
  }

  const [{ listings, calls }, baselines] = await Promise.all([
    readListings(listingIds),
    latestSnapshots(listingIds),
  ]);

  const observedAt = new Date().toISOString();
  const snapshots: Snapshot[] = [];
  const events: ListingEvent[] = [];
  let baselinesEstablished = 0;

  for (const listing of listings) {
    const snapshot = toSnapshot(listing, observedAt);
    if (!snapshot) continue;
    snapshots.push(snapshot);
    const before = baselines.get(snapshot.listingId);
    /*
      A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT.

      Comparing a listing against nothing has produced phantom sales in this
      codebase before — over a thousand of them in one night. A listing with no
      prior snapshot is recorded and left alone until there is something to
      compare it with.
    */
    if (!before) {
      baselinesEstablished += 1;
      continue;
    }
    events.push(...diffSnapshots(before, snapshot));
  }

  const outcome = salesLinked(events, interval.sold_delta, snapshots.length);
  for (const event of events) if (outcome.conflicted) event.conflicted = true;

  await writeSnapshots(snapshots);
  const written = await writeEvents(events, "triggered-inspection", interval.id);
  await writeSalesActivity(
    outcome.linked.map(row => ({ ...row })), interval.id);

  const attributed = outcome.linked.reduce((sum, row) => sum + row.units, 0);
  await closeInterval(interval.id, attributed, outcome.unresolved, outcome.conflicted);

  /* The Hot Pool's hook. Flagging is all that happens here — nothing decides
     how often a hot listing is polled, because the Hot Pool is not built. */
  await flagHotCandidates(outcome.linked.map(row => ({
    listingId: row.listingId, shopId: row.shopId, reason: row.reason,
  })));

  return {
    intervalId, shopId: interval.shop_id,
    listingsInspected: snapshots.length,
    baselinesEstablished,
    eventsCreated: written.written,
    duplicatesPrevented: written.duplicates,
    unitsObserved: interval.sold_delta,
    unitsAttributed: attributed,
    unitsUnresolved: outcome.unresolved,
    conflicted: outcome.conflicted,
    calls,
    /* How long the evidence sat there before anybody looked. */
    delayMs: Date.now() - Date.parse(interval.to_observed),
    ms: Date.now() - started,
  };
}

export type InspectionPass = {
  taken: number; completed: number; failed: number;
  unitsObserved: number; unitsAttributed: number; unitsUnresolved: number;
  calls: number; ms: number; skipped?: string;
};

/**
 * Work the queue for one firing.
 *
 * A job that throws goes back to queued with its attempt count raised, so a
 * bad minute at Etsy costs a retry rather than a lost interval. After enough
 * attempts it is parked as failed — visible in the health view, never silently
 * dropped.
 */
export async function inspectionPass(
  { maxJobs = 20, maxCalls = 200 }: { maxJobs?: number; maxCalls?: number } = {},
): Promise<InspectionPass> {
  await ensureMarketTables();
  const started = Date.now();
  const pass: InspectionPass = {
    taken: 0, completed: 0, failed: 0,
    unitsObserved: 0, unitsAttributed: 0, unitsUnresolved: 0, calls: 0, ms: 0,
  };

  const holder = crypto.randomUUID();
  if (!(await claimLock("triggered-inspection", holder, 240)))
    return { ...pass, skipped: "An inspection pass was already running." };

  try {
    /* A job left running by a firing that died is reclaimed, for the same
       reason the ingest reclaims its files: work must never vanish. */
    await db()
      .prepare(
        `UPDATE inspection_jobs SET state = 'queued'
          WHERE state = 'running' AND started_at < ?`)
      .bind(new Date(Date.now() - 15 * 60_000).toISOString())
      .run();

    for (let taken = 0; taken < maxJobs && pass.calls < maxCalls; taken += 1) {
      const job = await db()
        .prepare(
          `SELECT interval_id, attempts FROM inspection_jobs
            WHERE state = 'queued' ORDER BY queued_at ASC LIMIT 1`)
        .first<{ interval_id: number; attempts: number }>();
      if (!job) break;

      pass.taken += 1;
      await db()
        .prepare(
          `UPDATE inspection_jobs
              SET state = 'running', started_at = ?, attempts = attempts + 1
            WHERE interval_id = ?`)
        .bind(new Date().toISOString(), job.interval_id)
        .run();

      try {
        const result = await inspectInterval(job.interval_id);
        if (!result) {
          await db().prepare(
            `UPDATE inspection_jobs SET state = 'failed', error = 'Interval missing',
                    finished_at = ? WHERE interval_id = ?`)
            .bind(new Date().toISOString(), job.interval_id).run();
          pass.failed += 1;
          continue;
        }
        pass.completed += 1;
        pass.calls += result.calls;
        pass.unitsObserved += result.unitsObserved;
        pass.unitsAttributed += result.unitsAttributed;
        pass.unitsUnresolved += result.unitsUnresolved;
        await db().prepare(
          `UPDATE inspection_jobs
              SET state = 'done', finished_at = ?, listings_inspected = ?,
                  events_created = ?, duplicates_prevented = ?, units_attributed = ?,
                  units_unresolved = ?, conflicts = ?, requests = ?, delay_ms = ?, error = ''
            WHERE interval_id = ?`)
          .bind(new Date().toISOString(), result.listingsInspected, result.eventsCreated,
            result.duplicatesPrevented, result.unitsAttributed, result.unitsUnresolved,
            result.conflicted ? 1 : 0, result.calls, result.delayMs, job.interval_id)
          .run();
      } catch (error) {
        pass.failed += 1;
        const message = error instanceof Error ? error.message : "failed";
        const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
        await db().prepare(
          `UPDATE inspection_jobs SET state = ?, error = ?, finished_at = ?
            WHERE interval_id = ?`)
          .bind(exhausted ? "failed" : "queued", message.slice(0, 300),
            new Date().toISOString(), job.interval_id)
          .run();
      }
    }
  } finally {
    await releaseLock("triggered-inspection", holder);
  }

  pass.ms = Date.now() - started;
  return pass;
}
