export type SavedCompetitor = {
  tags?:string[]; history?:Array<{at:number;kind:'price'|'title'|'tags';before:string;after:string;currency:string}>;
  listingId:number; title:string; imageUrl:string; etsyUrl:string;
  priceCents:number|null; currency:string; favorites:number|null; views:number|null;
  ageDays:number|null; createdAt:number|null; listedAt:number|null;
  reviewsOnThisListing:null; displayFresh:boolean; intervals:number;
};
export type CollectionEntry = {listing:SavedCompetitor;baseline:SavedCompetitor;savedAt:number;checkedAt:number;unavailable:boolean};
export const COLLECTION_SCHEMA = `CREATE TABLE IF NOT EXISTS market_keyword_collections (
 user_id TEXT NOT NULL,keyword_key TEXT NOT NULL,listing_id INTEGER NOT NULL,
 baseline TEXT NOT NULL,payload TEXT NOT NULL,saved_at INTEGER NOT NULL,checked_at INTEGER NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0,unavailable INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,keyword_key,listing_id))`;
export const SAVE_COMPETITOR_SQL = `INSERT INTO market_keyword_collections
 (user_id,keyword_key,listing_id,baseline,payload,saved_at,checked_at)
 SELECT ?,?,?,?,?,?,? WHERE
 (SELECT COUNT(*) FROM market_keyword_collections WHERE user_id=? AND keyword_key=? AND archived=0)<100
 ON CONFLICT(user_id,keyword_key,listing_id) DO UPDATE SET archived=0`;
export function competitorChanges(entry:CollectionEntry){
 const delta=(a:number|null,b:number|null)=>a===null||b===null?null:a-b;
 return {favorites:delta(entry.listing.favorites,entry.baseline.favorites),views:delta(entry.listing.views,entry.baseline.views),
 priceCents:entry.listing.currency===entry.baseline.currency?delta(entry.listing.priceCents,entry.baseline.priceCents):null};
}

export async function ensureMarketCollections(db:D1Database){await db.prepare(COLLECTION_SCHEMA).run();}

export function recordCompetitorChanges(before:SavedCompetitor,after:SavedCompetitor,at:number):SavedCompetitor{
 const history=[...(before.history??[])];
 const add=(kind:'price'|'title'|'tags',old:string,next:string)=>{if(old!==next)history.push({at,kind,before:old,after:next,currency:after.currency});};
 if(before.currency===after.currency&&before.priceCents!==null&&after.priceCents!==null)add('price',String(before.priceCents),String(after.priceCents));
 add('title',before.title,after.title);
 if(before.tags&&after.tags)add('tags',JSON.stringify([...before.tags].sort()),JSON.stringify([...after.tags].sort()));
 return {...after,history:history.filter(e=>e.at>=at-90*86400).slice(-60)};
}
