"use client";
import { useEffect, useState } from "react";

/* ============================================================================
 * D1882 · THREE HOMEPAGES. OBSERVATION ONLY.
 *
 * Out, and not coming back: margin alarms (they assume Printify, and sellers
 * run Printful, Gelato, several or none), listings at risk (needs a blank
 * mapping that covers 5 of 83), make this and fix this (a guess in a confident
 * voice, and an argument with a seller who already knows to move on).
 *
 * What is left is the only thing here nobody else has: 18,046 live Etsy
 * listings read twice a day, and the difference in their stock counted as
 * units sold. 2,136 of them yesterday. Beside that, the seller's own
 * catalogue. Where the two do not line up is the whole point, and it is a
 * fact rather than an instruction.
 * ==========================================================================*/

type Listing={listingId:number;title:string;imageUrl:string;favorites?:number;sales:number;revenueMinor:number};
type World={label:string;activeListings:number;units:number;revenueMinor:number;
  lifetimeUnits:number;lifetimeRevenueMinor:number};
type Map={shopTotals?:{activeListings:number;ordersLast90:number;revenueLast90Minor:number;
  revenueMinor:number;orders:number;reviews:number};
  worlds?:World[];topListings?:Listing[];worldsPeriod?:string};
type Home={topListings?:{listings:Array<Listing&{favorites:number}>};niches?:Array<{phrase:string;newly:number}>};
type Sold={listingId:number;title:string;image:string|null;price:number|null;
  savesGained:number;sold:number;url:string;product?:string};
type Hot={listings?:Sold[];watched?:number;totalSold?:number;
  products?:Array<{key:string;label:string;listings:number;sold:number}>};
type Mine={title:string;state:string};

const usd=(minor:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
  maximumFractionDigits:0}).format(minor/100);
const num=(n:number)=>n.toLocaleString("en-US");

/* Her catalogue at the same grain the board reports, read from her own
   titles because that is all 83 of her live listings carry. */
const FAMILY:Record<string,RegExp>={
  "T-shirts":/\bt[- ]?shirts?\b|\btees?\b|(?<!sweat)\bshirts?\b/i,
  "Sweatshirts & Hoodies":/sweat\s*shirt|sweatshirt|hoodie|crewneck|sweater/i,
  "Tanks":/\btank\b/i,"Mugs":/\bmug\b/i,"Phone Cases":/phone case/i,
  "Stickers":/\bsticker/i,"Hats":/\bhat\b|\bcap\b|beanie/i,
  "Baby Bodysuits":/bodysuit|onesie/i,"Throw Pillows":/pillow/i,"Blankets":/blanket/i,
  "Tote Bags":/tote/i,"Wall Art":/\bposter\b|wall art|\bprint\b/i};

