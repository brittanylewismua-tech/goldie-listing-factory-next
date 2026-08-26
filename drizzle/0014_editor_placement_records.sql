CREATE TABLE `mockup_scene_geometry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`product_family` text NOT NULL,
	`print_side` text NOT NULL,
	`blueprint_id` integer,
	`print_provider_id` integer,
	`rendering_mode` text NOT NULL,
	`surface_json` text NOT NULL,
	`curvature` text DEFAULT '0' NOT NULL,
	`fabric_strength` text DEFAULT '0' NOT NULL,
	`blend_mode` text DEFAULT 'normal' NOT NULL,
	`foreground_key` text,
	`preparation_version` integer,
	`source_width` integer DEFAULT 0 NOT NULL,
	`source_height` integer DEFAULT 0 NOT NULL,
	`origin` text DEFAULT 'automatic' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scene_geometry_user_scene` ON `mockup_scene_geometry` (`user_id`,`scene_id`);--> statement-breakpoint
CREATE TABLE `mockup_artwork_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`design_key` text NOT NULL,
	`scene_id` text NOT NULL,
	`offset_u` text DEFAULT '0' NOT NULL,
	`offset_v` text DEFAULT '0' NOT NULL,
	`scale_multiplier` text DEFAULT '1' NOT NULL,
	`rotation` text DEFAULT '0' NOT NULL,
	`skew_x` text DEFAULT '0' NOT NULL,
	`skew_y` text DEFAULT '0' NOT NULL,
	`flip_x` integer DEFAULT 0 NOT NULL,
	`flip_y` integer DEFAULT 0 NOT NULL,
	`opacity` text DEFAULT '1' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_artwork_override_listing` ON `mockup_artwork_overrides` (`user_id`,`listing_id`,`design_key`);
