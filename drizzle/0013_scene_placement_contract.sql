ALTER TABLE `mockup_templates` ADD `print_side` text DEFAULT 'front' NOT NULL;--> statement-breakpoint
ALTER TABLE `mockup_templates` ADD `quad_means` text DEFAULT 'garment' NOT NULL;--> statement-breakpoint
ALTER TABLE `mockup_templates` ADD `occlusion_key` text;--> statement-breakpoint
ALTER TABLE `mockup_templates` ADD `occlusion_confirmed` integer DEFAULT 0 NOT NULL;
