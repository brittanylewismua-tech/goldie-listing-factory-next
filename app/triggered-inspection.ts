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
import { classify as classifyReference } from "@/app/reference-recovery";
import { ensureReferenceImageTable, rememberReferenceImage } from "@/app/reference-image-store";
import {
  baselineCompleteBefore, ensureBaselineTables, knownListings, markMissing,
  readShopPage, writeShopListings, MAX_PAGES_PER_SHOP, PAGE,
} from "@/app/shop-baseline";

const db = () => (env as unknown as { DB: D1Database }).DB;

const BATCH = 100;
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
    /* A fingerprint of Etsy's IMAGE IDENTIFIER — enough to notice the primary
       image changed, and nothing more. It is not a hash of the picture. The
       identifier and the URL themselves are written to `reference_images`,
       which the bulk poller never touches, so a later poll cannot erase the
       current image the way it erases this column. */
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
  /** Whether the shop was fully known before the interval began. */
  eligible: boolean;
  missingResolved: number;
  calls: number;
  delayMs: number;
  ms: number;
};

/** Inspect one queued interval. Safe to run twice; the second run changes nothing. */
export async function inspectInterval(intervalId: number): Promise<InspectionResult | null> {
  const started = Date.now();
  await ensureBaselineTables();
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

  /*
    ELIGIBILITY IS DECIDED BEFORE ANYTHING IS MEASURED.

    An interval that began before Goldie knew the whole shop can never be
    judged against it: the listing that sold may simply not have been in the
    picture. Those units stay unresolved forever and are excluded from the
    coverage figure that matters, rather than dragging it down as though the
    detector had failed to find something it was never shown.
  */
  const eligible = await baselineCompleteBefore(interval.shop_id, interval.from_observed);

  /* THE WHOLE SHOP, not the handful of listings discovery happened to find.
     This is the fix: 2.2 listings per shop made most sales unexplainable by
     construction. */
  const seen: Snapshot[] = [];
  const activeIds = new Set<number>();
  let calls = 0;
  const observedAt = new Date().toISOString();

  for (let page = 0; page < MAX_PAGES_PER_SHOP; page += 1) {
    const answer = await readShopPage(interval.shop_id, page * PAGE);
    calls += 1;
    if (!answer.ok) break;
    await writeShopListings(answer.listings);
    for (const listing of answer.listings) {
      activeIds.add(listing.listingId);
      seen.push({
        listingId: listing.listingId,
        shopId: listing.shopId,
        observedAt,
        quantity: listing.quantity,
        state: listing.state,
        /* The shop enumeration is deliberately thin: price, favourites and
           views are not asked for here because detection does not need them
           and fetching them for every listing in every selling shop would
           cost more than the whole sensor. They are filled in later, only for
           listings that turn out to matter. */
        priceCents: null,
        favorites: null,
        views: null,
        lastModified: listing.updated,
        originalCreated: listing.originalCreated,
        taxonomyId: listing.taxonomyId,
        titleHash: fingerprint(listing.title),
        tagsHash: "",
        imageHash: "",
      });
    }
    if (answer.listings.length < PAGE) break;
  }

  /*
    A LISTING THAT VANISHED IS A QUESTION, NOT AN ANSWER.

    Gone from the active response means sold out, deactivated, expired or
    deleted, and those are not the same event. The known ids that did not come
    back are resolved with a direct read, because calling a deactivation a
    sale would be the most damaging mistake this system could make.
  */
  const known = await knownListings(interval.shop_id);
  const missing = known
    .filter(row => !activeIds.has(row.listingId) && !row.missingSince)
    .map(row => row.listingId);
  if (missing.length) {
    const resolved = await readListings(missing.slice(0, 200));
    calls += resolved.calls;
    const answered = new Set<number>();
    for (const listing of resolved.listings) {
      const snapshot = toSnapshot(listing, observedAt);
      if (!snapshot) continue;
      answered.add(snapshot.listingId);
      seen.push(snapshot);
    }
    /* Anything Etsy would not answer for at all is recorded as missing rather
       than guessed at. */
    await markMissing(interval.shop_id, missing.filter(id => !answered.has(id)));
  }

  const baselines = await latestSnapshots(seen.map(snapshot => snapshot.listingId));
  const events: ListingEvent[] = [];
  let baselinesEstablished = 0;
  for (const snapshot of seen) {
    const before = baselines.get(snapshot.listingId);
    /*
      A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT.

      Comparing a listing against nothing invented over a thousand phantom
      sales in this codebase once. A listing with no prior snapshot is
      recorded and left alone until there is something to compare it with.
    */
    if (!before) {
      baselinesEstablished += 1;
      continue;
    }
    events.push(...diffSnapshots(before, snapshot));
  }

  const outcome = salesLinked(events, interval.sold_delta, seen.length);
  for (const event of events) if (outcome.conflicted) event.conflicted = true;

  /*
    THE BASELINE MOVES ONLY AFTER THE RESULT IS SAFE.

    Writing the new snapshots first would destroy the comparison point if
    anything after it failed, and the interval would be unrecoverable — the
    evidence for it would have been overwritten by the reading that was
    supposed to explain it.
  */
  const written = await writeEvents(events, "triggered-inspection", interval.id);
  await writeSalesActivity(outcome.linked.map(row => ({ ...row })), interval.id);
  const attributed = outcome.linked.reduce((sum, row) => sum + row.units, 0);
  await closeInterval(interval.id, attributed, outcome.unresolved, outcome.conflicted, eligible);
  await flagHotCandidates(outcome.linked.map(row => ({
    listingId: row.listingId, shopId: row.shopId, reason: row.reason,
  })));
  await writeSnapshots(seen);

  /*
    KEEP THE IMAGE OF WHAT ACTUALLY SOLD.

    The shop enumeration returns no images at all — `listings/active` does not
    carry them and `includes=Images` does not change that, which is measured,
    not assumed. Only `listings/batch` does. So rather than fetch images for
    every listing in every selling shop, this asks for them ONLY for the
    listings that just earned sale-linked evidence: a handful per inspection,
    one extra call, and exactly the listings a reference cohort can ever use.

    It is written to `reference_images`, not to the snapshot, because a later
    bulk poll overwrites snapshots with rows that carry no image and would
    erase the current image identity. That is the bug this replaces.
  */
  const movedIds = [...new Set(outcome.linked.map(row => row.listingId))];
  if (movedIds.length) {
    try {
      const withImages = await readListings(movedIds.slice(0, BATCH));
      calls += withImages.calls;
      await ensureReferenceImageTable();
      const capturedAt = Math.floor(Date.now() / 1000);
      for (const listing of withImages.listings) {
        const row = classifyReference(listing);
        if (!row.listingId) continue;
        await rememberReferenceImage({ ...row, retrievedAt: capturedAt,
          sourceEndpoint: "listings/batch?includes=Images" });
      }
    } catch {
      /* An image we failed to capture is a thinner reference corpus, never a
         failed inspection. The sales evidence is already safely written. */
    }
  }

  return {
    intervalId, shopId: interval.shop_id,
    listingsInspected: seen.length,
    baselinesEstablished,
    eventsCreated: written.written,
    duplicatesPrevented: written.duplicates,
    unitsObserved: interval.sold_delta,
    unitsAttributed: attributed,
    unitsUnresolved: outcome.unresolved,
    conflicted: outcome.conflicted,
    eligible,
    missingResolved: missing.length,
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
    /*
      ADOPT ANY INTERVAL THAT HAS NO JOB.

      Measured in production: 800 intervals existed and only 278 had jobs. The
      first version of the sensor opened intervals before the queue existed, so
      five hundred real shop sales sat there with nothing intending to look at
      them — the exact silent-loss failure this design is supposed to make
      impossible. Reconciling on every pass means an interval can never be
      stranded by a deploy, a partial write, or a future change of mind about
      who enqueues.
    */
    await db()
      .prepare(
        `INSERT INTO inspection_jobs (interval_id, shop_id, queued_at)
         SELECT i.id, i.shop_id, ?
           FROM shop_sales_intervals i
           LEFT JOIN inspection_jobs j ON j.interval_id = i.id
          WHERE j.interval_id IS NULL AND i.inspected_at IS NULL
          LIMIT 2000`)
      .bind(new Date().toISOString())
      .run();

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
