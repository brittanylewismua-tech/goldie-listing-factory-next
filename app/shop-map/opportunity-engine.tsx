"use client";
/*
  Opportunity Engine: Votes, Build, Track.

  Votes is the approved design (canvas "Opportunity Engine Design", Votes and
  "Votes on a phone" boards). It reports what customers chose with their
  purchases and favorites, and what they said in reviews. It does not tell
  the seller what to make; that is the Build page's job.

  The pink header runs the full width of the work area and holds the period
  switch, because the switch changes the whole page, not one card.
*/
import {useEffect,useMemo,useRef,useState} from "react";
import "@fontsource/archivo-black";
import "@fontsource-variable/instrument-sans";
import s from "./opportunity-engine.module.css";
import {buildTopTen,familyName,type PeriodListing,type CatalogListing,type YearSale,type OwnReview,type DesignRead} from "./opportunity-engine-model";
import {reviewsFor,saveRate,HIGH_SAVE_RATE,listingBadge,listingWhy,winningFormula,productsChosen,savedNotBought,
  buyerSignals,wearLine,whenLine,backLine,nameOf} from "./opportunity-votes-model";

export type EngineSection="overview"|"build"|"track";
type Data={period:PeriodListing[];catalog:CatalogListing[];year:YearSale[];reviews:OwnReview[];
  totalPeriod:number;refreshedAt:number|null;shopName:string|null};

