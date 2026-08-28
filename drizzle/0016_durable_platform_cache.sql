-- D661 · The D655/D656/D657 caching was inert in production. D657's own
-- instrumentation proved it: six consecutive identical product loads all
-- reported catalogFetches=4 and cache "miss", so caches.default was writing
-- nothing this deployment could read back. Two things were being cached for
-- two different reasons, and they need two different stores.
--
-- 1. The shop pairing verdict. Tiny, per seller, and the single biggest cost on
--    a product load - measured at ~1500ms of a ~2600ms request, re-proved on
--    every click. Keyed by the STABLE ids, never the names: D641 was caused by
--    a rename, and a verdict keyed on a name would reintroduce exactly that.
CREATE TABLE IF NOT EXISTS `shop_pairing_proofs` (
  `user_id` text NOT NULL,
  `printify_shop_id` integer NOT NULL,
  `etsy_shop_id` integer NOT NULL,
  `listing_id` integer NOT NULL DEFAULT 0,
  `proved_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `printify_shop_id`, `etsy_shop_id`)
);

-- 2. Platform reference data: Etsy's global taxonomy and Printify's blueprint
--    catalogue. Not the seller's data at all - the same bytes for everyone -
--    which is what makes one shared copy correct. Versioned and expiring, so a
--    stale tree ages out rather than being trusted forever.
CREATE TABLE IF NOT EXISTS `platform_cache` (
  `cache_key` text PRIMARY KEY NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL,
  `stored_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `platform_cache_expires` ON `platform_cache` (`expires_at`);
