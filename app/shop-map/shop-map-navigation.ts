/*
  Your Shop sections. "overview" is the Opportunity Engine's Votes page; Build
  and Track are its other two pages. The rail links to each with ?tab=, and a
  link clicked while already on /shop-map switches the section in place
  (SHOP_MAP_NAVIGATE) instead of reloading the page.
*/
export type ShopMapSection='overview'|'build'|'track'|'themes'|'sold'|'money';
export function shopMapSection(value:string|null):ShopMapSection {
 return value==='money'||value==='themes'||value==='sold'||value==='build'||value==='track'?value:'overview';
}
export const ENGINE_SECTIONS=new Set<ShopMapSection>(['overview','build','track']);
export const SHOP_MAP_NAVIGATE='shop-map:navigate';
export type ShopMapNavigateDetail={tab:ShopMapSection;listing?:number|null};

/** Move to a Your Shop section without leaving the page; returns false when not on /shop-map. */
export function navigateShopMap(tab:ShopMapSection,listing:number|null=null):boolean{
 if(typeof window==='undefined'||window.location.pathname!=='/shop-map')return false;
 const url=new URL(window.location.href);
 url.searchParams.set('tab',tab);
 if(listing)url.searchParams.set('listing',String(listing));else url.searchParams.delete('listing');
 window.history.pushState(window.history.state,'',url);
 window.dispatchEvent(new CustomEvent<ShopMapNavigateDetail>(SHOP_MAP_NAVIGATE,{detail:{tab,listing}}));
 return true;
}
