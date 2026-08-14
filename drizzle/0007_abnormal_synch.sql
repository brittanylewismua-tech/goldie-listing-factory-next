CREATE TABLE `seller_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pricing_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
