CREATE TABLE `etsy_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`etsy_user_id` integer NOT NULL,
	`shop_id` integer NOT NULL,
	`shop_name` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `etsy_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_oauth_states_user_expiry` ON `etsy_oauth_states` (`user_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `etsy_listing_links` (
	`printify_product_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`etsy_listing_id` integer NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_listing_links_user_batch` ON `etsy_listing_links` (`user_id`,`batch_id`);
