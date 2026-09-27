import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isOwner} from '@/app/mastermind/access';
import {withErrorLog} from '@/app/error-log';
import {ensureMarketCollections,recordCompetitorChanges} from '@/app/market-collection';
import {ensureNicheWatchTables} from '@/app/niche-watch-store';
import {competitorSnapshot} from '@/app/market-collection-refresh';
import {listingDisplay} from '@/app/etsy-listing-display';
export const POST=withErrorLog('collection-tick',async(request:Request)=>{
 if(request.headers.get('cf-connecting-ip')){const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:'Not authorized.'},{status:403});}
 const db=(env as unknown as {DB:D1Database}).DB,now=Math.floor(Date.now()/1000);
 await ensureMarketCollections(db);await ensureNicheWatchTables();
 await db.prepare('CREATE TABLE IF NOT EXISTS market_collection_clock(id INTEGER PRIMARY KEY,lease_until INTEGER NOT NULL)').run();
 const lease=await db.prepare('INSERT INTO market_collection_clock(id,lease_until) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET lease_until=excluded.lease_until WHERE market_collection_clock.lease_until<? RETURNING id').bind(now+120,now).first();
 if(!lease)return NextResponse.json({busy:true});
 try{
 const saved=await db.prepare(`SELECT c.user_id,c.keyword_key,c.listing_id,c.payload,c.checked_at FROM market_keyword_collections c
 JOIN niche_watches w ON w.user_id=c.user_id AND w.niche_key=c.keyword_key
 WHERE c.archived=0 AND w.paused=0 AND c.checked_at<=? ORDER BY c.checked_at,c.listing_id LIMIT 100`).bind(now-21600)
 .all<{user_id:string;keyword_key:string;listing_id:number;payload:string;checked_at:number}>();
 const details=await listingDisplay(saved.results.map(r=>r.listing_id),'search');
 if(saved.results.length)await db.batch(saved.results.map(r=>{
 const row=details.get(r.listing_id);
 return row?db.prepare('UPDATE market_keyword_collections SET payload=?,checked_at=?,unavailable=0 WHERE user_id=? AND keyword_key=? AND listing_id=? AND archived=0 AND checked_at=?')
 .bind(JSON.stringify(recordCompetitorChanges(JSON.parse(r.payload),competitorSnapshot(row,now),now)),now,r.user_id,r.keyword_key,r.listing_id,r.checked_at)
 :db.prepare('UPDATE market_keyword_collections SET checked_at=?,unavailable=1 WHERE user_id=? AND keyword_key=? AND listing_id=? AND archived=0 AND checked_at=?')
 .bind(now,r.user_id,r.keyword_key,r.listing_id,r.checked_at);
 }));
 return NextResponse.json({checked:saved.results.length});
 }finally{await db.prepare('UPDATE market_collection_clock SET lease_until=0 WHERE id=1 AND lease_until=?').bind(now+120).run();}
});
