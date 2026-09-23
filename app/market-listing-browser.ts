export type ListingOrder = 'newest' | 'favorites' | 'views' | 'price' | 'price-desc';
export type ResearchListing = {
  listingId:number; title:string; currency:string; priceCents:number|null;
  favorites:number|null; views:number|null; ageDays:number|null;
  createdAt?:number|null; reviewsOnThisListing:number|null;
};
// Missing measurements always sort last; zero is a real measurement.
function compare(a:number|null|undefined,b:number|null|undefined,ascending=false){
 const av=typeof a==='number'&&Number.isFinite(a)?a:null;
 const bv=typeof b==='number'&&Number.isFinite(b)?b:null;
 if(av===null)return bv===null?0:1;
 if(bv===null)return -1;
 return ascending?av-bv:bv-av;
}
export function browseListings<T extends ResearchListing>(listings:T[],order:ListingOrder,query='',currency=''):T[]{
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const filtered=listings.filter(l=>(!currency||(l.currency||'USD')===currency)&&words.every(w=>l.title.toLocaleLowerCase().includes(w)));
 // Currency amounts are never ranked against another currency.
 const mixed=new Set(filtered.map(l=>l.currency||'USD')).size>1;
 return filtered.sort((a,b)=>{
  let result=0;
  if(order==='newest')result=a.createdAt&&b.createdAt?compare(a.createdAt,b.createdAt):compare(a.ageDays,b.ageDays,true);
  else if(order==='favorites')result=compare(a.favorites,b.favorites);
  else if(order==='views')result=compare(a.views,b.views);
  else if(!mixed)result=compare(a.priceCents,b.priceCents,order==='price');
  return result||a.listingId-b.listingId;
 });
}

export function browseOwnListings<T extends {listingId:number;title:string;sales:number;favorites:number|null;revenueMinor?:number;state?:string}>(listings:T[],order:'sales'|'favorites'|'revenue',query='',state='all'):T[]{
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return listings.filter(l=>words.every(w=>l.title.toLocaleLowerCase().includes(w))&&(state==='all'||(state==='active'?l.state==='active':Boolean(l.state)&&l.state!=='active')))
 .sort((a,b)=>compare(order==='sales'?a.sales:order==='favorites'?a.favorites:a.revenueMinor,order==='sales'?b.sales:order==='favorites'?b.favorites:b.revenueMinor)||a.listingId-b.listingId);
}
