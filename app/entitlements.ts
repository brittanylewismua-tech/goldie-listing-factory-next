import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { allows, type Entitlement, type EntitlementState, type Feature,
  type SuitePlanKey } from "@/app/suite-plans";

/**
 * WHAT EACH ACCOUNT MAY REACH, AND WHO CHANGED IT.
 *
 * One table, one read, one audit trail. The audit is not decoration: a
 * complimentary grant is an access decision, and when somebody asks in three
 * months why an account has Full Suite the answer has to be a row, not a
 * memory.
 *
 * DEFAULT IS NOTHING. An account with no row reaches account and connection
 * screens and no feature. A default that granted access would mean a bug in
 * this file hands the product away.
 */
const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureEntitlementTables() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS member_entitlements (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'none',
      plan TEXT,
      expires_at INTEGER,
      granted_by TEXT NOT NULL DEFAULT '',
      granted_reason TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0)`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS member_entitlements_email ON member_entitlements (email)`),
    /* Append only. Nothing in this module updates or deletes a row here. */
    db().prepare(`CREATE TABLE IF NOT EXISTS entitlement_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      actor TEXT NOT NULL,
      member TEXT NOT NULL,
      member_email TEXT NOT NULL DEFAULT '',
      previous_json TEXT NOT NULL DEFAULT '',
      next_json TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '')`),
    db().prepare(
      `CREATE INDEX IF NOT EXISTS entitlement_audit_member ON entitlement_audit (member, at DESC)`),
  ]);
}

export const NO_ENTITLEMENT: Entitlement = { state: "none", plan: null, until: null };

export async function entitlementFor(user: ChatGPTUser): Promise<Entitlement> {
  /* The owner is not an entitlement row. Tying the owner's access to a table
     means a bad row locks the operator out of the tools that would fix it. */
  if (isOwner(user)) return { state: "beta", plan: "full_suite", until: null };

  await ensureEntitlementTables();
  const row = await db().prepare(
    `SELECT state, plan, expires_at AS expiresAt FROM member_entitlements WHERE user_id = ?`)
    .bind(user.userId)
    .first<{ state: string; plan: string | null; expiresAt: number | null }>()
    .catch(() => null);
  if (!row) return NO_ENTITLEMENT;
  return {
    state: (row.state ?? "none") as EntitlementState,
    plan: (row.plan ?? null) as SuitePlanKey | null,
    until: row.expiresAt === null || row.expiresAt === undefined
      ? null : Number(row.expiresAt),
  };
}

/**
 * The one gate. Returns the member's entitlement alongside the verdict so a
 * caller can explain the refusal without a second read.
 */
export async function gate(user: ChatGPTUser | null, feature: Feature, now =
  Math.floor(Date.now() / 1000)) {
  if (!user) return { ok: false as const, reason: "signed-out" as const,
    because: "Sign in to continue.", entitlement: NO_ENTITLEMENT, upgrade: null };
  const entitlement = await entitlementFor(user);
  const verdict = allows(entitlement, feature, now);
  return verdict.ok
    ? { ok: true as const, entitlement }
    : { ok: false as const, reason: "no-access" as const, because: verdict.because,
        entitlement, upgrade: verdict.upgrade };
}

export type GrantInput = {
  actor: string;
  userId: string;
  email: string;
  state: EntitlementState;
  plan: SuitePlanKey | null;
  expiresAt: number | null;
  reason: string;
};

/** Every change writes an audit row carrying what it was and what it became. */
export async function setEntitlement(input: GrantInput) {
  await ensureEntitlementTables();
  const now = Math.floor(Date.now() / 1000);
  const previous = await db().prepare(
    `SELECT state, plan, expires_at AS expiresAt FROM member_entitlements WHERE user_id = ?`)
    .bind(input.userId).first<Record<string, unknown>>().catch(() => null);

  await db().prepare(
    `INSERT INTO member_entitlements
       (user_id, email, state, plan, expires_at, granted_by, granted_reason, updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email, state = excluded.state, plan = excluded.plan,
       expires_at = excluded.expires_at, granted_by = excluded.granted_by,
       granted_reason = excluded.granted_reason, updated_at = excluded.updated_at`)
    .bind(input.userId, input.email, input.state, input.plan, input.expiresAt,
      input.actor, input.reason, now)
    .run();

  await db().prepare(
    `INSERT INTO entitlement_audit
       (at, actor, member, member_email, previous_json, next_json, reason)
     VALUES (?,?,?,?,?,?,?)`)
    .bind(now, input.actor, input.userId, input.email,
      JSON.stringify(previous ?? { state: "none", plan: null, expiresAt: null }),
      JSON.stringify({ state: input.state, plan: input.plan, expiresAt: input.expiresAt }),
      input.reason)
    .run();

  return { at: now };
}

export async function auditFor(userId: string, limit = 25) {
  await ensureEntitlementTables();
  const rows = await db().prepare(
    `SELECT at, actor, previous_json AS previous, next_json AS next, reason
       FROM entitlement_audit WHERE member = ? ORDER BY at DESC LIMIT ?`)
    .bind(userId, limit)
    .all<{ at: number; actor: string; previous: string; next: string; reason: string }>()
    .catch(() => ({ results: [] as Array<{ at: number; actor: string;
      previous: string; next: string; reason: string }> }));
  return (rows.results ?? []).map(row => ({
    at: Number(row.at), actor: row.actor, reason: row.reason,
    previous: safeParse(row.previous), next: safeParse(row.next),
  }));
}

const safeParse = (value: string) => {
  try { return JSON.parse(value) as unknown; } catch { return null; }
};

/** How many complimentary accounts are live. Beta size, without a DB console. */
export async function betaRoster(limit = 100) {
  await ensureEntitlementTables();
  const rows = await db().prepare(
    `SELECT user_id AS userId, email, state, plan, expires_at AS expiresAt,
            granted_by AS grantedBy, granted_reason AS reason, updated_at AS updatedAt
       FROM member_entitlements ORDER BY updated_at DESC LIMIT ?`)
    .bind(limit)
    .all<Record<string, unknown>>()
    .catch(() => ({ results: [] as Array<Record<string, unknown>> }));
  return rows.results ?? [];
}
