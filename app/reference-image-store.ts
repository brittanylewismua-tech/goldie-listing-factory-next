import { env } from "cloudflare:workers";
import type { ReferenceImage, Outcome } from "@/app/reference-images";

/**
 * Persistence for the current reference image. The policy — what the id is,
 * what is never stored, how fresh a row has to be — lives in
 * `reference-images.ts`, which stays importable without a Workers runtime so
 * it can be tested directly.
 */
export async function ensureReferenceImageTable() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS reference_images (
    listing_id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL DEFAULT 0,
    image_id INTEGER,
    image_url TEXT NOT NULL DEFAULT '',
    listing_state TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL DEFAULT '',
    retrieved_at INTEGER NOT NULL DEFAULT 0,
    source_endpoint TEXT NOT NULL DEFAULT '')`).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS reference_images_state ON reference_images (outcome, retrieved_at)`)
    .run();
}

export async function rememberReferenceImage(
  row: ReferenceImage & { outcome: Outcome },
) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `INSERT INTO reference_images
       (listing_id, shop_id, image_id, image_url, listing_state, outcome, retrieved_at, source_endpoint)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(listing_id) DO UPDATE SET
       shop_id = excluded.shop_id, image_id = excluded.image_id,
       image_url = excluded.image_url, listing_state = excluded.listing_state,
       outcome = excluded.outcome, retrieved_at = excluded.retrieved_at,
       source_endpoint = excluded.source_endpoint`)
    .bind(row.listingId, row.shopId, row.imageId, row.imageUrl, row.listingState,
      row.outcome, row.retrievedAt, row.sourceEndpoint)
    .run();
}
