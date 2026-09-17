import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { betaRoster, setEntitlement, auditFor, entitlementFor } from "@/app/entitlements";
import type { EntitlementState, SuitePlanKey } from "@/app/suite-plans";

/**
 * COMPLIMENTARY BETA ADMINISTRATION.
 *
 * Owner-only. Grants Full Suite access to a real account, with an optional
 * expiry and a required reason, and writes an audit row for every change.
 *
 * WHAT IT DELIBERATELY CANNOT DO:
 *   - show an Etsy or Printify token, or any part of one
 *   - show a member's artwork, scan results, watch contents or financial figures
 *   - sign in as anybody
 *   - send an email or an invitation
 *
 * It shows COUNTS and CONNECTION STATE, which is what deciding about access
 * needs, and nothing that would let the operator read a member's work.
 */
export const maxDuration = 120;

const db = () => (env as unknown as { DB: D1Database }).DB;

const countFor = async (sql: string, userId: string) => {
  const row = await db().prepare(sql).bind(userId).first<{ n: number }>().catch(() => null);
  return row ? Number(row.n) : null;
};

async function profile(userId: string, email: string) {
  /* Connection STATE, never the credential. `<> ''` yields a boolean; the
     encrypted value is never selected. */
  const etsy = await db().prepare(
    `SELECT COUNT(*) AS shops,
            SUM(CASE WHEN encrypted_access_token <> '' THEN 1 ELSE 0 END) AS live,
            SUM(CASE WHEN scopes LIKE '%transactions_r%' THEN 1 ELSE 0 END) AS withSales
       FROM etsy_connections WHERE user_id = ?`)
    .bind(userId).first<{ shops: number; live: number; withSales: number }>()
    .catch(() => null);
  const printify = await db().prepare(
    `SELECT encrypted_token <> '' AS live FROM printify_connections WHERE user_id = ?`)
    .bind(userId).first<{ live: number }>().catch(() => null);

  const usage = {
    scans: await countFor(`SELECT COUNT(*) AS n FROM scan_history WHERE user_id = ?`, userId),
    nicheWatches: await countFor(`SELECT COUNT(*) AS n FROM niche_watches WHERE user_id = ?`, userId),
    shopWatches: await countFor(`SELECT COUNT(*) AS n FROM member_shop_watches WHERE user_id = ?`, userId),
    capturedArtwork: await countFor(`SELECT COUNT(*) AS n FROM artwork_provenance WHERE user_id = ?`, userId),
    batches: await countFor(`SELECT COUNT(*) AS n FROM publish_identity WHERE user_id = ?`, userId),
  };

  const spend = await db().prepare(
    `SELECT COALESCE(SUM(actual_cost), 0) AS spent, COUNT(*) AS calls
       FROM spend_reservations WHERE user_id = ? AND state = 'settled'`)
    .bind(userId).first<{ spent: number; calls: number }>().catch(() => null);

  /*
    Recent errors for this member, message only — no request bodies.

    The columns are `area` and `created_at`. An earlier draft asked for `route`
    and `at`, which would have thrown and shown an operator an empty error list
    for a member who was hitting errors — the same failure that hid Shop Watch.
  */
  const errors = await db().prepare(
    `SELECT area, message, created_at AS createdAt FROM error_log WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 5`)
    .bind(userId).all<{ area: string; message: string; createdAt: string }>()
    .catch(() => ({ results: [] as Array<{ area: string; message: string; createdAt: string }> }));

  const shops = Number(etsy?.shops ?? 0);
  return {
    userId, email,
    entitlement: await entitlementFor({ userId, email } as never),
    connections: {
      etsyShops: shops,
      etsyLive: Number(etsy?.live ?? 0),
      shopsWithSalesAccess: Number(etsy?.withSales ?? 0),
      printifyConnected: Boolean(printify?.live),
    },
    /* Onboarding is "has a live Etsy shop", because nothing else works without
       one. Printify is optional until they open the factory. */
    onboarded: Number(etsy?.live ?? 0) > 0,
    usage,
    providerCost: Number((spend?.spent ?? 0).toFixed(5)),
    providerCalls: Number(spend?.calls ?? 0),
    recentErrors: (errors.results ?? []).map(row => ({
      area: row.area, message: String(row.message ?? "").slice(0, 200), at: row.createdAt })),
    audit: await auditFor(userId, 10),
  };
}

export const GET = withErrorLog("operations-beta", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (email) {
    /* Look the account up by the email it verified at sign-in. */
    const row = await db().prepare(
      `SELECT user_id AS userId, email FROM member_entitlements WHERE LOWER(email) = ?`)
      .bind(email).first<{ userId: string; email: string }>().catch(() => null);
    const fallback = await db().prepare(
      `SELECT DISTINCT user_id AS userId FROM etsy_connections WHERE LOWER(user_id) = ?`)
      .bind(email).first<{ userId: string }>().catch(() => null);
    const userId = row?.userId ?? fallback?.userId ?? null;
    if (!userId)
      return NextResponse.json({ found: false,
        note: "No account has signed in with that address yet. A member "
          + "must sign in once before access can be granted." });
    return NextResponse.json({ found: true, member: await profile(userId, row?.email ?? email) });
  }

  const roster = await betaRoster(100);
  return NextResponse.json({
    roster,
    complimentary: roster.filter(row => row.state === "beta").length,
    /* Beta size without a database console. */
    capacity: { granted: roster.length, target: 20 },
  });
});

export const POST = withErrorLog("operations-beta-grant", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    userId?: string; email?: string; state?: EntitlementState;
    plan?: SuitePlanKey | null; expiresAt?: number | null; reason?: string } | null;

  const userId = String(body?.userId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  if (!userId) return NextResponse.json({ error: "Which account?" }, { status: 400 });
  /* A reason is required: an access decision without one cannot be reviewed. */
  if (reason.length < 3)
    return NextResponse.json({ error: "Give a reason for this change." }, { status: 400 });

  const state = (body?.state ?? "beta") as EntitlementState;
  const allowed: EntitlementState[] = ["beta", "grandfathered", "active",
    "canceled", "past_due", "none"];
  if (!allowed.includes(state))
    return NextResponse.json({ error: "Unknown access state." }, { status: 400 });

  const result = await setEntitlement({
    actor: user.email || user.userId,
    userId,
    email: String(body?.email ?? "").trim().toLowerCase(),
    state,
    plan: (body?.plan ?? (state === "none" ? null : "full_suite")) as SuitePlanKey | null,
    expiresAt: body?.expiresAt ?? null,
    reason,
  });

  return NextResponse.json({ ok: true, at: result.at,
    entitlement: await entitlementFor({ userId, email: "" } as never) });
});