const num=(value:number|null|undefined)=>value==null?"—":value.toLocaleString("en-US");
const pct=(value:number)=>`${Math.round(value*100)}%`;
const dollars=(minor:number)=>"$"+Math.round(minor/100).toLocaleString("en-US");
const etsy=(id:number)=>`https://www.etsy.com/listing/${id}`;
const synced=(at:number|null)=>at?new Date(at*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null;
const bigImage=(url:string)=>url.replace("il_570xN","il_794xN");

async function json<T>(url:string):Promise<T>{
  const response=await fetch(url,{credentials:"same-origin"});
  if(!response.ok)throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

export default function OpportunityEngine({days,onDays,section="overview",listingId=null,onSection}:{
  days:30|90;onDays:(days:30|90)=>void;section?:EngineSection;listingId?:number|null;
  onSection:(section:EngineSection,listingId?:number|null)=>void;
}){
  const [data,setData]=useState<Data|null>(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [index,setIndex]=useState(0);
  const [reads,setReads]=useState<Map<number,DesignRead>>(new Map());
  const cardRef=useRef<HTMLElement>(null);

  useEffect(()=>{
    let live=true;setFailed(false);setIndex(0);
    void (async()=>{
      try{
        const [purchases,catalog,year,insights]=await Promise.all([
          json<{shop?:{shopName?:string};purchasePriorities?:{listings:PeriodListing[];totalUnits:number;refreshedAt:number|null}}>(`/api/shop-map/map?view=overview-purchases&days=${days}`),
          json<{listings?:CatalogListing[]}>(`/api/shop-map/my-listings`),
          json<{soldListings?:{listings:YearSale[]}}>(`/api/shop-map/map?view=sold&days=365`),
          json<{ownReviews?:OwnReview[]}>(`/api/shop-map/map?view=overview-insights&days=${days}`).catch(()=>({ownReviews:[]})),
        ]);
        if(!live)return;
        const map=purchases.purchasePriorities;
        setData({period:map?.listings??[],catalog:catalog.listings??[],year:year.soldListings?.listings??[],
          reviews:insights.ownReviews??[],totalPeriod:map?.totalUnits??0,refreshedAt:map?.refreshedAt??null,shopName:purchases.shop?.shopName??null});
      }catch{if(live)setFailed(true)}
    })();
    return ()=>{live=false};
  },[days,attempt]);

  const top=useMemo(()=>data?buildTopTen(data.period,data.catalog,data.year):[],[data]);

  /* Read the printed design on the listings the page shows: the top ten first,
     then everything sold this year. The formula cards are built from these. */
  const wantedIds=useMemo(()=>data?[...new Set([...top.map(row=>row.listingId),...data.year.map(row=>row.listingId)])].slice(0,60):[],[data,top]);
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
  const saved=useMemo(()=>data?savedNotBought(data.catalog,data.year,new Set(top.map(row=>row.listingId))):[],[data,top]);
  const buyers=useMemo(()=>data&&data.reviews.length>=10?buyerSignals(data.reviews):null,[data]);
  const images=useMemo(()=>new Map((data?.catalog??[]).map(row=>[row.listingId,row.imageUrl])),[data]);

  const revenue=data?data.period.reduce((sum,item)=>sum+Number(item.productRevenueMinor||0),0):0;
  const listingsSold=data?data.period.filter(item=>item.unitsPurchased>0).length:0;

  const header=<header className={s.band}>
    <div className={s.bandInner}>
      <div className={s.bandTop}>
        <span className={s.connected}><i aria-hidden="true"/>{data?.shopName??"Your shop"} is connected</span>
        <div className={s.showing}><span>Showing</span>
          <div className={s.period} role="group" aria-label="Period for the whole page">
            {([30,90] as const).map(value=><button key={value} type="button" aria-pressed={days===value} onClick={()=>onDays(value)}>Last {value} days</button>)}
          </div></div>
      </div>
      <div className={s.bandMain}>
        <div className={s.titleBlock}>
          <h1 className={s.h1}>{section==="build"?"Build":section==="track"?"Track":"Votes"}</h1>
          <p className={s.lede}>{section==="build"?"Turn what customers chose into your next listings."
            :section==="track"?"See how your new listings are doing against the ones customers already chose."
            :"Here’s what customers are voting on with their purchases and favorites in your shop."}</p>
        </div>
        {data&&section==="overview"?<dl className={s.figures}>
          <div><dt>sales</dt><dd>{num(data.totalPeriod)}</dd></div>
          <div><dt>revenue</dt><dd>{dollars(revenue)}</dd></div>
          <div><dt>listings sold</dt><dd>{listingsSold}</dd></div>
        </dl>:null}
      </div>
    </div>
  </header>;

  const tabs=<nav className={s.phoneTabs} aria-label="Opportunity Engine">
    {([["overview","Votes"],["build","Build"],["track","Track"]] as const).map(([key,label])=>
      <button key={key} type="button" aria-current={section===key?"page":undefined} onClick={()=>onSection(key)}>{label}</button>)}
  </nav>;

  if(section!=="overview"){
    const focus=listingId&&data?top.find(row=>row.listingId===listingId)??null:null;
    return <div className={`${s.engine} oe-engine`}>{tabs}{header}
      <div className={s.wrap}>
        <section className={s.soon}>
          {focus?<div className={s.soonListing}>
            {focus.imageUrl?<img src={focus.imageUrl} alt="" width={72} height={72}/>:null}
            <div><b>{nameOf(reads,focus.listingId,focus.title)}</b><span>No. {focus.rank} in your top {top.length} · {focus.unitsPeriod} sold in {days} days</span></div>
          </div>:null}
          <h2 className={s.h2}>{section==="build"?"Build is the next page we’re designing.":"Track is coming after Build."}</h2>
          <p>{section==="build"?"It will start from the listing you choose on Votes and walk through building it out, one step at a time."
            :"It will follow each listing you publish and compare its first weeks with your usual start."}</p>
          <button type="button" className={s.btnDark} onClick={()=>onSection("overview")}>Back to Votes</button>
        </section>
      </div>
    </div>;
  }

  if(failed)return <div className={`${s.engine} oe-engine`}>{tabs}{header}<div className={s.wrap}><section className={s.state} role="alert">
    <strong>Your votes could not load.</strong>
    <button type="button" className={s.btnLight} onClick={()=>{setData(null);setAttempt(value=>value+1)}}>Try again</button></section></div></div>;
  if(!data)return <div className={`${s.engine} oe-engine`}>{tabs}{header}<div className={s.wrap}><section className={s.state} role="status">
    <span className={s.spinner} aria-hidden="true"/>Reading your sales, favorites and reviews…</section></div></div>;
  if(!top.length)return <div className={`${s.engine} oe-engine`}>{tabs}{header}<div className={s.wrap}><section className={s.state}>
    <strong>No listings to rank yet.</strong> Connect your shop and sync listings in Connections.</section></div></div>;

  const row=top[Math.min(index,top.length-1)];
  const own=reviewsFor(row.listingId,data.reviews);
  const badge=listingBadge(row,top,data.reviews);
  const rate=saveRate(row);
  const golden=row.rank<=3;
  const salesCount=top.filter(item=>item.basis==="sales").length;
  const pick=(next:number)=>{
    setIndex(next);
    /* On a phone the list sits under the card, so a tap would change a card the
       seller cannot see. Bring the card back into view. */
    if(typeof window!=="undefined"&&window.matchMedia("(max-width: 760px)").matches)
      cardRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const listRow=(item:typeof top[number])=><button key={item.listingId} type="button" className={s.listRow}
    aria-pressed={item.listingId===row.listingId} onClick={()=>pick(item.rank-1)}>
    <span className={s.listRank}>{item.rank}</span>
    {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={38} height={38}/>:<span className={s.noThumb}/>}
    <span className={s.listText}><b>{nameOf(reads,item.listingId,item.title)}</b>
      <small>{item.basis==="sales"?`${item.unitsPeriod} sold`:`${num(item.favorites)} favorites`}</small></span>
  </button>;
  const stats:Array<[string,string]>=[
    ...(row.basis==="sales"?[[pct(row.share),`of your sales in the last ${days} days (${row.unitsPeriod} of ${data.totalPeriod})`] as [string,string]]:[]),
    [String(row.unitsYear),`${row.unitsYear===1?"sale":"sales"} in the last 12 months`],
    [num(row.favorites),"shoppers saved it to their favorites"],
    [num(row.views),"views on Etsy"],
    ...(rate!=null?[[`${(rate*100).toFixed(1)}%`,`of viewers saved it${rate>=HIGH_SAVE_RATE?", among your highest":""}`] as [string,string]]:[]),
    own.count&&own.average!=null?[`${own.average.toFixed(1)} ★`,`from ${own.count} ${own.count===1?"review":"reviews"}`]:["—","no reviews yet"],
  ];
  const topProduct=products?.rows[0];

  return <div className={`${s.engine} oe-engine`}>
    {tabs}{header}
    <div className={s.wrap}>

      <section className={s.section} aria-labelledby="oe-top">
        <div className={s.head}>
          <h2 id="oe-top" className={s.h2}>Your top {top.length}</h2>
          <p className={s.sub}>{salesCount>=top.length?"The listings your customers bought most. Start with number one."
            :salesCount?`The listings your customers bought most. Places ${salesCount+1} to ${top.length} are ranked by favorites.`
            :`Nothing sold in the last ${days} days, so these are ranked by favorites.`}</p>
        </div>
        <div className={s.topGrid}>
          <article ref={cardRef} className={s.card} data-golden={golden?"yes":"no"} aria-label={nameOf(reads,row.listingId,row.title)}>
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
                <h3 className={s.name}>{nameOf(reads,row.listingId,row.title)}</h3>
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
              {top.length>3?<div className={s.golden}><p>★ Your top 3</p>{top.slice(0,3).map(listRow)}</div>:null}
              <div className={s.rest}>{(top.length>3?top.slice(3):top).map(listRow)}</div>
            </div>
          </aside>
        </div>
        <p className={s.meta}>{synced(data.refreshedAt)?`Sales synced ${synced(data.refreshedAt)}.`:""}</p>
      </section>

      {formula&&formula.cards.length?<section className={s.section} aria-labelledby="oe-formula">
        <div className={s.head}><h2 id="oe-formula" className={s.h2}>Your winning formula</h2>
          <p className={s.sub}>What the designs your customers buy have in common. Last 12 months, {formula.units} sales.</p></div>
        <div className={s.formula}>{formula.cards.map(card=><div key={card.key} className={s.panel}>
          <h3 className={s.panelTitle}>{card.label}</h3>
          <p className={s.big}><b>{pct(card.share)}</b><span>of sales</span></p>
          {card.recent!=null?<span className={s.trend} data-trend={card.trend}>{card.trend==="up"?`Rising: ${pct(card.recent)} lately`
            :card.trend==="down"?`Down to ${pct(card.recent)} lately`:`Steady: ${pct(card.recent)} lately`}</span>:null}
          <span className={s.thumbs}>{card.listingIds.map(id=>images.get(id)).filter((url):url is string=>Boolean(url))
            .map(url=><img key={url} src={url} alt="" loading="lazy" width={44} height={44}/>)}</span>
        </div>)}</div>
      </section>:null}

      {products&&products.rows.length||saved.length?<section className={s.pair}>
        {products&&products.rows.length?<div className={s.section} aria-labelledby="oe-products">
          <div className={s.head}><h2 id="oe-products" className={s.h2}>The products they choose</h2>
            <p className={s.sub}>Sales in the last 12 months, against how many listings you have of each.</p></div>
          <div className={s.panel}>
            {products.rows.map(item=><div key={item.family} className={s.bar}>
              <p><b>{item.label}</b><span>{item.sold} sold · {item.listed} listed</span></p>
              <span className={s.track}><i style={{width:`${Math.max(2,Math.round(item.sold/Math.max(1,products.rows[0].sold)*100))}%`}}/></span>
            </div>)}
            {topProduct&&products.total?<p className={s.panelFoot}>{topProduct.sold} of your {products.total} sales were {familyName(topProduct.family)}.{topProduct.sold/products.total>=0.5?` Customers are voting for ${familyName(topProduct.family)}.`:""}</p>:null}
          </div>
        </div>:null}
        {saved.length?<div className={s.section} aria-labelledby="oe-saved">
          <div className={s.head}><h2 id="oe-saved" className={s.h2}>Saved, not bought</h2>
            <p className={s.sub}>Customers vote with their favorites as well. These listings were saved by many shoppers but haven’t sold in the last 12 months.</p></div>
          <ul className={s.savedList}>{saved.map(item=><li key={item.listingId}><a href={etsy(item.listingId)} target="_blank" rel="noopener noreferrer">
            {item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={48} height={48}/>:<span className={s.noThumb}/>}
            <span className={s.listText}><b>{nameOf(reads,item.listingId,item.title)}</b><small>0 sold in 12 months</small></span>
            <span className={s.savedCount}><b>{num(item.favorites)}</b><small>favorites</small></span></a></li>)}</ul>
        </div>:null}
      </section>:null}

      {buyers?<section className={s.section} aria-labelledby="oe-buyers">
        <div className={s.head}><h2 id="oe-buyers" className={s.h2}>What buyers tell you</h2>
          <p className={s.sub}>From your {buyers.count} most recent reviews: who they buy for, where they wear it, when they buy, and who comes back.</p></div>
        <div className={s.buyers}>
          {buyers.whoFor.length?<div className={s.panel}>
            <h3 className={s.panelTitle}>Who they buy for</h3>
            {buyers.whoFor.map(item=><div key={item.label} className={s.bar}>
              <p><span>{item.label}</span><b>{item.n}</b></p>
              <span className={s.track}><i style={{width:`${Math.round(item.n/Math.max(1,buyers.whoFor[0].n)*100)}%`}}/></span>
            </div>)}
            <p className={s.panelFoot}>{buyers.whoFor[0].label==="Men in their life"?"Most name a man in their life.":"Most are buying for another woman in their life."}</p>
          </div>:null}
          {buyers.wear.work||buyers.wear.campus||buyers.wear.march?<div className={s.panel}>
            <h3 className={s.panelTitle}>Where they wear it</h3>
            {buyers.wear.work?<p className={s.count}><b>{buyers.wear.work}</b><span>wear it to work</span></p>:null}
            {buyers.wear.quote?<blockquote className={s.quote}>“{buyers.wear.quote}”</blockquote>:null}
            {buyers.wear.campus?<p className={s.count}><b>{buyers.wear.campus}</b><span>mention college or campus</span></p>:null}
            {buyers.wear.march?<p className={s.count}><b>{buyers.wear.march}</b><span>wear it to a march or to vote</span></p>:null}
            {wearLine(buyers,topProduct?familyName(topProduct.family):"designs")?<p className={s.panelFoot}>{wearLine(buyers,topProduct?familyName(topProduct.family):"designs")}</p>:null}
          </div>:null}
          {buyers.when.gift||buyers.when.birthday?<div className={s.panel}>
            <h3 className={s.panelTitle}>When they buy</h3>
            {buyers.when.gift?<p className={s.count}><b>{buyers.when.gift}</b><span>bought it as a gift</span></p>:null}
            {buyers.when.birthday?<p className={s.count}><b>{buyers.when.birthday}</b><span>for a birthday</span></p>:null}
            {buyers.when.holiday?<p className={s.count}><b>{buyers.when.holiday}</b><span>for a holiday</span></p>:null}
            {buyers.when.quote?<blockquote className={s.quote}>“{buyers.when.quote}”</blockquote>:null}
            {whenLine(buyers)?<p className={s.panelFoot}>{whenLine(buyers)}</p>:null}
          </div>:null}
          {buyers.back.n?<div className={s.panel}>
            <h3 className={s.panelTitle}>Who comes back</h3>
            <p className={s.count}><b>{buyers.back.n}</b><span>say they’ll buy from you again</span></p>
            {buyers.back.quotes.map(line=><blockquote key={line} className={s.quote}>“{line}”</blockquote>)}
            {backLine(buyers)?<p className={s.panelFoot}>{backLine(buyers)}</p>:null}
          </div>:null}
        </div>
      </section>:null}

      <section className={s.section} aria-labelledby="oe-numbers">
        <div className={s.head}><h2 id="oe-numbers" className={s.h2}>Your top {top.length} by the numbers</h2>
          <p className={s.sub}>Save rate is the share of people who viewed a listing and favorited it. A high save rate means shoppers who find it want it.</p></div>
        <p className={s.swipe}>Swipe the table for more numbers →</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>#</th><th>Listing</th><th>Sold, {days} days</th><th>Share</th><th>Sold, 12 months</th><th>Favorites</th><th>Views</th><th>Save rate</th><th>Rating</th></tr></thead>
            <tbody>{top.map(item=>{const r=reviewsFor(item.listingId,data.reviews);const rate=saveRate(item);
              return <tr key={item.listingId} data-golden={item.rank<=3?"yes":"no"}>
                <td className={s.tRank}>{item.rank<=3?"★ ":""}{item.rank}</td>
                <td><span className={s.tName}>{item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" width={28} height={28}/>:null}<b>{nameOf(reads,item.listingId,item.title)}</b></span></td>
                <td>{item.basis==="sales"?item.unitsPeriod:"—"}</td><td>{item.basis==="sales"?pct(item.share):"—"}</td>
                <td>{item.unitsYear}</td><td>{num(item.favorites)}</td><td>{num(item.views)}</td>
                <td data-high={rate!=null&&rate>=HIGH_SAVE_RATE?"yes":"no"}>{rate==null?"—":`${(rate*100).toFixed(1)}%`}</td>
                <td>{r.count&&r.average!=null?`${r.average.toFixed(1)} (${r.count})`:"—"}</td></tr>})}</tbody>
          </table>
        </div>
      </section>
    </div>
  </div>;
}

