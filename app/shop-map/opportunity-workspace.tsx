"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {PurchasePriority,PurchasePriorityMap} from "@/app/shop-map-purchase-priorities";
import type {ProductDirection} from "@/app/shop-map-product-expansion";
import type {ShopFinding} from "@/app/shop-map-opportunity-discovery";
import type {CatalogAction} from "@/app/shop-map-actions";
import type {WinningPatternMap} from "@/app/shop-map-patterns";
import type {ArtworkMarketProof} from "@/app/shop-map-artwork-actions";
import {shortLabel} from "@/app/design-reach";
import {productFamily} from "@/app/product-type-utils";
import styles from "./opportunity-workspace.module.css";

type CatalogListing={listingId:number;title:string;state:string;family:string;imageUrl:string;
  artworkHash:string;sold90:number|null;views:number|null;favorites:number|null};
export type OwnReviewInsight={listingId:number;review:string;rating:number|null;createdAt:number};
type PublicComparison={listingId:number;title:string;url:string;imageUrl:string;price:string|null;reviewCount:number;latestReviewAt:number;difference:string;reviewExcerpt:string|null;observedAt:number};
type PublicComparisonResult={status:string;query?:string;comparisons:PublicComparison[];checkedAt?:number};
type Kind="build"|"improve"|"restore";
type Detail={id:string;kind:Kind;title:string;brief:string;sourceId?:number;imageUrl?:string;comparisonImageUrl?:string;buildBrief?:string;
  sources:Array<{label:string;url?:string}>;checks:string[];relatedId?:number};
const listingUrl=(id:number)=>`https://www.etsy.com/listing/${id}`;
const pct=(n:number)=>n>0&&n<.005?"<1%":`${Math.round(n*100)}%`;

