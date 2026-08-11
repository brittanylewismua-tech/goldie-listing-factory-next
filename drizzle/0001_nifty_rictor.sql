CREATE TABLE `mastermind_access` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mastermind_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `mastermind_settings` (`id`, `active`) VALUES (1, 1);
