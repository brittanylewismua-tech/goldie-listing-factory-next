-- D697 · A bundle publishes in one call, and every listing in it was credited to
-- one batch: the job stores a single batch_id, taken from drafts[0]. Measured on
-- the Hoodie + 1566 crewneck bundle after a real publish - Batch History showed
-- "4 PUBLISHED TO ETSY" on the hoodie and "DRAFT" with a Resume button on the
-- crewneck, whose two listings were live on Etsy at that moment. Resuming it
-- would have published them a second time and charged Etsy's fee again.
--
-- Each draft already knows its own batch; the queue was the place it got lost.
ALTER TABLE `etsy_publish_items` ADD `batch_id` text;
--> statement-breakpoint
CREATE INDEX `idx_etsy_publish_items_batch` ON `etsy_publish_items` (`user_id`,`batch_id`,`status`);
--> statement-breakpoint
-- Backfill: every existing item inherits its job's batch_id. Without this the new
-- per-item count reads zero for work already published, and Brittany's four live
-- listings would show as unpublished the moment this ships.
UPDATE `etsy_publish_items`
SET `batch_id` = (SELECT `batch_id` FROM `etsy_publish_jobs` WHERE `etsy_publish_jobs`.`id` = `etsy_publish_items`.`job_id`)
WHERE `batch_id` IS NULL;
