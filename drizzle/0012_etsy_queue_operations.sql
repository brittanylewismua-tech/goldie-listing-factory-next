CREATE TABLE `etsy_queue_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused_until` integer DEFAULT 0 NOT NULL,
	`manually_paused` integer DEFAULT 0 NOT NULL,
	`last_worker_at` text,
	`last_worker_status` text,
	`last_worker_processed` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `etsy_queue_state` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TABLE `etsy_worker_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_etsy_worker_runs_started` ON `etsy_worker_runs` (`started_at`);
