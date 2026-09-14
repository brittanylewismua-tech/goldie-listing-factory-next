import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { sensorHealth } from "@/app/shop-sensor";
import { coverage, ensureMarketTables } from "@/app/market-store";

/**
 * IS THE PIPELINE ALIVE, AND IS IT ANY GOOD?
 *
 * A collector that quietly stops is the worst failure this system can have,
 * because everything downstream keeps answering with old data and looks fine.
 * This is the page that makes silence visible — and it carries attribution
 * coverage, which is the honest measure of how much of what shops sold could
 * ever be tied to a listing.
 *
 * Owner only. No member sees any of this.
 */
export const GET = withErrorLog("market-health", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureMarketTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [sensor, cover, events, snapshots, activity] = await Promise.all([
    sensorHealth(),
    coverage(since),
    db.prepare(
      `SELECT type, COUNT(*) AS n FROM listing_events WHERE observed_at >= ?
        GROUP BY type ORDER BY n DESC LIMIT 20`).bind(since).all(),
    db.prepare(
      `SELECT COUNT(*) AS rows, COUNT(DISTINCT listing_id) AS listings,
              MAX(observed_at) AS newest
         FROM listing_snapshots`).first(),
    db.prepare(
      `SELECT COUNT(*) AS events, COALESCE(SUM(units), 0) AS units,
              COUNT(DISTINCT listing_id) AS listings
         FROM listing_sales_activity WHERE observed_at >= ?`).bind(since).first(),
  ]);

  const newest = (snapshots as { newest?: string } | null)?.newest ?? null;
  return NextResponse.json({
    windowDays: days,
    sensor,
    /* The number that decides whether any of this can be described to a member
       as selling. Everything else is plumbing. */
    attributionCoverage: cover,
    salesLinkedActivity: activity,
    snapshots,
    /* A pipeline that has not written a snapshot in an hour is broken, and
       saying so here is cheaper than noticing it in the product. */
    stale: newest ? Date.now() - Date.parse(newest) > 3_600_000 : true,
    eventsByType: (events as { results?: unknown[] }).results ?? [],
  });
});
