-- CARDS CRACKED, AND THE COUNTER THEY CAME FROM.
--
-- One row per card a seller has opened. The card's content is snapshotted at
-- the moment it opens rather than looked up later: a card that said "this has
-- held the top five for nine days" must still say that next month, when the
-- listing has fallen out. A card that rewrites itself is not a reward, it is a
-- dashboard with a ribbon on it.
CREATE TABLE IF NOT EXISTS `unlock_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`listings_at` integer NOT NULL,
	`opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_unlock_cards_user_ordinal` ON `unlock_cards` (`user_id`,`ordinal`);
