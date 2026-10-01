import { dimensionsFor } from "./shop-map-identity.ts";

export type PatternListingInput = {
  listingId:number;
  title:string;
  tags:string[];
  shopSection:string;
  productFamily:string;
  state:string;
  favorites:number|null;
  sales90:number;
  lifetimeSales:number;
  imageUrl?:string;
};

export type WinningPattern = {
  rank:number;
  key:string;
  label:string;
  customerPercent:number;
  catalogPercent:number;
  gapPoints:number;
  lift:number;
  sellingListings:number;
  catalogListings:number;
  listingIds:number[];
};

export type WinningPatternMap = {
  basis:"sales-90"|"sales-lifetime"|"favorites"|"none";
  basisLabel:string;
  totalSignal:number;
  patterns:WinningPattern[];
  overbuilt?:Array<{key:string;label:string;customerPercent:number;catalogPercent:number;activeArtworkCount:number}>;
  listings:Array<{rank:number;listingId:number;title:string;imageUrl?:string;signal:number;attentionPercent:number}>;
};

const PRODUCT=new Set(["shirt","shirts","tee","tees","tshirt","tshirts","hoodie","hoodies","sweatshirt","sweatshirts",
  "crewneck","crewnecks","mug","mugs","sticker","stickers","tote","totes","bag","bags","poster","posters","print","prints",
  "case","cases","tank","tanks","top","tops","gift","gifts","unisex","women","womens","mens","men","apparel","clothing"]);
const STOP=new Set(["the","and","for","with","your","you","our","this","that","from","of","in","on","to","a","an","is","it",
  "cute","funny","best","new","custom","personalized","personalised","graphic","design","style"]);

const clean=(text:string)=>String(text??"").toLowerCase()
  .replace(/&amp;/g," and ").replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ").trim();
const stem=(word:string)=>word.endsWith("ies")?word.slice(0,-3)+"y"
  :word.endsWith("es")&&word.length>5?word.slice(0,-2)
  :word.endsWith("s")&&word.length>4&&!word.endsWith("ss")?word.slice(0,-1):word;
const meaningful=(words:string[])=>words.some(word=>!STOP.has(word)&&!PRODUCT.has(stem(word))&&word.length>=3);
const BAD_EDGE=new Set(["t","shirt","tee","tees","top","tops","gift","gifts","women","woman","girl","girls","men","man","unisex"]);
const cleanCandidate=(words:string[])=>{
  const held=words.filter(word=>!PRODUCT.has(stem(word)));
  if(held.length<2||!meaningful(held))return null;
  if(held.some(word=>word.length===1))return null;
  if(BAD_EDGE.has(held[held.length-1])||BAD_EDGE.has(held[0]))return null;
  return held.join(" ");