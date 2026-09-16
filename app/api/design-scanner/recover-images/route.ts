import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { classify, account, recoveryRate, type EtsyListingRow, type Recovered }
  from "@/app/reference-recovery";
import { ensureReferenceImageTable } from "@/app/reference-image-store";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";

/**
 * RECOVER THE IMAGES THE INSPECTION THREW AWAY.
 *
 * `listings/batch?includes=Images` answers for a hundred listing ids in one
 * call, so the whole qualified corpus costs single-digit Etsy calls and no
 * paid provider call at all. This is a backfill of a capture bug, not a new
 * data collection.
 *
 * EVERY REQUESTED ID IS ACCOUNTED FOR. Etsy silently omits ids it will not
 * answer for, so the ids that come back are compared against the ids that went
 * out, and the difference is reported rather than divided away.
 *
 * Owner-only. No titles, tags, shop names or buyer information are returned.
 */
export const maxDuration = 300;

const BATCH = 100;

export const POST = withErrorLog("design-scanner-recover-images", async (request: Request) => {
  /*
    ALSO ON THE CLOCK.

    Nothing refreshed reference images, so every one of them aged past Etsy's
    six-hour display rule and Market Watch correctly withheld them — leaving a
    member looking at 44 blank grey boxes. The rule was right; nothing was
    keeping the data inside it.

    The scheduled caller builds its request inside the worker, so it carries no
    cf-connecting-ip, the same proof of origin the other cron routes use.
  */
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const db = (env as unknown as { DB: D1Database }).DB;
  await ensureReferenceImageTable();
  const now = Math.floor(Date.now() / 1000);
  const url = new URL(request.url);
  /* A cap so one invocation cannot run past the worker's time budget; the
     caller repeats until `remaining` is zero. */
  const maxBatches = Math.max(1, Math.min(20, Number(url.searchParams.get("batches")) || 10));
  const refresh = url.searchParams.get("refresh") === "1";

  /* The qualified corpus: listings with corroborated, sale-linked movement. */
  const qualified = await db.prepare(
    `SELECT DISTINCT a.listing_id AS listingId
       FROM listing_sales_activity a
      WHERE a.interval_id IS NOT NULL
        AND a.observed_at >= ?
      ORDER BY a.listing_id`)
    .bind(new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString())
    .all<{ listingId: number }>();

  const everyId = (qualified.results ?? []).map(row => Number(row.listingId));

  /* Rows already recovered inside Etsy's six-hour display window need no
     second call. `refresh=1` forces one when a display needs current data. */
  const held = await db.prepare(
    `SELECT listing_id AS listingId, retrieved_at AS retrievedAt FROM reference_images`)
    .all<{ listingId: number; retrievedAt: number }>();
  const recent = new Set((held.results ?? [])
    .filter(row => refresh ? false : now - Number(row.retrievedAt) < 6 * 3_600)
    .map(row => Number(row.listingId)));

  /*
    OLDEST FIRST, AND WHAT A MEMBER CAN SEE FIRST.

    A bounded refresh has to spend its calls where a blank box would actually
    appear, so listings inside a saved niche go before the rest of the corpus.
  */
  const visible = await db.prepare(
    `SELECT DISTINCT listing_id AS listingId FROM niche_candidates
      WHERE state IN ('monitoring','momentum','repeated-momentum')`)
    .all<{ listingId: number }>()
    .catch(() => ({ results: [] as Array<{ listingId: number }> }));
  const inNiche = new Set((visible.results ?? []).map(row => Number(row.listingId)));
  const staleness = new Map((held.results ?? [])
    .map(row => [Number(row.listingId), Number(row.retrievedAt) || 0]));

  const todo = everyId
    .filter(id => !recent.has(id))
    .sort((a, b) => {
      const seen = (inNiche.has(b) ? 1 : 0) - (inNiche.has(a) ? 1 : 0);
      if (seen) return seen;
      return (staleness.get(a) ?? 0) - (staleness.get(b) ?? 0);
    });
  const thisRun = todo.slice(0, maxBatches * BATCH);

  const answered: Recovered[] = [];
  const failedIds: number[] = [];
  let calls = 0;
  const failures: string[] = [];

  for (let index = 0; index < thisRun.length; index += BATCH) {
    const slice = thisRun.slice(index, index + BATCH);
    await waitForEtsyCapacity();
    let response: Response;
    try {
      response = await fetch(
        `https://openapi.etsy.com/v3/application/listings/batch`
        + `?listing_ids=${slice.join(",")}&includes=Images`,
        { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      failedIds.push(...slice);
      failures.push(error instanceof Error ? error.message : "request failed");
      continue;
    }
    await recordEtsyCall(response, "search");
    calls += 1;
    if (!response.ok) {
      failedIds.push(...slice);
      failures.push(`HTTP ${response.status}`);
      continue;
    }
    const body = await response.json() as { results?: EtsyListingRow[] };
    for (const row of body.results ?? []) answered.push(classify(row));
  }

  const { rows, totals, unaccounted } = account(thisRun, answered, failedIds);

  /* Written one statement per row rather than through the helper, so the whole
     run is a couple of batched writes instead of hundreds of round trips. */
  const insert = db.prepare(
    `INSERT INTO reference_images
       (listing_id, shop_id, image_id, image_url, listing_state, outcome,
        retrieved_at, source_endpoint, title, tags)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(listing_id) DO UPDATE SET
       shop_id = excluded.shop_id, image_id = excluded.image_id,
       image_url = excluded.image_url, listing_state = excluded.listing_state,
       outcome = excluded.outcome, retrieved_at = excluded.retrieved_at,
       source_endpoint = excluded.source_endpoint,
       title = excluded.title, tags = excluded.tags`);
  const statements = rows.map(row => insert.bind(
    row.listingId, row.shopId, row.imageId, row.imageUrl, row.listingState,
    row.outcome, now, "listings/batch?includes=Images",
    row.title, row.tags.join("|")));
  for (let index = 0; index < statements.length; index += 50)
    await db.batch(statements.slice(index, index + 50));

  const stored = await db.prepare(
    `SELECT outcome, COUNT(*) AS listings FROM reference_images GROUP BY outcome`)
    .all<{ outcome: string; listings: number }>();

  return NextResponse.json({
    qualifiedListings: everyId.length,
    requestedThisRun: thisRun.length,
    remaining: Math.max(0, todo.length - thisRun.length),
    skippedAsFresh: everyId.length - todo.length,
    etsyCalls: calls,
    failures: failures.slice(0, 5),
    totals,
    /* Null until every requested id is accounted for. */
    recoveryRateThisRun: recoveryRate(totals),
    unaccountedExtras: unaccounted.length,
    storedOverall: stored.results ?? [],
  });
});
