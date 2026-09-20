import { env } from "cloudflare:workers";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { addCandidates, needsCandidateDisplay } from "@/app/niche-candidate-store";
import { normalizeNiche, relates, type Candidate } from "@/app/niche-cohort";

type EtsyMoney = { amount?: number; divisor?: number; currency_code?: string };
type EtsyImage = { url_570xN?: string; url_fullxfull?: string; url_300x300?: string };
type EtsyListing = {
  listing_id?: number; shop_id?: number; title?: string; tags?: string[]; state?: string;
  price?: EtsyMoney; num_favorers?: number; views?: number;
  original_creation_timestamp?: number; images?: EtsyImage[];
};

const cents = (price?: EtsyMoney) => {
  if (!price || !Number.isFinite(Number(price.amount))) return null;
  const divisor = Math.max(1, Number(price.divisor) || 100);
  return Math.round(Number(price.amount) * 100 / divisor);
};

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
    sort_order: "desc", includes: "Images",
  });
  const response = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${search}`,
    { headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20_000) });
  await recordEtsyCall(response, "search");
  if (!response.ok) return false;
  const body = await response.json() as { results?: EtsyListing[] };
  const found = (body.results ?? []).flatMap((row, page) => {
    const listingId = Number(row.listing_id ?? 0);
    if (!listingId) return [];
    const candidate: Candidate = { listingId, shopId: Number(row.shop_id ?? 0),
      title: String(row.title ?? ""), tags: (row.tags ?? []).map(String) };
    if (!relates(candidate, terms).ok) return [];
    const photo = row.images?.[0];
    return [{ listingId, shopId: candidate.shopId, page, state: String(row.state ?? "active"),
      title: candidate.title, imageUrl: String(photo?.url_570xN ?? photo?.url_fullxfull
        ?? photo?.url_300x300 ?? ""), priceCents: cents(row.price),
      currency: String(row.price?.currency_code ?? "USD"),
      favorites: Number.isFinite(Number(row.num_favorers)) ? Number(row.num_favorers) : null,
      views: Number.isFinite(Number(row.views)) ? Number(row.views) : null,
      originalCreated: Number(row.original_creation_timestamp) || null,
      displayRefreshedAt: now }];
  });
  const db = (env as unknown as { DB: D1Database }).DB;
  const watchers = await db.prepare(
    `SELECT COUNT(*) AS n FROM niche_watches WHERE niche_key = ? AND paused = 0`)
    .bind(key).first<{ n: number }>().catch(() => null);
  await addCandidates(key, phrase, query, found, now, Math.max(1, Number(watchers?.n ?? 1)));
  return true;
}
