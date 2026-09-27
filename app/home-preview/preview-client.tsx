"use client";
import { useEffect, useState } from "react";

type Listing={listingId:number;title:string;imageUrl:string;favorites?:number;sales:number;revenueMinor:number};
type World={label:string;activeListings:number;units:number;revenueMinor:number;
  lifetimeUnits:number;lifetimeRevenueMinor:number};
type Map={shopTotals?:{activeListings:number;listings:number;orders:number;ordersLast90:number;
  revenueLast90Minor:number;revenueMinor:number;reviews:number};
  worlds?:World[];topListings?:Listing[];counts?:{listings:number;listingsWithSales:number;niches:number};
  needsAttention?:{missingProductionCosts:number;unclassifiedListings:number;
    unclassifiedPerformance?:{activeListings:number;orders:number;revenueMinor:number}};
  thisMonth?:{revenueMinor:number;orders:number;etsyFeesMinor:number;currency:string;accuracy?:string};
  worldsPeriod?:string};
type Home={topListings?:{listings:Array<Listing&{favorites:number}>;period?:string;rankedBy?:string};
  niches?:Array<{phrase:string;newly:number}>};
type Hot={listings?:Array<{listingId:number;title:string;image:string|null;price:number|null;
  savesGained:number;sold:number;url:string}>};
type Evidence={quote?:string;text?:string;rating?:number;shop?:string};
type Finding={title:string;explanation?:string;kind:string;evidence?:Evidence[]};
type Niche={name:string;phase:string;analysis?:{reviews30:number;reviewsPrior30:number};
  buyerInsights?:{findings?:Finding[]}};

const usd=(minor:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",
  maximumFractionDigits:0}).format(minor/100);
const num=(n:number)=>n.toLocaleString("en-US");

