CREATE TABLE IF NOT EXISTS photo_deliveries (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 printify_shop_id INTEGER NOT NULL,
 etsy_shop_id INTEGER NOT NULL,
 fingerprint TEXT NOT NULL,
 status TEXT NOT NULL,
 photos_json TEXT NOT NULL DEFAULT '[]',
 state_json TEXT,
 candidate_listing_id INTEGER,
 candidate_seen_at INTEGER,
 error TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS photo_delivery_active_product ON photo_deliveries(user_id,product_id) WHERE status IN ('preparing','waiting','delivering');
CREATE INDEX IF NOT EXISTS photo_delivery_owner ON photo_deliveries(user_id,product_id,created_at);
