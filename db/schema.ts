import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const printifyConnections = sqliteTable("printify_connections", {
  userId: text("user_id").primaryKey(),
  encryptedToken: text("encrypted_token").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