function directionDetail(row:PurchasePriority,direction:ProductDirection):Detail|null{
  if(direction.kind==="already-offered"&&direction.relatedListingId)return {
    id:`existing-${row.listingId}`,kind:"improve",title:`Compare the existing ${direction.targetFormat||"version"}`,
    brief:direction.catalogCoverage,
    sourceId:row.listingId,imageUrl:row.imageUrl,relatedId:direction.relatedListingId,
    sources:[{label:"Purchased product",url:listingUrl(row.listingId)},
      {label:"Existing version",url:listingUrl(direction.relatedListingId)}],
    checks:["Compare the real product images, dates, availability, options and prices.",
      "Check comparable visits before interpreting a purchase difference.",
      direction.researchQuestion||"Review the existing version before creating another."]};
  if(direction.kind==="availability-review")return {
    id:`availability-${row.listingId}`,kind:"restore",title:"Check whether this product can return",
    brief:direction.catalogCoverage,sourceId:row.listingId,imageUrl:row.imageUrl,
    sources:[{label:"Purchased product",url:listingUrl(row.listingId)}],
    checks:[direction.researchQuestion||"Confirm sourcing, stock and production feasibility.",
      "For a unique handmade product, carry forward a repeatable characteristic instead of promising an identical item."]};
  if(direction.kind==="test"&&direction.proposedChange)return {
    id:`test-${row.listingId}`,kind:"build",title:direction.proposedChange,
    brief:direction.retainedCharacteristic?`Carry forward ${direction.retainedCharacteristic}.`:direction.whyNow,
    sourceId:row.listingId,imageUrl:row.imageUrl,
    buildBrief:`Keep ${direction.retainedCharacteristic||"the verified product characteristic"}. Change: ${direction.proposedChange} Verify the existing catalog and production fit first.`,
    sources:[{label:"Purchased product",url:listingUrl(row.listingId)}],
    checks:[direction.catalogCoverage,"Confirm print area, materials, production cost and buyer purpose before building."]};
  return null;
}
function findingDetail(finding:ShopFinding):Detail{
  const kind:Kind=finding.kind==="restore"?"restore":finding.kind==="emerging"?"build":"improve";
  return {id:finding.id,kind,title:finding.direction,brief:finding.evidence,
    sourceId:finding.listingIds[0],imageUrl:finding.imageUrl,
    relatedId:finding.kind==="compare"?finding.listingIds[1]:undefined,
    sources:finding.listingIds.slice(0,6).map((id,index)=>({label:index?"Related product":"Source product",url:listingUrl(id)})),
    checks:[finding.detail]};
}
function actionDetail(action:CatalogAction,imageUrl?:string):Detail{
  const kind:Kind=/inactive|unavailable|sold out/i.test(action.headline)?"restore":/emerging/i.test(action.headline)?"build":"improve";
  return {id:`action-${action.listingId}`,kind,title:`${action.headline}: ${shortLabel(action.title)}`,brief:action.fact,
    sourceId:action.listingId,imageUrl,sources:[{label:"Source product",url:listingUrl(action.listingId)}],
    checks:[action.evidence,action.nextStep]};
}
function peerDetail(row:PurchasePriority,peer:CatalogListing):Detail{
  const peerSales=peer.sold90===null?"Purchase source unavailable":`${peer.sold90} purchased in 90 days`;
  return {id:`peer-${row.listingId}-${peer.listingId}`,kind:peer.state==="active"?"improve":"restore",
    title:peer.state==="active"?`Compare the existing ${peer.family||"version"}`:"Review the unavailable version",
    brief:`This artwork is already listed as ${shortLabel(peer.title)}. ${peerSales}.`,
    sourceId:row.listingId,imageUrl:row.imageUrl,comparisonImageUrl:peer.imageUrl,relatedId:peer.listingId,
    sources:[{label:"Selected product",url:listingUrl(row.listingId)},
      {label:"Existing version",url:listingUrl(peer.listingId)}],
    checks:["The catalog links these listings by exact artwork identity.",
      "Compare product photos, options, price, age and availability before choosing a test.",
      "The shown purchase counts do not establish a conversion difference without comparable traffic."]};
}
function relatedDetail(source:PurchasePriority,own:CatalogListing,peer:CatalogListing,patternLabel:string):Detail{
  return {id:`related-${own.listingId}-${peer.listingId}`,kind:"improve",
    title:`Compare related ${own.family||"product"} and ${peer.family||"product"} offers`,
    brief:`Both appear in the “${patternLabel}” catalog context; ${own.sold90} and ${peer.sold90} purchased in 90 days.`,
    sourceId:source.listingId,imageUrl:own.imageUrl,comparisonImageUrl:peer.imageUrl,relatedId:peer.listingId,
    sources:[{label:"Your product",url:listingUrl(own.listingId)},{label:"Related product",url:listingUrl(peer.listingId)}],
    checks:["This relationship comes from shared catalog wording, not confirmed visual similarity.",
      "Compare the actual artwork, buyer purpose, options, age, price, photos and availability.",
      "Purchase totals alone cannot explain which difference caused the response. Choose one observable difference to test."]};
}
function marketDetail(row:PurchasePriority,proof:ArtworkMarketProof,peer:NonNullable<ArtworkMarketProof["listings"]>[number]):Detail{
  return {id:`market-${row.listingId}-${peer.listingId}`,kind:"improve",title:"Compare a related Etsy product",
    brief:`A product in the saved “${proof.phrase}” watch has dated public activity. Inspect the actual products before choosing an original test.`,
    sourceId:row.listingId,imageUrl:row.imageUrl,comparisonImageUrl:peer.imageUrl,relatedId:peer.listingId,
    sources:[{label:"Your product",url:listingUrl(row.listingId)},{label:"Etsy comparison",url:peer.etsyUrl}],
    checks:[`Matched product format: ${productFamily(peer.title)||"needs review"}.`,
      `${peer.observedUnits30} observed stock decreases as of ${new Date(peer.confirmedAt*1000).toLocaleDateString()}; these are not confirmed purchases.`,
      `${peer.reviewsOnThisListing} public reviews on this listing; read their dates and wording before treating them as buyer evidence.`,
      "Compare buyer purpose, options, material, price and imagery. A difference is a test hypothesis, not proof of why another product sold."]};
}

