-- TODAY'S DROP, AND THE STREAK THAT IS EARNED RATHER THAN CLAIMED.
--
-- pod_drop_snapshots: one row per product category per day, shared by every
-- seller. The whole feature costs about a dozen Etsy calls a day no matter how
-- many people read it, and the history is the product — tomorrow's drop can
-- only say "this broke out overnight" because yesterday's row exists.
CREATE TABLE IF NOT EXISTS `pod_drop_snapshots` (
	`day_taxonomy` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`taxonomy_id` integer NOT NULL,
	`label` text NOT NULL,
	`listings_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pod_drop_day` ON `pod_drop_snapshots` (`day`);
--> statement-breakpoint
-- One claim row, so twenty sellers arriving at 7am do not each start a build.
-- Same pattern the Etsy publish worker already uses.
CREATE TABLE IF NOT EXISTS `pod_drop_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`building_day` text,
	`building_since` text,
	`last_built_day` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `pod_drop_state` (id) VALUES (1);
--> statement-breakpoint
-- Etsy's category tree, fetched once. It changes about never, and it is the
-- only honest way to know which taxonomy ids are the print-on-demand products
-- rather than hardcoding numbers that could quietly start meaning something
-- else.
CREATE TABLE IF NOT EXISTS `etsy_taxonomy_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`nodes_json` text NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
