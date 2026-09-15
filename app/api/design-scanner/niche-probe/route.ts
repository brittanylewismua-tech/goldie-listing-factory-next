import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { normalizeNiche, intersect, COHORT_CLAIM, type Candidate } from "@/app/niche-cohort";
import { EVIDENCE_FRESH_DAYS, SHOP_SHARE_CAP } from "@/app/momentum-cohort";
import { describeWindow } from "@/app/evidence-window";

/**
 * CAN THIS NICHE PRODUCE A COHORT AT ALL?
 *
 * Measurement, not a product surface.
 *
 * THE FIRST VERSION SEARCHED ETSY AND INTERSECTED. It returned zero for all
 * seven test niches, and the arithmetic says it always would: Etsy reports
 * 247,000 to 5,500,000 listings matching these phrases, a search reads the top
 * few hundred by relevance, and the momentum corpus is under a thousand
 * listings. The expected overlap between an arbitrary 300-row slice of a
 * million-row result set and a specific 856-row set is about a tenth of a
 * listing. Zero was not a shortage of evidence; it was a shortage of
 * coincidence, and paging deeper cannot fix it.
 *
 * SO THE DIRECTION IS INVERTED. The corpus is the small side, and it is the
 * side we hold. Rather than ask Etsy for a niche and hope our listings are in
 * it, this asks whether each listing we ALREADY have verified movement for
 * describes itself in the member's terms — using the listing's own title and
 * tags, captured on the same call that recovered its image.
 *
 * The honest claim gets narrower and truer: not "listings Etsy returned for
 * this niche", but "listings with verified momentum whose own title and tags
 * match this niche". No Etsy search call, no marketplace classification, and
 * the member's phrase is still what decides.
 *
 * The point is to find out whether a threshold exists that the data can
 * actually support, before one is chosen. Choosing first and measuring after
 * is how a minimum cohort size becomes a number picked to make a feature look
 * ready.
 *
 * Owner-only. Returns counts and reasons; no titles, no shop names, no URLs.
 */
export const maxDuration = 300;

export const GET = withErrorLog("design-scanner-niche-probe", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  const phrase = (url.searchParams.get("q") ?? "").trim();
  if (!phrase) return NextResponse.json({ error: "Give a niche phrase as ?q=" }, { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  /* The momentum corpus, with the evidence each listing carries. */
  const corpus = await db.prepare(
    `SELECT a.listing_id AS listingId, a.shop_id AS shopId,
            COUNT(DISTINCT a.interval_id) AS intervals,
            SUM(a.units) AS units,
            MIN(a.observed_at) AS firstSeen, MAX(a.observed_at) AS lastSeen,
            (SELECT COUNT(*) FROM shop_reviews v WHERE v.listing_id = a.listing_id) AS reviews,
            (SELECT image_url FROM reference_images r WHERE r.listing_id = a.listing_id) AS imageUrl,
            (SELECT outcome FROM reference_images r WHERE r.listing_id = a.listing_id) AS imageOutcome,
            (SELECT title FROM reference_images r WHERE r.listing_id = a.listing_id) AS title,
            (SELECT tags FROM reference_images r WHERE r.listing_id = a.listing_id) AS tags
       FROM listing_sales_activity a
      WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?
      GROUP BY a.listing_id, a.shop_id`)
    .bind(since)
    .all<{ listingId: number; shopId: number; intervals: number; units: number;
      firstSeen: string; lastSeen: string; reviews: number;
      imageUrl: string | null; imageOutcome: string | null;
      title: string | null; tags: string | null }>()
    .catch(() => ({ results: [] }));

  const evidence = new Map((corpus.results ?? []).map(row => [Number(row.listingId), row]));
  const qualified = new Set(evidence.keys());

  const { query, terms } = normalizeNiche(phrase);

  /* The corpus's own words. No Etsy call: these were captured by the same
     `listings/batch` request that recovered the images. */
  const candidates: Candidate[] = (corpus.results ?? []).map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    title: String(row.title ?? ""),
    tags: String(row.tags ?? "").split("|").filter(Boolean),
  }));
  const calls = 0;
  const withoutWords = candidates.filter(row => !row.title && !row.tags.length).length;
  const failures: string[] = [];

  const result = intersect(candidates, qualified, terms);

  /* The distribution of the cohort this query would actually produce. */
  const rows = result.members.map(member => evidence.get(member.listingId)!);
  const shops = new Map<number, number>();
  let withImage = 0, repeated = 0, withReview = 0, units = 0;
  let earliest = Infinity, latest = 0;
  for (const row of rows) {
    shops.set(Number(row.shopId), (shops.get(Number(row.shopId)) ?? 0) + 1);
    if (row.imageOutcome === "recovered" && row.imageUrl) withImage += 1;
    if (Number(row.intervals) >= 2) repeated += 1;
    if (Number(row.reviews) > 0) withReview += 1;
    units += Number(row.units) || 0;
    earliest = Math.min(earliest, Date.parse(row.firstSeen) / 1000);
    latest = Math.max(latest, Date.parse(row.lastSeen) / 1000);
  }
  const biggest = [...shops.values()].sort((a, b) => b - a)[0] ?? 0;
  const seconds = rows.length ? Math.max(0, latest - earliest) : 0;

  /* Reasons, grouped, so a thin cohort can be diagnosed rather than guessed at. */
  const why = new Map<string, number>();
  for (const rejection of result.rejected)
    why.set(rejection.because, (why.get(rejection.because) ?? 0) + 1);

  return NextResponse.json({
    phrase, normalized: { query, terms },
    source: {
      etsyCalls: calls,
      corpusListingsConsidered: result.searched,
      corpusListingsMissingWords: withoutWords,
      basis: "the momentum corpus's own titles and tags, captured during image recovery",
    },
    cohort: {
      listings: rows.length,
      shops: shops.size,
      withUsableImage: withImage,
      repeatedMovement: repeated,
      movementPlusReview: withReview,
      attributedUnits: units,
      largestShopListings: biggest,
      largestShopShare: rows.length ? biggest / rows.length : 0,
      exceedsShopCap: rows.length ? biggest / rows.length > SHOP_SHARE_CAP : false,
      evidenceWindowSeconds: seconds,
      evidenceWindow: rows.length ? describeWindow(seconds) : null,
    },
    intersectedBeforeRelevance: result.withMomentum,
    rejected: [...why.entries()].map(([because, listings]) => ({ because, listings }))
      .sort((a, b) => b.listings - a.listings),
    claim: COHORT_CLAIM,
  });
});
