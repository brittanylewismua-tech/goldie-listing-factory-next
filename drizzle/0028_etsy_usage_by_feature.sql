-- The rolling call log counted how much of the Etsy quota was spent and never
-- what spent it. That is the difference between "we are at capacity", which is
-- a complaint, and "publishing takes 9,200 calls a day for 54 sellers and we
-- are turning work away", which is the evidence Etsy asks for before raising a
-- limit. It is also the only way to know which feature to make cheaper.
--
-- Rebuilt rather than altered: the primary key becomes (bucket, feature), and
-- SQLite cannot change a primary key in place. Existing rows are carried over
-- and attributed to 'unlabelled', because they honestly are.
CREATE TABLE `etsy_api_usage_buckets_new` (
	`bucket` text NOT NULL,
	`feature` text DEFAULT 'unlabelled' NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`qpd_limit` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (`bucket`, `feature`)
);
--> statement-breakpoint
INSERT INTO `etsy_api_usage_buckets_new` (bucket,feature,calls,rate_limited,qpd_limit,updated_at)
  SELECT bucket,'unlabelled',calls,rate_limited,qpd_limit,updated_at FROM `etsy_api_usage_buckets`;
--> statement-breakpoint
DROP TABLE `etsy_api_usage_buckets`;
--> statement-breakpoint
ALTER TABLE `etsy_api_usage_buckets_new` RENAME TO `etsy_api_usage_buckets`;
--> statement-breakpoint
CREATE INDEX `idx_etsy_usage_bucket` ON `etsy_api_usage_buckets` (`bucket`);
--> statement-breakpoint
-- WHAT'S SELLING: one row per keyword per day, shared by every seller.
--
-- "What is hot for feminist tote bag" has the same answer for all 54 of them,
-- so it is fetched once and served from here. That is the whole reason this
-- feature is affordable: uncached it would be one Etsy call per search per
-- seller, cached it is one call per keyword per day for the entire app.
CREATE TABLE IF NOT EXISTS `etsy_keyword_snapshots` (
	`keyword_day` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`day` text NOT NULL,
	`listings_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_keyword_snapshots_day` ON `etsy_keyword_snapshots` (`day`);
