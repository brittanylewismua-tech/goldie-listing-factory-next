export type CatalogAction={listingId:number;title:string;headline:string;fact:string;evidence:string;nextStep:string;priority:number};
/*
  D1810 · EVERY ROW SAID THE SAME THING.

  The headline is the rule that fired, and one rule fires for a whole group of
  listings, so six rows read "Favorites, but no sales in 90 days" six
  times. The rule now labels the group once; each row carries the figure that
  is true of that listing and no other, which is what a seller is scanning
  for.
*/
export function catalogActions(listings:Array<{listing_id:number;title:string;state:string;created_at:number|null;favorites:number|null}>,sales:Array<{listing_id:number;quantity:number;sold_at:number;refunded:number}>,now:number):CatalogAction[]{
 const counts=new Map<number,{recent:number;previous:number;ninety:number}>();
 for(const sale of sales){if(sale.refunded||sale.quantity<=0||sale.sold_at>now||sale.sold_at<now-90*86400)continue;const n=counts.get(sale.listing_id)??{recent:0,previous:0,ninety:0};n.ninety+=sale.quantity;if(sale.sold_at>=now-30*86400)n.recent+=sale.quantity;else if(sale.sold_at>=now-60*86400)n.previous+=sale.quantity;counts.set(sale.listing_id,n);}
 return listings.flatMap(row=>{
  const n=counts.get(row.listing_id)??{recent:0,previous:0,ninety:0};
  const base={listingId:row.listing_id,title:row.title};
  if(row.state!=='active'&&n.ninety>0)return [{...base,headline:'Previously sold, now inactive',fact:`${n.ninety} sold in 90 days · now ${row.state}`,evidence:`${n.ninety} non-refunded units recorded in the last 90 days; last recorded listing state: ${row.state}.`,nextStep:'Check why this listing is inactive. Before renewing, check stock and current production costs.',priority:1}];
  if(row.state==='active'&&n.previous>=5&&n.recent<n.previous/2)return [{...base,headline:'Sales have dropped',fact:`${n.recent} sold in 30 days, down from ${n.previous}`,evidence:`${n.recent} non-refunded units in the last 30 days versus ${n.previous} in the preceding 30 days.`,nextStep:'Check Etsy Stats for changes in visits and orders. Review stock, prices, shipping, and any promotions during these dates.',priority:2}];
  if(row.state==='active'&&n.recent>=5&&n.previous<=1&&n.ninety<=n.recent+1)
    return [{...base,headline:'Emerging winner',fact:`${n.recent} sold in 30 days after ${n.previous} in the previous 30`,
      evidence:`${n.recent} non-refunded units in the last 30 days versus ${n.previous} in the preceding 30 days.`,
      nextStep:'Keep this listing active. If the next sales window confirms the rise, test a distinct variation of its artwork.',priority:3}];
  return [];
 }).sort((a,b)=>a.priority-b.priority||a.listingId-b.listingId).slice(0,6);
}
