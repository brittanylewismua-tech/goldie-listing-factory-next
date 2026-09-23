import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {env} from 'cloudflare:workers';
import {watchesFor as keywordWatches} from '@/app/niche-watch-store';
import {watchesFor as shopWatches} from '@/app/shop-watch';

/**
 * WHAT IS ALREADY BEING WATCHED FOR THIS MEMBER, IN ONE CHEAP READ.
 *
 * The Command Center had no page. It was four links in a sidebar group, which
 * is a menu, and a menu cannot be worth forty-seven dollars a month because a
 * menu does nothing until you click it. What makes a tool of this price feel
 * like one is that it has already done some work by the time you arrive.
 *
 * So this returns the standing state: how many keywords and shops are being
 * followed, how many phrases are on the trademark watchlist and how many of
 * them want a look, and how much of the seller's own catalogue has been
 * mapped. Every figure comes from our own database. NO ETSY CALLS - a landing
 * page that spends the shared allowance to render itself would be the most
 * expensive page in the product and the least useful.
 */
const count = async (sql: string, ...binds: unknown[]) => {
  const db = (env as unknown as {DB: D1Database}).DB;
  const row = await db.prepare(sql).bind(...binds).first<{n: number}>().catch(() => null);
  return Number(row?.n) || 0;
};

export const GET = withErrorLog('command-center-summary', async () => {
  const access = await requireFeatureApi('marketWatch');
  if (!access.ok) return access.response;
  const userId = access.user.userId;

  /* Every read is independent and every one is allowed to fail on its own:
     one missing table must not blank the whole page. */
  const [keywords, shops, phrases, needReview, mapped, sold90] = await Promise.all([
    keywordWatches(userId).then(rows => rows.length).catch(() => 0),
    shopWatches(userId).then(rows => rows.length).catch(() => 0),
    count(`SELECT COUNT(*) n FROM trademark_watches WHERE user_id = ?`, userId),
    count(`SELECT COUNT(*) n FROM trademark_watches WHERE user_id = ? AND last_risk IS NOT NULL AND last_risk != 'clear'`, userId),
    count(`SELECT COUNT(*) n FROM shop_map_listings WHERE user_id = ?`, userId),
    /* Units, not rows: two of the same shirt on one receipt is two sold. */
    count(`SELECT COALESCE(SUM(quantity),0) n FROM shop_map_listing_sales
            WHERE user_id = ? AND refunded = 0 AND sold_at >= ?`,
      userId, Math.floor(Date.now() / 1000) - 90 * 86_400),
  ]);

  return NextResponse.json({keywords, shops, phrases, needReview, mapped, sold90},
    {headers: {'Cache-Control': 'private, no-store'}});
});
