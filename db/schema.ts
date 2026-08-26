import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const mockupTemplates = sqliteTable("mockup_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  theme: text("theme").notNull(),
  name: text("name").notNull(),
  surfaceKind: text("surface_kind").notNull(),
  cornersJson: text("corners_json").notNull(),
  /* D573 - which print side this photograph shows. A back-print draft must not
     be rendered onto a front-facing scene, and Goldie cannot infer the side of a
     photograph at generation time, so the scene carries it. */
  printSide: text("print_side").notNull().default("front"),
  /* D573 - what cornersJson means. "garment" is a region of the garment that is
     larger than the Printify print area by an unknown ratio, which is why those
     scenes still need an empirical scale constant. "print-area" is a confirmed
     Printify print area, and Printify's own scale and x/y map straight into it.
     Everything already in the library predates the distinction and is "garment",
     so existing sets keep rendering exactly as they do today. */
  quadMeans: text("quad_means").notNull().default("garment"),
  /* D573 - the confirmed foreground that must stay in front of the artwork: a
     hood, hair, straps, arms. Stored once, not re-segmented per render. */
  occlusionKey: text("occlusion_key"),
  occlusionConfirmed: integer("occlusion_confirmed").notNull().default(0),
  /* D576 - JPG/PNG scenes are compiled once into a reusable rendering profile.
     The original photograph remains the source; these fields only describe its
     printable surface, depth and foreground layers. */
  preparationStatus: text("preparation_status").notNull().default("queued"),
  preparationJson: text("preparation_json"),
  preparationError: text("preparation_error").notNull().default(""),
  preparationAttempts: integer("preparation_attempts").notNull().default(0),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_mockup_templates_user_theme").on(table.userId, table.theme)]);

export const mockupRenderUsage = sqliteTable("mockup_render_usage", {
  userDay: text("user_day").primaryKey(),
  userId: text("user_id").notNull(),
  day: text("day").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const productRecipes = sqliteTable("product_recipes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  templateUrl: text("template_url").notNull(),
  description: text("description").notNull().default(""),
  defaultTitle: text("default_title").notNull().default(""),
  defaultMockupTheme: text("default_mockup_theme").notNull().default(""),
  pricingJson: text("pricing_json").notNull().default("{}"),
  keywordListId: text("keyword_list_id").notNull().default(""),
  printifyImageIndicesJson: text("printify_image_indices_json").notNull().default("[]"),
  normalizePadding: integer("normalize_padding", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_product_recipes_user").on(table.userId, table.updatedAt)]);

export const productBundles = sqliteTable("product_bundles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  recipeIdsJson: text("recipe_ids_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_product_bundles_user").on(table.userId, table.updatedAt)]);

export const keywordLists = sqliteTable("keyword_lists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  keywordsJson: text("keywords_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_keyword_lists_user").on(table.userId, table.updatedAt)]);

export const sellerPreferences = sqliteTable("seller_preferences", {
  userId: text("user_id").primaryKey(),
  pricingJson: text("pricing_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountPlans = sqliteTable("account_plans", {
  userId: text("user_id").primaryKey(),
  planKey: text("plan_key").notNull().default("goldie"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const etsyConnections = sqliteTable("etsy_connections", {
  userId: text("user_id").primaryKey(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
  etsyUserId: integer("etsy_user_id").notNull(),
  shopId: integer("shop_id").notNull(),
  shopName: text("shop_name").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const etsyOauthStates = sqliteTable("etsy_oauth_states", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_etsy_oauth_states_user_expiry").on(table.userId, table.expiresAt)]);

export const etsyListingLinks = sqliteTable("etsy_listing_links", {
  printifyProductId: text("printify_product_id").primaryKey(),
  userId: text("user_id").notNull(),
  batchId: text("batch_id").notNull(),
  etsyListingId: integer("etsy_listing_id").notNull(),
  status: text("status").notNull(),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_etsy_listing_links_user_batch").on(table.userId, table.batchId)]);

export const etsyPublishJobs = sqliteTable("etsy_publish_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  batchId: text("batch_id").notNull(),
  status: text("status").notNull().default("queued"),
  total: integer("total").notNull(),
  completed: integer("completed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  settingsJson: text("settings_json").notNull().default("{}"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_etsy_publish_jobs_user_updated").on(table.userId, table.updatedAt), uniqueIndex("idx_etsy_publish_jobs_user_batch").on(table.userId, table.batchId)]);

export const etsyPublishItems = sqliteTable("etsy_publish_items", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: integer("available_at").notNull().default(0),
  lockedAt: integer("locked_at"),
  resultJson: text("result_json"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_etsy_publish_items_job_status").on(table.jobId, table.status), index("idx_etsy_publish_items_status_available").on(table.status, table.availableAt, table.createdAt), index("idx_etsy_publish_items_status_locked").on(table.status, table.lockedAt), uniqueIndex("idx_etsy_publish_items_user_product").on(table.userId, table.productId)]);

export const etsyApiUsageBuckets = sqliteTable("etsy_api_usage_buckets", {
  bucket: text("bucket").primaryKey(),
  calls: integer("calls").notNull().default(0),
  rateLimited: integer("rate_limited").notNull().default(0),
  qpdLimit: integer("qpd_limit").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const etsyListingUsage = sqliteTable("etsy_listing_usage", {
  userProduct: text("user_product").primaryKey(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(),
  jobId: text("job_id").notNull(),
  etsyListingId: integer("etsy_listing_id").notNull(),
  apiCalls: integer("api_calls").notNull().default(0),
  publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_etsy_listing_usage_user_published").on(table.userId, table.publishedAt)]);

export const etsyQueueState = sqliteTable("etsy_queue_state", {
  id: integer("id").primaryKey(),
  pausedUntil: integer("paused_until").notNull().default(0),
  manuallyPaused: integer("manually_paused").notNull().default(0),
  lastWorkerAt: text("last_worker_at"),
  lastWorkerStatus: text("last_worker_status"),
  lastWorkerProcessed: integer("last_worker_processed").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const etsyWorkerRuns = sqliteTable("etsy_worker_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  processed: integer("processed").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
}, (table) => [index("idx_etsy_worker_runs_started").on(table.startedAt)]);

/* Stage 1 of the editor: the two records, kept apart on purpose.

   Scene geometry is a fact about the PHOTOGRAPH - where the printable surface
   is, how it curves, what material it is. It is keyed by the surface it was
   measured for, so a mug's geometry can never be served to a hoodie and a front
   geometry can never be served to a back print. It improves future designs. */
export const mockupSceneGeometry = sqliteTable("mockup_scene_geometry", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sceneId: text("scene_id").notNull(),
  productFamily: text("product_family").notNull(),
  printSide: text("print_side").notNull(),
  blueprintId: integer("blueprint_id"),
  printProviderId: integer("print_provider_id"),
  renderingMode: text("rendering_mode").notNull(),
  surfaceJson: text("surface_json").notNull(),
  curvature: text("curvature").notNull().default("0"),
  fabricStrength: text("fabric_strength").notNull().default("0"),
  blendMode: text("blend_mode").notNull().default("normal"),
  foregroundKey: text("foreground_key"),
  preparationVersion: integer("preparation_version"),
  sourceWidth: integer("source_width").notNull().default(0),
  sourceHeight: integer("source_height").notNull().default(0),
  /* "seller-adjusted" outranks "automatic" and background preparation must
     never overwrite it. */
  origin: text("origin").notNull().default("automatic"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_scene_geometry_user_scene").on(table.userId, table.sceneId)]);

/* An artwork override is a fact about ONE DESIGN on one listing. It is stored
   RELATIVE to where Printify put that design - offsets and a multiplier, never
   absolute coordinates - so it cannot be meaningfully applied to a different
   design even by accident. It is deliberately keyed by listing AND design. */
export const mockupArtworkOverrides = sqliteTable("mockup_artwork_overrides", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  /* D596 - the batch this listing belongs to, so an override can be scoped and
     cleaned up with its batch. */
  batchId: text("batch_id").notNull().default(""),
  listingId: text("listing_id").notNull(),
  designKey: text("design_key").notNull(),
  sceneId: text("scene_id").notNull(),
  offsetU: text("offset_u").notNull().default("0"),
  offsetV: text("offset_v").notNull().default("0"),
  scaleMultiplier: text("scale_multiplier").notNull().default("1"),
  rotation: text("rotation").notNull().default("0"),
  skewX: text("skew_x").notNull().default("0"),
  skewY: text("skew_y").notNull().default("0"),
  flipX: integer("flip_x").notNull().default(0),
  flipY: integer("flip_y").notNull().default(0),
  opacity: text("opacity").notNull().default("1"),
  /* D596 - a seller's perspective correction for THIS design, stored as deltas
     from where Printify's placement put the artwork, never as absolute corners. */
  cornerAdjustJson: text("corner_adjust_json"),
  /* Rendering settings a seller changed for this listing only. Null means "use
     the scene's own setting", which is what makes these listing-specific rather
     than quietly becoming scene facts. */
  blendMode: text("blend_mode"),
  fabricStrength: text("fabric_strength"),
  curvature: text("curvature"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_artwork_override_listing").on(table.userId, table.listingId, table.designKey)]);
