"use client";
import {useEffect,useRef,useState} from "react";
import type {ShopFinding} from "./shop-map-opportunity-discovery";
import type {CatalogAction} from "./shop-map-actions";
import type {WinningPatternMap} from "./shop-map-patterns";
import type {ArtworkMarketProof} from "./shop-map-artwork-actions";
import type {ReachListing} from "./design-reach";
import {shortLabel} from "./design-reach";
import {productFamily} from "./product-type-utils";

type Category="build"|"improve"|"restore";
type Link={label:string;url:string};
type Card={id:string;category:Category;tag:string;title:string;imageUrl?:string;
  evidence:string;direction:string;points:string[];links:Link[];
  pair?:{own:{image:string;url:string};other:{image:string;url:string}};
  source?:"shop"|"market";balance?:{catalog:number;customer:number}};
const listingUrl=(id:number)=>"https://www.etsy.com/listing/"+id;
const labelFor=(kind:ShopFinding["kind"]):Category=>
  kind==="emerging"?"build":kind==="restore"?"restore":"improve";

export function SiteOpportunities({findings,actions,map,marketProof,days,priorityIds}:{
  findings:ShopFinding[];actions:CatalogAction[];map:WinningPatternMap;
  marketProof:ArtworkMarketProof[];days:number;priorityIds:number[];
}){
  const [filter,setFilter]=useState<"all"|Category>("all");
  const [own,setOwn]=useState<ReachListing[]>([]);
  const [sourceError,setSourceError]=useState(false);
  const [retry,setRetry]=useState(0);
  const [selected,setSelected]=useState<Card|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(days!==90)return;
    let cancelled=false;
    void fetch("/api/shop-map/my-listings",{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)throw new Error("Catalog read failed");
        const body=await response.json() as {listings?:ReachListing[];sources?:{shop:string;catalog:string;sales:string}};
        if(body.sources?.catalog!=="available"||body.sources?.sales!=="available")throw new Error("Catalog coverage incomplete");
        return body.listings??[];
      })
      .then(rows=>{if(!cancelled){setOwn(rows);setSourceError(false);}})
      .catch(()=>{if(!cancelled)setSourceError(true);});
    return ()=>{cancelled=true;};
  },[days,retry]);
  const cards:Card[]=[];
  for(const row of findings){
    if(priorityIds.includes(row.listingIds[0]))continue;
    cards.push({
    id:row.id,category:labelFor(row.kind),tag:row.label,title:shortLabel(row.title),
    imageUrl:row.imageUrl||undefined,evidence:row.evidence,direction:row.direction,
    points:[row.detail],links:row.listingIds.slice(0,6).map((id,index)=>({
      label:index===0?"Source listing":"Related listing",url:listingUrl(id)
    })),source:"shop",
  });
  }
  if(days===90)for(const row of map.overbuilt??[])cards.push({
    id:"balance-"+row.key,category:"improve",tag:"CATALOG BALANCE",title:row.label,
    balance:{catalog:row.catalogPercent,customer:row.customerPercent},
    evidence:row.catalogPercent+"% of active designs · "+row.customerPercent+"% of "+(map.basis==="sales-90"?"90-day sales":"response"),
    direction:"Compare exposure and age before adding more.",
    points:["Count related active products and their dated purchases.","Check visits, availability, and listing age before interpreting the gap."],links:[],source:"shop",
  });
  if(days===90)for(const row of actions){
    if(findings.some(finding=>finding.listingIds[0]===row.listingId))continue;
    const restore=/inactive|unavailable|sold out/i.test(row.headline);
    const source=own.find(item=>item.listingId===row.listingId)??map.listings.find(item=>item.listingId===row.listingId);
    cards.push({id:"action-"+row.listingId,category:restore?"restore":"improve",tag:row.headline.toUpperCase(),
      title:shortLabel(row.title),imageUrl:source?.imageUrl,evidence:row.fact,direction:row.nextStep,
      points:[row.evidence],links:[{label:"Source listing",url:listingUrl(row.listingId)}],source:"shop"});
  }
  if(days===90)for(const proof of marketProof){
    const pattern=map.patterns.find(row=>row.key===proof.patternKey);
    if(!pattern)continue;
    const source=own.filter(row=>pattern.listingIds.includes(row.listingId)&&row.sold90>0&&row.imageUrl)
      .sort((a,b)=>b.sold90-a.sold90)[0];
    if(!source||!productFamily(source.title))continue;
    const peer=(proof.listings??[]).find(row=>row.imageUrl&&row.observedUnits30>0
      &&productFamily(row.title)===productFamily(source.title));
    if(!peer)continue;
    cards.push({id:"market-"+peer.listingId,category:"improve",tag:"ETSY PRODUCT EVIDENCE",
      title:shortLabel(source.title),imageUrl:source.imageUrl,
      evidence:peer.observedUnits30+" units of public activity observed for a related product on "+
        new Date(peer.confirmedAt*1000).toLocaleDateString()+".",
      direction:"Inspect both products and options before choosing a test.",
      points:["Matched through the saved "+proof.phrase+" watch and product format. Buyer purpose and materials still need inspection.",
        "The public activity may include inventory movement; it is not a confirmed competitor purchase count.",
        peer.priceCents!=null?"Observed listing price: "+new Intl.NumberFormat(undefined,{style:"currency",currency:peer.currency||"USD"}).format(peer.priceCents/100):""].filter(Boolean),
      links:[{label:"Your product",url:listingUrl(source.listingId)},{label:"Etsy comparison",url:peer.etsyUrl}],
      pair:{own:{image:source.imageUrl||"",url:listingUrl(source.listingId)},other:{image:peer.imageUrl,url:peer.etsyUrl}},
      source:"market"});
  }
  const shown=filter==="all"?cards:cards.filter(card=>card.category===filter);
  const open=(card:Card)=>{setSelected(card);requestAnimationFrame(()=>dialog.current?.showModal());};
  const close=()=>{dialog.current?.close();setSelected(null);};
  const method:Card={id:"method",category:"improve",tag:"EVIDENCE RULES",
    title:"A finding must earn its place",evidence:"Purchases set priority. Product and catalog evidence shape direction.",
    direction:"",points:["Check all relevant existing versions before proposing a build.",
      "Keep product images, options, dates, availability and purchases attached to the finding.",
      "Treat public Etsy listings as context; never claim another seller's private sales.",
      "When evidence is incomplete, show the precise check that is needed."],links:[]};
  return <section className="oe-site-section" aria-labelledby="oe-site-title">
    <div className="oe-site-opportunity-intro">
      <div><h2 id="oe-site-title">More opportunities</h2>
        <p>Findings from the full shop and relevant Etsy listings.</p></div>
      <div className="oe-site-filter" role="group" aria-label="Opportunity types">
        {([["all","All"],["build","Build out"],["improve","Improve"],["restore","Restore"]] as const)
          .map(([key,label])=><button key={key} type="button" aria-pressed={filter===key}
            onClick={()=>setFilter(key)}>{label}</button>)}
      </div>
    </div>
    <div className="oe-site-grid">
      {shown.map(card=><article className="oe-site-card" key={card.id} data-type={card.category}
        data-source={card.source}>
        <div className="oe-site-card-art">
          {card.balance?<div className="oe-site-balance" aria-label={card.balance.catalog+"% of active designs versus "+card.balance.customer+"% of customer response"}>
            <span className="oe-site-balance-catalog" style={{width:Math.max(5,Math.min(100,card.balance.catalog))+"%"}}/>
            <span className="oe-site-balance-customer" style={{width:Math.max(5,Math.min(100,card.balance.customer))+"%"}}/>
          </div>:card.pair?<div className="oe-site-pair">
            <a href={card.pair.own.url} target="_blank" rel="noopener noreferrer" aria-label="View your product">
              <img src={card.pair.own.image} alt="" width={66} height={66} loading="lazy"/></a>
            <a href={card.pair.other.url} target="_blank" rel="noopener noreferrer" aria-label="View Etsy comparison">
              <img src={card.pair.other.image} alt="" width={66} height={66} loading="lazy"/></a>
          </div>:card.imageUrl?<img src={card.imageUrl} alt="" width={87} height={87} loading="lazy"/>:
            <span className="oe-site-no-image">No photo</span>}
        </div>
        <div className="oe-site-card-body"><span className="oe-site-card-tag">{card.tag}</span>
          <h3>{card.title}</h3><p>{card.evidence}</p><strong>{card.direction}</strong>
          <button className="oe-site-link" type="button" onClick={()=>open(card)}>See evidence</button>
        </div>
      </article>)}
      {!shown.length?<p className="oe-site-empty">No {filter==="all"?"additional findings":filter==="build"?"build out findings":filter==="restore"?"restoration findings":"improvement findings"} in this view.</p>:null}
      {sourceError?<div className="oe-site-card oe-site-source-issue" role="status">
        <div className="oe-site-card-body"><span className="oe-site-card-tag">CATALOG COMPARISON</span>
          <h3>Comparison needs a retry</h3><p>The catalog or purchase source could not be checked.</p>
          <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry comparison</button></div></div>:null}
    </div>
    <div className="oe-site-evidence-band"><div><h2>How Goldie reaches a direction</h2>
      <p>Each finding compares actual products and purchase history. Relevant Etsy listings add market context when available; other sellers' private sales are never assumed.</p></div>
      <button type="button" onClick={()=>open(method)}>View evidence rules</button></div>
    <dialog ref={dialog} className="oe-site-dialog" onClose={()=>setSelected(null)}
      onClick={event=>{if(event.target===dialog.current)close();}}>
      {selected?<div className="oe-site-dialog-inner"><p className="oe-site-card-tag">{selected.tag}</p>
        <h2>{selected.title}</h2><p>{selected.evidence}</p>
        {selected.direction?<strong>{selected.direction}</strong>:null}
        <ul>{selected.points.map((point,index)=><li key={index}>{point}</li>)}</ul>
        <div className="oe-site-source-links">{selected.links.map((link,index)=><a key={index} href={link.url}
          target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
        <button type="button" onClick={close}>Close</button></div>:null}
    </dialog>
  </section>;
}
