import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";

/**
 * CASE 15, THROUGH THE REAL PIPELINE, WITHOUT TOUCHING ETSY.
 *
 * The changed-reference-image branch drops a reference whose Etsy image id no
 * longer matches the one we stored, because a changed image is a different
 * design and the analysis we hold describes artwork nobody has looked at.
 *
 * It cannot be observed by waiting: the poller keeps reference freshness at
 * 0.99, so references are almost never stale enough to be re-read, and when
 * they are, their images have usually not changed. The only honest ways to
 * see it in production are to modify a real Etsy listing — which this product
 * will not do — or to make our OWN CACHE disagree with Etsy and let the real
 * refresh discover it. This does the second.
 *
 * WHAT IS TOUCHED, AND WHY IT IS SAFE:
 *
 *   reference_images.retrieved_at  -> set into the past, so the scan's own
 *                                     six-hour rule re-reads the row.
 *   reference_images.image_id      -> set to a synthetic id, so Etsy's real
 *                                     answer differs and the branch fires.
 *
 * That table is OUR CACHE of Etsy's data, not a record of anything. Nothing
 * is written to Etsy. The refresh path rewrites image_url and retrieved_at
 * from Etsy's own answer anyway, so the cache is self-healing even if this
 * route dies halfway — and the original row is restored explicitly regardless,
 * in a finally, including when the scan throws.
 *
 * NO PROVIDER SPEND. The scan is run against an artwork hash that is already
 * analysed, so it is warm and pays nothing. That is also the point of the
 * fourth assertion: fresh analysis must be paid for only when it is genuinely
 * needed, and a reference leaving the cohort is not that.
 */
type Row = {
  listing_id: number; image_id: number | null; image_url: string;
  retrieved_at: number; outcome: string;
};

export const POST = withErrorLog("reference-change-canary", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const body = await request.json().catch(() => ({})) as
    { niche?: string; artworkHash?: string };
  const niche = String(body.niche ?? "").trim();
  const artworkHash = String(body.artworkHash ?? "").trim();
  if (!niche || !artworkHash)
    return NextResponse.json({
      error: "Send the niche and an artworkHash that has already been analysed, "
        + "so the canary costs nothing.",
    }, { status: 400 });

  /* The scan must already hold this design's analysis, or the canary would
     pay for a cold call and prove the opposite of what it is for. */
  const held = await db.prepare(
    `SELECT 1 AS found FROM scan_uploads WHERE user_id = ? AND artwork_hash = ?`)
    .bind(user.userId, artworkHash).first<{ found: number }>();
  if (!held)
    return NextResponse.json({
      error: "That design has not been analysed yet. Scan it once first; the "
        + "canary is only meaningful on a warm design.",
    }, { status: 400 });

  const scan = async () => {
    const response = await fetch(new URL("/api/design-scanner/scan", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify({ artworkHash, niche }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  /* ------------------------------------------------- 1. the baseline scan */
  const before = await scan();
  const cohortBefore = (before.body.cohort ?? {}) as Record<string, number>;

  /* A reference this niche's cohort actually uses, and one we hold analysis
     for — otherwise dropping it would change nothing observable. */
  const target = await db.prepare(
    `SELECT r.listing_id, r.image_id, r.image_url, r.retrieved_at, r.outcome
       FROM reference_images r
       JOIN reference_analysis a ON a.image_id = r.image_id
      WHERE r.outcome = 'recovered' AND r.image_id IS NOT NULL
      ORDER BY r.retrieved_at DESC LIMIT 1`)
    .first<Row>();
  if (!target)
    return NextResponse.json({
      error: "No analysed reference available to use as the canary.",
    }, { status: 409 });

  const originalImageId = Number(target.image_id);
  const syntheticImageId = originalImageId + 1;
  const sixHoursAgo = Math.floor(Date.now() / 1_000) - 7 * 3_600;
  let restored = false;

  try {
    /* --------------------------- 2. make our cache disagree with Etsy */
    await db.prepare(
      `UPDATE reference_images SET image_id = ?, retrieved_at = ? WHERE listing_id = ?`)
      .bind(syntheticImageId, sixHoursAgo, target.listing_id).run();

    /* ------------------------------------ 3. the scan discovers it */
    const after = await scan();
    const dropped = (after.body.droppedOnRefresh ?? {}) as Record<string, number>;
    const cohortAfter = (after.body.cohort ?? {}) as Record<string, number>;

    /* ------------------------------------------ 4. restore, then judge */
    await db.prepare(
      `UPDATE reference_images SET image_id = ?, image_url = ?, retrieved_at = ?,
              outcome = ? WHERE listing_id = ?`)
      .bind(originalImageId, target.image_url, Number(target.retrieved_at),
        target.outcome, target.listing_id).run();
    restored = true;

    const check = await db.prepare(
      `SELECT image_id, retrieved_at FROM reference_images WHERE listing_id = ?`)
      .bind(target.listing_id).first<{ image_id: number; retrieved_at: number }>();

    const imageChanged = Number(dropped.imageChanged ?? 0);
    const listingsBefore = Number(cohortBefore.listings ?? 0);
    const listingsAfter = Number(cohortAfter.listings ?? 0);

    return NextResponse.json({
      canary: {
        listingId: target.listing_id,
        originalImageId, syntheticImageId,
        restored: Number(check?.image_id) === originalImageId
          && Number(check?.retrieved_at) === Number(target.retrieved_at),
      },
      /* Each of the four things this is supposed to prove, stated separately
         so a partial result cannot read as a pass. */
      proofs: {
        oldAnalysisRejected: imageChanged >= 1,
        changedImageDidNotInheritEvidence: listingsAfter < listingsBefore,
        cohortRecalculated: listingsAfter === listingsBefore - imageChanged,
        noProviderSpend: Number(after.body.paidCalls ?? -1) === 0
          && Number(after.body.cost ?? -1) === 0
          && after.body.warm === true,
      },
      observed: {
        etsyRefreshCalls: after.body.etsyRefreshCalls,
        droppedOnRefresh: dropped,
        cohortBefore, cohortAfter,
        paidCalls: after.body.paidCalls, cost: after.body.cost,
        warm: after.body.warm,
        scanStatus: after.status,
      },
    });
  } finally {
    /*
      A canary that leaves the cache wrong is worse than no canary. The
      restore above runs on the success path; this one runs when the scan
      threw, and is written so running twice is harmless.
    */
    if (!restored)
      await db.prepare(
        `UPDATE reference_images SET image_id = ?, image_url = ?, retrieved_at = ?,
                outcome = ? WHERE listing_id = ?`)
        .bind(originalImageId, target.image_url, Number(target.retrieved_at),
          target.outcome, target.listing_id).run().catch(() => {});
  }
});
