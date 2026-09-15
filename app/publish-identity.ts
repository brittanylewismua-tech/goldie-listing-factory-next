import { env } from "cloudflare:workers";
import { MAPPING_VERSION } from "@/app/blueprint-registry";

/**
 * THE PUBLISH AUDIT TRAIL RECORDS WHAT WAS ACTUALLY USED.
 *
 * The historical scan recovered nothing because none of this was ever
 * stored: no blueprint id, no taxonomy node, no property payload. The answer
 * to "what category did we choose for this blank, and on what evidence" was
 * simply absent for every listing ever published.
 *
 * It is written when the product is selected and carried to the completed
 * publish record. AWAITED, not fire-and-forget: it is part of the listing's
 * audit trail, and a listing whose provenance was dropped because a write
 * was still in flight is a listing nobody can explain later.
 *
 * NOTHING IS EVER BACKFILLED BY INFERENCE. A blueprint id recovered from a
 * similar title is the title-matching this work replaced.
 */
export type PublishIdentity = {
  printifyBlueprintId: number | null;
  printifyBlueprintTitleSnapshot: string;
  printifyProductId: string;
  productFamily: string;
  taxonomyMappingVersion: number;
  etsyTaxonomyNodeId: number | null;
  requiredPropertyPayload: Record<string, string>;
  designIntelligenceVersion: string;
  familyCopyVersion: string;
  unresolvedReason: string;
};

export async function ensurePublishIdentityTable() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS publish_identity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    batch_id TEXT NOT NULL DEFAULT '',
    etsy_listing_id TEXT NOT NULL DEFAULT '',
    printify_blueprint_id INTEGER,
    printify_blueprint_title_snapshot TEXT NOT NULL DEFAULT '',
    printify_product_id TEXT NOT NULL DEFAULT '',
    product_family TEXT NOT NULL DEFAULT '',
    taxonomy_mapping_version INTEGER,
    etsy_taxonomy_node_id INTEGER,
    required_property_payload TEXT NOT NULL DEFAULT '{}',
    design_intelligence_version TEXT NOT NULL DEFAULT '',
    family_copy_version TEXT NOT NULL DEFAULT '',
    unresolved_reason TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'selected',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS publish_identity_member
       ON publish_identity (user_id, created_at)`).run();
}

/** Written at product selection, before anything is generated or published. */
export async function recordSelection(
  { id, userId, batchId, identity }:
  { id: string; userId: string; batchId: string; identity: Partial<PublishIdentity> },
) {
  await ensurePublishIdentityTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `INSERT INTO publish_identity
       (id, user_id, batch_id, printify_blueprint_id, printify_blueprint_title_snapshot,
        printify_product_id, product_family, taxonomy_mapping_version, etsy_taxonomy_node_id,
        required_property_payload, design_intelligence_version, family_copy_version,
        unresolved_reason, stage)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'selected')
     ON CONFLICT(id) DO UPDATE SET
       printify_blueprint_id = excluded.printify_blueprint_id,
       printify_blueprint_title_snapshot = excluded.printify_blueprint_title_snapshot,
       product_family = excluded.product_family,
       updated_at = CURRENT_TIMESTAMP`)
    .bind(id, userId, batchId,
      identity.printifyBlueprintId ?? null,
      identity.printifyBlueprintTitleSnapshot ?? "",
      identity.printifyProductId ?? "",
      identity.productFamily ?? "",
      identity.taxonomyMappingVersion ?? MAPPING_VERSION,
      identity.etsyTaxonomyNodeId ?? null,
      JSON.stringify(identity.requiredPropertyPayload ?? {}),
      identity.designIntelligenceVersion ?? "",
      identity.familyCopyVersion ?? "",
      /* Null with a stated reason beats a plausible number. */
      identity.unresolvedReason ?? (identity.printifyBlueprintId ? "" : "blueprint id not supplied at selection"))
    .run();
}

/** Completed publish. Carries the identity forward with the listing id. */
export async function recordPublished(
  { id, etsyListingId, requiredPropertyPayload, etsyTaxonomyNodeId }:
  { id: string; etsyListingId: string; requiredPropertyPayload: Record<string, string>;
    etsyTaxonomyNodeId: number | null },
) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(
    `UPDATE publish_identity
        SET etsy_listing_id = ?, required_property_payload = ?, etsy_taxonomy_node_id = ?,
            stage = 'published', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`)
    .bind(etsyListingId, JSON.stringify(requiredPropertyPayload), etsyTaxonomyNodeId, id)
    .run();
}

/**
 * Blueprints nobody has mapped yet.
 *
 * IDENTITY AND COUNTS ONLY. No member, no shop, no listing, no design. The
 * queue answers "which blanks need a mapping and how urgently", and that
 * question needs nothing about who was using them.
 */
export async function queueUnknownBlueprint(blueprintId: number, blueprintTitle: string) {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS blueprint_mapping_queue (
    blueprint_id INTEGER PRIMARY KEY,
    blueprint_title_snapshot TEXT NOT NULL DEFAULT '',
    occurrences INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(
    `INSERT INTO blueprint_mapping_queue (blueprint_id, blueprint_title_snapshot, occurrences)
     VALUES (?,?,1)
     ON CONFLICT(blueprint_id) DO UPDATE SET
       occurrences = blueprint_mapping_queue.occurrences + 1,
       last_seen = CURRENT_TIMESTAMP`)
    .bind(blueprintId, blueprintTitle).run();
}
