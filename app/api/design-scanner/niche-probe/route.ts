import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { normalizeNiche, intersect, COHORT_CLAIM, type Candidate } from "@/app/niche-cohort";
import { EVIDENCE_FRESH_DAYS, SHOP_SHARE_CAP } from "@/app/momentum-cohort";
import { describeWindow } from "@/app/evidence-window";

/**
 * CAN THIS NICHE PRODUCE A COHORT AT ALL?
 *
 * Measurement, not a product surface. It runs the real path a member scan
 * would run — normalize the phrase, ask Etsy for active listings, intersect
 * with verified momentum — and reports the distribution instead of an answer.
 *
 * The point is to find out whether a threshold exists that the data can
 * actually support, before one is chosen. Choosing first and measuring after
 * is how a minimum cohort size becomes a number picked to make a feature look
 * ready.
 *
 * Owner-only. Returns counts and reasons; no titles, no shop names, no URLs.
 */
export const maxDuration = 300;

const PAGE = 100;

type EtsyActive = {
  listing_id?: number; shop_id?: number; title?: string; tags?: string[];
};

export const GET = withErrorLog("design-scanner-niche-probe", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  const phrase = (url.searchParams.get("q") ?? "").trim();
  if (!phrase) return NextResponse.json({ error: "Give a niche phrase as ?q=" }, { status: 400 });
  const pages = Math.max(1, Math.min(10, Number(url.searchParams.get("pages")) || 3));

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
            (SELECT outcome FROM reference_images r WHERE r.listing_id = a.listing_id) AS imageOutcome
       FROM listing_sales_activity a
      WHERE a.interval_id IS NOT NULL AND a.observed_at >= ?
      GROUP BY a.listing_id, a.shop_id`)
    .bind(since)
    .all<{ listingId: number; shopId: number; intervals: number; units: number;
      firstSeen: string; lastSeen: string; reviews: number;
      imageUrl: string | null; imageOutcome: string | null }>()
    .catch(() => ({ results: [] }));

  const evidence = new Map((corpus.results ?? []).map(row => [Number(row.listingId), row]));
  const qualified = new Set(evidence.keys());

  const { query, terms } = normalizeNiche(phrase);
  const candidates: Candidate[] = [];
  let calls = 0;
  let etsyMatched = 0;
  const failures: string[] = [];

  for (let page = 0; page < pages; page += 1) {
    await waitForEtsyCapacity();
    const search = new URLSearchParams({
      keywords: query, limit: String(PAGE), offset: String(page * PAGE),
      sort_on: "score", sort_order: "desc",
    });
    let response: Response;
    try {
      response = await fetch(
        `https://openapi.etsy.com/v3/application/listings/active?${search}`,
        { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "request failed");
      break;
    }
    await recordEtsyCall(response, "search");
    calls += 1;
    if (!response.ok) { failures.push(`HTTP ${response.status}`); break; }
    const body = await response.json() as { results?: EtsyActive[]; count?: number };
    if (page === 0) etsyMatched = Number(body.count) || 0;
    const rows = body.results ?? [];
    for (const row of rows) {
      if (!row.listing_id) continue;
      candidates.push({
        listingId: Number(row.listing_id), shopId: Number(row.shop_id ?? 0),
        title: String(row.title ?? ""), tags: (row.tags ?? []).map(String),
      });
    }
    if (rows.length < PAGE) break;
  }

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
    etsy: { calls, resultsExamined: result.searched, etsyReportsMatching: etsyMatched, failures },
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
