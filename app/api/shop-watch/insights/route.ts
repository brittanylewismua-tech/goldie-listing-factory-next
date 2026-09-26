import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {requireFeatureApi} from '@/app/require-feature';
import {withErrorLog} from '@/app/error-log';
import {refreshIfStale} from '@/app/shop-watch';
import {ensureShopInsightTables} from '@/app/shop-watch-insight-store';
export const GET=withErrorLog('shop-watch-insights',async(request:Request)=>{
 const access=await requireFeatureApi('marketWatch');if(!access.ok)return access.response;
 const id=Number(new URL(request.url).searchParams.get('shop'));if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:'Choose a tracked shop.'},{status:400});
 const db=(env as unknown as {DB:D1Database}).DB;
 const watched=await db.prepare('SELECT shop_id FROM member_shop_watches WHERE user_id=? AND shop_id=? AND paused=0').bind(access.user.userId,id).first();
 if(!watched)return NextResponse.json({error:'This shop is not on your watchlist.'},{status:404});
 await refreshIfStale(id);await ensureShopInsightTables(db);
 const now=Math.floor(Date.now()/1000);
 const [shop,history,changes,coverage]=await Promise.all([
  db.prepare('SELECT last_refreshed AS checkedAt,next_refresh_at AS nextCheck,added_at AS trackingSince FROM watched_shops WHERE shop_id=?').bind(id).first(),
  db.prepare('SELECT observed_at,sold_count AS sales,favorers AS favorites,active_count AS active FROM shop_observations WHERE shop_id=? AND observed_at>=? ORDER BY observed_at').bind(id,new Date((now-91*86400)*1000).toISOString()).all<{observed_at:string;sales:number|null;favorites:number|null;active:number|null}>(),

  db.prepare('SELECT listing_id AS listingId,observed_at AS at,kind,before_value AS before,after_value AS after,currency FROM shop_listing_changes WHERE shop_id=? AND observed_at>=? ORDER BY observed_at DESC LIMIT 200').bind(id,now-90*86400).all(),
  db.prepare('SELECT COUNT(*) AS n FROM shop_listing_readings WHERE shop_id=?').bind(id).first<{n:number}>()
 ]);
 return NextResponse.json({...shop,observations:(history.results??[]).map(({observed_at,...r})=>({...r,at:Date.parse(observed_at)/1000})),changes:changes.results??[],catalogObserved:coverage?.n??0});
});
