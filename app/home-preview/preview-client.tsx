"use client";
import { useEffect, useState } from "react";

type Listing={listingId:number;title:string;imageUrl:string;favorites:number;sales:number;revenueMinor:number;currency:string};
type Blocks={thisMonth?:{revenueMinor:number;currency:string;orders:number;asOfDay?:string;profitAvailable:boolean};
  topListings?:{period:string;rankedBy:string;listings:Listing[]};
  niches?:Array<{phrase:string;newly:number}>;trademark?:{watched?:number;needReview?:number}};

const money=(minor:number,currency="USD")=>new Intl.NumberFormat("en-US",
  {style:"currency",currency,maximumFractionDigits:0}).format(minor/100);
/* Etsy titles are search surfaces. The first clause is the design. */
const short=(t:string)=>t.split(/[,|]/)[0].split(" ").slice(0,5).join(" ");

export default function PreviewClient(){
  const [b,setB]=useState<Blocks|null>(null);
  const [view,setView]=useState<"a"|"b"|"c">("a");
  useEffect(()=>{void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Blocks}>:null)
    .then(x=>setB(x?.blocks??null)).catch(()=>undefined);},[]);

  const shots=(b?.topListings?.listings??[]).filter(l=>l.imageUrl);
  const hero=shots[0];
  const month=b?.thisMonth;
  const niche=(b?.niches??[]).slice().sort((x,y)=>y.newly-x.newly)[0];
  const units=(b?.topListings?.listings??[]).reduce((n,l)=>n+l.sales,0);
  const faves=(b?.topListings?.listings??[]).reduce((n,l)=>n+(l.favorites||0),0);

  return <div className="hp">
    <div className="hp-switch">
      {([["a","Editorial"],["b","Gallery"],["c","Split"]] as const).map(([k,label])=>
        <button key={k} type="button" aria-pressed={view===k} onClick={()=>setView(k)}>{label}</button>)}
      <span>Real figures and real photographs from your shop</span>
    </div>

    {!b&&<div className="hp-load"/>}

    {b&&view==="a"&&<>
      <div className="hpA">
        <div>
          <p className="hp-eyebrow">September · through {month?.asOfDay??"today"}</p>
          <h1 className="hp-display">{money(month?.revenueMinor??0,month?.currency)}<br/><em>this month</em></h1>
          <p className="hp-lede">{month?.orders??0} orders. Profit is waiting on {month?.profitAvailable?"nothing":"2 production costs"}.</p>
          <a className="hp-cta" href="/listing-factory?step=setup">Start a batch →</a>
        </div>
        {hero&&<div className="hp-frame hpA-art">
          <img className="hp-shot" src={hero.imageUrl} alt=""/>
          <span className="hp-tag">Most favourited · <b>{hero.favorites.toLocaleString()}</b></span>
        </div>}
      </div>
      <div className="hpA-strip">
        <div><b>{units}</b><small>units sold, last 30 days</small></div>
        <div><b>{faves.toLocaleString()}</b><small>favourites on your top three</small></div>
        <div><b>{niche?.newly??0}</b><small>new listings in “{niche?.phrase??"your niches"}”</small></div>
      </div>
      <div className="hp-alert">
        <div><b>Girl Math has 11 live trademark matches</b>
          <small>None of them are class 025 clothing</small></div>
        <a href="/trademark?phrase=Girl%20Math">Review</a>
      </div>
    </>}

    {b&&view==="b"&&<>
      <div className="hpB-head">
        <div><p className="hp-eyebrow">She’s A Wolf Clothing</p>
          <h1 className="hp-display">{money(month?.revenueMinor??0,month?.currency)}</h1></div>
        <p className="hp-lede" style={{margin:0}}>September, {month?.orders??0} orders, {units} units sold in the last 30 days.</p>
      </div>
      <div className="hpB">
        {hero&&<div className="hp-frame big">
          <img className="hp-shot" src={hero.imageUrl} alt=""/>
          <span className="hp-tag">{short(hero.title)} · <b>{hero.favorites.toLocaleString()} favourites</b></span>
        </div>}
        <div className="hp-panel pink"><small>Needs you</small><b>11</b><small>trademark matches on Girl Math</small></div>
        <div className="hp-panel dark"><small>New in “{niche?.phrase??""}”</small><b>{niche?.newly??0}</b><small>listings since your last look</small></div>
        {shots[1]&&<div className="hp-frame wide">
          <img className="hp-shot" src={shots[1].imageUrl} alt=""/>
          <span className="hp-tag">{short(shots[1].title)}</span>
        </div>}
        <div className="hp-panel quiet"><small>Drafts this week</small><b>13/20</b><small>weekly goal</small></div>
        {shots[2]&&<div className="hp-frame wide">
          <img className="hp-shot" src={shots[2].imageUrl} alt=""/>
          <span className="hp-tag">{short(shots[2].title)}</span>
        </div>}
      </div>
    </>}

    {b&&view==="c"&&<>
      <div className="hpC">
        <div className="hpC-left">
          <p className="hp-eyebrow">Sunday, 27 September</p>
          <h1 className="hp-display">Two orders<br/>need a cost.</h1>
          <p className="hp-lede">Revenue and Etsy fees are exact. Profit for September can’t be worked out until you enter what those two cost to make.</p>
          <a className="hp-cta light" href="/shop-map/costs">Add production costs →</a>
        </div>
        <div className="hpC-rail">
          {shots.slice(0,3).map(l=><div key={l.listingId}><img className="hp-shot" src={l.imageUrl} alt=""/></div>)}
        </div>
      </div>
      <div className="hpC-foot">
        <div><b>{money(month?.revenueMinor??0,month?.currency)}</b><small>September · {month?.orders??0} orders</small></div>
        <div><b>{units}</b><small>units sold, last 30 days</small></div>
        <div><b>{niche?.newly??0}</b><small>new in “{niche?.phrase??""}”</small></div>
      </div>
    </>}
  </div>;
}
