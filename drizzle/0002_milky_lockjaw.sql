CREATE TABLE `printify_diagnostic_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`stage` text NOT NULL,
	`event` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`http_status` integer,
	`error_code` text,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `printify_diagnostics` (
	`reference` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`file_name` text NOT NULL,
	`template_product_id` text,
	`shop_id` integer,
	`stage` text NOT NULL,
	`outcome` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`http_status` integer,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
