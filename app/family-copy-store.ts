import { env } from "cloudflare:workers";
import { COPY_PROMPT_VERSION, COPY_MODEL_VERSION, type FamilyCopy } from "./family-copy.ts";

/**
 * WHERE FAMILY COPY IS KEPT, WHICH UNTIL NOW WAS NOWHERE.
 *
 * The call plan has costed family copy since it was written and the dry run
 * reported `familyCopyCacheTablePresent: false` — there was no table, so
 * every batch was a cold batch by construction and the reuse the architecture
 * is built around could not happen even in principle.
 *
 * ONE ROW PER FAMILY, NOT ONE PER CALL. A call covers several families at
 * once because that is cheaper than one call each, but storing the response
 * whole would mean a later batch needing {tee, tote} could not reuse the tee
 * copy it already paid for. Each family is written separately, so a new
 * family costs a call for that family alone.
 *
 * The identity carries the design-intelligence version: re-extracting a
 * design invalidates its copy rather than leaving new facts described in old
 * wording.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureFamilyCopyTable() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS listing_family_copy (
    user_id TEXT NOT NULL,
    artwork_hash TEXT NOT NULL,
    design_version TEXT NOT NULL,
    family TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    blurb TEXT NOT NULL,
    optional_json TEXT NOT NULL DEFAULT '{}',
    provider_cost REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, artwork_hash, design_version, family,
                 prompt_version, model_version))`).run();
}

export type StoredCopy = { family: string; copy: FamilyCopy };

/** Every family already described for this design at the current versions. */
export async function readFamilyCopy(
  userId: string, artworkHash: string, designVersion: string,
): Promise<StoredCopy[]> {
  await ensureFamilyCopyTable();
  const rows = await db().prepare(
    `SELECT family, blurb, optional_json FROM listing_family_copy
      WHERE user_id = ? AND artwork_hash = ? AND design_version = ?
        AND prompt_version = ? AND model_version = ?`)
    .bind(userId, artworkHash, designVersion, COPY_PROMPT_VERSION, COPY_MODEL_VERSION)
    .all<{ family: string; blurb: string; optional_json: string }>();
  return (rows.results ?? []).map(row => {
    let optionalFields: Record<string, string> = {};
    try { optionalFields = JSON.parse(row.optional_json) as Record<string, string>; }
    catch { optionalFields = {}; }
    return { family: row.family, copy: { blurb: row.blurb, optionalFields } };
  });
}

/**
 * Store one call's families, each on its own row.
 *
 * The cost of the call is recorded against the FIRST family written and zero
 * for the rest, so summing the column gives what the design actually cost
 * rather than the call's price multiplied by how many families it covered.
 */
export async function writeFamilyCopy(
  userId: string, artworkHash: string, designVersion: string,
  entries: StoredCopy[], providerCost = 0,
) {
  if (!entries.length) return;
  await ensureFamilyCopyTable();
  const statements = entries.map((entry, index) => db().prepare(
    `INSERT INTO listing_family_copy
       (user_id, artwork_hash, design_version, family, prompt_version,
        model_version, blurb, optional_json, provider_cost)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, artwork_hash, design_version, family, prompt_version, model_version)
       DO UPDATE SET blurb = excluded.blurb, optional_json = excluded.optional_json,
         /* A duplicate charge is added, never replaced: money that was spent
            twice has to be visible as twice. */
         provider_cost = listing_family_copy.provider_cost + excluded.provider_cost`)
    .bind(userId, artworkHash, designVersion, entry.family, COPY_PROMPT_VERSION,
      COPY_MODEL_VERSION, entry.copy.blurb,
      JSON.stringify(entry.copy.optionalFields ?? {}),
      index === 0 ? providerCost : 0));
  await db().batch(statements);
}
