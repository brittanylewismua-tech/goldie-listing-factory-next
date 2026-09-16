import { env } from "cloudflare:workers";
import { LEASE_TTL_SECONDS } from "./work-lease-rules.ts";

/**
 * ONE PAID CALL PER THING, EVEN WHEN TWO REQUESTS ASK AT ONCE.
 *
 * Every layer of the Listing Factory flow has the same shape: look in a
 * cache, and if it is empty, pay a provider and write the result. Between the
 * look and the write there is a gap, and two requests that arrive inside it
 * both find an empty cache and both pay. The write is harmless — the second
 * result replaces an equivalent first — which is exactly why it is invisible:
 * nothing looks wrong afterwards except the bill.
 *
 * A lease closes the gap. One request wins, does the work and writes; the
 * others wait for the winner's row instead of paying for their own.
 *
 * THREE THINGS THIS HAS TO GET RIGHT, AND THEY PULL AGAINST EACH OTHER:
 *
 *   A winner can crash. So leases expire, and a waiter that outlasts the
 *   window takes over rather than failing. The cost of a stale lease is one
 *   duplicate call; the cost of a permanent one is an artwork that can never
 *   be analyzed again.
 *
 *   A slow winner can come back from the dead. Once its lease has expired and
 *   been taken over, its result is older than the one now being produced, and
 *   writing it would silently undo the newer work. So every lease carries a
 *   token, and a write is accepted only while the writer still holds the
 *   lease. A stale worker's result is discarded, not merged.
 *
 *   Nothing may block forever. Waiting is bounded; a waiter that times out
 *   proceeds on its own.
 */
export { LEASE_TTL_SECONDS, LEASE_WAIT_MS, LEASE_POLL_MS, leaseHolds }
  from "./work-lease-rules.ts";

export type LeaseKind = "design-intelligence" | "family-copy";

export type Lease =
  | { held: true; kind: LeaseKind; key: string; token: string; because: string }
  | { held: false; because: string };

const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureWorkLeaseTable() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS work_leases (
    kind TEXT NOT NULL,
    lease_key TEXT NOT NULL,
    token TEXT NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (kind, lease_key))`).run();
}

/**
 * Take the lease, or report that somebody else holds a live one.
 *
 * ONE STATEMENT DECIDES IT. The insert either creates the row or replaces an
 * expired one, and `meta.changes` says which caller won — there is no
 * read-then-write gap for a third request to arrive in.
 */
export async function acquireLease(
  kind: LeaseKind, key: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Lease> {
  await ensureWorkLeaseTable();
  const token = crypto.randomUUID();
  const cutoff = nowSeconds - LEASE_TTL_SECONDS;
  const won = await db().prepare(
    `INSERT INTO work_leases (kind, lease_key, token, claimed_at)
     VALUES (?,?,?,?)
     ON CONFLICT(kind, lease_key) DO UPDATE SET token = excluded.token,
       claimed_at = excluded.claimed_at
       WHERE work_leases.claimed_at <= ?`)
    .bind(kind, key, token, nowSeconds, cutoff)
    .run();

  if (won.meta.changes)
    return { held: true, kind, key, token,
      because: "no live lease existed for this work" };
  return { held: false,
    because: "another request is already paying for this work" };
}

/**
 * Whether this worker still owns the lease it took.
 *
 * Checked immediately before a result is written. A worker whose lease has
 * expired and been taken over is holding an older answer than the one now
 * being produced, so its write is refused rather than allowed to overwrite.
 */
export async function stillHolds(kind: LeaseKind, key: string, token: string) {
  const row = await db().prepare(
    `SELECT token FROM work_leases WHERE kind = ? AND lease_key = ?`)
    .bind(kind, key).first<{ token: string }>();
  return row?.token === token;
}

/** Give the lease up. Only the holder may, so a takeover is not undone. */
export async function releaseLease(kind: LeaseKind, key: string, token: string) {
  await db().prepare(
    `DELETE FROM work_leases WHERE kind = ? AND lease_key = ? AND token = ?`)
    .bind(kind, key, token).run();
}
