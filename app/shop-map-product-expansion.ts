import type {PurchasePriorityMap} from "./shop-map-purchase-priorities";

export type ExpansionListing = {
  listingId:number; productFamily:string; state:string; artworkHash:string|null;
  design?:{wording:string[];illustrationCategory:string}|null;
};
export type ProductDirection = {
  listingId:number; kind:"test"|"already-offered"|"availability-review"|"research";
  retainedCharacteristic:string|null; proposedChange:string|null;
  catalogCoverage:string; whyNow:string; relatedListingId:number|null;
  researchQuestion:string|null;
};

const normalize=(value:string)=>String(value||"").toLowerCase().trim()
  .replace(/[\s_-]+/g," ");
const family=(value:string)=>{
  const key=normalize(value);
  if(["tee","t shirt","tshirt","shirt"].includes(key))return "tee";
  if(["sweatshirt","crewneck"].includes(key))return "sweatshirt";
  if(["poster","art print","print"].includes(key))return "poster";
  if(["sticker","decal"].includes(key))return "sticker";
  if(["tote","tote bag"].includes(key))return "tote";
  if(["pouch","zip pouch"].includes(key))return "pouch";
  return key;
};
const labels:Record<string,string>={
  tee:"tee",sweatshirt:"sweatshirt",poster:"poster",sticker:"sticker",
  tote:"tote",pouch:"pouch",
};
const peers:Record<string,string[]>={
  tee:["sweatshirt"],sweatshirt:["tee"],poster:["sticker"],
  sticker:["poster"],tote:["pouch"],pouch:["tote"],
};
const characteristic=(design:ExpansionListing["design"])=>{
  const wording=(design?.wording??[]).map(x=>String(x||"").trim()).filter(Boolean).join(" / ");
  if(wording)return `the visible wording “${wording.slice(0,100)}” and its artwork`;
  const motif=String(design?.illustrationCategory||"").trim();
  return motif&&!/^(none|unknown|text|typography|other)$/i.test(motif)
    ?`the visible ${motif} motif and its artwork`:null;
};

/**
 * Recommend only an exact-artwork format extension the shop has already shown
 * it can offer. A new phrase, buyer identity, material, or production ability
 * cannot be inferred from listing titles or a purchase count.
 */
export function buildProductDirections(
  purchase:PurchasePriorityMap,listings:ExpansionListing[],
):ProductDirection[]{
  const byId=new Map(listings.map(row=>[row.listingId,row]));
  const activeFormats=new Set(listings.filter(row=>row.state==="active").map(row=>family(row.productFamily)));
  return purchase.priorities.map(winner=>{
    const source=byId.get(winner.listingId);
    const base={listingId:winner.listingId,relatedListingId:null,retainedCharacteristic:null,
      proposedChange:null,researchQuestion:null};
    const evidence=`${winner.unitsPurchased} purchased unit${winner.unitsPurchased===1?"":"s"} across ${winner.orders} recorded transaction${winner.orders===1?"":"s"} in the last ${purchase.days} days`;
    if(!source||!source.artworkHash||!source.design){
      return {...base,kind:"research" as const,catalogCoverage:"Product imagery has not been analyzed for this purchased listing.",
        whyNow:evidence,researchQuestion:"Inspect this exact purchased product and its existing formats before proposing a related test."};
    }
    const retained=characteristic(source.design);
    if(!retained){
      return {...base,kind:"research" as const,catalogCoverage:"The analyzed image does not identify a specific characteristic safe to carry forward.",
        whyNow:evidence,researchQuestion:"Identify the visible motif, material, message, or construction that makes this exact product distinctive."};
    }
    if(source.state!=="active"){
      return {...base,kind:"availability-review" as const,retainedCharacteristic:retained,
        catalogCoverage:`This purchased listing is ${source.state||"unavailable"}.`,
        whyNow:evidence,researchQuestion:"Check whether this exact product can be replenished. If it is unique, identify a repeatable characteristic or obtainable sourcing direction."};
    }
    const sourceFamily=family(source.productFamily);
    const supported=(peers[sourceFamily]??[]).find(target=>activeFormats.has(target));
    if(!supported){
      return {...base,kind:"research" as const,retainedCharacteristic:retained,
        catalogCoverage:"No compatible additional format is established in the active catalog.",
        whyNow:evidence,researchQuestion:"Review same-format variations and confirm which changes are feasible before testing a new material or format."};
    }
    const existing=listings.find(row=>row.listingId!==source.listingId
      &&row.artworkHash===source.artworkHash&&family(row.productFamily)===supported);
    const label=labels[supported]??supported;
    if(existing){
      return {...base,kind:"already-offered" as const,retainedCharacteristic:retained,
        catalogCoverage:`This exact artwork is already listed on a ${label} (${existing.state||"state unknown"}).`,
        whyNow:evidence,relatedListingId:existing.listingId,
        researchQuestion:existing.state==="active"
          ?"Review that listing's dated sales and visibility before making another version."
          :"Check whether the existing listing can be returned to sale before creating a duplicate."};
    }
    return {...base,kind:"test" as const,retainedCharacteristic:retained,
      proposedChange:`Test this exact artwork on a ${label}, a format already active in your shop.`,
      catalogCoverage:`We have not found this exact artwork on a ${label} in the artwork-linked catalog.`,
      whyNow:evidence, researchQuestion:null};
  });
}
