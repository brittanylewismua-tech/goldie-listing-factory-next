import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { normalizeNiche } from "@/app/niche-cohort";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { POST as runScan } from "../scan/route";

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

  /*
    D1708 · IN PROCESS, NOT OVER THE NETWORK.

    This called the scan by fetching its own URL. A worker sub-request to
    itself is not a supported shape: the first live run returned a 500 before
    the canary had touched anything. Calling the handler directly removes the
    network hop entirely — and because getChatGPTUser reads the ambient
    request's cookies, the scan runs as the same signed-in owner without a
    credential being copied anywhere.
  */
  const scan = async () => {
    const response = await runScan(new Request("https://internal/api/design-scanner/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artworkHash, niche }),
    }));
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  /* ------------------------------------------------- 1. the baseline scan */
  const before = await scan();
  /*
    D1709 · The cohort shape used to travel only on a refusal, so a
    successful baseline reported nothing to compare against and two of the
    four proofs below read false on a run that had actually worked.
  */
  const cohortBefore = (before.body.cohort ?? {}) as Record<string, number>;

  /*
    A reference THIS NICHE'S COHORT ACTUALLY USES.

    The refresh only re-reads references inside the scanned niche's cohort, so
    a target picked globally would be left untouched and the branch would
    never fire — the canary would report all four proofs false and look like a
    defect in the product rather than in its own aim.

    Cohort membership is: recent sales activity, plus the niche's terms
    appearing in the reference's own title or tags. The terms come from
    normalizeNiche, the same function the scan uses, so this cannot drift from
    the real matcher. It is a looser filter than `intersect` on purpose —
    picking a candidate is all it has to do, and whether the pick landed is
    then read from the scan's own answer rather than assumed.
  */
  const { terms } = normalizeNiche(niche);
  if (!terms.length)
    return NextResponse.json({ error: "That niche has no usable terms." }, { status: 400 });
  const since = new Date(
    (Math.floor(Date.now() / 1_000) - EVIDENCE_FRESH_DAYS * 86_400) * 1_000).toISOString();
  const like = terms.map(() => `(r.title LIKE ? OR r.tags LIKE ?)`).join(" OR ");
  const binds = terms.flatMap(term => [`%${term}%`, `%${term}%`]);
  const target = await db.prepare(
    `SELECT r.listing_id, r.image_id, r.image_url, r.retrieved_at, r.outcome
       FROM reference_images r
       JOIN reference_analysis a ON a.image_id = r.image_id
       JOIN (SELECT DISTINCT listing_id FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?) s
         ON s.listing_id = r.listing_id
      WHERE r.outcome = 'recovered' AND r.image_id IS NOT NULL
        AND (${like})
      ORDER BY r.retrieved_at DESC LIMIT 1`)
    .bind(since, ...binds)
    .first<Row>();
  if (!target)
    return NextResponse.json({
      error: `No analysed reference in the ${niche} cohort to use as the canary. `
        + `The canary needs one reference that has momentum evidence, stored `
        + `analysis, and this niche's wording in its own title or tags.`,
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
      /* Whether the pick landed in the cohort at all, said separately from
         whether the branch behaved — a miss is a canary problem, not a
         product one, and the two must not be confused. */
      pickLandedInCohort: imageChanged >= 1,
      /* Stated so a missing cohort cannot be mistaken for a cohort of zero. */
      cohortReported: typeof cohortBefore.listings === "number"
        && typeof cohortAfter.listings === "number",
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

/**
 * DID ANY RUN OF THIS LEAVE A ROW WRONG?
 *
 * The canary's whole risk is that it mutates a reference row and fails to put
 * it back. The restore runs on the success path and again in a finally, and
 * the success path verifies itself — but "verified on the path that worked" is
 * not the same as "nothing was left behind", and the first live run of the
 * canary returned a 500.
 *
 * A synthetic image id is one the analysis table has never seen, so that is
 * what this looks for. It reports rather than repairs: the refresh path
 * rewrites a stale row from Etsy's own answer, so a row found here heals on
 * its next scan, and silently rewriting production data to make a check pass
 * is the habit this endpoint exists to guard against.
 */
export const GET = withErrorLog("reference-change-canary-integrity", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const orphaned = await db.prepare(
    `SELECT r.listing_id AS listingId, r.image_id AS imageId, r.retrieved_at AS retrievedAt
       FROM reference_images r
       LEFT JOIN reference_analysis a ON a.image_id = r.image_id
      WHERE r.outcome = 'recovered' AND r.image_id IS NOT NULL AND a.image_id IS NULL
      ORDER BY r.retrieved_at DESC LIMIT 50`)
    .all<{ listingId: number; imageId: number; retrievedAt: number }>();

  const totals = await db.prepare(
    `SELECT COUNT(*) AS held,
            SUM(CASE WHEN outcome = 'recovered' THEN 1 ELSE 0 END) AS recovered
       FROM reference_images`).first<{ held: number; recovered: number }>();

  /*
    An image id with no analysis is NORMAL for a reference the analyser has
    not reached yet — the backlog is thousands deep. What would not be normal
    is one whose id is exactly another row's id plus one AND whose
    retrieved_at was pushed into the past, which is the shape this canary
    writes.
  */
  const rows = (orphaned.results ?? []) as Array<{ listingId: number; imageId: number; retrievedAt: number }>;
  const suspects = [] as Array<{ listingId: number; imageId: number }>;
  for (const row of rows) {
    const neighbour = await db.prepare(
      `SELECT 1 AS found FROM reference_analysis WHERE image_id = ? LIMIT 1`)
      .bind(Number(row.imageId) - 1).first<{ found: number }>();
    if (neighbour) suspects.push({ listingId: row.listingId, imageId: row.imageId });
  }

  return NextResponse.json({
    held: Number(totals?.held ?? 0),
    recovered: Number(totals?.recovered ?? 0),
    withoutAnalysis: rows.length,
    /* The only list that matters: rows shaped like this canary's own writes. */
    looksLikeCanaryResidue: suspects,
    clean: suspects.length === 0,
  });
});
