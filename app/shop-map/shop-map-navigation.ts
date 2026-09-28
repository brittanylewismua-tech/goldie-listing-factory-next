export type ShopMapSection='overview'|'themes'|'sold'|'money';
export function shopMapSection(value:string|null):ShopMapSection {
 return value==='money'||value==='themes'||value==='sold'?value:'overview';
}
