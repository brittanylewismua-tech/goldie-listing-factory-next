import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {env} from 'cloudflare:workers';


/**
 * THE MEMBER'S OWN LISTINGS, WITH WHAT EACH ONE HAS DONE.
 *
 * Two tools want this and neither had it.
 *
 * The Design Scanner made a member type their own title, tags and price into
 * a form to have them checked - data this product already holds, about a
 * listing it already imported. Typing your own listing back into the software
 * that fetched it is the kind of thing that makes a tool feel like homework.
 *
 * And Shop Map could say what sold but never what to do about it. A design
 * that has sold and exists on exactly one product is the clearest revenue
 * action a print-on-demand seller has: the artwork is proven, the work is
 * done, and putting it on a second blank costs an afternoon. That needs the
 * product family beside the sales, which is what this returns.
 */
export const GET = withErrorLog('shop-map-my-listings', async () => {
  const access = await requireFeatureApi('shopMap');
  if (!access.ok) return access.response;
  const user = access.user;
  const db = (env as unknown as {DB: D1Database}).DB;
  const shopRow = await db.prepare(
    `SELECT shop_id, shop_name FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{shop_id: number; shop_name: string}>().catch(() => null);
  /* No connected shop is a state, not an error: the picker simply has nothing
     to offer and says so where it is shown. */
  if (!shopRow) return NextResponse.json({listings: [], shop: null});
  const shop = {shopId: Number(shopRow.shop_id), shopName: String(shopRow.shop_name ?? '')};

  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86_400;
  const [rows, sales] = await Promise.all([
    db.prepare(
      `SELECT listing_id, title, tags, state, favorites, views, image_url, product_family
         FROM shop_map_listings WHERE user_id = ? AND shop_id = ?`)
      .bind(user.userId, shop.shopId)
      .all<{listing_id: number; title: string; tags: string; state: string;
        favorites: number | null; views: number | null; image_url: string; product_family: string}>()
      .catch(() => null),
    /* Units and the most recent price actually paid, which is worth more than
       the listed price: it is what a buyer agreed to. Refunds are excluded -
       a refunded sale is not a sale. */
    db.prepare(
      `SELECT listing_id, SUM(quantity) AS units, MAX(sold_at) AS lastAt
         FROM shop_map_listing_sales
        WHERE user_id = ? AND shop_id = ? AND refunded = 0 AND sold_at >= ?
        GROUP BY listing_id`)
      .bind(user.userId, shop.shopId, ninetyDaysAgo)
      .all<{listing_id: number; units: number; lastAt: number}>()
      .catch(() => null),
  ]);

  type SaleRow = {listing_id: number; units: number; lastAt: number};
  const sold = new Map((sales?.results ?? []).map((row: SaleRow) => [Number(row.listing_id), Number(row.units) || 0]));
  type ListingRow = {listing_id: number; title: string; tags: string; state: string;
    favorites: number | null; views: number | null; image_url: string; product_family: string};
  const listings = (rows?.results ?? []).map((row: ListingRow) => ({
    listingId: Number(row.listing_id),
    title: String(row.title ?? ''),
    tags: (() => { try { return JSON.parse(row.tags || '[]') as string[]; } catch { return []; } })(),
    state: String(row.state ?? ''),
    family: String(row.product_family ?? ''),
    favorites: row.favorites ?? null,
    views: row.views ?? null,
    imageUrl: String(row.image_url ?? ''),
    sold90: sold.get(Number(row.listing_id)) ?? 0,
  }));

  return NextResponse.json({shop: {shopId: shop.shopId, shopName: shop.shopName}, listings},
    {headers: {'Cache-Control': 'private, no-store'}});
});
