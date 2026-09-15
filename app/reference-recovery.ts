/**
 * ACCOUNT FOR EVERY LISTING WE ASKED ABOUT.
 *
 * A recovery percentage computed over the listings Etsy happened to answer for
 * is not a recovery percentage — it is a survivorship figure that always looks
 * good. So the input is the ids we REQUESTED, and every one of them leaves
 * with an outcome. The totals are asserted to add up.
 *
 * Pure: the caller does the fetching.
 */
import type { Outcome } from "@/app/reference-images";

export type EtsyListingRow = {
  listing_id?: number; shop_id?: number; state?: string; quantity?: number;
  title?: string; tags?: string[];
  images?: Array<{ url_570xN?: string; url_fullxfull?: string; listing_image_id?: number }>;
};

export type Recovered = {
  listingId: number; shopId: number; imageId: number | null;
  imageUrl: string; listingState: string; outcome: Outcome;
  /* The listing's OWN words, from the same call. Kept because a niche cohort
     is decided by what the seller says the listing is, and fetching them
     separately would double the calls for information already in the payload. */
  title: string; tags: string[];
};

const ACTIVE = new Set(["active"]);

export function classify(row: EtsyListingRow): Recovered {
  const listingId = Number(row.listing_id ?? 0);
  const state = String(row.state ?? "").toLowerCase();
  const image = row.images?.[0];
  const url = String(image?.url_570xN ?? image?.url_fullxfull ?? "");
  const base = {
    listingId, shopId: Number(row.shop_id ?? 0),
    imageId: image?.listing_image_id === undefined ? null : Number(image.listing_image_id),
    imageUrl: url, listingState: state,
    title: String(row.title ?? ""), tags: (row.tags ?? []).map(String),
  };
  if (state === "removed" || state === "unavailable")
    return { ...base, outcome: "deleted" };
  if (state === "sold_out" || (ACTIVE.has(state) && Number(row.quantity ?? 1) === 0))
    /* Sold out is still a real listing with a real image, and its sell-out is
       itself evidence. It is recorded distinctly but it is not a loss. */
    return { ...base, outcome: url ? "recovered" : "sold-out" };
  if (!ACTIVE.has(state)) return { ...base, outcome: "inactive" };
  if (!url) return { ...base, outcome: "no-image" };
  return { ...base, outcome: "recovered" };
}

export type Accounting = Record<Outcome, number> & { requested: number; accounted: number };

export function account(
  requested: number[], answered: Recovered[], failedIds: number[],
): { rows: Recovered[]; totals: Accounting; unaccounted: number[] } {
  const byId = new Map(answered.map(row => [row.listingId, row]));
  const failed = new Set(failedIds);
  const rows: Recovered[] = [];
  const totals: Accounting = {
    requested: requested.length, accounted: 0, recovered: 0, inactive: 0,
    "sold-out": 0, "no-image": 0, unavailable: 0, deleted: 0, failed: 0,
  };
  for (const listingId of requested) {
    const answer = byId.get(listingId);
    const row: Recovered = answer ?? {
      listingId, shopId: 0, imageId: null, imageUrl: "", listingState: "",
      title: "", tags: [],
      /* Etsy answering the call but omitting the id is different from the call
         failing, and both are different from a listing that is simply gone. */
      outcome: failed.has(listingId) ? "failed" : "unavailable",
    };
    rows.push(row);
    totals[row.outcome] += 1;
    totals.accounted += 1;
  }
  const seen = new Set(requested);
  return { rows, totals, unaccounted: [...byId.keys()].filter(id => !seen.has(id)) };
}

/** Refuses to produce a percentage until the accounting balances. */
export function recoveryRate(totals: Accounting): number | null {
  if (totals.accounted !== totals.requested) return null;
  const counted = totals.recovered + totals.inactive + totals["sold-out"]
    + totals["no-image"] + totals.unavailable + totals.deleted + totals.failed;
  if (counted !== totals.requested) return null;
  return totals.recovered / Math.max(1, totals.requested);
}
