import { env } from "cloudflare:workers";
import { stateOf, summarize, LABELS, type ListingEvidence } from "@/app/niche-watch";
import { watchesFor } from "@/app/niche-watch-store";
import { ensureCandidateTables } from "@/app/niche-candidate-store";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { describeWindow } from "@/app/evidence-window";
import { DISPLAY_FRESHNESS_SECONDS } from "@/app/reference-images";

type Row = {
  nicheKey: string; listingId: number; shopId: number; title: string; imageUrl: string;
  priceCents: number | null; currency: string; favorites: number | null;
  views: number | null; originalCreated: number | null; displayRefreshedAt: number;
  intervals: number; sold7: number; sold30: number; firstSeen: string | null;
  lastSeen: string | null; reviews: number; outcome: string;
};

export type MarketListing = {
  listingId: number; title: string; imageUrl: string; etsyUrl: string;
  state: string; label: string; confirmedAt: number; intervals: number;
  sold7: number; sold30: number; priceCents: number | null; currency: string;
  favorites: number | null; views: number | null; ageDays: number | null;
  reviewsOnThisListing: number; displayFresh: boolean;
};

const db = () => (env as unknown as { DB: D1Database }).DB;
const seconds = (value: string | null) => value ? Math.floor(Date.parse(value) / 1000) || 0 : 0;

async function rowsFor(keys: string[], now: number) {
  if (!keys.length) return [];
  await ensureCandidateTables();
  const marks = keys.map(() => "?").join(",");
  const since30 = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();
  const since7 = new Date((now - 7 * 86_400) * 1000).toISOString();
  const rows = await db().prepare(
    `SELECT c.niche_key AS nicheKey, c.listing_id AS listingId, c.shop_id AS shopId,
            COALESCE(NULLIF(c.title,''), r.title, '') AS title,
            COALESCE(NULLIF(c.image_url,''), r.image_url, '') AS imageUrl,
            COALESCE(s.price_cents, c.price_cents) AS priceCents,
            c.currency AS currency, COALESCE(s.favorites,c.favorites) AS favorites,
            COALESCE(s.views,c.views) AS views,
            COALESCE(s.original_created,c.original_created) AS originalCreated,
            MAX(c.display_refreshed_at,COALESCE(r.retrieved_at,0)) AS displayRefreshedAt,
            COALESCE(a.intervals,0) AS intervals, COALESCE(a.sold7,0) AS sold7,
            COALESCE(a.sold30,0) AS sold30, a.firstSeen AS firstSeen,
            a.lastSeen AS lastSeen, COALESCE(v.reviews,0) AS reviews,
            COALESCE(r.outcome,'') AS outcome
       FROM niche_candidates c
       LEFT JOIN reference_images r ON r.listing_id=c.listing_id
       LEFT JOIN listing_snapshots s ON s.listing_id=c.listing_id
         AND s.observed_at=(SELECT MAX(s2.observed_at) FROM listing_snapshots s2
                            WHERE s2.listing_id=c.listing_id)
       LEFT JOIN (SELECT listing_id, COUNT(DISTINCT interval_id) AS intervals,
                         SUM(CASE WHEN observed_at >= ? THEN units ELSE 0 END) AS sold7,
                         SUM(units) AS sold30, MIN(observed_at) AS firstSeen,
                         MAX(observed_at) AS lastSeen
                    FROM listing_sales_activity
                   WHERE observed_at >= ? GROUP BY listing_id) a ON a.listing_id=c.listing_id
       LEFT JOIN (SELECT listing_id,COUNT(*) AS reviews FROM shop_reviews GROUP BY listing_id) v
         ON v.listing_id=c.listing_id
      WHERE c.niche_key IN (${marks})
        AND c.state NOT IN ('expired','inactive')
      ORDER BY sold30 DESC, intervals DESC, favorites DESC, views DESC
      LIMIT ?`)
    /* Each keyword may own up to 200 candidates. A smaller global LIMIT lets
       the first busy keyword crowd every later keyword out of the response. */
    .bind(since7, since30, ...keys, Math.max(200, keys.length * 200)).all<Row>();
  return rows.results ?? [];
}

function evidenceFor(rows: Row[]): ListingEvidence[] {
  return rows.filter(row => row.intervals > 0).map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    intervals: Number(row.intervals), lastConfirmedAt: seconds(row.lastSeen),
    firstConfirmedAt: seconds(row.firstSeen), present: row.outcome === "recovered",
    linkedReviews: Number(row.reviews) || 0,
  }));
}

function listingFrom(row: Row, now: number): MarketListing {
  const evidence = evidenceFor([row])[0];
  const state = evidence ? stateOf(evidence, now) : "watching";
  const ageDays = row.originalCreated
    ? Math.max(0, Math.floor((now - Number(row.originalCreated)) / 86_400)) : null;
  return { listingId: Number(row.listingId), title: String(row.title || "Untitled listing"),
    imageUrl: String(row.imageUrl || ""), etsyUrl: `https://www.etsy.com/listing/${row.listingId}`,
    state, label: evidence ? LABELS[state as keyof typeof LABELS] : "Watching",
    confirmedAt: evidence?.lastConfirmedAt ?? 0, intervals: Number(row.intervals) || 0,
    sold7: Number(row.sold7) || 0, sold30: Number(row.sold30) || 0,
    priceCents: row.priceCents == null ? null : Number(row.priceCents),
    currency: String(row.currency || "USD"),
    favorites: row.favorites == null ? null : Number(row.favorites),
    views: row.views == null ? null : Number(row.views), ageDays,
    reviewsOnThisListing: Number(row.reviews) || 0,
    displayFresh: now - Number(row.displayRefreshedAt) < DISPLAY_FRESHNESS_SECONDS };
}

export async function readNiche(userId: string, _terms: string[], key: string, now: number) {
  const rows = await rowsFor([key], now);
  const watch = (await watchesFor(userId)).find(row => row.key === key);
  const evidence = evidenceFor(rows);
  const summary = summarize(evidence, now, { since: watch?.lastOpened ?? 0 });
  const listings = rows.map(row => listingFrom(row, now)).slice(0, 36);
  return { key, summary, window: summary.windowSeconds ? describeWindow(summary.windowSeconds) : null,
    listings, gathering: summary.moving === 0 && listings.length > 0,
    staleForDisplay: listings.filter(row => !row.displayFresh).length };
}

export async function summariesForWatches(
  watches: Array<{ key: string; terms: string[] }>, now: number,
) {
  const rows = await rowsFor(watches.map(watch => watch.key), now);
  const out = new Map<string, ReturnType<typeof summarize>>();
  for (const watch of watches) {
    const evidence = evidenceFor(rows.filter(row => row.nicheKey === watch.key));
    out.set(watch.key, summarize(evidence, now));
  }
  return out;
}

export async function previewsForWatches(keys: string[], now: number) {
  const rows = await rowsFor(keys, now);
  const out = new Map<string, MarketListing[]>();
  for (const key of keys)
    out.set(key, rows.filter(row => row.nicheKey === key).slice(0, 4)
      .map(row => listingFrom(row, now)));
  return out;
}
