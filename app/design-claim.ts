import { env } from "cloudflare:workers";
import { EXTRACTION_SCHEMA_VERSION, DESIGN_MODEL_VERSION, DESIGN_PROMPT_VERSION }
  from "./design-intelligence.ts";

/**
 * TWO REQUESTS FOR THE SAME ARTWORK PAID TWICE.
 *
 * `readDesignIntelligence` → paid extraction → `writeDesignIntelligence` has
 * no claim anywhere in it. Two requests arriving for one artwork before
 * either finishes both read an empty cache, both call the provider, and both
 * write. The upsert makes the DATA safe — the second write simply replaces
 * the first with an equivalent payload — which is exactly why this was
 * invisible: nothing looked wrong afterwards.
 *
 * The spend is not safe. Two vision calls would be billed for one design, and
 * the upsert's `DO UPDATE` clause never touched `provider_cost`, so the second
 * charge would be dropped from the record as it landed — the bill doubling and
 * the ledger staying quiet about it.
 *
 * NOTHING IS LOSING MONEY TODAY, and this is not a repair of a live leak.
 * No caller performs the extraction yet: the layered flow is planned, costed
 * and dry-run, but `writeDesignIntelligence` has no callers at all. The race
 * is in the shape of the path as written, and it bills twice on the first day
 * the extraction is connected. It is closed here, before that day, rather
 * than after an invoice explains it.
 *
 * A claim row decides who pays. The winner extracts; the loser waits for the
 * real row rather than calling the provider. A claim is not a promise — a
 * winner can crash — so claims expire, and a loser that waits out the window
 * proceeds itself rather than failing. The cost of a stale claim is one
 * duplicate call in a rare case; the cost of a permanent claim is an artwork
 * that can never be analyzed again.
 */
export { CLAIM_TTL_SECONDS, CLAIM_WAIT_MS, CLAIM_POLL_MS, claimHolds }
  from "./design-claim-rules.ts";
import { CLAIM_TTL_SECONDS } from "./design-claim-rules.ts";

export type ClaimOutcome =
  | { role: "winner"; because: string }
  | { role: "waiter"; because: string }
  | { role: "took-over"; because: string };

const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureDesignClaimTable() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS design_intelligence_claims (
    user_id TEXT NOT NULL,
    artwork_hash TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, artwork_hash, schema_version, model_version, prompt_version))`).run();
}

const key = (userId: string, artworkHash: string) =>
  [userId, artworkHash, EXTRACTION_SCHEMA_VERSION, DESIGN_MODEL_VERSION, DESIGN_PROMPT_VERSION] as const;

/**
 * Claim the right to perform the paid extraction for this artwork.
 *
 * One statement decides it: the insert either creates the row or replaces an
 * expired one, and `meta.changes` says which caller won. There is no
 * read-then-write gap for a second request to arrive in.
 */
export async function claimDesignExtraction(
  userId: string, artworkHash: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ClaimOutcome> {
  await ensureDesignClaimTable();
  const cutoff = nowSeconds - CLAIM_TTL_SECONDS;
  const claimed = await db().prepare(
    `INSERT INTO design_intelligence_claims
       (user_id, artwork_hash, schema_version, model_version, prompt_version, claimed_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, artwork_hash, schema_version, model_version, prompt_version)
       DO UPDATE SET claimed_at = excluded.claimed_at
       WHERE design_intelligence_claims.claimed_at <= ?`)
    .bind(...key(userId, artworkHash), nowSeconds, cutoff)
    .run();

  if (claimed.meta.changes)
    return { role: "winner", because: "no live claim existed for this artwork" };
  return { role: "waiter",
    because: "another request is already paying for this artwork's analysis" };
}

/** Release a claim once the extraction has been stored, or has failed. */
export async function releaseDesignExtraction(userId: string, artworkHash: string) {
  await db().prepare(
    `DELETE FROM design_intelligence_claims
      WHERE user_id = ? AND artwork_hash = ? AND schema_version = ?
        AND model_version = ? AND prompt_version = ?`)
    .bind(...key(userId, artworkHash)).run();
}
