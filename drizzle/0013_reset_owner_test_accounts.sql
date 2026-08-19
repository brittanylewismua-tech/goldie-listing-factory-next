CREATE TABLE `_account_reset_20260819_account_plans` AS SELECT * FROM `account_plans`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_billing_customers` AS SELECT * FROM `billing_customers`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_billing_subscriptions` AS SELECT * FROM `billing_subscriptions`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_billing_trials` AS SELECT * FROM `billing_trials`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_connections` AS SELECT * FROM `etsy_connections`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_listing_links` AS SELECT * FROM `etsy_listing_links`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_listing_usage` AS SELECT * FROM `etsy_listing_usage`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_oauth_states` AS SELECT * FROM `etsy_oauth_states`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_publish_items` AS SELECT * FROM `etsy_publish_items`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_etsy_publish_jobs` AS SELECT * FROM `etsy_publish_jobs`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_keyword_lists` AS SELECT * FROM `keyword_lists`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_listing_batches` AS SELECT * FROM `listing_batches`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_mastermind_access` AS SELECT * FROM `mastermind_access`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_mockup_render_usage` AS SELECT * FROM `mockup_render_usage`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_mockup_set_preferences` AS SELECT * FROM `mockup_set_preferences`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_mockup_templates` AS SELECT * FROM `mockup_templates`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_printify_batch_sessions` AS SELECT * FROM `printify_batch_sessions`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_printify_connections` AS SELECT * FROM `printify_connections`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_printify_diagnostic_events` AS SELECT * FROM `printify_diagnostic_events`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_printify_diagnostics` AS SELECT * FROM `printify_diagnostics`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_printify_draft_results` AS SELECT * FROM `printify_draft_results`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_product_bundles` AS SELECT * FROM `product_bundles`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_product_recipes` AS SELECT * FROM `product_recipes`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_seller_preferences` AS SELECT * FROM `seller_preferences`;
--> statement-breakpoint
CREATE TABLE `_account_reset_20260819_trial_reminder_emails` AS SELECT * FROM `trial_reminder_emails`;
--> statement-breakpoint
DELETE FROM `etsy_publish_items`;
--> statement-breakpoint
DELETE FROM `etsy_publish_jobs`;
--> statement-breakpoint
DELETE FROM `etsy_listing_links`;
--> statement-breakpoint
DELETE FROM `etsy_listing_usage`;
--> statement-breakpoint
DELETE FROM `etsy_oauth_states`;
--> statement-breakpoint
DELETE FROM `etsy_connections`;
--> statement-breakpoint
DELETE FROM `printify_diagnostic_events`;
--> statement-breakpoint
DELETE FROM `printify_diagnostics`;
--> statement-breakpoint
DELETE FROM `printify_draft_results`;
--> statement-breakpoint
DELETE FROM `printify_batch_sessions`;
--> statement-breakpoint
DELETE FROM `printify_connections`;
--> statement-breakpoint
DELETE FROM `listing_batches`;
--> statement-breakpoint
DELETE FROM `product_bundles`;
--> statement-breakpoint
DELETE FROM `product_recipes`;
--> statement-breakpoint
DELETE FROM `keyword_lists`;
--> statement-breakpoint
DELETE FROM `seller_preferences`;
--> statement-breakpoint
DELETE FROM `mockup_set_preferences`;
--> statement-breakpoint
DELETE FROM `mockup_templates`;
--> statement-breakpoint
DELETE FROM `mockup_render_usage`;
--> statement-breakpoint
DELETE FROM `trial_reminder_emails`;
--> statement-breakpoint
DELETE FROM `billing_trials`;
--> statement-breakpoint
DELETE FROM `billing_subscriptions`;
--> statement-breakpoint
DELETE FROM `billing_customers`;
--> statement-breakpoint
DELETE FROM `account_plans`;
--> statement-breakpoint
DELETE FROM `mastermind_access`;
