import type {NicheProject} from './niche-research-model';
export type BuyerSource={id:number;listingId:number;shopId:number;shop:string;title:string;text:string;at:number;rating:number|null};
export type BuyerFinding={title:string;explanation:string;kind:'pattern'|'request';evidence:Array<BuyerSource&{quote:string}>};
export type BuyerReport={version:string;sourceKey:string;analyzed:number;available:number;at:number;findings:BuyerFinding[]};
export const BUYER_VERSION='buyer-context-1';
/** Balanced across shops, deduplicated, and restricted to this niche's actual reviews. */
export function buyerEvidence(p:NicheProject,at:number){
 const seenIds=new Set<number>(),seenText=new Set<string>();
 const groups=p.shops.filter(s=>p.selected.includes(s.id)).sort((a,b)=>a.id-b.id).map(s=>{
  const listings=new Map(s.listings.map(l=>[l.id,l]));
  return [...s.reviews].sort((a,b)=>b.at-a.at||a.transactionId-b.transactionId).flatMap(r=>{
   const l=listings.get(r.listingId),text=r.text.trim(),normalized=text.toLowerCase().replace(/\s+/g,' ');
   if(!l||r.at>at||r.at<at-365*86400||text.length<30||seenIds.has(r.transactionId)||seenText.has(normalized))return [];
   seenIds.add(r.transactionId);seenText.add(normalized);
   return [{id:r.transactionId,listingId:r.listingId,shopId:s.id,shop:s.name,title:l.title.slice(0,250),text:text.slice(0,1800),at:r.at,rating:r.rating}];
  });
 });
 const available=groups.reduce((n,g)=>n+g.length,0),sources:BuyerSource[]=[];let chars=0;
 for(let i=0;sources.length<1000&&groups.some(g=>g.length>i);i++)for(const group of groups){const r=group[i];if(!r)continue;const size=JSON.stringify(r).length;if(chars+size>180000||sources.length>=1000)continue;sources.push(r);chars+=size;}
 const serialized=JSON.stringify([BUYER_VERSION,p.name,[...p.selected].sort((a,b)=>a-b),sources]);
 // Two independent hashes identify cache inputs; never used as a security boundary.
 let a=2166136261,b=5381;for(let i=0;i<serialized.length;i++){a=Math.imul(a^serialized.charCodeAt(i),16777619);b=Math.imul(b,33)^serialized.charCodeAt(i);}
 return {sources,available,sourceKey:`${BUYER_VERSION}:${serialized.length}:${a>>>0}:${b>>>0}`};
}
const generic=/^(?:family recipients|comfort and softness|print durability|fit and sizing|great quality|happy customers|customer satisfaction)$/i;
/** Quotes and metadata come from our sources, never from generated URLs or counts. */
export function validateBuyerFindings(raw:unknown,sources:BuyerSource[]):BuyerFinding[]{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as {findings?:unknown}).findings))throw Error('Buyer analysis returned an incomplete result.');
 const byId=new Map(sources.map(r=>[r.id,r])),findings:BuyerFinding[]=[],seen=new Set<string>();
 for(const item of (raw as {findings:unknown[]}).findings.slice(0,8)){
  if(!item||typeof item!=='object')continue;const x=item as Record<string,unknown>;
  if(typeof x.title!=='string'||typeof x.explanation!=='string'||!Array.isArray(x.evidence))continue;
  const title=x.title.trim(),explanation=x.explanation.trim();if(!title||title.length>110||explanation.length<30||explanation.length>650||generic.test(title)||seen.has(title.toLowerCase()))continue;
  const ids=new Set<number>(),texts=new Set<string>(),evidence:BuyerFinding['evidence']=[];let invalid=false;
  for(const value of x.evidence.slice(0,6)){
   const e=value as {id?:unknown;quote?:unknown}|null,source=e&&typeof e.id==='number'?byId.get(e.id):undefined;
   if(!source||typeof e?.quote!=='string'||e.quote.length<15||e.quote.length>500||!source.text.includes(e.quote)){invalid=true;break;}
   const normalized=source.text.toLowerCase().replace(/\s+/g,' ');if(ids.has(source.id)||texts.has(normalized))continue;
   ids.add(source.id);texts.add(normalized);evidence.push({...source,quote:e.quote});
  }
  const kind=x.kind==='request'?'request':'pattern';
  // A product request can be useful once; the UI explicitly labels it as one review.
  if(invalid||evidence.length<(kind==='request'?1:2))continue;
  if(kind==='request'&&!evidence.some(e=>/\b(wish|please|would love|could you|hope|want|need|looking for)\b/i.test(e.quote)))continue;
  seen.add(title.toLowerCase());findings.push({title,explanation,kind,evidence});
 }
 if((raw as {findings:unknown[]}).findings.length&&!findings.length)throw Error('The buyer findings could not be verified against the reviews.');
 return findings;
}
