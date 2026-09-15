import { env } from "cloudflare:workers";

/**
 * THE DESIGN IS UNDERSTOOD ONCE.
 *
 * Twenty products carrying the same artwork asked the model about that
 * artwork twenty times, because the cache key included the product. The
 * design bytes are identical in all twenty, so the answer is too.
 *
 * Identity here is the artwork itself and the terms of the question:
 *
 *     user_id + artwork_hash + schema version + model version + prompt version
 *
 * NO TTL. A twenty-four hour expiry made sense for a cache keyed on a whole
 * request; it makes none for a fact about bytes that cannot change. Expiring
 * it only means paying to learn the same thing again tomorrow.
 *
 * A version change writes a NEW ROW rather than overwriting the old one, so
 * a listing published last month can still be explained by the extraction it
 * was actually built from.
 *
 * NEVER SHARED ACROSS MEMBERS. Two members can hold byte-identical artwork —
 * a common template, the same stock graphic — and reusing one member's
 * extraction for the other would leak the fact that someone else holds that
 * design. The member id stays in the key even though it costs a second call.
 */
export const EXTRACTION_SCHEMA_VERSION = 1;
export const DESIGN_PROMPT_VERSION = 1;
export const DESIGN_MODEL_VERSION = "google/gemini-2.5-flash";

/*
  Everything downstream needs from the artwork, gathered in one pass. If a
  field is missing here, some later step will reach for the image again and
  the saving is lost — so the list is deliberately generous.
*/
export type DesignIntelligence = {
  wording: string[];
  typography: string[];
  illustrationCategory: string;
  audienceCues: string[];
  recipientCues: string[];
  occasionCues: string[];
  tone: string;
  personalizationStructure: string;
  textToArtRatio: number;
  composition: string;
  dominantColors: string[];
  optionalFieldEvidence: Record<string, string>;
};

export async function ensureDesignIntelligenceTable() {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS design_intelligence (
    user_id TEXT NOT NULL,
    artwork_hash TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    provider_cost REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, artwork_hash, schema_version, model_version, prompt_version))`).run();
}

export type Stored = { design: DesignIntelligence; createdAt: string; fresh: boolean };

/** The current version's extraction for this member's artwork, if it exists. */
export async function readDesignIntelligence(
  userId: string, artworkHash: string,
): Promise<Stored | null> {
  await ensureDesignIntelligenceTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  const row = await db.prepare(
    `SELECT payload_json, created_at FROM design_intelligence
      WHERE user_id = ? AND artwork_hash = ? AND schema_version = ?
        AND model_version = ? AND prompt_version = ?`)
    .bind(userId, artworkHash, EXTRACTION_SCHEMA_VERSION, DESIGN_MODEL_VERSION, DESIGN_PROMPT_VERSION)
    .first<{ payload_json: string; created_at: string }>();
  if (!row) return null;
  try {
    return { design: JSON.parse(row.payload_json) as DesignIntelligence,
      createdAt: row.created_at, fresh: false };
  } catch { return null; }
}

export async function writeDesignIntelligence(
  userId: string, artworkHash: string, design: DesignIntelligence, providerCost = 0,
) {
  await ensureDesignIntelligenceTable();
  const db = (env as unknown as { DB: D1Database }).DB;
  /* A version bump writes a new row; the old one is kept for auditability. */
  await db.prepare(
    `INSERT INTO design_intelligence
       (user_id, artwork_hash, schema_version, model_version, prompt_version,
        payload_json, provider_cost)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(user_id, artwork_hash, schema_version, model_version, prompt_version)
       DO UPDATE SET payload_json = excluded.payload_json`)
    .bind(userId, artworkHash, EXTRACTION_SCHEMA_VERSION, DESIGN_MODEL_VERSION,
      DESIGN_PROMPT_VERSION, JSON.stringify(design), providerCost)
    .run();
}
