import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { addCandidates, needsCandidateDisplay } from "@/app/niche-candidate-store";
import { normalizeNiche, relates, type Candidate } from "@/app/niche-cohort";

import { listingDisplay, listingPhoto, listingPrice, type EtsyDisplayListing } from "@/app/etsy-listing-display";

/** One bounded Etsy read used when a saved keyword has no current cards yet. */
export async function refreshKeywordListings(
  key: string, phrase: string, now: number, force = false,
) {
  if (!force && !(await needsCandidateDisplay(key, now))) return false;
  const { query, terms } = normalizeNiche(phrase);
  if (!terms.length) return false;
  await waitForEtsyCapacity();
  const search = new URLSearchParams({
    keywords: query, limit: "48", offset: "0", sort_on: "score",
    sort_order: "desc",
  });
  const response = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${search}`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
  await recordEtsyCall(response, "search");
  if (!response.ok) throw new Error("Etsy could not load listings for this keyword. Please try again.");
  const body = await response.json() as { results?: EtsyDisplayListing[] };
  const db = (env as unknown as { DB: D1Database }).DB;
  // Include stored candidates: at the pool limit a fresh search can return an
  // entirely different page, leaving every saved card without display data.
  const existing = await db.prepare(`SELECT listing_id AS listingId FROM niche_candidates
    WHERE niche_key = ? AND state IN ('discovered','awaiting-baseline','monitoring','momentum','repeated-momentum')
    ORDER BY last_qualifying_at DESC, display_refreshed_at ASC LIMIT 48`)
    .bind(key).all<{ listingId: number }>();
  const existingIds = new Set((existing.results ?? []).map(row => Number(row.listingId)));
  const display = await listingDisplay([
    ...existingIds, ...(body.results ?? []).map(row => Number(row.listing_id)),
  ], "search");
  const found = [...display.values()].flatMap((row, page) => {
    const listingId = Number(row.listing_id ?? 0);
    if (!listingId) return [];
    const candidate: Candidate = { listingId, shopId: Number(row.shop_id ?? 0),
      title: String(row.title ?? ""), tags: (row.tags ?? []).map(String) };
    if (!existingIds.has(listingId) && !relates(candidate, terms).ok) return [];
    return [{ listingId, shopId: candidate.shopId, page, state: String(row.state ?? "active"),
      title: candidate.title, imageUrl: listingPhoto(row), priceCents: listingPrice(row),
      currency: String(row.price?.currency_code ?? "USD"),
      favorites: typeof row.num_favorers === "number" && Number.isFinite(row.num_favorers) ? Number(row.num_favorers) : null,
      views: typeof row.views === "number" && Number.isFinite(row.views) ? Number(row.views) : null,
      originalCreated: Number(row.original_creation_timestamp) || null,
      displayRefreshedAt: now }];
  });
  const watchers = await db.prepare(
    `SELECT COUNT(*) AS n FROM niche_watches WHERE niche_key = ? AND paused = 0`)
    .bind(key).first<{ n: number }>().catch(() => null);
  await addCandidates(key, phrase, query, found, now, Math.max(1, Number(watchers?.n ?? 1)));
  return true;
}
