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

  /*
    TODAY'S READING AGAINST THE LAST ONE FROM A PREVIOUS DAY.

    Two things were wrong with the obvious version. Comparing the two most
    recent rows compares two readings from this morning when the member opened
    the page twice, so a real overnight change vanishes. And a niche with only
    ONE reading has no baseline at all — treating the missing baseline as zero
    announced the entire existing cohort as "newly showing momentum", which is
    precisely the noise this update exists to avoid: the first morning would
    have claimed 42 bachelorette listings newly moved when none had.

    So: no previous day, no line. An unknown change is not a change.
  */
  const today = new Date(Date.now()).toISOString().slice(0, 10);
  const niches: NicheChange[] = [];
  for (const watch of saved) {
    const current = await db.prepare(
      `SELECT payload_json AS payload FROM niche_watch_history
        WHERE niche_key = ? ORDER BY observed_at DESC LIMIT 1`)
      .bind(watch.key).first<{ payload: string }>().catch(() => null);
    const before = await db.prepare(
      `SELECT payload_json AS payload FROM niche_watch_history
        WHERE niche_key = ? AND observed_day < ? ORDER BY observed_at DESC LIMIT 1`)
      .bind(watch.key, today).first<{ payload: string }>().catch(() => null);
    /* A watch saved today has nothing to compare against yet, and says nothing. */
    if (!current || !before) continue;
    let now_: { moving?: number; repeated?: number; shops?: number };
    let then_: { moving?: number; repeated?: number; shops?: number };
    try {
      now_ = JSON.parse(current.payload) as typeof now_;
      then_ = JSON.parse(before.payload) as typeof then_;
    } catch { continue; }
    niches.push({
      phrase: watch.phrase,
      /* A change, not a level. Never negative. */
      newlyMoving: Math.max(0, Number(now_.moving ?? 0) - Number(then_.moving ?? 0)),
      newlyRepeated: Math.max(0, Number(now_.repeated ?? 0) - Number(then_.repeated ?? 0)),
      moving: Number(now_.moving ?? 0),
      shops: Number(now_.shops ?? 0),
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
