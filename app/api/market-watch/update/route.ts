import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { buildUpdate, NOTHING_NEW, type NicheChange, type ShopChange } from "@/app/market-update";
import { watchesFor } from "@/app/niche-watch-store";
import { briefForShop } from "@/app/shop-watch-brief";

/**
 * THE MORNING UPDATE.
 *
 * Built from stored history, so it costs a few local queries and no Etsy call
 * and no paid call. It answers four questions and is silent when it has no
 * answers.
 */
export const GET = withErrorLog("market-watch-update", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Market Watch is in internal testing." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const saved = await watchesFor(user.userId);

  /* Yesterday's reading against today's, per niche, from append-only history. */
  const niches: NicheChange[] = [];
  for (const watch of saved) {
    const rows = await db.prepare(
      `SELECT payload_json AS payload FROM niche_watch_history
        WHERE niche_key = ? ORDER BY observed_at DESC LIMIT 2`)
      .bind(watch.key).all<{ payload: string }>().catch(() => ({ results: [] }));
    const readings = (rows.results ?? []).map(row => {
      try { return JSON.parse(row.payload) as
        { moving?: number; repeated?: number; shops?: number }; }
      catch { return null; }
    }).filter(Boolean) as Array<{ moving?: number; repeated?: number; shops?: number }>;
    if (!readings.length) continue;
    const [current, previous] = readings;
    niches.push({
      phrase: watch.phrase,
      /* A change, not a level. Never negative. */
      newlyMoving: Math.max(0, Number(current.moving ?? 0) - Number(previous?.moving ?? 0)),
      newlyRepeated: Math.max(0,
        Number(current.repeated ?? 0) - Number(previous?.repeated ?? 0)),
      moving: Number(current.moving ?? 0),
      shops: Number(current.shops ?? 0),
    });
  }

  const watched = await db.prepare(
    `SELECT shop_id AS shopId, label AS shopName FROM member_shop_watches
      WHERE user_id = ? ORDER BY added_at DESC LIMIT 25`)
    .bind(user.userId).all<{ shopId: number; shopName: string }>()
    .catch(() => ({ results: [] as Array<{ shopId: number; shopName: string }> }));

  const shops: ShopChange[] = [];
  for (const row of watched.results ?? []) {
    const brief = await briefForShop(Number(row.shopId)) as {
      attention?: Array<{ headline?: string; support?: number }>;
      love?: Array<{ headline?: string; support?: number }>;
      dislike?: Array<{ headline?: string; support?: number }>;
    };
    /* The single strongest pattern, not the whole brief. The brief is a page
       the member can open; the update is a reason to open it. */
    const best = [...(brief.dislike ?? []), ...(brief.love ?? []), ...(brief.attention ?? [])]
      .sort((a, b) => Number(b.support ?? 0) - Number(a.support ?? 0))[0];
    if (best?.headline)
      shops.push({ shopId: Number(row.shopId), shopName: String(row.shopName ?? ""),
        headline: String(best.headline), support: Number(best.support ?? 0) });
  }

  const update = buildUpdate(niches, shops);
  return NextResponse.json({ ...update,
    message: update.empty ? NOTHING_NEW : null });
});
