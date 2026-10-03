"use client";
import {useEffect,useMemo,useState} from "react";
import s from "./opportunity-engine.module.css";
import {buildTopTen,readListing,familyStats,decode,shortName,buildNextMoves,styleBreakdown,reviewThemes,describe,
  type PeriodListing,type CatalogListing,type YearSale,type OwnReview,type Direction,type DesignRead,type NextMove} from "./opportunity-engine-model";

type Comparison={listingId:number;title:string;url:string;imageUrl:string;price:string|null;reviewCount:number;latestReviewAt:number;difference:string;reviewExcerpt:string|null};
type Similar={state:"idle"|"loading"|"done"|"failed";rows:Comparison[];note?:string};
type Data={period:PeriodListing[];catalog:CatalogListing[];year:YearSale[];reviews:OwnReview[];directions:Direction[];
  totalPeriod:number;refreshedAt:number|null};

const num=(value:number|null|undefined)=>value==null?"—":value.toLocaleString("en-US");
const dollars=(minor:number)=>"$"+Math.round(minor/100).toLocaleString("en-US");
const etsy=(id:number)=>`https://www.etsy.com/listing/${id}`;
const synced=(at:number|null)=>at?new Date(at*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null;
const bigImage=(url:string)=>url.replace("il_570xN","il_794xN");

async function json<T>(url:string):Promise<T>{
  const response=await fetch(url,{credentials:"same-origin"});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

export default function OpportunityEngine({days}:{days:30|90}){
  const [data,setData]=useState<Data|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [index,setIndex]=useState(0);
  const [similar,setSimilar]=useState<Record<number,Similar>>({});
  const [reads,setReads]=useState<Map<number,DesignRead>>(new Map());
  const [reading,setReading]=useState(false);
  const [filter,setFilter]=useState<"all"|NextMove["group"]>("all");
  const [open,setOpen]=useState<Set<string>>(new Set());

  useEffect(()=>{
    let live=true;setFailed(false);setIndex(0);
    void (async()=>{
      try{
        const [purchases,catalog,year,insights]=await Promise.all([
          json<{purchasePriorities?:{listings:PeriodListing[];totalUnits:number;refreshedAt:number|null}}>(`/api/shop-map/map?view=overview-purchases&days=${days}`),
          json<{listings?:CatalogListing[]}>(`/api/shop-map/my-listings`),
          json<{soldListings?:{listings:YearSale[]}}>(`/api/shop-map/map?view=sold&days=365`),
          json<{ownReviews?:OwnReview[];productDirections?:Direction[]}>(`/api/shop-map/map?view=overview-insights&days=${days}`).catch(()=>({ownReviews:[],productDirections:[]})),
        ]);
        if(!live)return;
        const map=purchases.purchasePriorities;
        setData({period:map?.listings??[],catalog:catalog.listings??[],year:year.soldListings?.listings??[],
          reviews:insights.ownReviews??[],directions:insights.productDirections??[],totalPeriod:map?.totalUnits??0,refreshedAt:map?.refreshedAt??null});
      }catch{if(live)setFailed(true)}
    })();
    return ()=>{live=false};
  },[days,attempt]);

  const top=useMemo(()=>data?buildTopTen(data.period,data.catalog,data.year):[],[data]);

  /* Read the printed design on the listings the page shows: the top ten first,
     then everything sold this year and the favorited listings moves point at. */
  const wantedIds=useMemo(()=>data?[...new Set([...top.map(row=>row.listingId),...data.year.map(row=>row.listingId),
    ...data.catalog.filter(row=>row.state==="active"&&(row.favorites??0)>=150).map(row=>row.listingId)])].slice(0,60):[],[data,top]);
  useEffect(()=>{
    if(!wantedIds.length)return;
    let live=true;
    void (async()=>{
      setReading(true);
      for(let round=0;round<6&&live;round++){
        const response=await fetch("/api/shop-map/listing-designs",{method:"POST",credentials:"same-origin",
          headers:{"Content-Type":"application/json"},body:JSON.stringify({listingIds:wantedIds})}).catch(()=>null);
        if(!response?.ok)break;
        const body=await response.json() as {reads:DesignRead[];pending:number;limited?:boolean};
        if(!live)return;
        setReads(prev=>{const next=new Map(prev);for(const item of body.reads)next.set(item.listingId,item);return next});
        if(!body.pending||body.limited)break;
      }
      if(live)setReading(false);
    })();
    return ()=>{live=false};
  },[wantedIds]);

  const families=useMemo(()=>data?familyStats(data.catalog,data.year):[],[data]);
  const totalYear=useMemo(()=>data?data.year.reduce((sum,row)=>sum+Number(row.sales||0),0):0,[data]);
  const month=new Date().getMonth()+1;
  const moves=useMemo(()=>data?buildNextMoves({top,catalog:data.catalog,year:data.year,reviews:data.reviews,reads,days,month}):[],[data,top,reads,days,month]);
  const style=useMemo(()=>data?styleBreakdown(data.year,reads):null,[data,reads]);
  const buyers=useMemo(()=>data?reviewThemes(data.reviews):null,[data]);
  const images=useMemo(()=>new Map((data?.catalog??[]).map(row=>[row.listingId,row.imageUrl])),[data]);

  if(failed)return <section className={`${s.state} oe-engine`} role="alert"><strong>The Opportunity Engine could not load.</strong>
    <button type="button" className={s.btnGhost} onClick={()=>{setData(null);setAttempt(value=>value+1)}}>Try again</button></section>;
  if(!data)return <section className={`${s.state} oe-engine`} role="status"><span className={s.spinner} aria-hidden="true"/>Reading your sales, favorites and reviews…</section>;
  if(!top.length)return <section className={`${s.state} oe-engine`}><strong>No listings to rank yet.</strong> Connect your shop and sync listings in Connections.</section>;

  const salesCount=top.filter(row=>row.basis==="sales").length;
  const row=top[Math.min(index,top.length-1)];
  const design=reads.get(row.listingId);
  const read=readListing(row,{days,reviews:data.reviews,directions:data.directions,families,totalYearUnits:totalYear,month});
  const sim=similar[row.listingId]??{state:"idle",rows:[]};
  const nameOf=(id:number,title:string)=>reads.get(id)?.name??shortName(title);
  const revenue=data.period.reduce((sum,item)=>sum+Number(item.productRevenueMinor||0),0);
  const activeCount=data.catalog.filter(item=>item.state==="active").length;
  const leadUnits=top[0]?.basis==="sales"?top[0].unitsPeriod:0;
  const tied=top.filter(item=>item.basis==="sales"&&item.unitsPeriod===leadUnits).length;
  const shown=moves.filter(move=>filter==="all"||move.group===filter);
  const loadSimilar=async(listingId:number)=>{
    setSimilar(prev=>({...prev,[listingId]:{state:"loading",rows:[]}}));
    try{
      const response=await fetch(`/api/shop-map/market-comparisons?listingId=${listingId}`,{method:"POST",credentials:"same-origin"});
      const body=await response.json() as {status?:string;reason?:string;comparisons?:Comparison[]};
      setSimilar(prev=>({...prev,[listingId]:{state:"done",rows:body.comparisons??[],
        note:body.status==="insufficient-context"?"This title is too general to search on.":body.reason}}));
    }catch{setSimilar(prev=>({...prev,[listingId]:{state:"failed",rows:[]}}))}
  };
  const toggle=(id:string)=>setOpen(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next});

  return <div className={`${s.engine} oe-engine`}>
    <dl className={s.summary} aria-label={`Last ${days} days`}>
      <div><dt>Units sold</dt><dd>{num(data.totalPeriod)}</dd><p>Last {days} days</p></div>
      <div><dt>Product sales</dt><dd>{dollars(revenue)}</dd><p>Before fees and production</p></div>
      <div><dt>{tied>1?"Tied for first":"Top listing"}</dt><dd>{tied>1?tied:leadUnits}</dd><p>{tied>1?`${leadUnits} units each`:`units, ${nameOf(top[0].listingId,top[0].title)}`}</p></div>
      <div><dt>Listings sold</dt><dd>{salesCount}</dd><p>Of {num(activeCount)} active</p></div>
    </dl>

    <section className={s.section} aria-labelledby="oe-top">
      <header className={s.head}>
        <div><p className={s.eyebrow}>Follow the votes</p><h2 id="oe-top">Your top {top.length}</h2>
          <p className={s.sub}>{salesCount>=top.length?`Ranked by units sold in the last ${days} days.`
            :salesCount?`Ranked by units sold in the last ${days} days. Places ${salesCount+1} to ${top.length} are ranked by favorites.`
            :`Nothing sold in the last ${days} days, so these are ranked by favorites.`}</p></div>
        <p className={s.meta}>{[synced(data.refreshedAt)?`Sales synced ${synced(data.refreshedAt)}`:"",reading?"Reading designs…":""].filter(Boolean).join(" · ")}</p>
      </header>

      <div className={s.rail} role="tablist" aria-label={`Top ${top.length} listings`}>
        {top.map(item=><button key={item.listingId} type="button" role="tab" aria-selected={item.listingId===row.listingId}
          className={s.railItem} onClick={()=>setIndex(item.rank-1)}>
          <span className={s.railThumb}>{item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={120} height={120}/>:null}
            <span className={s.railRank}>{item.rank}</span></span>
          <span className={s.railName}>{nameOf(item.listingId,item.title)}</span>
          <span className={s.railMeta}>{item.basis==="sales"?`${item.unitsPeriod} sold`:`${num(item.favorites)} favorites`}</span>
        </button>)}
      </div>

      <article className={s.card} role="tabpanel" aria-label={nameOf(row.listingId,row.title)}>
        <a className={s.cardImg} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer" aria-label="Open this listing on Etsy">
          {row.imageUrl?<img src={bigImage(row.imageUrl)} alt=""/>:<span className={s.noImg}>No photo on file</span>}
        </a>
        <div className={s.cardHead}>
          <div className={s.cardTop}>
            <span className={s.rankPill}>#{row.rank} of {top.length}</span>
            <span className={row.basis==="sales"?s.basisSales:s.basisFav}>{row.basis==="sales"?"Ranked by sales":"Ranked by favorites"}</span>
            <span className={s.pager}>
              <button type="button" aria-label="Previous listing" disabled={row.rank===1} onClick={()=>setIndex(row.rank-2)}>‹</button>
              <button type="button" aria-label="Next listing" disabled={row.rank===top.length} onClick={()=>setIndex(row.rank)}>›</button>
            </span>
          </div>
          <div>
            <h3 className={s.name}>{design?.name??shortName(row.title)}</h3>
            <p className={s.title}>{design?describe(design):decode(row.title)}</p>
          </div>
          <dl className={s.stats}>
            {row.basis==="sales"?<div><dt>Sold, {days} days</dt><dd>{row.unitsPeriod}</dd></div>:null}
            {row.basis==="sales"?<div><dt>Of shop sales</dt><dd>{Math.round(row.share*100)}%</dd></div>:null}
            <div><dt>Sold, 12 months</dt><dd>{row.unitsYear}</dd></div>
            <div><dt>Favorites</dt><dd>{num(row.favorites)}</dd></div>
            <div><dt>Views</dt><dd>{num(row.views)}</dd></div>
            {read.reviews.count?<div><dt>{read.reviews.count} reviews</dt><dd>{read.reviews.average?.toFixed(1)}★</dd></div>:null}
          </dl>
          <p className={s.read}>{read.headline}</p>
        </div>
        <div className={s.cardDetail}>
          <div>
            <h4 className={s.label}>Next moves</h4>
            <ol className={s.steps}>{read.moves.map(move=><li key={move.kind}><b>{move.title}</b><span>{move.detail}</span><small>{move.evidence}</small></li>)}</ol>
          </div>
          <div className={s.side}>
            {read.missing.length?<div><h4 className={s.label}>What&apos;s missing</h4>
              <ul className={s.bullets}>{read.missing.map(line=><li key={line}>{line}</li>)}</ul></div>:null}
            {read.reviews.quote?<div><h4 className={s.label}>What buyers say</h4><blockquote className={s.quote}>“{read.reviews.quote}”</blockquote></div>:null}
            <div><h4 className={s.label}>Similar listings in other shops</h4>
              {sim.state==="idle"?<button type="button" className={s.link} onClick={()=>void loadSimilar(row.listingId)}>Find similar Etsy listings</button>
              :sim.state==="loading"?<p className={s.muted} role="status">Searching Etsy…</p>
              :sim.state==="failed"?<p className={s.muted}>Etsy search did not answer. <button type="button" className={s.link} onClick={()=>void loadSimilar(row.listingId)}>Try again</button></p>
              :sim.rows.length?<ul className={s.similar}>{sim.rows.map(item=><li key={item.listingId}><a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={56} height={56}/>:null}
                  <span><b>{shortName(item.title)}</b><small>{[item.price,item.reviewCount?`${item.reviewCount} reviews`:null].filter(Boolean).join(" · ")}</small></span></a></li>)}</ul>
              :<p className={s.muted}>{sim.note||"No close matches in Etsy search right now."}</p>}
            </div>
          </div>
          <div className={s.actions}>
            <a className={s.btn} href="/listing-factory?step=setup">Start a batch in Listing Factory</a>
            <a className={s.btnGhost} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer">Open on Etsy</a>
          </div>
        </div>
      </article>
    </section>

    {moves.length?<section className={s.section} aria-labelledby="oe-moves">
      <header className={s.head}>
        <div><p className={s.eyebrow}>Across your shop</p><h2 id="oe-moves">Your next moves</h2>
          <p className={s.sub}>Ranked by how much customer evidence is behind each one.</p></div>
        <div className={s.filters} role="group" aria-label="Filter moves">
          {([["all","All"],["quick","Quick fixes"],["new","New designs"],["hold","Hold off"]] as const).map(([key,label])=>
            <button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}
        </div>
      </header>
      <ol className={s.moves}>
        {shown.map(move=>{const isOpen=open.has(move.id);const rank=moves.indexOf(move)+1;
          const thumbs=move.listingIds.map(id=>images.get(id)).filter((url):url is string=>Boolean(url)).slice(0,3);
          return <li key={move.id} className={s.move}>
          <div className={s.moveRow} data-thumbs={thumbs.length?"yes":"no"}>
            <span className={s.moveRank}>{rank}</span>
            {thumbs.length?<span className={s.moveThumbs}>{thumbs.map(url=><img key={url} src={url} alt="" loading="lazy" width={96} height={96}/>)}</span>:null}
            <div className={s.moveText}>
              <span className={s.tag} data-group={move.group}>{move.tag}</span>
              <h3>{move.title}</h3><p>{move.why}</p>
              <dl className={s.moveEvidence}>{move.evidence.map(([value,label])=><div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
            </div>
            <div className={s.moveActions}>
              <a className={s.btn} href={move.action.href} target={move.action.href.startsWith("http")?"_blank":undefined} rel="noopener noreferrer">{move.action.label}</a>
              <button type="button" className={s.btnGhost} aria-expanded={isOpen} onClick={()=>toggle(move.id)}>{isOpen?"Hide proof":"Show proof"}</button>
            </div>
          </div>
          {isOpen?<div className={s.proof}>
            <div><h4 className={s.label}>{move.proof.left.h}</h4><ul className={s.bullets}>{move.proof.left.lines.map(line=><li key={line}>{line}</li>)}</ul></div>
            <div><h4 className={s.label}>{move.proof.right.h}</h4>
              {move.proof.right.caution?<p className={s.caution}>{move.proof.right.caution}</p>:null}
              <ol className={s.numbered}>{move.proof.right.steps.map(step=><li key={step}>{step}</li>)}</ol></div>
          </div>:null}
        </li>})}
        {!shown.length?<li className={s.muted}>Nothing in this group right now.</li>:null}
      </ol>
    </section>:null}

    <section className={s.section} aria-labelledby="oe-why">
      <header className={s.head}><div><p className={s.eyebrow}>The reasons</p><h2 id="oe-why">Why buyers choose you</h2></div></header>
      <div className={s.panels}>
        <div className={s.panel}>
          <h3>What sold, by design style</h3>
          {style&&style.analysedListings?<>
            <p className={s.panelSub}>Units in the last 12 months from {style.analysedListings} read designs ({style.analysedUnits} of {style.totalUnits} units).</p>
            <div className={s.bars}>{style.traits.map(trait=><div key={trait.key} className={s.bar}>
              <span>{trait.label}</span>
              <span className={s.track}><span style={{width:`${Math.round(trait.units/Math.max(1,style.analysedUnits)*100)}%`}}/></span>
              <b>{trait.units} of {style.analysedUnits}</b></div>)}</div>
          </>:<p className={s.panelSub}>{reading?"Reading the designs on your listing photos…":"Design styles appear once your listing photos have been read."}</p>}
        </div>
        <div className={s.panel}>
          <div className={s.panelHead}><div><h3>What buyers say</h3>
            <p className={s.panelSub}>Your {buyers?.count??0} most recent reviews.</p></div>
            {buyers?.average!=null?<div className={s.score}><b>{buyers.average.toFixed(1)}</b><span>{buyers.five} five-star</span></div>:null}</div>
          <ul className={s.themes}>{buyers?.themes.map(theme=><li key={theme.label}><span>{theme.label}{theme.quote?<small>“{theme.quote}”</small>:null}</span><b>{theme.n}</b></li>)}
            {buyers&&buyers.low?<li><span>Problems (1 to 3 stars)</span><b>{buyers.low}</b></li>:null}</ul>
        </div>
      </div>
    </section>
  </div>;
}
