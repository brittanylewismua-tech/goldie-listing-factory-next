import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {env} from 'cloudflare:workers';
import {ensureProvenanceTables} from '@/app/artwork-provenance';


// Member-scoped catalog and actual non-refunded sales.
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

  await ensureProvenanceTables();
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86_400;
  const [rows, sales] = await Promise.all([
    db.prepare(
      `SELECT listing_id, title, tags, state, favorites, views, image_url, product_family, COALESCE(NULLIF(artwork_hash,''),(SELECT MIN(p.artwork_hash) FROM artwork_provenance p WHERE p.user_id=shop_map_listings.user_id AND p.etsy_listing_id=shop_map_listings.listing_id AND p.artwork_hash<>'' HAVING COUNT(DISTINCT p.artwork_hash)=1)) AS artwork_hash
         FROM shop_map_listings WHERE user_id = ? AND shop_id = ?`)
      .bind(user.userId, shop.shopId)
      .all<{listing_id: number; title: string; tags: string; state: string;
        favorites: number | null; views: number | null; image_url: string; product_family: string; artwork_hash: string}>()
      .catch(() => null),
    // Actual units paid for within the period, excluding refunded transactions.
    db.prepare(
      `SELECT listing_id, SUM(quantity) AS units
         FROM shop_map_listing_sales
        WHERE user_id = ? AND shop_id = ? AND refunded = 0 AND sold_at >= ?
        GROUP BY listing_id`)
      .bind(user.userId, shop.shopId, ninetyDaysAgo)
      .all<{listing_id: number; units: number}>()
      .catch(() => null),
  ]);

  type SaleRow = {listing_id: number; units: number};
  const sold = new Map<number, {units: number}>(
    (sales?.results ?? []).map((row: SaleRow) =>
      [Number(row.listing_id), {units: Number(row.units) || 0}]));
  type ListingRow = {listing_id: number; title: string; tags: string; state: string;
    favorites: number | null; views: number | null; image_url: string; product_family: string; artwork_hash: string};
  const listings = (rows?.results ?? []).map((row: ListingRow) => ({
    listingId: Number(row.listing_id),
    title: String(row.title ?? ''),
    tags: (() => { try { return JSON.parse(row.tags || '[]') as string[]; } catch { return []; } })(),
    state: String(row.state ?? ''),
    family: String(row.product_family ?? ''),
    artworkHash: String(row.artwork_hash ?? ''),
    favorites: row.favorites ?? null,
    views: row.views ?? null,
    imageUrl: String(row.image_url ?? ''),
    sold90: sold.get(Number(row.listing_id))?.units ?? 0,

  }));

  return NextResponse.json({shop: {shopId: shop.shopId, shopName: shop.shopName}, listings},
    {headers: {'Cache-Control': 'private, no-store'}});
});
