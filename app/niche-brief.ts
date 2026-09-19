/**
 * BUILDING A NICHE BRIEF.
 *
 * Lifted out of the route unchanged so the scheduled refresh and the member's
 * own page build a brief the SAME way. Two implementations of this would drift,
 * and the one that drifted would be the one nobody was looking at.
 *
 * Reads the shared corpus. No paid provider call exists on this path, and one
 * more saved niche costs one more local query — not an Etsy sweep. That is why
 * a scheduled rebuild is affordable at all.
 *
 * Listing images and titles come from `reference_images`, which carries the
 * time each was read from Etsy. Anything past six hours is marked stale for
 * display rather than shown as current.
 */
import { env } from "cloudflare:workers";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
import {
  stateOf, summarize, patterns, LABELS, type ListingEvidence,
} from "@/app/niche-watch";
import { watchesFor } from "@/app/niche-watch-store";
import { ANALYSIS_VERSION } from "@/app/reference-analysis";
import { candidateSummary } from "@/app/niche-candidate-store";
import { GATHERING } from "@/app/niche-candidates";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { describeWindow } from "@/app/evidence-window";
import { DISPLAY_FRESHNESS_SECONDS } from "@/app/reference-images";

type Row = {
  listingId: number; shopId: number; title: string; tags: string;
  imageId: number | null; imageUrl: string; outcome: string; retrievedAt: number;
  intervals: number; firstSeen: string; lastSeen: string; reviews: number;
};

export async function readNiche(userId: string, terms: string[], key: string, now: number) {
  const db = (env as unknown as { DB: D1Database }).DB;
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  const corpus = await db.prepare(
    `SELECT r.listing_id AS listingId, a.shop_id AS shopId, r.title AS title,
            r.tags AS tags, r.image_id AS imageId, r.image_url AS imageUrl,
            r.outcome AS outcome, r.retrieved_at AS retrievedAt,
            a.intervals AS intervals, a.firstSeen AS firstSeen, a.lastSeen AS lastSeen,
            (SELECT COUNT(*) FROM shop_reviews v WHERE v.listing_id = r.listing_id) AS reviews
       FROM reference_images r
       JOIN (SELECT listing_id, shop_id, COUNT(DISTINCT interval_id) AS intervals,
                    MIN(observed_at) AS firstSeen, MAX(observed_at) AS lastSeen
               FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?
              GROUP BY listing_id, shop_id) a
         ON a.listing_id = r.listing_id`)
    .bind(since).all<Row>();

  const rows = corpus.results ?? [];
  const candidates: Candidate[] = rows.map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    title: String(row.title ?? ""), tags: String(row.tags ?? "").split("|").filter(Boolean),
  }));
  const matched = intersect(candidates,
    new Set(candidates.map(row => row.listingId)), terms);
  const inNiche = new Set(matched.members.map(member => member.listingId));
  const mine = rows.filter(row => inNiche.has(Number(row.listingId)));

  const watch = (await watchesFor(userId)).find(row => row.key === key);
  const since_ = watch?.lastOpened ?? 0;

  const evidence: ListingEvidence[] = mine.map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    intervals: Number(row.intervals) || 0,
    lastConfirmedAt: Math.floor(Date.parse(row.lastSeen) / 1000) || 0,
    firstConfirmedAt: Math.floor(Date.parse(row.firstSeen) / 1000) || 0,
    present: row.outcome === "recovered",
    linkedReviews: Number(row.reviews) || 0,
  }));
  const summary = summarize(evidence, now, { since: since_ });

  /* Patterns from the content-free analyses of the listings currently moving. */
  const liveImageIds = mine
    .filter(row => {
      const state = stateOf(evidence.find(e => e.listingId === Number(row.listingId))!, now);
      return state === "momentum" || state === "repeated-momentum";
    })
    .map(row => Number(row.imageId))
    .filter(Boolean);
  let visualPatterns: string[] = [];
  if (liveImageIds.length >= 4) {
    const analyses = await db.prepare(
      `SELECT payload_json AS payload FROM reference_analysis
        WHERE analysis_version = ? AND image_id IN (${liveImageIds.map(() => "?").join(",")})`)
      .bind(ANALYSIS_VERSION, ...liveImageIds)
      .all<{ payload: string }>().catch(() => ({ results: [] as Array<{ payload: string }> }));
    const parsed: Array<Record<string, unknown>> = [];
    for (const row of analyses.results ?? []) {
      try { parsed.push(JSON.parse(row.payload) as Record<string, unknown>); } catch { /* skip */ }
    }
    visualPatterns = patterns(parsed);
  }

  /*
    The listing cards. Title, image and link are current Etsy data, so each
    one carries whether it is inside the six-hour display window. Nothing
    here is an inferred sale count.
  */
  const listings = mine
    .map(row => {
      const own = evidence.find(item => item.listingId === Number(row.listingId))!;
      const state = stateOf(own, now);
      return {
        listingId: Number(row.listingId),
        title: String(row.title ?? ""),
        imageUrl: String(row.imageUrl ?? ""),
        etsyUrl: `https://www.etsy.com/listing/${Number(row.listingId)}`,
        state, label: LABELS[state],
        confirmedAt: own.lastConfirmedAt,
        /* Reviews only when they belong to this exact listing. */
        reviewsOnThisListing: own.linkedReviews,
        displayFresh: now - Number(row.retrievedAt) < DISPLAY_FRESHNESS_SECONDS,
      };
    })
    .sort((a, b) =>
      (b.state === "repeated-momentum" ? 1 : 0) - (a.state === "repeated-momentum" ? 1 : 0)
      || b.confirmedAt - a.confirmedAt);

  /*
    GATHERING IS NOT THE SAME AS UNSUPPORTED.

    A niche Goldie has just started watching has candidates being baselined and
    no movement yet. Saying "not enough verified evidence" makes that look
    permanent, when the honest answer is that the watching has begun and
    nothing has moved YET. Measured: "girl power" went from 0 listings in the
    corpus to 200 candidates under observation, and the page still read as a
    dead end.
  */
  /*
    BOTH NUMBERS FROM ONE SET.

    `candidateSummary` counts the watched listings and their distinct shops in
    one query over the same rows, so the member-facing line cannot claim more
    shops than listings — which it did when the two came from different pools.
  */
  const watched = await candidateSummary(key);
  const watching = watched.watching;

  return {
    key, summary, visualPatterns,
    candidates: { watching, shops: watched.shops, byState: watched.byState },
    /* Shown only while nothing has moved: never alongside real evidence. */
    gathering: summary.moving === 0 && watching > 0 ? GATHERING : null,
    window: summary.windowSeconds ? describeWindow(summary.windowSeconds) : null,
    listings,
    staleForDisplay: listings.filter(row => !row.displayFresh).length,
  };
}
