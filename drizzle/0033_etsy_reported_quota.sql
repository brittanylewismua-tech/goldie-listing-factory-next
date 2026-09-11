-- Etsy reports what is left of the day's quota on every response, and that
-- figure covers the whole app key — including whatever World Builder spent on
-- the same key. Counting only our own calls would leave the budget believing
-- in headroom another product had already used.
--
-- These columns are intentionally separate from 0031. Production applied 0031
-- before reported quota tracking existed.
ALTER TABLE `etsy_queue_state` ADD COLUMN `remaining_today` integer;
--> statement-breakpoint
ALTER TABLE `etsy_queue_state` ADD COLUMN `remaining_at` text;
