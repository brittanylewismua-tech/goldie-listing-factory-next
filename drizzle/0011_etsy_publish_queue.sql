CREATE TABLE `etsy_publish_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_publish_jobs_user_updated` ON `etsy_publish_jobs` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_publish_jobs_user_batch` ON `etsy_publish_jobs` (`user_id`,`batch_id`);
--> statement-breakpoint
CREATE TABLE `etsy_publish_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer DEFAULT 0 NOT NULL,
	`locked_at` integer,
	`result_json` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_publish_items_job_status` ON `etsy_publish_items` (`job_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_etsy_publish_items_status_available` ON `etsy_publish_items` (`status`,`available_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_etsy_publish_items_status_locked` ON `etsy_publish_items` (`status`,`locked_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_etsy_publish_items_user_product` ON `etsy_publish_items` (`user_id`,`product_id`);
--> statement-breakpoint
CREATE TABLE `etsy_api_usage_buckets` (
	`bucket` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`rate_limited` integer DEFAULT 0 NOT NULL,
	`qpd_limit` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `etsy_listing_usage` (
	`user_product` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`job_id` text NOT NULL,
	`etsy_listing_id` integer NOT NULL,
	`api_calls` integer DEFAULT 0 NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_listing_usage_user_published` ON `etsy_listing_usage` (`user_id`,`published_at`);
