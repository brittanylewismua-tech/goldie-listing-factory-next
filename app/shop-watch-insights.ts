export type ShopObservation={at:number;sales:number|null;favorites:number|null;active:number|null};
export type ListingReading={id:number;title:string;price:number|null;currency:string;tags:string[]|null;createdAt:number|null;at:number};
export type ListingChange={title?:string;listingId:number;at:number;kind:'new'|'price'|'title'|'tags';before:string;after:string;currency:string};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function listingReading(row:Record<string,any>,at:number):ListingReading|null{
 const id=number(row.listing_id);if(!id||!row.title)return null;
 const price=row.price;return {id,title:String(row.title),price:price&&number(price.amount)!==null&&Number(price.divisor)>0?Math.round(price.amount/price.divisor*100):null,currency:String(price?.currency_code||''),tags:Array.isArray(row.tags)?[...new Set(row.tags.map(String))].sort():null,createdAt:number(row.original_creation_timestamp),at};
}
export function listingChanges(before:ListingReading|null,after:ListingReading,started:number):ListingChange[]{
 if(before&&before.at>=after.at)return [];
 const event=(kind:ListingChange['kind'],old:string,value:string):ListingChange=>({listingId:after.id,at:after.at,kind,before:old,after:value,currency:after.currency});
 if(!before)return after.createdAt!==null&&after.createdAt>=started&&after.createdAt<=after.at?[{...event('new','',after.title),at:after.createdAt}]:[];
 const changes:ListingChange[]=[];
 if(before.price!==null&&after.price!==null&&before.currency===after.currency&&before.price!==after.price)changes.push(event('price',String(before.price),String(after.price)));
 if(before.title!==after.title)changes.push(event('title',before.title,after.title));
 if(before.tags&&after.tags&&before.tags.join('|')!==after.tags.join('|'))changes.push(event('tags',JSON.stringify(before.tags),JSON.stringify(after.tags)));
 return changes;
}
export function shopActivity(rows:ShopObservation[],days:number,now:number){
 const valid=rows.filter(r=>Number.isFinite(r.at)&&r.at<=now).sort((a,b)=>a.at-b.at);
 const cutoff=now-days*86400;
 // Never spread a long observation gap over invented daily sales.
 const prior=valid.filter(r=>r.at<=cutoff).at(-1);
 const inWindow=valid.filter(r=>r.at>cutoff);
 const selected=prior&&cutoff-prior.at<=86400?[prior,...inWindow]:inWindow;
 const first=selected[0],last=selected.at(-1);
 const delta=(key:'sales'|'favorites'|'active')=>{
  if(!first||!last||first===last||first[key]===null||last[key]===null)return null;
  if(key==='sales'&&selected.some((r,i)=>i>0&&(r.sales===null||selected[i-1].sales===null||r.sales<selected[i-1].sales!)))return null;
  return last[key]!-first[key]!;
 };
 const daily=new Map<string,ShopObservation>();for(const row of selected)daily.set(new Date(row.at*1000).toISOString().slice(0,10),row);
 const points=[...daily.values()];
 return {from:first?.at??null,to:last?.at??null,sales:delta('sales'),favorites:delta('favorites'),active:delta('active'),series:points.slice(1).map((r,i)=>({from:points[i].at,to:r.at,sales:r.sales!==null&&points[i].sales!==null&&r.sales>=points[i].sales!?r.sales-points[i].sales!:null}))};
}
export type ShopInsights={observations:ShopObservation[];changes:ListingChange[];checkedAt:string|null;nextCheck:string|null;trackingSince:string|null;catalogObserved:number};
