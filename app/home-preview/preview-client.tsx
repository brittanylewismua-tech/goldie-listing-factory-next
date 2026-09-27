"use client";
import { useEffect, useState } from "react";

type Listing={listingId:number;title:string;imageUrl:string;favorites:number;sales:number;revenueMinor:number;currency:string};
type Blocks={thisMonth?:{revenueMinor:number;currency:string;orders:number;asOfDay?:string;profitAvailable:boolean};
  topListings?:{period:string;rankedBy:string;listings:Listing[]};
  niches?:Array<{phrase:string;newly:number}>};

const money=(minor:number,currency="USD")=>new Intl.NumberFormat("en-US",
  {style:"currency",currency,maximumFractionDigits:0}).format(minor/100);

/*
  D1867 · WHAT BELONGS ON A HOMEPAGE.

  The trademark warning came off: a phrase on a watchlist having matches is
  not something a seller has to do anything about this morning, and putting it
  under "needs you" asked for an action nobody could name. What is left is the
  three things that are true every day - what the shop earned, what is earning
  it, and what moved in the phrases being watched - and one way to start work.

  Titles are off the photographs. A photograph of a shirt already says which
  shirt it is; the numbers are what the picture cannot say.
*/
export default function PreviewClient(){
  const [b,setB]=useState<Blocks|null>(null);
  const [view,setView]=useState<"a"|"b"|"c">("a");
  useEffect(()=>{void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Blocks}>:null)
    .then(x=>setB(x?.blocks??null)).catch(()=>undefined);},[]);

  const shots=(b?.topListings?.listings??[]).filter(l=>l.imageUrl);
  const hero=shots[0];
  const month=b?.thisMonth;
  const moved=(b?.niches??[]).filter(n=>n.newly>0).sort((x,y)=>y.newly-x.newly).slice(0,3);
  const units=(b?.topListings?.listings??[]).reduce((n,l)=>n+l.sales,0);
  const period=(b?.topListings?.period??"Last 30 days").toLowerCase();

  const Chip=({l}:{l:Listing})=><span className="hp-chip">
    <b>{l.favorites.toLocaleString()}</b><small>saved</small>
    {l.sales>0&&<><b style={{marginLeft:4}}>{l.sales}</b><small>sold</small></>}
  </span>;

  return <div className="hp">
    <div className="hp-switch">
      {([["a","Editorial"],["b","Gallery"],["c","Ledger"]] as const).map(([k,label])=>
        <button key={k} type="button" aria-pressed={view===k} onClick={()=>setView(k)}>{label}</button>)}
      <span>Your real figures and your own photographs</span>
    </div>

    {!b&&<div className="hp-load"/>}

    {b&&view==="a"&&<>
      <div className="hpA">
        <div>
          <p className="hp-kick">September · through {month?.asOfDay??"today"}</p>
          <h1 className="hp-display">{money(month?.revenueMinor??0,month?.currency)}
            <em>from {month?.orders??0} orders</em></h1>
          <p className="hp-lede">Revenue and Etsy fees are exact.
            {month?.profitAvailable?" Profit is worked out.":" Profit needs the cost of two orders."}</p>
          <a className="hp-cta" href="/listing-factory?step=setup">Make something new</a>
        </div>
        {hero&&<div className="hp-frame hpA-art"><img className="hp-shot" src={hero.imageUrl} alt=""/><Chip l={hero}/></div>}
      </div>
      <div className="hp-band">
        <div><b>{units}</b><small>units sold, {period}</small></div>
        <div><b>{shots.reduce((n,l)=>n+(l.favorites||0),0).toLocaleString()}</b><small>people saved your top three</small></div>
        <div><b className="accent">{moved.reduce((n,m)=>n+m.newly,0)}</b><small>new listings in the phrases you watch</small></div>
      </div>
      {moved.length>0&&<div className="hp-moved">
        <p className="hp-kick" style={{margin:"0 0 10px"}}>Moved since you last looked</p>
        {moved.map(m=><div className="hp-moved-row" key={m.phrase}>
          <b>+{m.newly}</b><span>{m.phrase}</span><small>new listings</small></div>)}
      </div>}
    </>}

    {b&&view==="b"&&<>
      <div className="hpB-head">
        <div><p className="hp-kick">September</p>
          <h1 className="hp-display">{money(month?.revenueMinor??0,month?.currency)}</h1></div>
        <p className="hp-lede" style={{margin:0}}>{month?.orders??0} orders. {units} units sold {period}.</p>
      </div>
      <div className="hpB">
        {hero&&<div className="hp-frame big"><img className="hp-shot" src={hero.imageUrl} alt=""/><Chip l={hero}/></div>}
        <div className="hp-panel pink"><small>New in “{moved[0]?.phrase??"your phrases"}”</small>
          <b>+{moved[0]?.newly??0}</b><small>listings since you last looked</small></div>
        <div className="hp-panel dark"><small>Units sold</small><b>{units}</b><small>{period}</small></div>
        {shots[1]&&<div className="hp-frame wide"><img className="hp-shot" src={shots[1].imageUrl} alt=""/><Chip l={shots[1]}/></div>}
        <div className="hp-panel quiet"><small>Drafts this week</small><b>13</b><small>of 20 on your goal</small></div>
        {shots[2]&&<div className="hp-frame"><img className="hp-shot" src={shots[2].imageUrl} alt=""/><Chip l={shots[2]}/></div>}
      </div>
    </>}

    {b&&view==="c"&&<>
      <div className="hpC-hero">
        <div>
          <p className="hp-kick">September · through {month?.asOfDay??"today"}</p>
          <h1 className="hp-display">{money(month?.revenueMinor??0,month?.currency)}
            <em>from {month?.orders??0} orders · {units} units {period}</em></h1>
          <p className="hp-lede">Revenue and Etsy fees are exact. Profit needs the cost of two orders.</p>
          <a className="hp-cta pale" href="/listing-factory?step=setup">Make something new</a>
        </div>
        <div className="hpC-strip">
          {shots.slice(0,3).map(l=><div className="hp-frame" key={l.listingId}>
            <img className="hp-shot" src={l.imageUrl} alt=""/><Chip l={l}/></div>)}
        </div>
      </div>
      {moved.length>0&&<div className="hp-moved" style={{marginTop:22}}>
        <p className="hp-kick" style={{margin:"0 0 10px"}}>Moved since you last looked</p>
        {moved.map(m=><div className="hp-moved-row" key={m.phrase}>
          <b>+{m.newly}</b><span>{m.phrase}</span><small>new listings</small></div>)}
      </div>}
    </>}
  </div>;
}
