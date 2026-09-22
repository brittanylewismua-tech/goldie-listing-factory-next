export type SavedCompetitor = {
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
