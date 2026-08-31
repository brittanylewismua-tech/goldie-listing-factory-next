-- D835 · One Etsy connection per seller was the shape that kept breaking.
--
-- etsy_connections had user_id as its primary key, so a seller could hold
-- exactly one Etsy shop while their product bank held Printify products from
-- any store. Half the bank answered 409 at all times, and which half depended
-- on which shop was connected last. Measured on Brittany's account: connecting
-- She's A Wolf Clothing did not fix the mismatch, it inverted it - Gildan Tee
-- went 409 -> 200 and three GODISAGIRLAPPAREL products went 200 -> 409.
--
-- Every connection is kept now, one is active, and the bank is scoped to the
-- active one. The allowance is counted per user and is untouched by this, so
-- it keeps pooling across shops.
CREATE TABLE `etsy_connections_multi` (
  `user_id` text NOT NULL,
  `shop_id` integer NOT NULL,
  `encrypted_access_token` text NOT NULL,
  `encrypted_refresh_token` text NOT NULL,
  `expires_at` integer NOT NULL,
  `etsy_user_id` integer NOT NULL,
  `shop_name` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `shop_id`)
);
--> statement-breakpoint
-- The connection that exists today becomes that seller's active shop. Without
-- this every signed-in seller is silently disconnected on deploy.
INSERT INTO `etsy_connections_multi`
  (`user_id`,`shop_id`,`encrypted_access_token`,`encrypted_refresh_token`,`expires_at`,`etsy_user_id`,`shop_name`,`is_active`,`updated_at`)
SELECT `user_id`,`shop_id`,`encrypted_access_token`,`encrypted_refresh_token`,`expires_at`,`etsy_user_id`,`shop_name`,1,`updated_at`
FROM `etsy_connections`;
--> statement-breakpoint
DROP TABLE `etsy_connections`;
--> statement-breakpoint
ALTER TABLE `etsy_connections_multi` RENAME TO `etsy_connections`;
--> statement-breakpoint
CREATE INDEX `idx_etsy_connections_active` ON `etsy_connections` (`user_id`,`is_active`);
