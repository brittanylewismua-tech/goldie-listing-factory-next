export type ShopMapSection='overview'|'themes'|'sold'|'money';
export function shopMapSection(value:string|null):ShopMapSection {
 return value==='overview'||value==='themes'||value==='sold'?value:'money';
}
