"use client";
import { useEffect, useState } from "react";

/* ============================================================================
 * D1881 · NO ADVICE. COUNTED SALES ONLY.
 *
 * Three framings went in the bin, all of them mine and all of them wrong:
 *
 * MARGIN ALARMS assumed Printify. Sellers run Printful, Gelato, several at
 * once, or none - the cost side is not consistently knowable, so a homepage
 * built on it lies for most people.
 *
 * LISTINGS AT RISK needed a blank-to-listing mapping that exists for 5 of 83
 * listings here and would be no better elsewhere.
 *
 * MAKE THIS and FIX THIS were advice. "Make this" is a guess wearing a
 * confident face, and "fix this" argues with a seller who has already learned
 * the right lesson: if it is not selling, move on.
 *
 * What is left is the only thing here nobody else has - sales counted from
 * stock falling, not estimated from reviews. So the page shows what is
 * selling, at three distances: across Etsy, inside the searches she follows,
 * and in her own shop. It observes. It does not instruct.
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * WHAT IS ACTUALLY THERE.
 *
 * Measured first, designed second. The supply-side margin alarm - "Printify
 * raised this blank, you have N listings on it, here is the money" - is the
 * most valuable thing this product could say and it CANNOT RUN TODAY:
 * publish_identity joins an Etsy listing to a Printify blueprint only for
 * listings the Factory published, and that is 5 of 83. No blank brand name
 * appears in any live title either, so it cannot be recovered from the words.
 *
 * What IS available is the product family - 69 tees, 18 sweatshirts, 3 tanks,
 * a mug, two phone cases - so exposure is stated at that grain and labelled
 * as that grain. A homepage that overstates its own evidence is worse than a
 * boring one.
 * ==========================================================================*/

type Listing={listingId:number;title:string;imageUrl:string;favorites?:number;sales:number;revenueMinor:number};
type World={label:string;activeListings:number;units:number;revenueMinor:number;
  lifetimeUnits:number;lifetimeRevenueMinor:number};
type Map={shopTotals?:{activeListings:number;listings:number;orders:number;ordersLast90:number;
  revenueLast90Minor:number;revenueMinor:number;reviews:number};
  worlds?:World[];topListings?:Listing[];counts?:{listings:number;listingsWithSales:number;niches:number};
  needsAttention?:{missingProductionCosts:number};
  thisMonth?:{revenueMinor:number;orders:number;etsyFeesMinor:number;currency:string};
  worldsPeriod?:string};
type Home={topListings?:{listings:Array<Listing&{favorites:number}>;period?:string;rankedBy?:string};
  niches?:Array<{phrase:string;newly:number}>};
type Hot={listings?:Array<{listingId:number;title:string;image:string|null;price:number|null;
  savesGained:number;sold:number;url:string}>};
type Opportunity={phrase:string;listings:number;reviews:number;prior:number;shops:number};
type Niche={name:string;analysis?:{opportunities?:Opportunity[]}};
type Mine={title:string;state:string};
type Updates={items?:Array<{headline?:string;title?:string;source?:string}>;sources?:Array<{name:string}>;
  status?:string;day?:string};

const usd=(minor:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
  maximumFractionDigits:0}).format(minor/100);
const num=(n:number)=>n.toLocaleString("en-US");

const FAMILIES:Array<[string,RegExp]>=[["Sweatshirts and hoodies",/sweat\s*shirt|sweatshirt|hoodie|crewneck/i],
  ["T-shirts",/\bt[- ]?shirt|\btee\b|\bshirt\b/i],["Tanks",/\btank\b/i],
  ["Mugs",/\bmug\b/i],["Phone cases",/phone case/i]];

