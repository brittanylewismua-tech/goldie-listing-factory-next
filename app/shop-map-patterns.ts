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
const titleCase=(text:string)=>text.split(" ").map(word=>word?word[0].toUpperCase()+word.slice(1):word).join(" ");

function candidates(row:PatternListingInput){
  const found=new Set<string>();
  const titleWords=clean(row.title).split(" ").filter(Boolean);
  for(let size=2;size<=3;size+=1){
    for(let at=0;at+size<=titleWords.length;at+=1){
      const words=titleWords.slice(at,at+size);
      if(!meaningful(words))continue;
      const trimmed=words.filter(word=>!PRODUCT.has(stem(word)));
      if(trimmed.length<2||!meaningful(trimmed))continue;
      found.add(trimmed.join(" "));
    }
  }
  for(const raw of row.tags){
    const words=clean(raw).split(" ").filter(Boolean).filter(word=>!PRODUCT.has(stem(word)));
    if(words.length>=2&&words.length<=5&&meaningful(words))found.add(words.join(" "));
  }
  const dimensions=dimensionsFor(row);
  const theme=clean(dimensions.messageTheme);
  if(theme&&theme.split(" ").length>=2)found.add(theme);
  return found;
}

const overlap=(a:Set<number>,b:Set<number>)=>{
  let both=0;
  for(const id of a)if(b.has(id))both+=1;
  return both/Math.max(1,Math.min(a.size,b.size));
};

export function discoverWinningPatterns(rows:PatternListingInput[]):WinningPatternMap{
  const recent=rows.reduce((sum,row)=>sum+Math.max(0,row.sales90),0);
  const lifetime=rows.reduce((sum,row)=>sum+Math.max(0,row.lifetimeSales),0);
  const favorites=rows.reduce((sum,row)=>sum+Math.max(0,row.favorites??0),0);
  const basis=recent>0?"sales-90":lifetime>0?"sales-lifetime":favorites>0?"favorites":"none";
  const signalOf=(row:PatternListingInput)=>basis==="sales-90"?Math.max(0,row.sales90)
    :basis==="sales-lifetime"?Math.max(0,row.lifetimeSales)
    :basis==="favorites"?Math.max(0,row.favorites??0):0;
  const totalSignal=rows.reduce((sum,row)=>sum+signalOf(row),0);
  const active=rows.filter(row=>row.state==="active");
  const activeTotal=Math.max(1,active.length);

  const rankedListings=rows.map(row=>({row,signal:signalOf(row)})).filter(x=>x.signal>0)
    .sort((a,b)=>b.signal-a.signal||a.row.listingId-b.row.listingId)
    .slice(0,5).map((x,index)=>({rank:index+1,listingId:x.row.listingId,title:x.row.title,
      imageUrl:x.row.imageUrl,signal:x.signal,attentionPercent:totalSignal?Math.round(x.signal/totalSignal*100):0}));

  if(!totalSignal)return {basis,basisLabel:"not enough customer response yet",totalSignal:0,patterns:[],listings:[]};

  /*
    PHRASE ORDER IS NOT A NEW IDEA.

    "girl power" and "power girl" used to become separate candidates. That let
    a broad shop-wide phrase be correctly suppressed while a reordered variant
    slipped back in as a fake opportunity. Patterns are therefore grouped by
    their normalized token set before any lift math happens.
  */
  const conceptKey=(phrase:string)=>[...new Set(clean(phrase).split(" ")
    .map(stem).filter(Boolean))].sort().join(" ");
  const byConcept=new Map<string,{ids:Set<number>;variants:Map<string,number>}>();
  const rowById=new Map(rows.map(row=>[row.listingId,row]));
  for(const row of rows){
    for(const phrase of candidates(row)){
      const key=conceptKey(phrase);
      if(!key)continue;
      const held=byConcept.get(key)??{ids:new Set<number>(),variants:new Map<string,number>()};
      held.ids.add(row.listingId);
      held.variants.set(phrase,(held.variants.get(phrase)??0)+1);
      byConcept.set(key,held);
    }
  }

  const scored=[...byConcept.entries()].flatMap(([concept,group])=>{
    const ids=group.ids;
    const phrase=[...group.variants.entries()].sort((a,b)=>b[1]-a[1]
      || b[0].split(" ").length-a[0].split(" ").length
      || a[0].localeCompare(b[0]))[0]?.[0]??concept;
    if(ids.size<2)return [];
    let signal=0,sellingListings=0,catalogListings=0;
    for(const id of ids){
      const row=rowById.get(id);if(!row)continue;
      const value=signalOf(row);
      signal+=value;if(value>0)sellingListings+=1;
      if(row.state==="active")catalogListings+=1;
    }
    if(signal<=0||sellingListings<1||catalogListings<1)return [];
    const customerShare=signal/totalSignal;
    const catalogShare=catalogListings/activeTotal;
    const lift=customerShare/Math.max(.01,catalogShare);
    const gap=customerShare-catalogShare;
    // Shop-wide wallpaper is not an opportunity. It has to outperform how
    // common it already is in the catalog.
    if(lift<1.12&&gap<.04)return [];
    if(catalogShare>.55&&lift<1.4)return [];
    const specificity=Math.max(.2,1-catalogShare);
    const support=Math.min(1,Math.log2(sellingListings+1)/2);
    const score=(customerShare*Math.max(1,lift))*specificity*(.65+.35*support);
    return [{phrase,ids,signal,sellingListings,catalogListings,customerShare,catalogShare,lift,gap,score}];
  }).sort((a,b)=>b.score-a.score||b.customerShare-a.customerShare||b.phrase.length-a.phrase.length);

  const chosen:typeof scored=[];
  for(const candidate of scored){
    const tokens=new Set(conceptKey(candidate.phrase).split(" ").filter(Boolean));
    const duplicate=chosen.some(existing=>{
      const other=new Set(conceptKey(existing.phrase).split(" ").filter(Boolean));
      const common=[...tokens].filter(token=>other.has(token)).length;
      const tokenOverlap=common/Math.max(1,Math.min(tokens.size,other.size));
      return overlap(candidate.ids,existing.ids)>=.75&&(tokenOverlap>=.5||candidate.phrase.includes(existing.phrase)||existing.phrase.includes(candidate.phrase));
    });
    if(duplicate)continue;
    chosen.push(candidate);
    if(chosen.length>=5)break;
  }

  return {
    basis,
    basisLabel:basis==="sales-90"?"units sold in the last 90 days"
      :basis==="sales-lifetime"?"lifetime units sold"
      :"favorites (used because this shop has no recorded sales yet)",
    totalSignal,
    patterns:chosen.map((row,index)=>({
      rank:index+1,key:row.phrase,label:titleCase(row.phrase),
      customerPercent:Math.round(row.customerShare*100),
      catalogPercent:Math.round(row.catalogShare*100),
      gapPoints:Math.round(row.gap*100),
      lift:Number(row.lift.toFixed(1)),
      sellingListings:row.sellingListings,catalogListings:row.catalogListings,
      listingIds:[...row.ids],
    })),
    listings:rankedListings,
  };
}
