-- WHAT THEY HAVE ALREADY SEEN IS THEIRS, PERMANENTLY.
--
-- The week's access re-locks on Monday, which is what keeps somebody listing.
-- Re-locking a day they already read would be different: that is taking
-- something back, and it would make the whole thing feel mean rather than
-- moreish. So each day a seller opens the drop is recorded with the depth they
-- had at the time, and the archive replays exactly that, forever.
--
-- You keep what you have seen. You earn what is new.
CREATE TABLE IF NOT EXISTS `drop_seen` (
	`user_day` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`depth` integer DEFAULT 10 NOT NULL,
	`seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_drop_seen_user` ON `drop_seen` (`user_id`,`day`);
--> statement-breakpoint
-- Etsy reports what is left of the day's quota on every response, and that
-- figure covers the whole app key — including whatever World Builder spent on
-- the same key. Counting only our own calls would leave the budget believing
-- in headroom another product had already used.
ALTER TABLE `etsy_queue_state` ADD COLUMN `remaining_today` integer;
--> statement-breakpoint
ALTER TABLE `etsy_queue_state` ADD COLUMN `remaining_at` text;
