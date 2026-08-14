CREATE TABLE `account_plans` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan_key` text DEFAULT 'goldie' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `product_recipes` ADD `keyword_list_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_recipes` ADD `printify_image_indices_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_recipes` ADD `normalize_padding` integer DEFAULT true NOT NULL;