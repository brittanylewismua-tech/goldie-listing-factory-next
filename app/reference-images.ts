/**
 * THE CURRENT PRIMARY IMAGE OF A LISTING WE HAVE EVIDENCE ABOUT.
 *
 * Why this is its own table rather than another column on `listing_snapshots`:
 * snapshots are a HISTORY, written by two different readers. The bulk poller
 * does not ask Etsy for images, so its rows carry no image identity. Reading
 * "the newest snapshot" therefore reports NO IMAGE for every listing a poll
 * has touched since its inspection — which, given the poller runs constantly,
 * is eventually all of them. I made exactly that mistake and reported zero
 * recoverable images when the real figure was not zero.
 *
 * So current image state lives here, keyed by listing, overwritten in place.
 * A later poll cannot erase it because a later poll never writes here.
 *
 * WHAT `image_id` IS. Etsy's own identifier for the image. It is NOT a hash of
 * the image's contents — two different pictures have different ids, but so do
 * two uploads of the same picture, and the id tells you nothing about what is
 * in the frame. `listing_snapshots.image_hash` is a fingerprint OF THAT ID,
 * used only to notice that the primary image changed. Neither is a content
 * hash and neither may be described as one.
 *
 * WHAT IS NOT STORED: the image bytes. Etsy's terms cover displaying current
 * listing data, not keeping a copy of the artwork. Images are fetched when
 * they are about to be analysed and dropped afterwards; what persists is the
 * URL, the retrieval time, and the derived structured analysis.
 *
 * SIX-HOUR FRESHNESS. Etsy requires displayed listing information to have been
 * refreshed within six hours. `retrieved_at` is what makes that checkable, and
 * `isFresh` is what checks it. A stale row is re-fetched, never shown.
 */
export const DISPLAY_FRESHNESS_SECONDS = 6 * 60 * 60;

export type ReferenceImage = {
  listingId: number;
  shopId: number;
  imageId: number | null;
  imageUrl: string;
  listingState: string;
  retrievedAt: number;
  sourceEndpoint: string;
};

/** Every reason a requested listing did not produce a usable image. */
export type Outcome =
  | "recovered"      /* active, has a primary image URL */
  | "inactive"       /* Etsy answered, state is not active */
  | "sold-out"       /* Etsy answered, sold out */
  | "no-image"       /* Etsy answered, listing carries no image */
  | "unavailable"    /* Etsy answered but omitted this listing id */
  | "deleted"        /* Etsy explicitly reports it gone */
  | "failed";        /* the call itself did not succeed */

export const isFresh = (retrievedAt: number, now: number) =>
  now - retrievedAt < DISPLAY_FRESHNESS_SECONDS;