/*
  D1868 · A HOMEPAGE FOR A SHOP WITH A HISTORY.

  The page was showing $94 for a shop that has taken $91,007 across 3,688
  orders and 607 reviews. The month is the smallest true number in the
  product and it was the only one on the front page.

  What is here now is the shape of the business: what it has earned against
  what it is earning, every theme ranked by lifetime revenue beside its
  active listings, and the finding that falls out of putting those two
  columns next to each other - Self-Love has taken $9,748 across 413 units
  and has four listings live. The catalogue has drifted away from what sold.
*/
export default function PreviewClient(){
  const [m,setM]=useState<Map|null>(null);
  const [h,setH]=useState<Home|null>(null);
  const [hot,setHot]=useState<Hot|null>(null);
  const [niches,setNiches]=useState<Niche[]>([]);
  useEffect(()=>{
    void fetch("/api/shop-map/map").then(r=>r.ok?r.json() as Promise<Map>:null).then(setM).catch(()=>undefined);
    void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Home}>:null)
      .then(x=>setH(x?.blocks??null)).catch(()=>undefined);
    /* What is moving on Etsy in the last day, and what the shops in her own
       researched searches are charging. Both are already computed; neither
       was anywhere near the front page. */
    void fetch("/api/sold-overnight?hours=24").then(r=>r.ok?r.json() as Promise<Hot>:null)
      .then(x=>setHot(x)).catch(()=>undefined);
    void fetch("/api/niche-research").then(r=>r.ok?r.json() as Promise<{projects?:Array<{id:string}>}>:null)
      .then(async body=>{
        const out:Niche[]=[];
        for(const project of (body?.projects??[]).slice(0,2)){
          const detail=await fetch(`/api/niche-research?id=${encodeURIComponent(project.id)}`)
            .then(r=>r.ok?r.json() as Promise<{project:Niche}>:null).catch(()=>null);
          if(detail?.project?.analysis)out.push(detail.project);
        }
        setNiches(out);
      }).catch(()=>undefined);
  },[]);

  if(!m) return <div className="hp"><div className="hp-load"/></div>;

  const t=m.shopTotals;
  const worlds=(m.worlds??[]).slice().sort((a,b)=>b.lifetimeRevenueMinor-a.lifetimeRevenueMinor);
  const topLife=Math.max(1,...worlds.map(w=>w.lifetimeRevenueMinor));
  const topNow=Math.max(1,...worlds.map(w=>w.revenueMinor));
  const shots=(h?.topListings?.listings??[]).filter(l=>l.imageUrl).slice(0,4);
  const sellers=(m.topListings??[]).filter(l=>l.imageUrl).slice(0,4);
  const moved=(h?.niches??[]).filter(n=>n.newly>0).sort((a,b)=>b.newly-a.newly).slice(0,4);
  const gallery=shots.length?shots:sellers;
  /* Most saves gained in the window, photographs only. */
  const movers=(hot?.listings??[]).filter(l=>l.image&&l.sold>0).slice(0,4);
  /*
    D1875 · The best thing this product knows, and it was three clicks down.
    A finding is a reason a buyer gave, drawn from reviews on the shops in her
    own research, with the review itself attached.
  */
  const reasons=niches.flatMap(n=>(n.buyerInsights?.findings??[])
    .filter(f=>f.title&&(f.evidence??[]).length>0)
    .slice(0,2)
    .map(f=>{
      const ev=(f.evidence??[])[0];
      const quote=(ev?.quote||ev?.text||"").trim();
      return {niche:n.name,title:f.title,shop:ev?.shop,rating:ev?.rating,
        quote:quote.length>180?`${quote.slice(0,177)}…`:quote};
    })).slice(0,4);
  /* The label is built from the endpoint's own period and ranking so it
     cannot drift away from what is actually on the shelf. */
  const galleryLabel=shots.length
    ? `Top three by ${h?.topListings?.rankedBy==="favorites"?"saves":"units sold"} · ${(h?.topListings?.period??"last 30 days").toLowerCase()}`
    : `Top three by units sold · ${(m.worldsPeriod??"last 90 days").toLowerCase()}`;
  const perOrder=t&&t.ordersLast90?Math.round(t.revenueLast90Minor/t.ordersLast90):0;

  return <div className="hp">
    <section className="hero">
      <div className="hero-copy">
        <p className="k">She’s A Wolf Clothing · last 90 days</p>
        <div className="hero-big">{usd(t?.revenueLast90Minor??0)}</div>
        <div className="hero-facts">
          <div><b>{num(t?.ordersLast90??0)}</b><small>ORDERS</small></div>
          <div><b>{usd(perOrder)}</b><small>AVERAGE ORDER</small></div>
          <div><b>{num(t?.activeListings??0)}</b><small>LISTINGS LIVE</small></div>
        </div>
        <p className="hero-life">All time: <b>{usd(t?.revenueMinor??0)}</b> across{" "}
          <b>{num(t?.orders??0)} orders</b> and <b>{num(t?.reviews??0)} reviews</b>.</p>
      </div>
      <div className="hero-shots">
        <p className="shots-label">{galleryLabel}</p>
        {gallery.slice(0,3).map(l=><div className="shot" key={l.listingId}>
          <img src={l.imageUrl} alt="" width={570} height={712} loading="eager"/>
          <span className="chip">
            {typeof l.favorites==="number"&&<><b>{num(l.favorites)}</b><small>SAVED</small></>}
            {l.sales>0&&<><b style={{marginLeft:typeof l.favorites==="number"?5:0}}>{l.sales}</b><small>SOLD</small></>}
          </span>
        </div>)}
      </div>
    </section>

    {/* D1871 · September, and only September. The fourth tile used to read
        "24 new in your phrases", which named nothing a seller could picture
        and described the wrong thing besides. */}
    <div className="strip three">
      <div><b>{usd(m.thisMonth?.revenueMinor??0)}</b><small>SEPTEMBER SO FAR</small></div>
      <div><b>{usd(m.thisMonth?.etsyFeesMinor??0)}</b><small>ETSY FEES THIS MONTH</small></div>
      <div><b>{num(m.thisMonth?.orders??0)}</b><small>ORDERS THIS MONTH</small></div>
    </div>

    {/* D1873 · The grouping is built from repeated phrases, tags and shop
        sections in the seller's own listings - shop-map-worlds.ts, no model
        call - so these are keyword clusters, and naming them that is more
        accurate than "themes" or "categories" ever was. */}
    <div className="hp-rule"><h2>Keywords driving sales in your shop</h2><i/>
      <small><em className="key life"/> all time &nbsp; <em className="key now"/> last 90 days</small></div>
    <div className="themes">
      <div className="theme head"><span>Keyword</span><span/><span>All time</span><span>Last 90 days</span></div>
      {worlds.map(w=><div className="theme" key={w.label}>
        <div><div className="name">{w.label}</div><div className="meta">{w.activeListings} live</div></div>
        <div>
          <div className="theme-bar"><i style={{width:`${Math.round(w.lifetimeRevenueMinor/topLife*100)}%`}}/></div>
          <div className="theme-bar now"><i style={{width:`${Math.max(w.revenueMinor?3:0,Math.round(w.revenueMinor/topNow*100))}%`}}/></div>
        </div>
        <div><div className="life">{usd(w.lifetimeRevenueMinor)}</div><div className="lifeu">{num(w.lifetimeUnits)} units</div></div>
        <div><div className="now">{w.revenueMinor?usd(w.revenueMinor):"—"}</div><div className="nowu">{w.units?`${w.units} units`:"nothing"}</div></div>
      </div>)}
    </div>
    <p className="source">Grouped from the words that repeat across your own titles, tags and
      shop sections. Revenue is what listings carrying that keyword have taken — not what
      buyers searched for.</p>

    {/*
      D1874 · THE REST OF THE PRODUCT, ON THE FRONT PAGE.

      Everything above this is the seller's own shop. These two sections are
      the tools she is paying for pointed outward: what moved on Etsy in the
      last day, and what the shops in her own researched searches charge for
      the same garment she sells.
    */}
    {movers.length>0&&<>
      {/* D1875 · "Moving" is a word nobody says. readBoard sums sold and
          saves_gained over buckets newer than now minus the window, so both
          figures are counted over the last 24 hours exactly. */}
      <div className="hp-rule"><h2>What sold on Etsy overnight</h2><i/>
        <small>counted from stock dropping, last 24 hours</small></div>
      <div className="shelf">
        {movers.map(l=><a className="shot mover" key={l.listingId} href={l.url} target="_blank" rel="noopener noreferrer">
          {l.image?<img src={l.image} alt="" width={570} height={712} loading="lazy"/>:<span/>}
          <span className="chip">
            <b>{num(l.sold)}</b><small>SOLD IN 24H</small>
            {l.savesGained>0&&<><b style={{marginLeft:5}}>+{num(l.savesGained)}</b><small>SAVES</small></>}
          </span>
          {typeof l.price==="number"&&<span className="price">${l.price.toFixed(2)}</span>}
        </a>)}
      </div>
    </>}

    {reasons.length>0&&<>
      <div className="hp-rule"><h2>Why people bought in your niches</h2><i/>
        <small>from reviews on the shops you research</small></div>
      <div className="reasons">
        {reasons.map(r=><div className="reason" key={r.niche+r.title}>
          <p className="k">{r.niche}</p>
          <h3>{r.title}</h3>
          {r.quote&&<blockquote>“{r.quote}”<cite>{r.shop?`${r.shop}`:""}{r.rating?` · ${r.rating}★`:""}</cite></blockquote>}
        </div>)}
      </div>
    </>}

    {gallery.length>3&&<>
      <div className="hp-rule"><h2>Selling now</h2><i/><small>{m.worldsPeriod?.toLowerCase()??"last 90 days"}</small></div>
      <div className="shelf">
        {gallery.slice(3).map(l=><div className="shot" key={l.listingId}>
          <img src={l.imageUrl} alt="" width={570} height={712} loading="lazy"/>
          <span className="chip">
            {typeof l.favorites==="number"&&<><b>{num(l.favorites)}</b><small>SAVED</small></>}
            {l.sales>0&&<><b style={{marginLeft:typeof l.favorites==="number"?5:0}}>{l.sales}</b><small>SOLD</small></>}
          </span>
        </div>)}
      </div>
    </>}

    <div className="split">
      <div className="box">
        {/* newSinceLastBrief counts listings Goldie has watched sell for the
            first time since the member last opened the brief - not listings
            that merely appeared, which is what the old wording implied. */}
        <p className="k">Started selling in the searches you follow</p>
        <div style={{marginTop:14}}>
          {moved.length?moved.map(x=><div className="moved" key={x.phrase}>
            <b>{x.newly}</b><span>listings in <b className="ph">{x.phrase}</b></span></div>)
          :<p>Nothing in your saved searches has started selling since you last looked.</p>}
        </div>
        {moved.length>0&&<p className="why">Goldie watches these searches and notices when a
          listing’s stock drops, which means it sold. These are the ones that started selling
          since you last opened Research.</p>}
      </div>
      <div className="box">
        <p className="k">Your listings</p>
        <div className="goal" style={{marginTop:14}}><b>{num(t?.activeListings??0)}</b><small>live on Etsy</small></div>
        <a className="cta" href="/listing-factory?step=setup">Make something new</a>
        {Boolean(m.needsAttention?.missingProductionCosts)&&<p className="why">
          September’s revenue and Etsy fees are exact, but Goldie does not know what
          {" "}{m.needsAttention?.missingProductionCosts} of the orders cost to make, so it is not showing a
          profit figure rather than a wrong one. <a href="/shop-map/costs">Enter those two costs</a> and
          the figure completes.</p>}
      </div>
    </div>
  </div>;
}
