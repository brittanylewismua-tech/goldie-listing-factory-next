import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const printifyConnections = sqliteTable("printify_connections", {
  userId: text("user_id").primaryKey(),
  encryptedToken: text("encrypted_token").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mastermindAccess = sqliteTable("mastermind_access", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  redeemedAt: text("redeemed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mastermindSettings = sqliteTable("mastermind_settings", {
  id: integer("id").primaryKey(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const printifyDiagnostics = sqliteTable("printify_diagnostics", {
  reference: text("reference").primaryKey(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  fileName: text("file_name").notNull(),
  templateProductId: text("template_product_id"),
  shopId: integer("shop_id"),
  stage: text("stage").notNull(),
  outcome: text("outcome").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  errorCode: text("error_code"),
  httpStatus: integer("http_status"),
  message: text("message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_printify_diagnostics_outcome_updated").on(table.outcome, table.updatedAt)]);

export const printifyDiagnosticEvents = sqliteTable("printify_diagnostic_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull(),
  stage: text("stage").notNull(),
  event: text("event").notNull(),
  attempt: integer("attempt").notNull().default(0),
  httpStatus: integer("http_status"),
  errorCode: text("error_code"),
  message: text("message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_printify_diagnostic_events_reference").on(table.reference)]);

export const printifyBatchSessions = sqliteTable("printify_batch_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  shopId: integer("shop_id").notNull(),
  productId: text("product_id").notNull(),
  templateJson: text("template_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_printify_batch_sessions_user_expiry").on(table.userId, table.expiresAt)]);

export const printifyDraftResults = sqliteTable("printify_draft_results", {
  requestKey: text("request_key").primaryKey(),
  userId: text("user_id").notNull(),
  batchId: text("batch_id").notNull(),
  clientId: text("client_id").notNull(),
  status: text("status").notNull(),
  responseJson: text("response_json"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_printify_draft_results_user_batch").on(table.userId, table.batchId)]);
