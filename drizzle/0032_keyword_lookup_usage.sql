-- Keyword lookups a seller has spent today, counted only when the answer was
-- not already cached. A phrase somebody else looked up this morning costs
-- nothing to serve again, so it should not count against anybody — the limit
-- exists to bound Etsy calls, not curiosity.
--
-- This is intentionally separate from 0031. Production applied 0031 before
-- keyword limits existed, so extending that already-recorded migration would
-- leave the required table missing on the live database.
CREATE TABLE IF NOT EXISTS `keyword_lookup_usage` (
	`user_day` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`fresh_lookups` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
