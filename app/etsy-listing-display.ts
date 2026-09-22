import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity, type EtsyFeature } from "@/app/api/etsy/client";
import { decodeEntities } from "@/app/shop-map-worlds";

export type EtsyDisplayListing = {
  listing_id?: number; shop_id?: number; title?: string; tags?: string[]; state?: string;
  price?: { amount?: number; divisor?: number; currency_code?: string };
  num_favorers?: number; views?: number; original_creation_timestamp?: number; creation_timestamp?: number; created_timestamp?: number;
  images?: Array<{ rank?: number; url_570xN?: string; url_fullxfull?: string; url_300x300?: string }>;
  shop?: { shop_name?: string; icon_url_fullxfull?: string };
};

/** Search responses do not embed images. Hydrate a bounded page through Etsy's
 * batch endpoint, which supports the Images and Shop associations. */
export async function listingDisplay(ids: number[], feature: EtsyFeature, token?: string) {
  const selected = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (selected.length > 100) throw new Error("Listing display requests are limited to 100 listings.");
  if (!selected.length) return new Map<number, EtsyDisplayListing>();
  await waitForEtsyCapacity();
  const query = new URLSearchParams({ listing_ids: selected.join(","), includes: "Images,Shop" });
  const response = await fetch(`https://openapi.etsy.com/v3/application/listings/batch?${query}`, {
    headers: { "x-api-key": etsyApiCredential(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(25_000),
  });
  await recordEtsyCall(response, feature);
  if (!response.ok) throw new Error("Etsy could not refresh these listing photos and details. Please try again.");
  const body = await response.json() as { results?: EtsyDisplayListing[] };
  return new Map((body.results ?? []).map(row => [Number(row.listing_id), {
    ...row, title: decodeEntities(String(row.title ?? "")),
  }]));
}

export function listingPhoto(row: EtsyDisplayListing) {
  const photo = [...(row.images ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0];
  return photo?.url_570xN || photo?.url_fullxfull || photo?.url_300x300 || "";
}

export function listingPrice(row: EtsyDisplayListing) {
  const amount = row.price?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100 / Math.max(1, Number(row.price?.divisor) || 100));
}
