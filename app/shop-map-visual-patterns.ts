export type VisualPatternSource = {
  listingId:number;
  artworkHash:string;
  sales90:number;
  lifetimeSales:number;
  favorites:number|null;
  design:{
    wording:string[];
    illustrationCategory:string;
    audienceCues:string[];
    recipientCues:string[];
    occasionCues:string[];
    tone:string;
    composition:string;
  };
};

export type VisualWinningPattern={
  rank:number;
  key:string;
  label:string;
  customerPercent:number;
  catalogPercent:number;
  gapPoints:number;
  lift:number;
  artworkCount:number;
  listingIds:number[];
};

const clean=(value:string)=>String(value||"").toLowerCase()
  .replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ").trim();
const title=(value:string)=>value.split(" ").map(word=>word?word[0].toUpperCase()+word.slice(1):word).join(" ");
const GENERIC=new Set(["feminist","feminism","girl power","women's rights","womens rights","political","politics"]);

function concepts(source:VisualPatternSource){
  const out=new Map<string,number>();
  const add=(value:string,quality:number)=>{
    const key=clean(value);
    if(!key||GENERIC.has(key))return;
    out.set(key,Math.max(quality,out.get(key)??0));
  };
  const d=source.design;
  for(const line of d.wording){
    const value=clean(line);
    if(value.split(" ").length>=2)add(value,3);
  }
  for(const value of [...d.audienceCues,...d.recipientCues,...d.occasionCues]){
    const normalized=clean(value);
    if(normalized.length>=4)add(normalized,2);
  }
  const illustration=clean(d.illustrationCategory);
  if(illustration&&illustration!=="none"&&illustration!=="text"&&illustration!=="typography")add(illustration,1);
  return out;
}

export function discoverVisualWinningPatterns(rows:VisualPatternSource[]){
  const recent=rows.reduce((sum,row)=>sum+Math.max(0,row.sales90),0);
  const lifetime=rows.reduce((sum,row)=>sum+Math.max(0,row.lifetimeSales),0);
  const favorites=rows.reduce((sum,row)=>sum+Math.max(0,row.favorites??0),0);
  const basis=recent>0?"sales-90":lifetime>0?"sales-lifetime":favorites>0?"favorites":"none";
  const signalOf=(row:VisualPatternSource)=>basis==="sales-90"?Math.max(0,row.sales90)
    :basis==="sales-lifetime"?Math.max(0,row.lifetimeSales)
    :basis==="favorites"?Math.max(0,row.favorites??0):0;

  const artwork=new Map<string,{signal:number;listingIds:Set<number>;concepts:Map<string,number>}>();
  for(const row of rows){
    const held=artwork.get(row.artworkHash)??{signal:0,listingIds:new Set<number>(),concepts:new Map<string,number>()};
    held.signal+=signalOf(row);
    held.listingIds.add(row.listingId);
    for(const [concept,quality] of concepts(row))
      held.concepts.set(concept,Math.max(quality,held.concepts.get(concept)??0));
    artwork.set(row.artworkHash,held);
  }
  const totalSignal=[...artwork.values()].reduce((sum,row)=>sum+row.signal,0);
  const artworkTotal=Math.max(1,artwork.size);
  if(!totalSignal)return {basis,totalSignal:0,patterns:[],coverageArtworks:artwork.size};

  const byConcept=new Map<string,{artworks:Set<string>;signal:number;listingIds:Set<number>;quality:number}>();
  for(const [hash,row] of artwork){
    for(const [concept,quality] of row.concepts){
      const held=byConcept.get(concept)??{artworks:new Set<string>(),signal:0,listingIds:new Set<number>(),quality:0};
      held.artworks.add(hash);
      held.signal+=row.signal;
      held.quality=Math.max(held.quality,quality);
      for(const id of row.listingIds)held.listingIds.add(id);
      byConcept.set(concept,held);
    }
  }

  const scored=[...byConcept.entries()].flatMap(([key,row])=>{
    const customer=row.signal/totalSignal;
    const catalog=row.artworks.size/artworkTotal;
    const lift=customer/Math.max(.01,catalog);
    const gap=customer-catalog;
    /*
      Repeated visual concepts are normal pattern evidence. One artwork may
      also be enough when it is a genuine mega-winner: if a single design owns
      at least a third of customer response, hiding it because no second design
      repeats the concept would understate exactly what customers are rewarding.
    */
    const megaWinner=row.artworks.size===1&&artworkTotal>1&&customer>=.33;
    if(row.artworks.size<2&&!megaWinner)return [];
    if(customer<.08)return [];
    if(!megaWinner&&lift<1.15&&gap<.04)return [];
    const score=customer*Math.max(1,lift)*(1-catalog*.45)*(1+row.quality*.04);
    return [{key,row,customer,catalog,lift,gap,score}];
  }).sort((a,b)=>b.score-a.score||b.customer-a.customer||b.row.quality-a.row.quality||a.key.localeCompare(b.key));

  const chosen:typeof scored=[];
  for(const candidate of scored){
    const duplicate=chosen.some(existing=>{
      const a=new Set(candidate.row.artworks),b=new Set(existing.row.artworks);
      let same=0;for(const hash of a)if(b.has(hash))same+=1;
      return same/Math.max(1,Math.min(a.size,b.size))>=.8;
    });
    if(duplicate)continue;
    chosen.push(candidate);
    if(chosen.length>=5)break;
  }

  return {
    basis,totalSignal,coverageArtworks:artwork.size,
    patterns:chosen.map((x,index):VisualWinningPattern=>({
      rank:index+1,key:x.key,label:title(x.key),
      customerPercent:Math.round(x.customer*100),
      catalogPercent:Math.round(x.catalog*100),
      gapPoints:Math.round(x.gap*100),
      lift:Number(x.lift.toFixed(1)),
      artworkCount:x.row.artworks.size,
      listingIds:[...x.row.listingIds],
    })),
  };
}
