CREATE TABLE `keyword_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`keywords_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_keyword_lists_user` ON `keyword_lists` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `product_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`template_url` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`default_title` text DEFAULT '' NOT NULL,
	`default_mockup_theme` text DEFAULT '' NOT NULL,
	`pricing_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_product_recipes_user` ON `product_recipes` (`user_id`,`updated_at`);