import type { RegisterMatch } from './trademark-check';
import {normalize,squeeze} from './trademark-record.ts';

// Public search request observed on USPTO's own Trademark Search website.
// No browser session, credentials, or private API key are used.
export const USPTO_SEARCH_URL='https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch';
export type LiveTrademarkSearch={records:RegisterMatch[];total:number;complete:boolean;checkedAt:number};
const CACHE_SECONDS=15*60;
export function liveTrademarkQuery(phrase:string,aliases:string[]=[]){const variants=[...new Set([phrase.trim().slice(0,200),...aliases.slice(0,8).map(a=>a.slice(0,200))])];return {
 query:{bool:{must:[{bool:{should:variants.map(query=>({match_phrase:{WM:{query}}})),minimum_should_match:1}}],filter:[{term:{LD:'true'}}]}},
 size:200,from:0,track_total_hits:true,
 _source:['alive','id','internationalClass','wordmark','ownerName','goodsAndServices','registrationId','registrationDate','filedDate']
};}
export function readLiveTrademarkSearch(payload:unknown,phrase:string,now=Math.floor(Date.now()/1000)):LiveTrademarkSearch {
 const p=payload as {timedOut?:boolean;shardsFailed?:number;hits?:{totalValue?:number;totalRelation?:string;hits?:Array<{source?:Record<string,unknown>}>}};
 if(p?.timedOut || (p?.shardsFailed??0)>0 || !Array.isArray(p?.hits?.hits) || !Number.isFinite(p.hits.totalValue))throw Error('Incomplete USPTO response');
 const wanted=normalize(phrase),joined=squeeze(phrase);
 const records:RegisterMatch[]=[];
 for(const hit of p.hits.hits){const s=hit.source;if(!s || s.alive!==true)continue;
  const mark=typeof s.wordmark==='string'?s.wordmark:'';
  const serial=String(s.id??'');const m=normalize(mark);
  if(!/^\d{8}$/.test(serial)||!m)continue;
  const exact=m===wanted||squeeze(mark)===joined;
  const containsPhrase=(` ${m} `).includes(` ${wanted} `);
  if(!exact&&!containsPhrase)continue;
  // Missing registration metadata is not a verified pending application.
  if(!Object.hasOwn(s,'registrationId'))continue;
  const registration=String(s.registrationId??'');
  const classes=Array.isArray(s.internationalClass)?s.internationalClass.map(c=>String(c).match(/\b\d{3}\b/)?.[0]).filter((c):c is string=>Boolean(c)):[];
  const owner=Array.isArray(s.ownerName)?String(s.ownerName[0]??'').replace(/\s+\([^)]*\)\s*$/,''):'';
  records.push({serial,mark,owner,registration,classes,registered:/^[1-9]\d*$/.test(registration),exact,containsPhrase:!exact&&containsPhrase,
   goods:Array.isArray(s.goodsAndServices)?s.goodsAndServices.filter((g):g is string=>typeof g==='string').slice(0,45):[],
   filedDate:typeof s.filedDate==='string'?s.filedDate.slice(0,10):undefined,
   registrationDate:typeof s.registrationDate==='string'?s.registrationDate.slice(0,10):undefined});
 }
 records.sort((a,b)=>Number(b.exact)-Number(a.exact)||Number(b.classes.includes('025'))-Number(a.classes.includes('025'))||Number(b.registered)-Number(a.registered)||a.mark.localeCompare(b.mark));
 return {records,total:Number(p.hits.totalValue),complete:p.hits.totalRelation==='eq'&&Number(p.hits.totalValue)<=p.hits.hits.length&&records.length===p.hits.hits.length,checkedAt:now};
}
export async function ensureLiveTrademarkCache(db:D1Database){await db.prepare('CREATE TABLE IF NOT EXISTS tm_live_search_cache (phrase TEXT PRIMARY KEY, payload TEXT NOT NULL, checked_at INTEGER NOT NULL)').run();}
const pending=new Map<string,Promise<LiveTrademarkSearch|null>>();
export async function liveTrademarkSearch(phrase:string,db?:D1Database|null,aliases:string[]=[]):Promise<LiveTrademarkSearch|null>{
 if(normalize(phrase).length<2)return null;const key=JSON.stringify([normalize(phrase),[...new Set(aliases.map(normalize))].sort()]);
 const held=pending.get(key);if(held)return held;
 const work=(async()=>{
  const now=Math.floor(Date.now()/1000);
  if(db)try{
   await ensureLiveTrademarkCache(db);
   const cached=await db.prepare('SELECT payload, checked_at FROM tm_live_search_cache WHERE phrase=? AND checked_at>=?').bind(key,now-CACHE_SECONDS).first<{payload:string;checked_at:number}>();
   if(cached){const data=JSON.parse(cached.payload) as LiveTrademarkSearch;if(Array.isArray(data.records)&&Number.isFinite(data.total)&&typeof data.complete==='boolean'&&data.checkedAt===cached.checked_at)return data;}
  }catch{/* Cache failure never prevents an uncached source check. */}
  try{
   const response=await fetch(USPTO_SEARCH_URL,{method:'POST',headers:{'Content-Type':'application/json',accept:'application/json','user-agent':'GoldieSuite/1.0 (+https://thegoldiesuite.com)'},body:JSON.stringify(liveTrademarkQuery(phrase,aliases)),redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!response.ok)return null;
   const data=readLiveTrademarkSearch(await response.json(),phrase,now);
   if(db)await db.prepare('INSERT INTO tm_live_search_cache(phrase,payload,checked_at) VALUES(?,?,?) ON CONFLICT(phrase) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at').bind(key,JSON.stringify(data),now).run().catch(()=>{});
   return data;
  }catch{return null;}
 })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
