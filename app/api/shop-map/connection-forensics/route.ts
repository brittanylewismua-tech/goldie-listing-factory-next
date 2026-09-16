import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";

/**
 * WHAT ACTUALLY HAPPENED TO A CONNECTION THAT IS NO LONGER THERE.
 *
 * A shop disappeared during a failed authorisation and I guessed at the cause
 * in a report. That is not good enough: a guess about somebody's data is how a
 * real defect gets filed as user error and ships again.
 *
 * This reads the live schema rather than the migration that was supposed to
 * have produced it, because the two are only the same if that migration
 * actually ran. It also counts what still references the missing shop — if
 * drafts and listing links survive, the row was removed rather than
 * overwritten, and the reverse tells a different story.
 *
 * No tokens are read or reported.
 */
export const GET = withErrorLog("shop-map-connection-forensics", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const missing = Number(new URL(request.url).searchParams.get("shop")) || 0;

  const ask = async <T>(sql: string, ...args: unknown[]) =>
    db.prepare(sql).bind(...args).all<T>().catch(error => ({
      results: [] as T[], error: error instanceof Error ? error.message : "failed",
    }));

  /* The table as it exists, not as the migration described it. The primary key
     decides whether an upsert could have overwritten one shop with another. */
  const schema = await ask<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master
      WHERE tbl_name = 'etsy_connections' ORDER BY type DESC`);

  /*
    SCOPED TO THE CALLER, ALWAYS.

    The first version of this query had no user_id filter, and a diagnostic
    written to investigate one account read every account's rows and printed
    other members' shop names into a report. Owner access is not a reason to
    widen a query — it is a reason to be more careful with one, because
    nothing downstream will stop it.
  */
  const rows = await ask<Record<string, unknown>>(
    `SELECT shop_id, shop_name, is_active, etsy_user_id, updated_at,
            scopes, scopes_checked_at
       FROM etsy_connections WHERE user_id = ? ORDER BY updated_at DESC`,
    user.userId);

  /* Whether this shop is connected by anyone at all, as a count and nothing
     more — enough to tell "the row is gone" from "the row moved to another
     account", without naming anybody. */
  const elsewhere = missing
    ? (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM etsy_connections WHERE shop_id = ? AND user_id <> ?`,
      missing, user.userId)).results?.[0] ?? null
    : null;

  /* Anything still pointing at the missing shop. Related records surviving
     means the connection row was deleted, not rewritten into another shop. */
  const traces: Record<string, unknown> = {};
  if (missing) {
    traces.listingLinks = (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM etsy_listing_links WHERE user_id = ?`, user.userId)).results?.[0] ?? null;
    traces.batchesMentioningShop = (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM listing_batches WHERE user_id = ? AND state_json LIKE ?`,
      user.userId, `%${missing}%`)).results?.[0] ?? null;
    traces.draftResults = (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM printify_draft_results WHERE user_id = ?`, user.userId)).results?.[0] ?? null;
    traces.corpusListingsForShop = (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sold_watch WHERE shop_id = ?`, missing)).results?.[0] ?? null;
    traces.oauthStatesTargetingShop = (await ask<{ n: number }>(
      `SELECT COUNT(*) AS n FROM etsy_oauth_states WHERE target_shop_id = ?`, missing)).results?.[0] ?? null;
  }

  /* Every error this account recorded around the attempt, which is the only
     contemporaneous record of what the callback did. */
  const errors = await ask<{ area: string; message: string; created_at: string; url: string }>(
    `SELECT area, message, created_at, url FROM error_log
      WHERE created_at >= datetime('now','-6 hours')
        AND (area LIKE '%etsy%' OR url LIKE '%etsy%' OR area LIKE '%shop-map%')
      ORDER BY created_at DESC LIMIT 40`);

  return NextResponse.json({
    schema: (schema.results ?? []).map(row => ({ name: row.name, sql: row.sql })),
    connections: rows.results ?? [],
    connectionCount: (rows.results ?? []).length,
    sameShopConnectedByOtherAccounts: elsewhere,
    missingShop: missing || null,
    traces,
    recentEtsyErrors: errors.results ?? [],
  });
});