function publicComparisonDetail(row:PurchasePriority,peer:PublicComparison,query:string):Detail{
  return {id:`public-${row.listingId}-${peer.listingId}`,kind:"improve",title:`Compare ${shortLabel(peer.title)}`,
    brief:peer.difference,sourceId:row.listingId,imageUrl:row.imageUrl,comparisonImageUrl:peer.imageUrl,relatedId:peer.listingId,
    sources:[{label:"Your product",url:listingUrl(row.listingId)},{label:"Etsy comparison",url:peer.url}],
    checks:[`${peer.reviewCount} public listing reviews; a sampled review is dated ${new Date(peer.latestReviewAt*1000).toLocaleDateString()}. Reviews are evidence of reviewed purchases, not a sales total.`,
      peer.price?`Comparison price observed: ${peer.price}. Check your own current price and options before drawing a conclusion.`:"Comparison price was unavailable.",
      peer.reviewExcerpt?`One public review says: “${peer.reviewExcerpt}”`:"Read the public reviews for buyer context.",
      `Search basis: ${query}. Compare actual product images, purpose, options and materials before testing an original version.`]};
}

export function OpportunityWorkspace({map,directions=[],findings=[],actions=[],patterns,catalogPatterns,marketProof=[],reviews=[],
  analysisFailed=false,onRetry}: {map:PurchasePriorityMap;directions?:ProductDirection[];findings?:ShopFinding[];
  actions?:CatalogAction[];patterns?:WinningPatternMap;catalogPatterns?:WinningPatternMap;marketProof?:ArtworkMarketProof[];
  reviews?:OwnReviewInsight[];analysisFailed?:boolean;onRetry?:()=>void}){
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [catalog,setCatalog]=useState<CatalogListing[]>([]);
  const [publicComparisons,setPublicComparisons]=useState<Record<number,PublicComparisonResult>>({});
  const requestedComparisons=useRef(new Set<number>());
  const [catalogState,setCatalogState]=useState<"loading"|"available"|"unavailable">("loading");
  const [retry,setRetry]=useState(0);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [expanded,setExpanded]=useState<Kind[]>(["build"]);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{setSelectedId(null)},[map.days]);
  useEffect(()=>{let cancelled=false;setCatalogState("loading");
    void fetch("/api/shop-map/my-listings",{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("Catalog unavailable");
      const data=await response.json() as {listings?:CatalogListing[];sources?:{catalog:string;sales:string}};
      if(data.sources?.catalog!=="available"||data.sources?.sales!=="available")throw Error("Catalog incomplete");
      return data.listings??[];
    }).then(rows=>{if(!cancelled){setCatalog(rows);setCatalogState("available")}})
      .catch(()=>{if(!cancelled)setCatalogState("unavailable")});
    return()=>{cancelled=true};
  },[retry]);
  const featured=useMemo(()=>map.listings.slice(0,10),[map.listings]);
  const selected=featured.find(row=>row.listingId===selectedId)??featured[0];
  const selectedIndex=selected?featured.findIndex(row=>row.listingId===selected.listingId):-1;
  const patternContext=map.days===90&&patterns?.patterns.length?patterns:catalogPatterns;
  useEffect(()=>{if(!selected?.listingId||requestedComparisons.current.has(selected.listingId))return;
    const id=selected.listingId;requestedComparisons.current.add(id);
    setPublicComparisons(previous=>({...previous,[id]:{status:"loading",comparisons:[]}}));
    void fetch(`/api/shop-map/market-comparisons?listingId=${id}`,{method:"POST",cache:"no-store"})
      .then(async response=>{if(!response.ok)throw Error("Comparison unavailable");return response.json() as Promise<PublicComparisonResult>})
      .then(result=>setPublicComparisons(previous=>({...previous,[id]:result})))
      .catch(()=>setPublicComparisons(previous=>({...previous,[id]:{status:"unavailable",comparisons:[]}})));
  },[selected?.listingId]);
  const directionById=new Map(directions.map(row=>[row.listingId,row]));
  const allDetails:Detail[]=[];
  for(const finding of findings)allDetails.push(findingDetail(finding));
  for(const action of actions)if(!findings.some(item=>item.listingIds[0]===action.listingId)
    &&!allDetails.some(item=>item.sourceId===action.listingId&&item.kind==="restore"))
    allDetails.push(actionDetail(action,map.listings.find(row=>row.listingId===action.listingId)?.imageUrl));
  for(const row of map.listings){
    const direction=directionById.get(row.listingId);
    if(direction){const item=directionDetail(row,direction);if(item)allDetails.push(item)}
    const own=catalog.find(item=>item.listingId===row.listingId);
    if(own?.artworkHash)for(const peer of catalog.filter(item=>item.listingId!==row.listingId&&item.artworkHash===own.artworkHash))
      allDetails.push(peerDetail(row,peer));
  }
  if(patternContext?.basis==="sales-90"&&map.days===90&&catalogState==="available")for(const pattern of patternContext.patterns.slice(0,5)){
    const matched=catalog.filter(row=>pattern.listingIds.includes(row.listingId)
      &&row.imageUrl&&(row.sold90??0)>0);
    for(const own of matched.slice(0,5)){
      const source=map.listings.find(row=>row.listingId===own.listingId);
      if(!source||source.unitsPurchased<2)continue;
      const peer=matched.filter(row=>row.listingId!==own.listingId
        &&row.family.toLowerCase()!==own.family.toLowerCase())
        .sort((a,b)=>(b.sold90??0)-(a.sold90??0))[0];
      if(peer)allDetails.push(relatedDetail(source,own,peer,pattern.label));
    }
  }
  if(patterns&&map.days===90)for(const proof of marketProof){
    const pattern=patterns.patterns.find(row=>row.key===proof.patternKey);if(!pattern)continue;
    const own=map.listings.find(row=>pattern.listingIds.includes(row.listingId)&&row.imageUrl);
    if(!own)continue;
    const peer=proof.listings?.find(row=>row.imageUrl&&row.observedUnits30>0
      &&productFamily(row.title)===productFamily(own.title));
    if(peer)allDetails.push(marketDetail(own,proof,peer));
  }
  for(const row of map.listings){const result=publicComparisons[row.listingId];
    if(result?.status==="available")for(const peer of result.comparisons)allDetails.push(publicComparisonDetail(row,peer,result.query||"related product"));
  }
  const reviewIds=new Set(map.listings.map(row=>row.listingId));
  const requestPattern=/\\b(wish|could you|would love|please offer|option|size|color|colour|personaliz|customiz|material)\\b/i;
  const reviewCounts=new Map<number,number>();
  for(const review of reviews){
    if(!reviewIds.has(review.listingId)||!requestPattern.test(review.review))continue;
    const count=reviewCounts.get(review.listingId)??0;
    if(count>=2)continue;
    reviewCounts.set(review.listingId,count+1);
    const product=map.listings.find(row=>row.listingId===review.listingId)!;
    allDetails.push({
      id:`review-${review.listingId}-${review.createdAt}-${count}`,kind:"improve",title:"Read what a buyer said",
      brief:`“${review.review.trim().slice(0,190)}${review.review.trim().length>190?"…":""}”`,
      sourceId:review.listingId,imageUrl:product.imageUrl,
      sources:[{label:"Reviewed product",url:listingUrl(review.listingId)}],
      checks:[`Review dated ${new Date(review.createdAt*1000).toISOString().slice(0,10)}. This is one buyer’s wording, not a verified pattern.`,
        "Check whether it describes a specific option, use, objection or request before changing the product."]});
  }
  const unique=new Map<string,Detail>();
  for(const item of allDetails){
    const key=item.sourceId+":"+item.kind+":"+(item.relatedId||item.title.toLowerCase());
    const existing=unique.get(key);
    if(!existing){unique.set(key,item);continue}
    if(item.id.startsWith("public-")){unique.set(key,item);continue}
    if(item.comparisonImageUrl)unique.set(key,{...item,brief:existing.brief,
      checks:item.checks});
  }
  const details=[...unique.values()];
  const selectedPaths=selected?details.filter(item=>item.sourceId===selected.listingId).slice(0,6):[];
  const diagnosis=selectedPaths.some(item=>item.id.startsWith("peer-")||item.id.startsWith("existing-"))
    ?"This artwork is already on another product in your shop."
    :selectedPaths[0]?.brief||null;
  const groups:[Kind,string][]=[["build","Build on proven demand"],["improve","Improve an existing offer"],["restore","Recover or prepare"]];
  const open=(item:Detail)=>{setDetail(item);requestAnimationFrame(()=>dialog.current?.showModal())};
  const close=()=>{dialog.current?.close();setDetail(null)};
  const reviewItems=details.filter(item=>!selected||item.sourceId!==selected.listingId);
  const choice=(row:PurchasePriority,index:number)=><button key={row.listingId} type="button" className={styles.choice}
    aria-pressed={selected?.listingId===row.listingId} onClick={()=>setSelectedId(row.listingId)}>
    {row.imageUrl?<img src={row.imageUrl} alt="" width={66} height={66}/>:<span className={styles.noThumb} aria-hidden="true"/>}
    <span><b>{index+1}. {shortLabel(row.title)}</b><small>{row.unitsPurchased} purchased</small></span>
  </button>;
  return <section className={styles.workspace} aria-labelledby="oe-workspace-title">
    <div className={styles.heading}><div><h2 id="oe-workspace-title">Top listings in your shop</h2><p>These are the listings your customers are voting the most on.</p></div></div>
    {selected?<>
      <article className={styles.focus} aria-live="polite">
        <div className={styles.art}>{selected.imageUrl?<img src={selected.imageUrl} alt={selected.title} width={300} height={300}
          fetchPriority={selected.rank===1?"high":undefined}/>:<span>Listing image unavailable</span>}</div>
        <div className={styles.body}><div className={styles.pager} aria-label="Top listing navigation">
          <button type="button" aria-label="Previous top listing" disabled={selectedIndex===0}
            onClick={()=>setSelectedId(featured[selectedIndex-1].listingId)}>‹</button>
          <span>Listing {selectedIndex+1} of {featured.length}</span>
          <button type="button" aria-label="Next top listing" disabled={selectedIndex===featured.length-1}
            onClick={()=>setSelectedId(featured[selectedIndex+1].listingId)}>›</button>
        </div>
          <h3>{shortLabel(selected.title)}</h3>
          <div className={styles.vote}><strong>{selected.unitsPurchased}</strong><span>units purchased</span><i>·</i>
            <strong>{pct(selected.share)}</strong><span>{map.shareLabel.toLowerCase()}</span></div>
          {diagnosis?<p className={styles.interpret}>{diagnosis}</p>:null}
          {selectedPaths.length>0?<>
            <div className={styles.pathHead}><h4>Ideas and checks</h4></div>
            <div className={styles.paths}>{selectedPaths.slice(0,3).map(item=><button type="button" key={item.id} className={styles.path}
              onClick={()=>open(item)}><span><strong>{item.title}</strong></span><span aria-hidden="true">›</span></button>)}</div>
            {selectedPaths.length>3?<details className={styles.morePaths}><summary>More for this listing ({selectedPaths.length-3})</summary>
              <div className={styles.paths}>{selectedPaths.slice(3).map(item=><button type="button" key={item.id} className={styles.path}
                onClick={()=>open(item)}><span><strong>{item.title}</strong></span><span aria-hidden="true">›</span></button>)}</div>
            </details>:null}
            {publicComparisons[selected.listingId]?.status==="loading"?<p className={styles.localState} role="status">Checking related Etsy listings…</p>:null}
            {["unavailable","no-reviewed-match","insufficient-context"].includes(publicComparisons[selected.listingId]?.status||"")?<p className={styles.localState} role="status">No reviewed Etsy match for this listing.</p>:null}
          </>:<div className={styles.localState} role="status">
            {analysisFailed?"Product analysis could not load.":catalogState==="loading"?"Checking your listings…":
              catalogState==="unavailable"?"Couldn’t check your listings.":
              publicComparisons[selected.listingId]?.status==="loading"?"Checking related Etsy listings…":
              publicComparisons[selected.listingId]?.status==="unavailable"?"Couldn’t check Etsy comparisons right now.":
              "No specific next step is verified for this listing yet."}
            {analysisFailed&&onRetry?<button type="button" onClick={onRetry}>Retry analysis</button>:null}
            {catalogState==="unavailable"?<button type="button" onClick={()=>setRetry(value=>value+1)}>Retry catalog</button>:null}
          </div>}
        </div>
      </article>
      <div className={styles.listingChoices} role="group" aria-label="Top purchased listings">
        <div className={styles.selector}>{featured.slice(0,3).map(choice)}</div>
        {featured.length>3?<details className={styles.more}><summary>View listings 4–{featured.length}</summary>
          <div className={styles.moreChoices}>{featured.slice(3).map((row,index)=>choice(row,index+3))}</div>
        </details>:null}
      </div>
    </>:<p className={styles.localState}>No purchases in this period. Try the other period to see purchased products.</p>}
    {patternContext?.basis==="sales-90"&&patternContext.patterns.length>0?<section className={styles.customer}>
      <div className={styles.sectionHead}><h2>What customers are choosing</h2><span>Last {map.days} days</span></div>
      <div className={styles.patterns}>{patternContext.patterns.slice(0,3).map(row=><div key={row.key} className={styles.pattern}>
        <strong>{row.label}</strong><span><b>{row.customerPercent}%</b> of purchased units</span>
        <small>{row.catalogListings} related listing{row.catalogListings===1?"":"s"} in your shop</small>
      </div>)}</div>
      <p className={styles.patternNote}>{map.days===90&&patterns?.patterns.length?"Based on analyzed product images.":"Based on listing titles and tags."} Themes may overlap.</p>
    </section>:null}
    {reviewItems.length>0?<section className={styles.reviewSection}>
      <div className={styles.sectionHead}><h2>Review these</h2><span>{reviewItems.length} shop finding{reviewItems.length===1?"":"s"}</span></div>
      <div className={styles.reviewGrid}>{reviewItems.slice(0,3).map(item=><button type="button" key={item.id} className={styles.reviewCard} onClick={()=>open(item)}>
        {item.imageUrl?<img src={item.imageUrl} alt="" width={64} height={64}/>:null}
        <span><small>{item.kind==="build"?"BUILD":item.kind==="restore"?"RECOVER":"COMPARE"}</small>
          <strong>{item.title}</strong><em>{item.brief}</em></span>
      </button>)}</div>
    </section>:null}
    {reviewItems.length>3?<details className={styles.deeper}><summary>Go deeper <span>{reviewItems.length-3} more findings</span></summary>
      <div className={styles.groups}>{groups.map(([kind,label])=>{
        const items=reviewItems.slice(3).filter(item=>item.kind===kind);
        if(!items.length)return null;
        return <details key={kind} className={styles.group} open={expanded.includes(kind)}
          onToggle={event=>{const isOpen=event.currentTarget.open;setExpanded(previous=>
            isOpen?previous.includes(kind)?previous:[...previous,kind]:previous.filter(item=>item!==kind))}}>
          <summary><span>{label}<small>{items.length} finding{items.length===1?"":"s"}</small></span><span aria-hidden="true">⌄</span></summary>
          <div>{items.map(item=><button type="button" key={item.id} className={styles.finding} onClick={()=>open(item)}>
            {item.imageUrl?<img src={item.imageUrl} alt="" width={53} height={53}/>:<span className={styles.noThumb} aria-hidden="true"/>}
            <span><strong>{item.title}</strong><small>{item.brief}</small></span><span aria-hidden="true">›</span>
          </button>)}</div>
        </details>})}</div>
    </details>:null}
    <dialog ref={dialog} className={styles.dialog} aria-label={detail?.title||"Opportunity evidence"}
      onClose={()=>setDetail(null)} onClick={event=>{if(event.target===dialog.current)close()}}>
      {detail?<div className={styles.dialogInner}><div className={styles.dialogTop}><span>{detail.kind==="build"?"BUILD":detail.kind==="restore"?"RECOVER":"COMPARE"}</span>
        <button type="button" onClick={close} aria-label="Close details">×</button></div>
        <h2>{detail.title}</h2><p>{detail.brief}</p>
        {detail.comparisonImageUrl&&detail.imageUrl?<div className={styles.comparison}><figure><img src={detail.imageUrl} alt="Your product" width={220} height={190}/><figcaption>Your product</figcaption></figure><figure><img src={detail.comparisonImageUrl} alt="Comparison product" width={220} height={190}/><figcaption>Comparison product</figcaption></figure></div>:null}
        {detail.buildBrief?<div className={styles.buildBrief}><h3>Build brief</h3><p>{detail.buildBrief}</p></div>:null}
        <div className={styles.sources}>{detail.sources.map((source,index)=>source.url
          ?<a key={index} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
          :<span key={index}>{source.label}</span>)}</div>
        <h3>Evidence and next checks</h3><ul>{detail.checks.map((point,index)=><li key={index}>{point}</li>)}</ul>
      </div>:null}
    </dialog>
  </section>;
}
