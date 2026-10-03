"use client";
/*
  Opportunity Engine: Votes, Build, Track.

  Votes reports what customers chose with their purchases, favorites, orders
  and reviews. It does not tell the seller what to make; that is Build.

  Layout (approved in Brittany's live page, 3 Oct 2026): a compact pink header
  with the period switch beside the figures, the shop's highlights scrolling
  in a black strip, then section chips that jump to: Top 10, What they
  choose, Who buys, In their words, When, Saved, Numbers.

  Every section has an empty state, so a brand-new shop sees what will fill
  in rather than half-empty cards.
*/
import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import "@fontsource/archivo-black";
import "@fontsource-variable/instrument-sans";
import s from "./opportunity-engine.module.css";
import {buildTopTen,familyName,type PeriodListing,type CatalogListing,type YearSale,type OwnReview,type DesignRead,type TopRow} from "./opportunity-engine-model";
import {reviewsFor,saveRate,HIGH_SAVE_RATE,listingBadge,listingWhy,winningFormula,productsChosen,savedNotBought,
  buyerSignals,wearLine,whenLine,nameOf,shopHighlights} from "./opportunity-votes-model";
import type {VotesSignals} from "./votes-signals-model";

export type EngineSection="overview"|"build"|"track";
type Data={period:PeriodListing[];catalog:CatalogListing[];year:YearSale[];reviews:OwnReview[];
  totalPeriod:number;refreshedAt:number|null;shopName:string|null;shopImage:string|null};
type Signals={state:"loading"|"syncing"|"ready"|"failed";data:VotesSignals|null};
type Words={state:"loading"|"ready"|"failed";phrases:Array<{phrase:string;reviews:number}>;reviews:number};

const num=(value:number|null|undefined)=>value==null?"—":value.toLocaleString("en-US");
const pct=(value:number)=>`${Math.round(value*100)}%`;
const dollars=(minor:number)=>"$"+Math.round(minor/100).toLocaleString("en-US");
const etsy=(id:number)=>`https://www.etsy.com/listing/${id}`;
const synced=(at:number|null)=>at?new Date(at*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null;
const dateOf=(at:number)=>new Date(at*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});
const bigImage=(url:string)=>url.replace("il_570xN","il_794xN");

async function json<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:"same-origin",...init});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

const SECTIONS=[["oe-top","Top 10"],["oe-choose","What they choose"],["oe-who","Who buys"],["oe-words","In their words"],
  ["oe-when","When"],["oe-saved","Saved"],["oe-numbers","Numbers"]] as const;

function Empty({children}:{children:ReactNode}){return <p className={s.empty}>{children}</p>}

