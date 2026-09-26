import {listingReading,listingChanges,type ListingReading} from './shop-watch-insights';
export async function ensureShopInsightTables(db:D1Database){await db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS shop_listing_readings(shop_id INTEGER NOT NULL,listing_id INTEGER NOT NULL,payload TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(shop_id,listing_id))'),
 db.prepare('CREATE TABLE IF NOT EXISTS shop_listing_changes(shop_id INTEGER NOT NULL,listing_id INTEGER NOT NULL,observed_at INTEGER NOT NULL,kind TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,currency TEXT NOT NULL,UNIQUE(shop_id,listing_id,observed_at,kind))'),
 db.prepare('CREATE INDEX IF NOT EXISTS shop_listing_changes_recent ON shop_listing_changes(shop_id,observed_at DESC)')]);}
export async function recordShopListings(db:D1Database,shopId:number,rows:Record<string,any>[],at:number){
 await ensureShopInsightTables(db);
 const shop=await db.prepare('SELECT added_at FROM watched_shops WHERE shop_id=?').bind(shopId).first<{added_at:string}>();
 const started=Date.parse(shop?.added_at??'')/1000;if(!Number.isFinite(started))return;
 const readings=rows.map(row=>listingReading(row,at)).filter((r):r is ListingReading=>r!==null);
 const heldById=new Map<number,{payload:string;checked_at:number}>();
 for(let i=0;i<readings.length;i+=90){const ids=readings.slice(i,i+90).map(r=>r.id);if(!ids.length)continue;const held=await db.prepare(`SELECT listing_id,payload,checked_at FROM shop_listing_readings WHERE shop_id=? AND listing_id IN (${ids.map(()=>'?').join(',')})`).bind(shopId,...ids).all<{listing_id:number;payload:string;checked_at:number}>();for(const r of held.results??[])heldById.set(r.listing_id,r);}
 const writes:D1PreparedStatement[]=[];
 for(const after of readings){const held=heldById.get(after.id);if(held&&held.checked_at>=at)continue;
  const before=held?JSON.parse(held.payload) as ListingReading:null;
  const changes=listingChanges(before,after,started);
  if(after.tags===null&&before?.tags)after.tags=before.tags;
  // Events and the reading stay adjacent in one transaction; stale reads cannot create events.
  const group=[...changes.map(c=>db.prepare(`INSERT OR IGNORE INTO shop_listing_changes(shop_id,listing_id,observed_at,kind,before_value,after_value,currency)
    SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT checked_at FROM shop_listing_readings WHERE shop_id=? AND listing_id=?),0)=?`).bind(shopId,c.listingId,c.at,c.kind,c.before,c.after,c.currency,shopId,after.id,held?.checked_at??0)),
   db.prepare('INSERT INTO shop_listing_readings(shop_id,listing_id,payload,checked_at) VALUES(?,?,?,?) ON CONFLICT(shop_id,listing_id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at WHERE excluded.checked_at>shop_listing_readings.checked_at').bind(shopId,after.id,JSON.stringify(after),at)];
  if(writes.length+group.length>80){await db.batch(writes.splice(0));}writes.push(...group);
 }
 if(writes.length)await db.batch(writes);
}
