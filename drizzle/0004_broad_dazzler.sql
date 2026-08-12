CREATE TABLE `printify_batch_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`shop_id` integer NOT NULL,
	`product_id` text NOT NULL,
	`template_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_printify_batch_sessions_user_expiry` ON `printify_batch_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `printify_draft_results` (
	`request_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`client_id` text NOT NULL,
	`status` text NOT NULL,
	`response_json` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_printify_draft_results_user_batch` ON `printify_draft_results` (`user_id`,`batch_id`);