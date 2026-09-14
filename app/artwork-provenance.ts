/**
 * KEEPING THE DESIGN THAT SOLD.
 *
 * Measured across She's A Wolf's entire Printify history: not one order
 * carries its own artwork, and every sampled product now answers 404. Zero
 * per cent of sold units can be tied to the design the buyer actually bought.
 * That history is gone and no amount of cleverness recovers it.
 *
 * What is recoverable is everything from here on. At the moment Goldie
 * publishes a listing, the Printify product still exists and still carries its
 * print areas and their images — so this takes a copy then, keyed to the Etsy
 * listing that will one day report a sale. A seller deleting the product later
 * no longer erases the evidence.
 *
 * THE BYTES, NOT A LINK. Printify's image URLs are temporary and the product
 * they belong to may be deleted, so a stored URL is a promise that expires.
 * The image is copied into R2 and hashed, which is what makes a sale two years
 * from now still point at something real.
 */
import { env } from "cloudflare:workers";

const db = () => (env as unknown as { DB: D1Database }).DB;
const bucket = () => (env as unknown as { ARTWORK: R2Bucket }).ARTWORK;

/** One print image per product. Enough to identify the design, bounded in cost. */
export const MAX_ARTWORK_BYTES = 12 * 1024 * 1024;

export async function ensureProvenanceTables(): Promise<void> {
  await db().batch([
    /*
      One row per design Goldie has seen published, with the artwork it was
      published with. Keyed on the Printify product because that is what the
      order will name; the Etsy listing is filled in when publishing finishes.
    */
    db().prepare(`CREATE TABLE IF NOT EXISTS artwork_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      printify_shop_id INTEGER,
      printify_product_id TEXT NOT NULL,
      etsy_listing_id INTEGER,
      batch_id TEXT NOT NULL DEFAULT '',
      blueprint_id INTEGER,
      print_provider_id INTEGER,
      variant_ids TEXT NOT NULL DEFAULT '',
      /* Where on the garment, and how big — the placement is part of the
         design, not decoration around it. */
      placement TEXT NOT NULL DEFAULT '',
      artwork_key TEXT NOT NULL DEFAULT '',
      artwork_hash TEXT NOT NULL DEFAULT '',
      artwork_bytes INTEGER NOT NULL DEFAULT 0,
      source_url TEXT NOT NULL DEFAULT '',
      captured_at TEXT NOT NULL,
      captured_because TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    )`),
    /* One capture per product per reason; re-publishing the same product
       should not fill the table with duplicates of the same design. */
    db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS artwork_provenance_once
      ON artwork_provenance (user_id, printify_product_id, artwork_hash)`),
    db().prepare(`CREATE INDEX IF NOT EXISTS artwork_provenance_listing
      ON artwork_provenance (etsy_listing_id)`),
  ]);
}

/** Content hash, so the same design published twice is recognised as one. */
async function hashOf(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

type PrintifyProduct = {
  id?: string; blueprint_id?: number; print_provider_id?: number;
  print_areas?: Array<{
    variant_ids?: number[];
    placeholders?: Array<{
      position?: string;
      images?: Array<{ src?: string; x?: number; y?: number; scale?: number; angle?: number }>;
    }>;
  }>;
};

export type Capture = {
  captured: boolean;
  reason: string;
  productId: string;
  hash?: string;
  bytes?: number;
  note?: string;
};

/**
 * Take a copy of what a Printify product is printing, right now.
 *
 * Called when the product is known to exist: at publish, when a shop is first
 * connected, when a new product appears, and when an order arrives. Failure is
 * never fatal to the caller — a design not captured is a gap in evidence, not
 * a reason a seller's publish should fall over.
 */
export async function captureProductArtwork(
  {
    userId, shopId, productId, token, because, batchId = "", listingId = null,
  }: {
    userId: string; shopId: number; productId: string; token: string;
    because: string; batchId?: string; listingId?: number | null;
  },
): Promise<Capture> {
  await ensureProvenanceTables();
  const base: Capture = { captured: false, reason: because, productId };

  try {
    const response = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000),
      });
    if (!response.ok) return { ...base, note: `Printify answered ${response.status}` };
    const product = await response.json() as PrintifyProduct;

    /* The first placeholder that actually carries an image. A product with no
       image is a draft nobody finished, not a design. */
    const area = (product.print_areas ?? []).find(row =>
      (row.placeholders ?? []).some(place => (place.images ?? []).length));
    const placeholder = (area?.placeholders ?? []).find(place => (place.images ?? []).length);
    const image = (placeholder?.images ?? [])[0];
    if (!image?.src) return { ...base, note: "The product carries no print image." };

    const artwork = await fetch(image.src, { signal: AbortSignal.timeout(30_000) });
    if (!artwork.ok) return { ...base, note: `Artwork fetch answered ${artwork.status}` };
    const bytes = await artwork.arrayBuffer();
    if (bytes.byteLength > MAX_ARTWORK_BYTES)
      return { ...base, note: `Artwork is ${Math.round(bytes.byteLength / 1_048_576)}MB, over the cap.` };

    const hash = await hashOf(bytes);
    const key = `provenance/${userId}/${hash}.png`;
    /* Keyed by content, so the same design across ten products is stored once. */
    const already = await bucket().head(key).catch(() => null);
    if (!already)
      await bucket().put(key, bytes, { httpMetadata: { contentType: artwork.headers.get("content-type") ?? "image/png" } });

    const placement = JSON.stringify({
      position: placeholder?.position ?? "",
      x: image.x ?? null, y: image.y ?? null,
      scale: image.scale ?? null, angle: image.angle ?? null,
    });

    await db().prepare(
      `INSERT INTO artwork_provenance
         (user_id, printify_shop_id, printify_product_id, etsy_listing_id, batch_id,
          blueprint_id, print_provider_id, variant_ids, placement,
          artwork_key, artwork_hash, artwork_bytes, source_url, captured_at, captured_because)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, printify_product_id, artwork_hash) DO UPDATE SET
         /* A later capture may learn the listing id the first one did not. */
         etsy_listing_id = COALESCE(artwork_provenance.etsy_listing_id, excluded.etsy_listing_id),
         placement = excluded.placement`)
      .bind(userId, shopId, productId, listingId, batchId,
        product.blueprint_id ?? null, product.print_provider_id ?? null,
        (area?.variant_ids ?? []).join(","), placement,
        key, hash, bytes.byteLength, "", new Date().toISOString(), because)
      .run();

    return { ...base, captured: true, hash, bytes: bytes.byteLength };
  } catch (error) {
    /* Recorded, never thrown: evidence capture must not be able to break a
       publish the seller is waiting on. */
    return { ...base, note: error instanceof Error ? error.message : "failed" };
  }
}

/**
 * THE MOMENTS WORTH CAPTURING AT.
 *
 * Publishing is the richest one, because both the product and the new listing
 * id exist. It is not the only one: a shop connected for the first time has a
 * whole catalogue that may be deleted next month, a product that changes is a
 * different design from the one that sold yesterday, an order proves a design
 * mattered, and a product Goldie is about to retire is a last chance.
 *
 * Every one of these is the same capture, labelled with why it happened, so
 * the evidence can later be read in the knowledge of how it was obtained.
 */
export type CaptureReason =
  | "listing-factory-publish"
  | "connected-shop-backfill"
  | "new-product-discovered"
  | "product-changed"
  | "order-detected"
  | "before-goldie-retires-product";

/**
 * Capture before Goldie itself removes a product.
 *
 * Goldie deletes QA products and abandoned drafts, and a deletion it performs
 * is the one deletion it can always see coming. Taking the copy first costs a
 * call and preserves a design that would otherwise vanish exactly the way the
 * historical ones did.
 */
export async function captureBeforeRetiring(
  { userId, shopId, productId, token }:
    { userId: string; shopId: number; productId: string; token: string },
): Promise<Capture> {
  return captureProductArtwork({
    userId, shopId, productId, token, because: "before-goldie-retires-product",
  });
}

/** Fill in the Etsy listing once publishing has produced one. */
export async function linkListingToArtwork(
  userId: string, productId: string, listingId: number,
): Promise<void> {
  await ensureProvenanceTables();
  await db().prepare(
    `UPDATE artwork_provenance SET etsy_listing_id = ?
      WHERE user_id = ? AND printify_product_id = ? AND etsy_listing_id IS NULL`)
    .bind(listingId, userId, productId).run();
}

/** What Goldie can now prove about a design, for the audit view. */
export async function provenanceHealth(userId?: string): Promise<Record<string, unknown>> {
  await ensureProvenanceTables();
  const scope = userId ? `WHERE user_id = ?` : "";
  const bind = userId ? [userId] : [];
  const row = await db().prepare(
    `SELECT COUNT(*) AS designs,
            COUNT(DISTINCT artwork_hash) AS distinct_artwork,
            SUM(CASE WHEN etsy_listing_id IS NOT NULL THEN 1 ELSE 0 END) AS with_listing,
            COALESCE(SUM(artwork_bytes), 0) AS bytes,
            MIN(captured_at) AS first_capture
       FROM artwork_provenance ${scope}`).bind(...bind).first<Record<string, number | string>>();
  return {
    designsCaptured: Number(row?.designs ?? 0),
    distinctArtwork: Number(row?.distinct_artwork ?? 0),
    linkedToAnEtsyListing: Number(row?.with_listing ?? 0),
    storedMegabytes: Math.round(Number(row?.bytes ?? 0) / 1_048_576 * 10) / 10,
    capturingSince: row?.first_capture ?? null,
  };
}
