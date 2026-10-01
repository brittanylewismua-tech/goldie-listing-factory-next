import type {VisualPatternSource} from "./shop-map-visual-patterns";

export type WinnerDna={
  basis:"sales-90"|"sales-lifetime";
  sellingArtworks:number;
  traits:Array<{label:string;sellingArtworks:number;customerPercent:number;catalogPercent:number;listingIds:number[]}>;
};

const clean=(value:string)=>String(value||"").trim().replace(/\s+/g," ");
const usable=(value:string)=>value.length>=3&&value.length<=55&&!/^(none|unknown|other|n\/a|not applicable)$/i.test(value);

function traitsOf(design:VisualPatternSource["design"]){
  const traits=new Set<string>();
  const add=(prefix:string,value:string)=>{
    const v=clean(value);
    if(usable(v))traits.add(`${prefix}: ${v}`);
  };
  add("Tone",design.tone);
  add("Composition",design.composition);
  add("Illustration",design.illustrationCategory);
  for(const value of (design.typography??[]).slice(0,2))add("Typography",value);
  const words=(design.wording??[]).join(" ").trim().split(/\s+/).filter(Boolean).length;
  if(words>=2&&words<=6)traits.add("Short visible wording");
  const ratio=Number(design.textToArtRatio);
  if(Number.isFinite(ratio)&&ratio>=0&&ratio<=1){
    if(ratio>=.7)traits.add("Text-led layout");
    else if(ratio<=.3)traits.add("Illustration-led layout");
  }
  return traits;
}

export function winnerDnaFrom(rows:VisualPatternSource[]):WinnerDna|null{
  const recent=rows.reduce((sum,row)=>sum+Math.max(0,row.sales90),0);
  const lifetime=rows.reduce((sum,row)=>sum+Math.max(0,row.lifetimeSales),0);
  const basis=recent>0?"sales-90":lifetime>0?"sales-lifetime":null;
  if(!basis)return null;
  const byArtwork=new Map<string,{signal:number;active:boolean;design:VisualPatternSource["design"];listingIds:Set<number>}>();
  for(const row of rows){
    const held=byArtwork.get(row.artworkHash)??{signal:0,active:false,design:row.design,listingIds:new Set<number>()};
    held.signal+=Math.max(0,basis==="sales-90"?row.sales90:row.lifetimeSales);
    held.active=held.active||row.state==="active";
    held.listingIds.add(row.listingId);
    byArtwork.set(row.artworkHash,held);
  }
  const ranked=[...byArtwork.values()].filter(row=>row.signal>0)
    .sort((a,b)=>b.signal-a.signal).slice(0,5);
  if(ranked.length<2)return null;
  const winnerSignal=ranked.reduce((sum,row)=>sum+row.signal,0);
  const active=[...byArtwork.values()].filter(row=>row.active);
  const catalogTotal=Math.max(1,active.length);
  const candidate=new Map<string,{signal:number;count:number;activeCount:number;listingIds:Set<number>}>();
  for(const row of active){
    for(const label of traitsOf(row.design)){
      const held=candidate.get(label)??{signal:0,count:0,activeCount:0,listingIds:new Set<number>()};
      held.activeCount+=1;candidate.set(label,held);
    }
  }
  for(const row of ranked){
    for(const label of traitsOf(row.design)){
      const held=candidate.get(label)??{signal:0,count:0,activeCount:0,listingIds:new Set<number>()};
      held.signal+=row.signal;held.count+=1;
      for(const id of row.listingIds)held.listingIds.add(id);
      candidate.set(label,held);
    }
  }
  const traits=[...candidate.entries()].flatMap(([label,row])=>{
    const customer=row.signal/winnerSignal;
    const catalog=row.activeCount/catalogTotal;
    if(row.count<2||customer<.6||customer-catalog<.08)return [];
    return [{label,sellingArtworks:row.count,customerPercent:Math.round(customer*100),
      catalogPercent:Math.round(catalog*100),listingIds:[...row.listingIds].sort((a,b)=>a-b),signal:row.signal}];
  }).sort((a,b)=>b.signal-a.signal||b.sellingArtworks-a.sellingArtworks)
    .slice(0,3).map(({signal,...rest})=>rest);
  return traits.length?{basis,sellingArtworks:ranked.length,traits}:null;
}
