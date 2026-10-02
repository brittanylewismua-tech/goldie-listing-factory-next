"use client";
import {useEffect,useMemo,useState} from "react";
import s from "./opportunity-engine.module.css";
import {buildTopTen,readListing,shopMoves,shortName,familyStats,
  type PeriodListing,type CatalogListing,type YearSale,type OwnReview,type Direction} from "./opportunity-engine-model";

type Comparison={listingId:number;title:string;url:string;imageUrl:string;price:string|null;reviewCount:number;latestReviewAt:number;difference:string;reviewExcerpt:string|null};
type Similar={state:"idle"|"loading"|"done"|"failed";rows:Comparison[];note?:string};
type Data={period:PeriodListing[];catalog:CatalogListing[];year:YearSale[];reviews:OwnReview[];directions:Direction[];totalPeriod:number;receiptsComplete:boolean;refreshedAt:number|null};

const num=(value:number|null|undefined)=>value==null?"—":value.toLocaleString("en-US");
const etsy=(id:number)=>`https://www.etsy.com/listing/${id}`;
const synced=(at:number|null)=>at?new Date(at*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null;

async function json<T>(url:string):Promise<T>{
  const response=await fetch(url,{credentials:"same-origin"});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

export default function OpportunityEngine({days}:{days:30|90}){
  const [data,setData]=useState<Data|null>(null);
  const [failed,setFailed]=useState(false);
  const [index,setIndex]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [similar,setSimilar]=useState<Record<number,Similar>>({});

  useEffect(()=>{
    let live=true;setFailed(false);setIndex(0);
    void (async()=>{
      try{
        const [purchases,catalog,year,insights]=await Promise.all([
          json<{purchasePriorities?:{listings:PeriodListing[];totalUnits:number;receiptsComplete:boolean;refreshedAt:number|null}}>(`/api/shop-map/map?view=overview-purchases&days=${days}`),
          json<{listings?:CatalogListing[]}>(`/api/shop-map/my-listings`),
          json<{soldListings?:{listings:YearSale[]}}>(`/api/shop-map/map?view=sold&days=365`),
          json<{ownReviews?:OwnReview[];productDirections?:Direction[]}>(`/api/shop-map/map?view=overview-insights&days=${days}`).catch(()=>({ownReviews:[],productDirections:[]})),
        ]);
        if(!live)return;
        const map=purchases.purchasePriorities;
        setData({period:map?.listings??[],catalog:catalog.listings??[],year:year.soldListings?.listings??[],
          reviews:insights.ownReviews??[],directions:insights.productDirections??[],
          totalPeriod:map?.totalUnits??0,receiptsComplete:Boolean(map?.receiptsComplete),refreshedAt:map?.refreshedAt??null});
      }catch{if(live)setFailed(true)}
    })();
    return ()=>{live=false};
  },[days,attempt]);

  const top=useMemo(()=>data?buildTopTen(data.period,data.catalog,data.year):[],[data]);
  const families=useMemo(()=>data?familyStats(data.catalog,data.year):[],[data]);
  const totalYear=useMemo(()=>data?data.year.reduce((sum,row)=>sum+Number(row.sales||0),0):0,[data]);
  const moves=useMemo(()=>data?shopMoves(data.catalog,data.year,data.reviews,new Set(top.map(row=>row.listingId))):[],[data,top]);

  if(failed)return <section className={s.state} role="alert"><strong>The Opportunity Engine could not load.</strong>
    <button type="button" className={s.btnGhost} onClick={()=>{setData(null);setAttempt(value=>value+1)}}>Try again</button></section>;
  if(!data)return <section className={s.state} role="status"><span className={s.spinner} aria-hidden="true"/>Reading your sales, favorites and reviews…</section>;
  if(!top.length)return <section className={s.state}><strong>No listings to rank yet.</strong> Connect your shop and sync listings in Connections.</section>;

  const salesCount=top.filter(row=>row.basis==="sales").length;
  const row=top[Math.min(index,top.length-1)];
  const read=readListing(row,{days,reviews:data.reviews,directions:data.directions,families,totalYearUnits:totalYear,month:new Date().getMonth()+1});
  const sim=similar[row.listingId]??{state:"idle",rows:[]};
  const loadSimilar=async(listingId:number)=>{
    setSimilar(prev=>({...prev,[listingId]:{state:"loading",rows:[]}}));
    try{
      const response=await fetch(`/api/shop-map/market-comparisons?listingId=${listingId}`,{method:"POST",credentials:"same-origin"});
      const body=await response.json() as {status?:string;reason?:string;comparisons?:Comparison[]};
      setSimilar(prev=>({...prev,[listingId]:{state:"done",rows:body.comparisons??[],
        note:body.status==="insufficient-context"?"This title is too general to search on.":body.reason}}));
    }catch{setSimilar(prev=>({...prev,[listingId]:{state:"failed",rows:[]}}))}
  };
  return <div className={s.engine}>
    <section aria-labelledby="oe-top-title" className={s.top}>
      <div className={s.secHead}>
        <div><h2 id="oe-top-title">Your top {top.length}</h2>
          <p>{salesCount>=top.length
            ?`Ranked by units sold in the last ${days} days. Follow these votes first.`
            :salesCount
              ?`Ranked by units sold in the last ${days} days. Only ${salesCount} ${salesCount===1?"listing":"listings"} sold, so places ${salesCount+1} to ${top.length} are ranked by favorites.`
              :`Nothing sold in the last ${days} days, so these are ranked by favorites.`}</p></div>
        <p className={s.fresh}>{data.totalPeriod} {data.totalPeriod===1?"unit":"units"} sold in {days} days{synced(data.refreshedAt)?` · sales synced ${synced(data.refreshedAt)}`:""}</p>
      </div>
    <article className={s.card} aria-live="polite">
      <a className={s.cardImg} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer" aria-label="Open this listing on Etsy">
        {row.imageUrl?<img src={row.imageUrl.replace("il_570xN","il_794xN")} alt=""/>:<span className={s.noImg}>No photo on file</span>}
        <span className={s.bigRank}>{row.rank}</span>
      </a>
      <div className={s.cardBody}>
        <div className={s.pager}>
          <button type="button" aria-label="Previous listing" disabled={row.rank===1} onClick={()=>setIndex(row.rank-2)}>‹</button>
          <span>Listing {row.rank} of {top.length}</span>
          <button type="button" aria-label="Next listing" disabled={row.rank===top.length} onClick={()=>setIndex(row.rank)}>›</button>
          <span className={row.basis==="sales"?s.chipSales:s.chipFav}>{row.basis==="sales"?"Ranked by sales":"Ranked by favorites"}</span>
        </div>
        <div><h3 className={s.name}>{shortName(row.title)}</h3><p className={s.full}>{row.title}</p></div>
        <dl className={s.stats}>
          {row.basis==="sales"?<>
            <div><dt>sold in {days} days</dt><dd>{row.unitsPeriod}</dd></div>
            <div><dt>of shop purchases</dt><dd>{Math.round(row.share*100)}%</dd></div>
          </>:null}
          <div><dt>sold in 12 months</dt><dd>{row.unitsYear}</dd></div>
          <div><dt>favorites</dt><dd>{num(row.favorites)}</dd></div>
          <div><dt>views, all time</dt><dd>{num(row.views)}</dd></div>
          {read.reviews.count?<div><dt>{read.reviews.count} reviews</dt><dd>{read.reviews.average?.toFixed(1)}★</dd></div>:null}
        </dl>
        <p className={s.read}>{read.headline}</p>

        <div className={s.block}>
          <h4>Next moves</h4>
          <ol className={s.moves}>{read.moves.map(move=><li key={move.kind}>
            <b>{move.title}</b><span>{move.detail}</span><small>{move.evidence}</small></li>)}</ol>
        </div>

        {read.missing.length?<div className={s.block}><h4>What&apos;s missing</h4>
          <ul className={s.missing}>{read.missing.map(line=><li key={line}>{line}</li>)}</ul></div>:null}

        {read.reviews.quote?<div className={s.block}><h4>What buyers say</h4>
          <blockquote className={s.quote}>“{read.reviews.quote}”</blockquote></div>:null}

        <div className={s.block}>
          <h4>Similar listings in other shops</h4>
          {sim.state==="idle"?<button type="button" className={s.btnGhost} onClick={()=>void loadSimilar(row.listingId)}>Find similar Etsy listings</button>
          :sim.state==="loading"?<p className={s.muted} role="status">Searching Etsy…</p>
          :sim.state==="failed"?<p className={s.muted}>Etsy search did not answer. <button type="button" className={s.link} onClick={()=>void loadSimilar(row.listingId)}>Try again</button></p>
          :sim.rows.length?<ul className={s.similar}>{sim.rows.map(item=><li key={item.listingId}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={72} height={72}/>:null}
              <span><b>{shortName(item.title)}</b><small>{[item.price,item.reviewCount?`${item.reviewCount} reviews`:null].filter(Boolean).join(" · ")}</small>
              <em>{item.difference}</em></span></a></li>)}</ul>
          :<p className={s.muted}>{sim.note||"No close matches in Etsy search right now."}</p>}
        </div>

        <div className={s.actions}>
          <a className={s.btn} href="/listing-factory?step=setup">Start a batch in Listing Factory</a>
          <a className={s.btnGhost} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer">Open on Etsy</a>
        </div>
      </div>
    </article>
      <div className={s.strip} role="group" aria-label={`Top ${top.length} listings`}>{top.map(item=><button key={item.listingId} type="button"
        className={s.tile} aria-current={item.listingId===row.listingId?true:undefined} onClick={()=>setIndex(item.rank-1)}>
        {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={48} height={48}/>:<span className={s.noImg}/>}
        <span className={s.tileText}><b>{item.rank}. {shortName(item.title)}</b>
          <small>{item.basis==="sales"?`${item.unitsPeriod} purchased`:`${num(item.favorites)} favorites`}</small></span>
      </button>)}</div>
    </section>

    {moves.length?<section aria-labelledby="oe-more-title">
      <div className={s.secHead}><div><h2 id="oe-more-title">More for your shop</h2>
        <p>After your top {top.length}, these are the next places your shop&apos;s numbers point to.</p></div></div>
      <div className={s.shopMoves}>{moves.map(move=><article key={move.id} className={s.shopMove}>
        <span className={s.tag}>{move.tag}</span>
        <h3>{move.title}</h3><p>{move.detail}</p>
        {move.listings.length?<div className={s.minis}>{move.listings.map(item=><a key={item.listingId} href={etsy(item.listingId)} target="_blank" rel="noopener noreferrer">
          {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={96} height={96}/>:<span className={s.noImg}>No photo</span>}</a>)}</div>:null}
        <ul>{move.evidence.map(line=><li key={line}>{line}</li>)}</ul>
      </article>)}</div>
    </section>:null}
  </div>;
}