export default function PreviewClient(){
  const [m,setM]=useState<Map|null>(null);
  const [h,setH]=useState<Home|null>(null);
  const [hot,setHot]=useState<Hot|null>(null);
  const [niches,setNiches]=useState<Niche[]>([]);
  const [mine,setMine]=useState<Mine[]>([]);
  const [up,setUp]=useState<Updates|null>(null);
  const [view,setView]=useState<"a"|"b"|"c">("a");

  useEffect(()=>{
    /* Each destination is written out, so the fetch-coverage guard can see
       every one of them. */
    void fetch("/api/shop-map/map").then(r=>r.ok?r.json() as Promise<Map>:null)
      .then(setM).catch(()=>undefined);
    void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Home}>:null)
      .then(x=>setH(x?.blocks??null)).catch(()=>undefined);
    void fetch("/api/sold-overnight?hours=24").then(r=>r.ok?r.json() as Promise<Hot>:null)
      .then(setHot).catch(()=>undefined);
    void fetch("/api/platform-updates").then(r=>r.ok?r.json() as Promise<Updates>:null)
      .then(setUp).catch(()=>undefined);
    void fetch("/api/shop-map/my-listings").then(r=>r.ok?r.json() as Promise<{listings?:Mine[]}>:null)
      .then(x=>setMine(x?.listings??[])).catch(()=>undefined);
    void fetch("/api/niche-research").then(r=>r.ok?r.json() as Promise<{projects?:Array<{id:string}>}>:null)
      .then(async body=>{
        const out:Niche[]=[];
        for(const p of (body?.projects??[]).slice(0,2)){
          const d=await fetch(`/api/niche-research?id=${encodeURIComponent(p.id)}`)
            .then(r=>r.ok?r.json() as Promise<{project:Niche}>:null).catch(()=>null);
          if(d?.project?.analysis)out.push(d.project);
        }
        setNiches(out);
      }).catch(()=>undefined);
  },[]);

  if(!m) return <div className="hp"><div className="hp-load"/></div>;

  const t=m.shopTotals;
  const worlds=(m.worlds??[]).slice().sort((a,b)=>b.lifetimeRevenueMinor-a.lifetimeRevenueMinor);
  const topLife=Math.max(1,...worlds.map(w=>w.lifetimeRevenueMinor));
  const shots=(h?.topListings?.listings??[]).filter(l=>l.imageUrl);
  const gallery=shots.length?shots:(m.topListings??[]).filter(l=>l.imageUrl);
  const sold24=(hot?.listings??[]).filter(l=>l.image&&l.sold>0).slice(0,4);
  const active=mine.filter(l=>l.state==="active");
  const families=FAMILIES.map(([name,re])=>({name,n:active.filter(l=>re.test(l.title||"")).length}))
    .filter(f=>f.n>0).sort((a,b)=>b.n-a.n);
  const rising=niches.flatMap(n=>(n.analysis?.opportunities??[])
    .filter(o=>o.reviews>=5&&o.reviews>o.prior)
    .map(o=>({...o,niche:n.name,gain:o.reviews-o.prior})))
    .sort((x,y)=>y.gain-x.gain).slice(0,5);
  const risingTop=Math.max(1,...rising.map(r=>r.reviews));
  const moved=(h?.niches??[]).filter(n=>n.newly>0).sort((a,b)=>b.newly-a.newly).slice(0,3);
  const thin=worlds.filter(w=>w.lifetimeUnits>=50&&w.units===0)
    .sort((a,b)=>b.lifetimeRevenueMinor-a.lifetimeRevenueMinor)[0];
  const changes=(up?.items??[]).length;
  const watching=(up?.sources??[]).length;
  const owed=m.needsAttention?.missingProductionCosts??0;

  const Photos=({n=3}:{n?:number})=><div className="shots">
    {gallery.slice(0,n).map(l=><div className="shot" key={l.listingId}>
      <img src={l.imageUrl} alt="" width={570} height={712} loading="eager"/>
      <span className="chip"><b>{num(l.favorites??0)}</b><small>SAVED</small>
        {l.sales>0&&<><b style={{marginLeft:5}}>{l.sales}</b><small>SOLD</small></>}</span>
    </div>)}
  </div>;

  const Money=()=><>
    <p className="k">She’s A Wolf Clothing · last 90 days</p>
    <div className="big">{usd(t?.revenueLast90Minor??0)}</div>
    <div className="facts">
      <div><b>{num(t?.ordersLast90??0)}</b><small>ORDERS</small></div>
      <div><b>{usd(t&&t.ordersLast90?Math.round(t.revenueLast90Minor/t.ordersLast90):0)}</b><small>AVERAGE ORDER</small></div>
      <div><b>{num(t?.activeListings??0)}</b><small>LISTINGS LIVE</small></div>
    </div>
  </>;

  const Rising=()=><div className="table">
    <div className="row head"><span>Category</span><span/><span>Last 30</span><span>Before</span></div>
    {rising.map(r=><div className="row" key={r.niche+r.phrase}>
      <div><b className="name">{r.phrase}</b><small>{r.shops} shops · {num(r.listings)} listings</small></div>
      <div><div className="bar now"><i style={{width:`${Math.round(r.reviews/risingTop*100)}%`}}/></div>
        <div className="bar"><i style={{width:`${Math.round(r.prior/risingTop*100)}%`}}/></div></div>
      <div className="figure">{num(r.reviews)}<small>+{r.gain}</small></div>
      <div className="figure quiet">{num(r.prior)}<small>{r.niche}</small></div>
    </div>)}
  </div>;

  const Earned=()=><div className="table">
    <div className="row head"><span>Keyword</span><span/><span>All time</span><span>Last 90</span></div>
    {worlds.map(w=><div className="row" key={w.label}>
      <div><b className="name">{w.label}</b><small>{w.activeListings} live</small></div>
      <div><div className="bar"><i style={{width:`${Math.round(w.lifetimeRevenueMinor/topLife*100)}%`}}/></div>
        <div className="bar now"><i style={{width:`${w.revenueMinor?Math.max(3,Math.round(w.revenueMinor/topLife*100)):0}%`}}/></div></div>
      <div className="figure">{usd(w.lifetimeRevenueMinor)}<small>{num(w.lifetimeUnits)} units</small></div>
      <div className="figure accent">{w.revenueMinor?usd(w.revenueMinor):"—"}<small>{w.units?`${w.units} units`:"nothing"}</small></div>
    </div>)}
  </div>;

  const Overnight=()=><div className="shots four">
    {sold24.map(l=><a className="shot" key={l.listingId} href={l.url} target="_blank" rel="noopener noreferrer">
      {l.image&&<img src={l.image} alt="" width={570} height={712} loading="lazy"/>}
      <span className="chip"><b>{num(l.sold)}</b><small>SOLD IN 24H</small></span>
      {typeof l.price==="number"&&<span className="price">${l.price.toFixed(2)}</span>}
    </a>)}
  </div>;

  const Rule=({title,note}:{title:string;note?:string})=>
    <div className="rule"><h2>{title}</h2><i/>{note&&<small>{note}</small>}</div>;

  return <div className="hp">
    <div className="switch">
      {([["a","Ledger"],["b","Two sides"],["c","Brief"]] as const).map(([k,l])=>
        <button key={k} type="button" aria-pressed={view===k} onClick={()=>setView(k)}>{l}</button>)}
      <span>Real figures, real photographs, honest gaps</span>
    </div>

    {view==="a"&&<>
      <section className="hero"><div className="hero-copy"><Money/></div><Photos/></section>
      <Rule title="Selling on Etsy in the last 24 hours" note="counted, not estimated"/>
      <Overnight/>
      <Rule title="Selling in the searches you follow"/>
      <div className="table">
        <div className="row head"><span>Search</span><span/><span>Listings</span><span/></div>
        {moved.map(x=><div className="row" key={x.phrase}>
          <div><b className="name">{x.phrase}</b><small>since you last looked</small></div>
          <div><div className="bar now"><i style={{width:`${Math.round(x.newly/Math.max(1,moved[0].newly)*100)}%`}}/></div></div>
          <div className="figure accent">{num(x.newly)}<small>started selling</small></div>
          <div/>
        </div>)}
      </div>
      <Rule title="Selling in your shop" note={m.worldsPeriod?.toLowerCase()}/>
      <Earned/>
    </>}

    {view==="b"&&<>
      <section className="hero"><div className="hero-copy"><Money/></div><Photos/></section>
      <Rule title="Getting more reviews on Etsy" note="last 30 days against the 30 before"/>
      <Rising/>
      <Rule title="Selling on Etsy in the last 24 hours" note="counted, not estimated"/>
      <Overnight/>
      <Rule title="Selling in your shop"/>
      <Earned/>
    </>}

    {view==="c"&&<>
      <section className="brief">
        <p className="k">Sunday, 27 September</p>
        <h1>{moved[0]?`${moved[0].newly} listings started selling in ${moved[0].phrase}.`:"Nothing new started selling in your searches."}{" "}
          {rising[0]?`${rising[0].phrase} is up to ${rising[0].reviews} reviews from ${rising[0].prior}.`:""}</h1>
        <p className="lede">{usd(t?.revenueLast90Minor??0)} over 90 days from {num(t?.ordersLast90??0)} orders,
          across {num(t?.activeListings??0)} live listings.</p>
      </section>
      <Photos n={4}/>
      <Rule title="Selling on Etsy in the last 24 hours" note="counted, not estimated"/>
      <Overnight/>
      <Rule title="Getting more reviews on Etsy" note="last 30 days against the 30 before"/>
      <Rising/>
      <Rule title="Selling in your shop"/>
      <Earned/>
    </>}
  </div>;
}
