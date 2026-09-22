export type CatalogAction={listingId:number;title:string;headline:string;evidence:string;nextStep:string;priority:number};
export function catalogActions(listings:Array<{listing_id:number;title:string;state:string;created_at:number|null;favorites:number|null}>,sales:Array<{listing_id:number;quantity:number;sold_at:number;refunded:number}>,now:number):CatalogAction[]{
 const counts=new Map<number,{recent:number;previous:number;ninety:number}>();
 for(const sale of sales){if(sale.refunded||sale.quantity<=0||sale.sold_at>now||sale.sold_at<now-90*86400)continue;const n=counts.get(sale.listing_id)??{recent:0,previous:0,ninety:0};n.ninety+=sale.quantity;if(sale.sold_at>=now-30*86400)n.recent+=sale.quantity;else if(sale.sold_at>=now-60*86400)n.previous+=sale.quantity;counts.set(sale.listing_id,n);}
 return listings.flatMap(row=>{
  const n=counts.get(row.listing_id)??{recent:0,previous:0,ninety:0};
  const base={listingId:row.listing_id,title:row.title};
  if(row.state!=='active'&&n.ninety>0)return [{...base,headline:'Check a past seller that is no longer active',evidence:`${n.ninety} non-refunded units recorded in the last 90 days; last recorded listing state: ${row.state}.`,nextStep:'Open the Etsy listing and check why it is unavailable. If you still want to sell it, confirm provider stock, pricing and costs before renewing. Do not renew discontinued or intentionally retired work.',priority:1}];
  if(row.state==='active'&&n.previous>=5&&n.recent<n.previous/2)return [{...base,headline:'Investigate a sales slowdown',evidence:`${n.recent} non-refunded units in the last 30 days versus ${n.previous} in the preceding 30 days.`,nextStep:'Compare stock, price, shipping, promotions and seasonality across those dates. Check Etsy Stats before editing the design. Test one change and record the dates so you can compare the result.',priority:2}];
  if(row.state==='active'&&n.ninety===0&&row.created_at&&row.created_at<=now-90*86400&&(row.favorites??0)>=5)return [{...base,headline:'Review favorites without recent orders',evidence:`No non-refunded sale recorded in the last 90 days; ${row.favorites} lifetime favorites. Favorites may be older and are not a conversion rate.`,nextStep:'Check the full checkout price, readable first photo, size help and delivery promise. Choose one change to test on this listing and compare actual orders over equal periods. Do not add more versions until you understand the response.',priority:3}];
  return [];
 }).sort((a,b)=>a.priority-b.priority||a.listingId-b.listingId).slice(0,6);
}