export default function PreviewClient(){
  const [m,setM]=useState<Map|null>(null);
  const [h,setH]=useState<Home|null>(null);
  const [hot,setHot]=useState<Hot|null>(null);
  const [mine,setMine]=useState<Mine[]>([]);
  const [view,setView]=useState<"a"|"b"|"c">("a");

  useEffect(()=>{
    void fetch("/api/shop-map/map").then(r=>r.ok?r.json() as Promise<Map>:null).then(setM).catch(()=>undefined);
    void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Home}>:null)
      .then(x=>setH(x?.blocks??null)).catch(()=>undefined);
    void fetch("/api/sold-overnight?hours=24").then(r=>r.ok?r.json() as Promise<Hot>:null)
      .then(setHot).catch(()=>undefined);
    void fetch("/api/shop-map/my-listings").then(r=>r.ok?r.json() as Promise<{listings?:Mine[]}>:null)
      .then(x=>setMine(x?.listings??[])).catch(()=>undefined);
  },[]);

  if(!m||!hot) return <div className="hp"><div className="hp-load"/></div>;

  const t=m.shopTotals;
  const active=mine.filter(l=>l.state==="active");
  const yours=(label:string)=>{const re=FAMILY[label];return re?active.filter(l=>re.test(l.title||"")).length:0;};
  const shelves=(hot.products??[]).slice().sort((a,b)=>b.sold-a.sold)
    .map(p=>({...p,yours:yours(p.label)}));
  const peak=Math.max(1,...shelves.map(s=>s.sold));
  const sold=(hot.listings??[]).filter(l=>l.image&&l.sold>0);
  const moved=(h?.niches??[]).filter(n=>n.newly>0).sort((a,b)=>b.newly-a.newly).slice(0,3);
  const worlds=(m.worlds??[]).slice().sort((a,b)=>b.lifetimeRevenueMinor-a.lifetimeRevenueMinor);
  const topLife=Math.max(1,...worlds.map(w=>w.lifetimeRevenueMinor));
  const shots=(h?.topListings?.listings??[]).filter(l=>l.imageUrl);
  const gallery=shots.length?shots:(m.topListings??[]).filter(l=>l.imageUrl);
  const absent=shelves.filter(s=>s.yours===0&&s.sold>=70);
  /*
    D1883 · THE BIGGEST NUMBER HAS TO BE ABOUT HER.

    It was 2,190 - everything sold across every listing Goldie watches. That
    is a fact about the dataset, not about this shop, and putting it in 92px
    flattered the tool instead of serving the seller.

    What belongs there is demand for what she actually sells: the category she
    is already in that sold most yesterday, and how many listings she has
    standing in it.
  */
  const mine0=shelves.filter(s=>s.yours>0).sort((a,b)=>b.sold-a.sold)[0];
  const lead=mine0??shelves[0];
  const perOrder=t&&t.ordersLast90?Math.round(t.revenueLast90Minor/t.ordersLast90):0;

  /* D1884 · Her shop is the top of her own homepage. The market is context
     underneath it, not the headline. */
  const Hers=()=><div className="hero-copy">
    <p className="k">She’s A Wolf Clothing · last 90 days</p>
    <div className="big">{usd(t?.revenueLast90Minor??0)}</div>
    <div className="facts">
      <div><b>{num(t?.ordersLast90??0)}</b><small>ORDERS</small></div>
      <div><b>{usd(perOrder)}</b><small>AVERAGE ORDER</small></div>
      <div><b>{num(t?.activeListings??0)}</b><small>LISTINGS LIVE</small></div>
    </div>
    {lead&&<p className="hero-note">{lead.label} sold {num(lead.sold)} times on Etsy yesterday.
      You have {num(lead.yours)} live.</p>}
  </div>;

  const Yourshots=({n=3}:{n?:number})=><div className="shots">
    {gallery.slice(0,n).map(l=><div className="shot" key={l.listingId}>
      <img src={l.imageUrl} alt="" width={570} height={712} loading="eager"/>
      <span className="chip"><b>{num(l.favorites??0)}</b><small>SAVED</small>
        {l.sales>0&&<><b style={{marginLeft:5}}>{l.sales}</b><small>SOLD</small></>}</span>
    </div>)}
  </div>;

  const Rule=({title,note}:{title:string;note?:string})=>
    <div className="rule"><h2>{title}</h2><i/>{note&&<small>{note}</small>}</div>;

  const Tile=({l}:{l:Sold})=><a className="shot" href={l.url} target="_blank" rel="noopener noreferrer">
    {l.image&&<img src={l.image} alt="" width={570} height={712} loading="lazy"/>}
    <span className="chip"><b>{num(l.sold)}</b><small>SOLD</small></span>
    {typeof l.price==="number"&&<span className="price">${l.price.toFixed(2)}</span>}
  </a>;

  const Shelves=({limit=8}:{limit?:number})=><div className="table">
    <div className="row head"><span>Product</span><span/><span>Sold</span><span>You have</span></div>
    {shelves.slice(0,limit).map(s=><div className="row" key={s.key}>
      <div><b className="name">{s.label}</b><small>{num(s.listings)} listings sold something</small></div>
      <div><div className="bar now"><i style={{width:`${Math.round(s.sold/peak*100)}%`}}/></div></div>
      <div className="figure">{num(s.sold)}<small>units</small></div>
      <div className={s.yours?"figure":"figure none"}>{s.yours?num(s.yours):"none"}<small>{s.yours?"live":"in your shop"}</small></div>
    </div>)}
  </div>;

  const Yours=()=><div className="table">
    <div className="row head"><span>Keyword</span><span/><span>All time</span><span>Last 90</span></div>
    {worlds.map(w=><div className="row" key={w.label}>
      <div><b className="name">{w.label}</b><small>{w.activeListings} live</small></div>
      <div><div className="bar"><i style={{width:`${Math.round(w.lifetimeRevenueMinor/topLife*100)}%`}}/></div>
        <div className="bar now"><i style={{width:`${w.revenueMinor?Math.max(3,Math.round(w.revenueMinor/topLife*100)):0}%`}}/></div></div>
      <div className="figure">{usd(w.lifetimeRevenueMinor)}<small>{num(w.lifetimeUnits)} units</small></div>
      <div className="figure accent">{w.revenueMinor?usd(w.revenueMinor):"—"}<small>{w.units?`${w.units} units`:"nothing"}</small></div>
    </div>)}
  </div>;

  const Searches=()=>moved.length?<div className="table">
    <div className="row head"><span>Search you follow</span><span/><span>Started selling</span><span/></div>
    {moved.map(x=><div className="row" key={x.phrase}>
      <div><b className="name">{x.phrase}</b><small>since you last looked</small></div>
      <div><div className="bar now"><i style={{width:`${Math.round(x.newly/moved[0].newly*100)}%`}}/></div></div>
      <div className="figure accent">{num(x.newly)}<small>listings</small></div><div/>
    </div>)}
  </div>:null;

  return <div className="hp">
    <div className="switch">
      {([["a","Tape"],["b","Floor"],["c","Window"]] as const).map(([k,l])=>
        <button key={k} type="button" aria-pressed={view===k} onClick={()=>setView(k)}>{l}</button>)}
      <span>Counted from stock, last 24 hours · your own figures beside it</span>
    </div>

    {view==="a"&&<>
      <section className="hero"><Hers/><Yourshots/></section>
      <Rule title="What sold most, listing by listing" note={`${num(hot.totalSold??0)} units across ${num(hot.watched??0)} watched listings`}/>
      <div className="shots four">{sold.slice(3,11).map(l=><Tile l={l} key={l.listingId}/>)}</div>
      <Rule title="Selling in the searches you follow"/><Searches/>
      <Rule title="Selling in your shop" note={m.worldsPeriod?.toLowerCase()}/><Yours/>
    </>}

    {view==="b"&&<>
      <section className="hero"><Hers/><Yourshots/></section>
      <Rule title="Every product type, against your shelf" note="units sold in 24 hours"/>
      <Shelves limit={12}/>
      <Rule title="Selling in the searches you follow"/><Searches/>
      <Rule title="Selling in your shop"/><Yours/>
    </>}

    {view==="c"&&<>
      <section className="hero"><Hers/><Yourshots/></section>
      <Rule title="What sold on Etsy yesterday" note={`${num(hot.totalSold??0)} units across ${num(hot.watched??0)} watched listings`}/>
      <div className="shots six">{sold.slice(0,12).map(l=><Tile l={l} key={l.listingId}/>)}</div>
      <Rule title="By product type" note="units sold in 24 hours · your live count beside it"/>
      <Shelves limit={8}/>
      <Rule title="Your own best sellers" note={m.worldsPeriod?.toLowerCase()}/>
      <div className="shots four">{gallery.slice(0,4).map(l=><div className="shot" key={l.listingId}>
        <img src={l.imageUrl} alt="" width={570} height={712} loading="lazy"/>
        <span className="chip"><b>{num(l.favorites??0)}</b><small>SAVED</small>
          {l.sales>0&&<><b style={{marginLeft:5}}>{l.sales}</b><small>SOLD</small></>}</span>
      </div>)}</div>
      <Rule title="Selling in your shop"/><Yours/>
    </>}
  </div>;
}
