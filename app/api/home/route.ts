import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { memberUsage } from "@/app/spend-guard";
import { registerSize } from "@/app/trademark-register";
import { watchesFor } from "@/app/niche-watch-store";

/**
 * STATUS WORTH A MEMBER'S ATTENTION, AND NOTHING ELSE.
 *
 * Every number here is one a seller would act on. Cron activity, queue depth,
 * API usage and health counters are deliberately absent — they belong to the
 * owner view. An empty counter is also absent: "0 drafts" occupies the same
 * space as a real answer and says less than nothing.
 *
 * Each block is computed independently and a failure in one drops that block
 * rather than the page.
 */
export const GET = withErrorLog("home-status", async () => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const owner = isOwner(user);
  const now = Math.floor(Date.now() / 1000);
  const blocks: Record<string, unknown> = {};

  /* Connections: only mentioned when something needs the member's attention. */
  try {
    const rows = await db.prepare(
      `SELECT shop_name AS shopName, is_active AS active,
              encrypted_access_token <> '' AS live
         FROM etsy_connections WHERE user_id = ?`)
      .bind(user.userId).all<{ shopName: string; active: number; live: number }>();
    const shops = rows.results ?? [];
    const broken = shops.filter(row => !row.live);
    const active = shops.find(row => row.active === 1);
    if (!shops.length) blocks.connections = { needs: "etsy", say: "Connect your Etsy shop to begin." };
    else if (broken.length)
      blocks.connections = { needs: "reconnect",
        say: `${broken.length} shop${broken.length === 1 ? "" : "s"} need reconnecting.`,
        shops: broken.map(row => row.shopName) };
    else if (active)
      blocks.connections = { needs: null, activeShop: active.shopName };
  } catch { /* the block is dropped, the page is not */ }

  /* This month, from Shop Map's own rollups. Profit unavailable stays
     unavailable — it is a correct state, not a gap to fill with a zero. */
  try {
    /*
      THE ROLLUP IS A PAYLOAD, NOT A ROW OF COLUMNS.

      This asked for revenue_minor, currency, profit_minor, profit_complete,
      orders and period — none of which exist. `finance_rollups` stores one
      `payload_json` per month. The query threw on every request, the catch
      dropped the block, and Home has never once shown This Month.
    */
    const row = await db.prepare(
      `SELECT payload_json AS payload, month FROM finance_rollups
        WHERE user_id = ? ORDER BY month DESC LIMIT 1`)
      .bind(user.userId).first<{ payload: string; month: string }>();
    if (row) {
      /*
        THE NAMES THE ROLLUP ACTUALLY WRITES.

        `revenueMinor`, `orders` and `profitMinor` do not exist in the payload.
        The rollup writes `grossSellerRevenueMinor`, `coverage.receipts` and
        `knownOperatingProfitMinor` — so after the query was fixed, Home still
        rendered "$0.00 from 0 orders" for a month with a $26.49 sale. An
        unexplained zero is worse than a missing block: it looks like an answer.
      */
      const parsed = JSON.parse(row.payload) as {
        grossSellerRevenueMinor?: number; currency?: string;
        coverage?: { receipts?: number };
        knownOperatingProfitMinor?: number | null };
      const profit = parsed.knownOperatingProfitMinor;
      blocks.thisMonth = {
        month: row.month,
        revenueMinor: Number(parsed.grossSellerRevenueMinor) || 0,
        currency: parsed.currency ?? "USD",
        orders: Number(parsed.coverage?.receipts) || 0,
        /* Null unless every completeness condition held. Never zero. */
        profitMinor: profit ?? null,
        profitAvailable: profit !== null && profit !== undefined,
      };
    }
  } catch { /* Shop Map may not be set up for this member */ }

  /* Watched niches carrying something new since the last brief. */
  try {
    const saved = await watchesFor(user.userId);
    const moved: Array<{ phrase: string; newly: number }> = [];
    for (const watch of saved) {
      const rows = await db.prepare(
        `SELECT payload_json AS payload FROM niche_watch_history
          WHERE niche_key = ? ORDER BY observed_at DESC LIMIT 1`)
        .bind(watch.key).first<{ payload: string }>();
      if (!rows) continue;
      try {
        const parsed = JSON.parse(rows.payload) as { newSinceLastBrief?: number };
        const newly = Number(parsed.newSinceLastBrief ?? 0);
        if (newly > 0) moved.push({ phrase: watch.phrase, newly });
      } catch { /* skip */ }
    }
    if (moved.length) blocks.niches = moved;
  } catch { /* skip */ }

  /* Scans left today. Shown because it is a limit the member can hit. */
  try {
    const usage = await memberUsage(user.userId, "designScannerVision");
    if (usage.remaining !== null)
      blocks.scansLeft = { remaining: usage.remaining, limit: usage.limit };
  } catch { /* skip */ }

  /* Drafts in flight, only when there are some. */
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) AS open FROM publish_identity
        WHERE user_id = ? AND published_at IS NULL`)
      .bind(user.userId).first<{ open: number }>();
    if (Number(row?.open ?? 0) > 0) blocks.factory = { openDrafts: Number(row!.open) };
  } catch { /* skip */ }

  /* The register's loading state, because a member checking a phrase against a
     half-loaded register is getting a partial answer and has a right to know. */
  try {
    const size = await registerSize(db);
    const loading = size.files.some(file =>
      file.state === "waiting" || file.state === "partial");
    blocks.trademark = { marks: size.marks, loading };
  } catch { /* skip */ }

  return NextResponse.json({ blocks, owner, at: now });
});