export default function OpportunityEngine({days,onDays,section="overview",listingId=null,onSection}:{
  days:30|90;onDays:(days:30|90)=>void;section?:EngineSection;listingId?:number|null;
  onSection:(section:EngineSection,listingId?:number|null)=>void;
}){
  const [data,setData]=useState<Data|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [index,setIndex]=useState(0);
  const [reads,setReads]=useState<Map<number,DesignRead>>(new Map());
  const [signals,setSignals]=useState<Signals>({state:"loading",data:null});
  const [words,setWords]=useState<Words>({state:"loading",phrases:[],reviews:0});
  const [sort,setSort]=useState<{key:string;dir:1|-1}>({key:"rank",dir:1});
  const cardRef=useRef<HTMLElement>(null);

  useEffect(()=>{
    let live=true;setFailed(false);setIndex(0);
    void (async()=>{
      try{
        const [purchases,catalog,year,insights,shop]=await Promise.all([
          json<{shop?:{shopName?:string};purchasePriorities?:{listings:PeriodListing[];totalUnits:number;refreshedAt:number|null}}>(`/api/shop-map/map?view=overview-purchases&days=${days}`),
          json<{listings?:CatalogListing[]}>(`/api/shop-map/my-listings`),
          json<{soldListings?:{listings:YearSale[]}}>(`/api/shop-map/map?view=sold&days=365`),
          json<{ownReviews?:OwnReview[]}>(`/api/shop-map/map?view=overview-insights&days=${days}`).catch(()=>({ownReviews:[]})),
          json<{shopName?:string;imageUrl?:string|null}>(`/api/etsy`).catch(()=>({} as {shopName?:string;imageUrl?:string|null})),
        ]);
        if(!live)return;
        const map=purchases.purchasePriorities;
        setData({period:map?.listings??[],catalog:catalog.listings??[],year:year.soldListings?.listings??[],
          reviews:insights.ownReviews??[],totalPeriod:map?.totalUnits??0,refreshedAt:map?.refreshedAt??null,
          shopName:purchases.shop?.shopName??shop.shopName??null,shopImage:shop.imageUrl??null});
      }catch{if(live)setFailed(true)}
    })();
    return ()=>{live=false};
  },[days,attempt]);

  /* Order, review-photo and favorites signals. Read first; sync only when a day old, then read again. */
  useEffect(()=>{
    if(section!=="overview")return;
    let live=true;
    void (async()=>{
      try{
        let body=await json<VotesSignals&{empty?:boolean}>("/api/shop-map/votes-signals");
        if(!live)return;
        setSignals({state:body.stale?"syncing":"ready",data:body.empty?null:body});
        if(body.stale&&!body.empty){
          await json("/api/shop-map/votes-signals",{method:"POST"}).catch(()=>null);
          body=await json<VotesSignals&{empty?:boolean}>("/api/shop-map/votes-signals");
          if(live)setSignals({state:"ready",data:body});
        }
      }catch{if(live)setSignals(prev=>({state:prev.data?"ready":"failed",data:prev.data}))}
    })();
    return ()=>{live=false};
  },[section,attempt]);

  useEffect(()=>{
    if(section!=="overview")return;
    let live=true;
    void json<{phrases:Array<{phrase:string;reviews:number}>;reviews:number}>("/api/shop-map/buyer-words",{method:"POST"})
      .then(body=>{if(live)setWords({state:"ready",phrases:body.phrases??[],reviews:body.reviews??0})})
      .catch(()=>{if(live)setWords({state:"failed",phrases:[],reviews:0})});
    return ()=>{live=false};
  },[section,attempt]);

  const top=useMemo(()=>data?buildTopTen(data.period,data.catalog,data.year):[],[data]);
  const saved=useMemo(()=>data?savedNotBought(data.catalog,data.year,new Set(top.map(row=>row.listingId))):[],[data,top]);
  const sig=signals.data;

  /* Read the printed design on every listing the page names. */
  const wantedIds=useMemo(()=>data?[...new Set([...top.map(row=>row.listingId),...saved.map(row=>row.listingId),
    ...(sig?.lastYear.listings??[]).map(row=>row.listingId),...(sig?.gaining.listings??[]).map(row=>row.listingId),
    ...data.year.map(row=>row.listingId)])].slice(0,60):[],[data,top,saved,sig]);
  useEffect(()=>{
    if(!wantedIds.length)return;
    let live=true;
    void (async()=>{
      for(let round=0;round<6&&live;round++){
        const response=await fetch("/api/shop-map/listing-designs",{method:"POST",credentials:"same-origin",
          headers:{"Content-Type":"application/json"},body:JSON.stringify({listingIds:wantedIds})}).catch(()=>null);
        if(!response?.ok)break;
        const body=await response.json() as {reads:DesignRead[];pending:number;limited?:boolean};
        if(!live)return;
        setReads(prev=>{const next=new Map(prev);for(const item of body.reads)next.set(item.listingId,item);return next});
        if(!body.pending||body.limited)break;
      }
    })();
    return ()=>{live=false};
  },[wantedIds]);

  const formula=useMemo(()=>data?winningFormula(data.year,data.period,reads,data.catalog):null,[data,reads]);
  const products=useMemo(()=>data?productsChosen(data.catalog,data.year):null,[data]);
  const buyers=useMemo(()=>data&&data.reviews.length>=10?buyerSignals(data.reviews):null,[data]);
  const catalogBy=useMemo(()=>new Map((data?.catalog??[]).map(row=>[row.listingId,row])),[data]);
  const name=(id:number,title?:string)=>nameOf(reads,id,title??catalogBy.get(id)?.title??"Listing");
  const image=(id:number)=>catalogBy.get(id)?.imageUrl??top.find(row=>row.listingId===id)?.imageUrl??null;

  const revenue=data?data.period.reduce((sum,item)=>sum+Number(item.productRevenueMinor||0),0):0;
  const listingsSold=data?data.period.filter(item=>item.unitsPurchased>0).length:0;
  const colorOption=sig?.variations.options.find(option=>option.name==="Color");
  const highlights=useMemo(()=>data?shopHighlights({top,name:(id,title)=>nameOf(reads,id,title),days,saved,formula:formula?.cards??[],products,
    reviews:data.reviews,repeatBuyers:sig?.repeat.repeatBuyers,giftOrders:sig?.gifts.gifts,topPlace:sig&&sig.places.orders>=5?sig.places.places[0]?.label??null:null,
    topColor:colorOption&&colorOption.units?{value:colorOption.values[0].value.toLowerCase(),share:colorOption.values[0].units/colorOption.units}:null}):[],
    [data,top,reads,days,saved,formula,products,sig,colorOption]);

  /* Open a listing: in the top 10 it is selected in the card, anywhere else it opens on Etsy. */
  const openListing=(id:number)=>{
    const rank=top.findIndex(row=>row.listingId===id);
    if(rank>=0){setIndex(rank);cardRef.current?.scrollIntoView({behavior:"smooth",block:"start"});return}
    window.open(etsy(id),"_blank","noopener,noreferrer");
  };
  const thumb=(id:number,size:number,label?:string)=>{const url=image(id);
    return <button key={id} type="button" className={s.thumbBtn} onClick={()=>openListing(id)} aria-label={`Open ${label??name(id)}`}>
      {url?<img src={url} alt="" width={size} height={size} style={{width:size,height:size}}/>:<span className={s.noThumb} style={{width:size,height:size}}/>}
    </button>};
  const jump=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});

  const header=<header className={s.band}>
    <div className={s.bandInner}>
      <div className={s.titleBlock}>
        <h1 className={s.h1}>{section==="build"?"Build":section==="track"?"Track":"Votes"}</h1>
        <span className={s.connected}>
          {data?.shopImage?<img src={data.shopImage} alt="" width={30} height={30}/>:<span className={s.logoBlank} aria-hidden="true"/>}
          <b>{data?.shopName??"Your shop"}</b><span className={s.dot}>Connected</span></span>
        <p className={s.lede}>{section==="build"?"Turn what customers chose into your next listings."
          :section==="track"?"See how your new listings are doing against the ones customers already chose."
          :"Here’s what customers are voting on with their purchases and favorites in your shop."}</p>
      </div>
      {section==="overview"?<div className={s.bandRight}>
        <div className={s.showing}><span>Showing</span>
          <div className={s.period} role="group" aria-label="Period for the whole page">
            {([30,90] as const).map(value=><button key={value} type="button" aria-pressed={days===value} onClick={()=>onDays(value)}>Last {value} days</button>)}
          </div></div>
        <dl className={s.figures}>
          <div><dt>sales</dt><dd>{data?num(data.totalPeriod):<i className={s.skelText}/>}</dd></div>
          <div><dt>revenue</dt><dd>{data?dollars(revenue):<i className={s.skelText}/>}</dd></div>
          <div><dt>listings sold</dt><dd>{data?listingsSold:<i className={s.skelText}/>}</dd></div>
        </dl>
      </div>:null}
    </div>
  </header>;

  const marquee=highlights.length>=3?<div className={s.marquee} role="region" aria-label="Shop highlights">
    <div className={s.marqueeTrack}>
      {[0,1].map(copy=><div key={copy} className={s.marqueeRun} aria-hidden={copy===1?true:undefined}>
        {highlights.map(line=><span key={line}><b aria-hidden="true">★</b>{line}</span>)}</div>)}
    </div></div>:<div className={s.marqueeQuiet} aria-hidden="true"/>;

  const tabs=<nav className={s.phoneTabs} aria-label="Opportunity Engine">
    {([["overview","Votes"],["build","Build"],["track","Track"]] as const).map(([key,label])=>
      <button key={key} type="button" aria-current={section===key?"page":undefined} onClick={()=>onSection(key)}>{label}</button>)}
  </nav>;

  if(section!=="overview"){
    const focus=listingId&&data?top.find(row=>row.listingId===listingId)??null:null;
    return <div className={`${s.engine} oe-engine oe-votes`}>{tabs}{header}
      <div className={s.wrap}>
        <section className={s.soon}>
          {focus?<div className={s.soonListing}>
            {focus.imageUrl?<img src={focus.imageUrl} alt="" width={72} height={72}/>:null}
            <div><b>{name(focus.listingId,focus.title)}</b><span>No. {focus.rank} in your top {top.length} · {focus.unitsPeriod} sold in {days} days</span></div>
          </div>:null}
          <h2 className={s.h2}>{section==="build"?"Build is the next page we’re designing.":"Track is coming after Build."}</h2>
          <p>{section==="build"?"It will start from the listing you choose on Votes and walk through building it out, one step at a time."
            :"It will follow each listing you publish and compare its first weeks with your usual start."}</p>
          <button type="button" className={s.btnDark} onClick={()=>onSection("overview")}>Back to Votes</button>
        </section>
      </div>
    </div>;
  }

  if(failed)return <div className={`${s.engine} oe-engine oe-votes`}>{tabs}{header}{marquee}<div className={s.wrap}><section className={s.state} role="alert">
    <strong>Your votes could not load.</strong>
    <button type="button" className={s.btnLight} onClick={()=>{setData(null);setAttempt(value=>value+1)}}>Try again</button></section></div></div>;
  /* Loading shows the page's shape, not a spinner. */
  if(!data)return <div className={`${s.engine} oe-engine oe-votes`} aria-busy="true">{tabs}{header}{marquee}<div className={s.wrap}>
    <p className={s.srOnly} role="status">Reading your sales, favorites and reviews…</p>
    <div className={s.head}><i className={s.skelTitle}/><i className={s.skelLine}/></div>
    <div className={s.topGrid}><div className={`${s.skelBlock} ${s.skelCard}`}/><div className={`${s.skelBlock} ${s.skelList}`}/></div>
    <div className={s.formula}>{[0,1,2,3].map(key=><div key={key} className={`${s.skelBlock} ${s.skelSmall}`}/>)}</div>
  </div></div>;

  const newShop=top.length===0;
  const row=top[Math.min(index,Math.max(0,top.length-1))];
  const own=row?reviewsFor(row.listingId,data.reviews):null;
  const badge=row?listingBadge(row,top,data.reviews):null;
  const rate=row?saveRate(row):null;
  const golden=Boolean(row&&row.rank<=3&&row.basis==="sales");
  const salesCount=top.filter(item=>item.basis==="sales").length;
  const pick=(next:number)=>{
    setIndex(next);
    /* On a phone the list sits under the card; bring the changed card into view. */
    if(typeof window!=="undefined"&&window.matchMedia("(max-width: 760px)").matches)
      cardRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const listRow=(item:TopRow)=><button key={item.listingId} type="button" className={s.listRow}
    aria-pressed={item.listingId===row?.listingId} onClick={()=>pick(item.rank-1)}>
    <span className={s.listRank}>{item.rank}</span>
    {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={38} height={38}/>:<span className={s.noThumb}/>}
    <span className={s.listText}><b>{name(item.listingId,item.title)}</b>
      <small>{item.basis==="sales"?`${item.unitsPeriod} sold`:`${num(item.favorites)} favorites`}</small></span>
  </button>;
  const stats:Array<[string,string]>=row&&own?[
    ...(row.basis==="sales"?[[pct(row.share),`of your sales in the last ${days} days (${row.unitsPeriod} of ${data.totalPeriod})`] as [string,string]]:[]),
    [String(row.unitsYear),`${row.unitsYear===1?"sale":"sales"} in the last 12 months`],
    [num(row.favorites),"shoppers saved it to their favorites"],
    [num(row.views),"views on Etsy"],
    ...(rate!=null?[[`${(rate*100).toFixed(1)}%`,`of viewers saved it${rate>=HIGH_SAVE_RATE?", among your highest":""}`] as [string,string]]:[]),
    own.count&&own.average!=null?[`${own.average.toFixed(1)} ★`,`from ${own.count} ${own.count===1?"review":"reviews"}`]:["—","no reviews yet"],
  ]:[];
  const topProduct=products?.rows[0];
  const productWord=topProduct?familyName(topProduct.family):"designs";
  const ordersNote=signals.state==="syncing"&&!sig?.coverage.orders?"Reading your orders from Etsy. This takes a minute the first time.":
    signals.state==="failed"?"Your orders could not be read just now.":null;
  const yearSales=data.year.reduce((sum,item)=>sum+Number(item.sales||0),0);

  /* Numbers table: sortable on any column. */
  const tableRows=top.map(item=>{const r=reviewsFor(item.listingId,data.reviews);const save=saveRate(item);
    return {item,r,save,cells:{rank:item.rank,name:name(item.listingId,item.title).toLowerCase(),sold:item.basis==="sales"?item.unitsPeriod:-1,
      share:item.basis==="sales"?item.share:-1,year:item.unitsYear,fav:item.favorites??-1,views:item.views??-1,save:save??-1,rating:r.average??-1} as Record<string,number|string>}});
  tableRows.sort((a,b)=>{const x=a.cells[sort.key],y=b.cells[sort.key];return (x<y?-1:x>y?1:0)*sort.dir});
  const th=(key:string,label:string)=><th aria-sort={sort.key===key?(sort.dir===1?"ascending":"descending"):"none"}>
    <button type="button" onClick={()=>setSort(prev=>({key,dir:prev.key===key?(prev.dir===1?-1:1):(key==="rank"||key==="name"?1:-1)}))}>
      {label}<i aria-hidden="true">{sort.key===key?(sort.dir===1?"↑":"↓"):""}</i></button></th>;

  return <div className={`${s.engine} oe-engine oe-votes`}>
    {tabs}{header}{marquee}
    <nav className={s.chips} aria-label="Sections on this page">
      {SECTIONS.map(([id,label])=><button key={id} type="button" onClick={()=>jump(id)}>{label}</button>)}
    </nav>
    <div className={s.wrap}>

      {/* ── Top 10 ── */}
      <section id="oe-top" className={s.section} aria-labelledby="oe-top-h">
        <div className={s.head}>
          <h2 id="oe-top-h" className={s.h2}>Your top {top.length||10}</h2>
          <p className={s.sub}>{newShop?"Your top 10 fills in as sales and favorites come in."
            :salesCount>=top.length?"The listings your customers bought most (the most votes)."
            :salesCount?`The listings your customers bought most (the most votes). Places ${salesCount+1} to ${top.length} are ranked by favorites.`
            :`Nothing sold in the last ${days} days, so these are ranked by favorites.`}</p>
        </div>
        {newShop||!row||!own?<Empty>No listings to rank yet. Once your shop is connected and your listings sync, the listings customers buy and save most appear here.</Empty>:<>
        <div className={s.topGrid}>
          <article ref={cardRef} className={s.card} data-golden={golden?"yes":"no"} aria-label={name(row.listingId,row.title)}>
            <div className={s.cardTop}>
              <a className={s.photo} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer" aria-label="Open this listing on Etsy">
                {row.imageUrl?<img src={bigImage(row.imageUrl)} alt=""/>:<span className={s.noImg}>No photo on file</span>}
                <span className={s.rankTag}>{golden?"★ ":""}No. {row.rank}</span>
              </a>
              <div className={s.cardText}>
                <div className={s.cardBar}>
                  {badge?<span className={s.badge} data-tone={badge.tone}>{badge.label}</span>:<span/>}
                  <span className={s.pager}>
                    <button type="button" aria-label="Previous listing" disabled={row.rank===1} onClick={()=>setIndex(row.rank-2)}>‹</button>
                    <button type="button" aria-label="Next listing" disabled={row.rank===top.length} onClick={()=>setIndex(row.rank)}>›</button>
                  </span>
                </div>
                <h3 className={s.name}>{name(row.listingId,row.title)}</h3>
                <p className={s.why}>{listingWhy(row,top,data.reviews,days)}</p>
              </div>
            </div>
            <dl className={s.stats}>{stats.map(([value,label])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className={s.cardFoot}>
              <div className={s.review}><small>{own.quote?"From a customer review":"Reviews"}</small>
                <p>{own.quote?`“${own.quote}”`:"No written review yet."}</p></div>
              <div className={s.buttons}>
                <a className={s.btnLight} href={etsy(row.listingId)} target="_blank" rel="noopener noreferrer">View on Etsy</a>
                <button type="button" className={s.btnDark} onClick={()=>onSection("build",row.listingId)}>Build on this</button>
              </div>
            </div>
          </article>
          <aside className={s.list} aria-label={`Your top ${top.length}`}>
            <p className={s.listHead}>Ranked by {salesCount?"sales":"favorites"}, last {days} days</p>
            <div className={s.listBody}>
              {top.length>3&&salesCount>=3?<div className={s.golden}><p>★ Your top 3</p>{top.slice(0,3).map(listRow)}</div>:null}
              <div className={s.rest}>{(top.length>3&&salesCount>=3?top.slice(3):top).map(listRow)}</div>
            </div>
          </aside>
        </div>
        <p className={s.meta}>{synced(data.refreshedAt)?`Sales synced ${synced(data.refreshedAt)}.`:""}</p></>}
      </section>

      {/* ── What they choose ── */}
      <section id="oe-choose" className={s.group} aria-labelledby="oe-choose-h">
        <h2 id="oe-choose-h" className={s.groupTitle}>What they choose</h2>
        <div className={s.section}>
          <div className={s.head}><h3 className={s.h3}>Your winning formula</h3>
            <p className={s.sub}>What the designs your customers buy have in common. Last 12 months, {formula?.units??yearSales} sales.</p></div>
          {formula&&formula.cards.length?<div className={s.formula}>{formula.cards.map(card=><div key={card.key} className={s.panel}>
            <h4 className={s.panelTitle}>{card.label}</h4>
            <p className={s.big}><b>{pct(card.share)}</b><span>of sales</span></p>
            {card.recent!=null?<span className={s.trend} data-trend={card.trend}>{card.trend==="up"?`Rising: ${pct(card.recent)} lately`
              :card.trend==="down"?`Down to ${pct(card.recent)} lately`:`Steady: ${pct(card.recent)} lately`}</span>:null}
            <span className={s.thumbs}>{card.listingIds.map(id=>thumb(id,44))}</span>
          </div>)}</div>:<Empty>{yearSales<5?"Your formula appears after five sales. It compares the designs buyers choose: wording, art, and the product they’re printed on."
            :"Reading the designs on your listing photos…"}</Empty>}
        </div>

        <div className={s.pair}>
          <div className={s.section}>
            <div className={s.head}><h3 className={s.h3}>The sizes and colors they pick</h3>
              <p className={s.sub}>From the options buyers chose at checkout, last 12 months.</p></div>
            <div className={s.panel}>
              {sig&&sig.variations.options.length?<div className={s.optionGrid}>{sig.variations.options.map(option=><div key={option.name} className={s.optionGroup}>
                <h4 className={s.panelTitle}>{option.name}</h4>
                {option.values.map(value=><div key={value.value} className={s.bar}>
                  <p><span>{value.value}</span><b>{pct(value.units/Math.max(1,option.units))}</b></p>
                  <span className={s.track}><i style={{width:`${Math.round(value.units/Math.max(1,option.values[0].units)*100)}%`}}/></span>
                </div>)}
              </div>)}</div>:<Empty>{ordersNote??(sig&&sig.coverage.orders?"Your listings don’t offer size or color choices, or buyers haven’t picked any yet.":"Appears after your first orders with a size or color choice.")}</Empty>}
              {sig&&sig.variations.units?<p className={s.panelFoot}>{sig.variations.units} items with a choice, from {sig.coverage.orders} orders.</p>:null}
            </div>
          </div>
          <div className={s.section}>
            <div className={s.head}><h3 className={s.h3}>The products they choose</h3>
              <p className={s.sub}>Sales in the last 12 months, against how many listings you have of each.</p></div>
            {products&&products.rows.length?<div className={s.panel}>
              {products.rows.map(item=><div key={item.family} className={s.bar}>
                <p><b>{item.label}</b><span>{item.sold} sold · {item.listed} listed</span></p>
                <span className={s.track}><i style={{width:`${Math.max(2,Math.round(item.sold/Math.max(1,products.rows[0].sold)*100))}%`}}/></span>
              </div>)}
              {topProduct&&products.total?<p className={s.panelFoot}>{topProduct.sold} of your {products.total} sales were {familyName(topProduct.family)}.{topProduct.sold/products.total>=0.5?` Customers are voting for ${familyName(topProduct.family)}.`:""}</p>:null}
            </div>:<Empty>Appears once your listings have synced.</Empty>}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.head}><h3 className={s.h3}>Bought together</h3>
            <p className={s.sub}>Designs that landed in the same order, last 12 months.</p></div>
          {sig&&sig.together.pairs.length?<div className={s.together}>{sig.together.pairs.map(pair=><div key={`${pair.a}:${pair.b}`} className={s.panel}>
            <span className={s.pairThumbs}>{thumb(pair.a,64)}<b aria-hidden="true">+</b>{thumb(pair.b,64)}</span>
            <p className={s.pairNames}>{name(pair.a)} <span>and</span> {name(pair.b)}</p>
            <p className={s.count}><b>{pair.orders}</b><span>{pair.orders===1?"order":"orders"} with both</span></p>
          </div>)}</div>:<Empty>{ordersNote??(sig&&sig.coverage.orders?`None yet: ${sig.together.multiItemOrders} of your ${sig.together.orders} orders had more than one design.`:"Appears when buyers start putting two designs in one order.")}</Empty>}
        </div>
      </section>

      {/* ── Who buys (soft pink band) ── */}
      <section id="oe-who" className={`${s.group} ${s.tinted}`} aria-labelledby="oe-who-h">
        <h2 id="oe-who-h" className={s.groupTitle}>Who buys</h2>
        <div className={s.quad}>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>Who they buy for</h3>
            {buyers&&buyers.whoFor.length?<>{buyers.whoFor.map(item=><div key={item.label} className={s.bar}>
              <p><span>{item.label}</span><b>{item.n}</b></p>
              <span className={s.track}><i style={{width:`${Math.round(item.n/Math.max(1,buyers.whoFor[0].n)*100)}%`}}/></span>
            </div>)}<p className={s.panelFoot}>From your {buyers.count} most recent reviews.</p></>
            :<Empty>Appears after about 10 written reviews.</Empty>}
          </div>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>Where they are</h3>
            {sig&&sig.places.places.length?<>{sig.places.places.map(place=><div key={place.label} className={s.bar}>
              <p><span>{place.label}</span><b>{place.orders}</b></p>
              <span className={s.track}><i style={{width:`${Math.round(place.orders/Math.max(1,sig.places.places[0].orders)*100)}%`}}/></span>
            </div>)}<p className={s.panelFoot}>From {sig.places.orders} orders in the last 12 months{sig.places.abroad?`. ${sig.places.abroad} shipped outside the US.`:"."}</p></>
            :<Empty>{ordersNote??(sig&&sig.coverage.orders?"Etsy didn’t include buyer locations on these orders.":"Appears after your first orders.")}</Empty>}
          </div>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>Who comes back</h3>
            {sig&&sig.repeat.buyers?<>
              {sig.repeat.repeatBuyers?<p className={s.count}><b>{sig.repeat.repeatBuyers}</b><span>{sig.repeat.repeatBuyers===1?"buyer":"buyers"} ordered more than once</span></p>
                :<p className={s.plain}>None of your {sig.repeat.buyers} buyers{sig.repeat.since?` since ${new Date(sig.repeat.since*1000).toLocaleDateString("en-US",{month:"short",year:"numeric"})}`:""} has placed a second order yet.</p>}
              {sig.repeat.secondPicks.length?<div className={s.picks}><small>What they bought next</small>
                <span className={s.thumbs}>{sig.repeat.secondPicks.map(pick=>thumb(pick.listingId,44))}</span></div>:null}
              {buyers?.back.n?<p className={s.count}><b>{buyers.back.n}</b><span>reviews say they’ll buy again</span></p>:null}
              {buyers?.back.quotes[0]?<blockquote className={s.quote}>“{buyers.back.quotes[0]}”</blockquote>:null}
              <p className={s.panelFoot}>Counted from {sig.repeat.buyers} buyers{sig.repeat.since?` since ${new Date(sig.repeat.since*1000).toLocaleDateString("en-US",{month:"short",year:"numeric"})}`:""}.</p>
            </>:<Empty>{ordersNote??"Appears after your first orders."}</Empty>}
          </div>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>Bought as gifts</h3>
            {sig&&sig.gifts.orders?<>
              <p className={s.count}><b>{sig.gifts.gifts}</b><span>of {sig.gifts.orders} orders were marked as a gift</span></p>
              <p className={s.count}><b>{sig.gifts.withMessage}</b><span>came with a gift message</span></p>
              {buyers?.when.gift?<p className={s.count}><b>{buyers.when.gift}</b><span>reviews mention a gift</span></p>:null}
              <p className={s.panelFoot}>Marked by the buyer at Etsy checkout, last 12 months.</p>
            </>:<Empty>{ordersNote??"Appears after your first orders."}</Empty>}
          </div>
        </div>
      </section>

      {/* ── In their words ── */}
      <section id="oe-words" className={s.group} aria-labelledby="oe-words-h">
        <h2 id="oe-words-h" className={s.groupTitle}>In their words</h2>
        <div className={s.section}>
          <div className={s.head}><h3 className={s.h3}>Buyer photos</h3><p className={s.sub}>Photos buyers added to their reviews.</p></div>
          {sig&&sig.photos.length?<div className={s.photos}>{sig.photos.map(photo=>
            <button key={photo.transactionId} type="button" className={s.photoTile} onClick={()=>photo.listingId&&openListing(photo.listingId)}
              aria-label={photo.listingId?`Photo of ${name(photo.listingId)}`:"Buyer photo"}>
              <img src={photo.imageUrl} alt="" width={200} height={200}/>
              {photo.rating?<span>{"★".repeat(Math.max(0,Math.min(5,photo.rating)))}</span>:null}
            </button>)}</div>
          :<Empty>{ordersNote??"None yet. When a buyer adds a photo to a review, it shows up here."}</Empty>}
        </div>
        <div className={s.pair}>
          <div className={s.section}>
            <div className={s.head}><h3 className={s.h3}>The words they use</h3><p className={s.sub}>Phrases that come up in more than one review.</p></div>
            <div className={s.panel}>
              {words.phrases.length?<ul className={s.phrases}>{words.phrases.map(item=><li key={item.phrase}>
                <span>“{item.phrase}”</span><b>{item.reviews} reviews</b></li>)}</ul>
              :<Empty>{words.state==="loading"?"Reading your reviews…":words.reviews<10?"Appears after about 10 written reviews.":"No phrase came up in more than one review yet."}</Empty>}
              {words.phrases.length?<p className={s.panelFoot}>Counted in your {words.reviews} most recent reviews.</p>:null}
            </div>
          </div>
          <div className={s.section}>
            <div className={s.head}><h3 className={s.h3}>Where they wear it</h3><p className={s.sub}>Mentioned in reviews.</p></div>
            <div className={s.panel}>
              {buyers&&(buyers.wear.work||buyers.wear.campus||buyers.wear.march)?<>
                {buyers.wear.work?<p className={s.count}><b>{buyers.wear.work}</b><span>wear it to work</span></p>:null}
                {buyers.wear.quote?<blockquote className={s.quote}>“{buyers.wear.quote}”</blockquote>:null}
                {buyers.wear.campus?<p className={s.count}><b>{buyers.wear.campus}</b><span>mention college or campus</span></p>:null}
                {buyers.wear.march?<p className={s.count}><b>{buyers.wear.march}</b><span>wear it to a march or to vote</span></p>:null}
                {wearLine(buyers,productWord)?<p className={s.panelFoot}>{wearLine(buyers,productWord)}</p>:null}
              </>:<Empty>{buyers?"No reviews mention where they wear it yet.":"Appears after about 10 written reviews."}</Empty>}
            </div>
          </div>
        </div>
      </section>

      {/* ── When ── */}
      <section id="oe-when" className={s.group} aria-labelledby="oe-when-h">
        <h2 id="oe-when-h" className={s.groupTitle}>When</h2>
        <div className={s.triple}>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>This time last year</h3>
            {sig&&sig.lastYear.covered&&sig.lastYear.units?<>
              <p className={s.count}><b>{sig.lastYear.units}</b><span>sold {dateOf(sig.lastYear.from)} to {dateOf(sig.lastYear.to)} last year</span></p>
              <ul className={s.miniList}>{sig.lastYear.listings.map(item=><li key={item.listingId}>{thumb(item.listingId,36)}
                <span>{name(item.listingId)}</span><b>{item.units}</b></li>)}</ul>
              <p className={s.panelFoot}>The same 30 days, one year back.</p>
            </>:<Empty>{sig&&sig.lastYear.covered?"Nothing sold in these 30 days last year.":"Appears once your shop has a full year of sales here."}</Empty>}
          </div>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>Gaining favorites</h3>
            {sig&&sig.gaining.ready&&sig.gaining.listings.length?<>
              <ul className={s.miniList}>{sig.gaining.listings.map(item=><li key={item.listingId}>{thumb(item.listingId,36)}
                <span>{name(item.listingId)}</span><b>+{item.gained}</b></li>)}</ul>
              <p className={s.panelFoot}>New favorites in the last {sig.gaining.days} days.</p>
            </>:<Empty>{sig&&sig.gaining.ready?"No listing gained favorites this week.":
              `Your shop’s favorites are recorded once a day${sig?.gaining.since?` since ${new Date(sig.gaining.since+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric"})}`:""}. This shows which listings are gaining after the first week.`}</Empty>}
          </div>
          <div className={s.panel}>
            <h3 className={s.panelTitle}>The occasions</h3>
            {buyers&&(buyers.when.gift||buyers.when.birthday||buyers.when.holiday)?<>
              {buyers.when.birthday?<p className={s.count}><b>{buyers.when.birthday}</b><span>for a birthday</span></p>:null}
              {buyers.when.holiday?<p className={s.count}><b>{buyers.when.holiday}</b><span>for a holiday</span></p>:null}
              {buyers.when.quote?<blockquote className={s.quote}>“{buyers.when.quote}”</blockquote>:null}
              {whenLine(buyers)?<p className={s.panelFoot}>{whenLine(buyers)}</p>:null}
            </>:<Empty>{buyers?"No reviews name an occasion yet.":"Appears after about 10 written reviews."}</Empty>}
          </div>
        </div>
      </section>

      {/* ── Saved, not bought ── */}
      <section id="oe-saved" className={s.section} aria-labelledby="oe-saved-h">
        <div className={s.head}><h2 id="oe-saved-h" className={s.h2}>Saved, not bought</h2>
          <p className={s.sub}>Customers vote with their favorites as well. These listings were saved by many shoppers but haven’t sold in the last 12 months.</p></div>
        {saved.length?<ul className={s.savedList}>{saved.map(item=><li key={item.listingId}><a href={etsy(item.listingId)} target="_blank" rel="noopener noreferrer">
          {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={48} height={48}/>:<span className={s.noThumb}/>}
          <span className={s.listText}><b>{name(item.listingId,item.title)}</b><small>0 sold in 12 months</small></span>
          <span className={s.savedCount}><b>{num(item.favorites)}</b><small>favorites</small></span></a></li>)}</ul>
        :<Empty>Nothing here: every listing with 100 or more favorites has sold in the last 12 months.</Empty>}
      </section>

      {/* ── Numbers ── */}
      <section id="oe-numbers" className={s.section} aria-labelledby="oe-numbers-h">
        <div className={s.head}><h2 id="oe-numbers-h" className={s.h2}>Your top {top.length||10} by the numbers</h2>
          <p className={s.sub}>Tap a column to sort. Save rate is the share of people who viewed a listing and favorited it.</p></div>
        {top.length?<><p className={s.swipe}>Swipe the table for more numbers →</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr>{th("rank","#")}{th("name","Listing")}{th("sold",`Sold, ${days} days`)}{th("share","Share")}{th("year","Sold, 12 months")}
              {th("fav","Favorites")}{th("views","Views")}{th("save","Save rate")}{th("rating","Rating")}</tr></thead>
            <tbody>{tableRows.map(({item,r,save})=><tr key={item.listingId} data-golden={item.rank<=3&&item.basis==="sales"?"yes":"no"}>
              <td className={s.tRank}>{item.rank<=3&&item.basis==="sales"?"★ ":""}{item.rank}</td>
              <td className={s.tSticky}><button type="button" className={s.tName} onClick={()=>openListing(item.listingId)}>
                {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={28} height={28}/>:null}<b>{name(item.listingId,item.title)}</b></button></td>
              <td>{item.basis==="sales"?item.unitsPeriod:"—"}</td><td>{item.basis==="sales"?pct(item.share):"—"}</td>
              <td>{item.unitsYear}</td><td>{num(item.favorites)}</td><td>{num(item.views)}</td>
              <td data-high={save!=null&&save>=HIGH_SAVE_RATE?"yes":"no"}>{save==null?"—":`${(save*100).toFixed(1)}%`}</td>
              <td>{r.count&&r.average!=null?`${r.average.toFixed(1)} (${r.count})`:"—"}</td></tr>)}</tbody>
          </table>
        </div></>:<Empty>Fills in with your top 10.</Empty>}
      </section>
    </div>
  </div>;
}
