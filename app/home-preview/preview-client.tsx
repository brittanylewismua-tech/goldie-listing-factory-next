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
type Home={topListings?:{listings:Array<Listing&{favorites:number}>};niches?:Array<{phrase:string;newly:number}>};

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
  useEffect(()=>{
    void fetch("/api/shop-map/map").then(r=>r.ok?r.json() as Promise<Map>:null).then(setM).catch(()=>undefined);
    void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Home}>:null)
      .then(x=>setH(x?.blocks??null)).catch(()=>undefined);
  },[]);

  if(!m) return <div className="hp"><div className="hp-load"/></div>;

  const t=m.shopTotals;
  const worlds=(m.worlds??[]).slice().sort((a,b)=>b.lifetimeRevenueMinor-a.lifetimeRevenueMinor);
  const topLife=Math.max(1,...worlds.map(w=>w.lifetimeRevenueMinor));
  const topNow=Math.max(1,...worlds.map(w=>w.revenueMinor));
  const shots=(h?.topListings?.listings??[]).filter(l=>l.imageUrl).slice(0,4);
  const sellers=(m.topListings??[]).filter(l=>l.imageUrl).slice(0,4);
  const moved=(h?.niches??[]).filter(n=>n.newly>0).sort((a,b)=>b.newly-a.newly).slice(0,4);
  const un=m.needsAttention?.unclassifiedPerformance;
  const perListing=un&&un.activeListings?Math.round(un.revenueMinor/un.activeListings):0;
  const shopAvg=t&&t.activeListings?Math.round(t.revenueMinor/t.activeListings):0;
  const gallery=shots.length?shots:sellers;
  const units90=(m.worlds??[]).reduce((n,w)=>n+w.units,0);
  const perOrder=t&&t.ordersLast90?Math.round(t.revenueLast90Minor/t.ordersLast90):0;

  return <div className="hp">
    <section className="hero">
      <div className="hero-copy">
        <p className="k">She’s A Wolf Clothing · last 90 days</p>
        <div className="hero-big">{usd(t?.revenueLast90Minor??0)}</div>
        <div className="hero-facts">
          <div><b>{num(t?.ordersLast90??0)}</b><small>ORDERS</small></div>
          <div><b>{num(units90)}</b><small>UNITS</small></div>
          <div><b>{usd(perOrder)}</b><small>PER ORDER</small></div>
          <div><b>{num(t?.activeListings??0)}</b><small>LIVE</small></div>
        </div>
        <p className="hero-life">All time: <b>{usd(t?.revenueMinor??0)}</b> across{" "}
          <b>{num(t?.orders??0)} orders</b> and <b>{num(t?.reviews??0)} reviews</b>.</p>
      </div>
      <div className="hero-shots">
        {gallery.slice(0,3).map(l=><div className="shot" key={l.listingId}>
          <img src={l.imageUrl} alt="" width={570} height={712} loading="eager"/>
          <span className="chip">
            {typeof l.favorites==="number"&&<><b>{num(l.favorites)}</b><small>SAVED</small></>}
            {l.sales>0&&<><b style={{marginLeft:typeof l.favorites==="number"?5:0}}>{l.sales}</b><small>SOLD</small></>}
          </span>
        </div>)}
      </div>
    </section>

    <div className="strip">
      <div><b>{usd(m.thisMonth?.revenueMinor??0)}</b><small>SEPTEMBER SO FAR</small></div>
      <div><b>{usd(m.thisMonth?.etsyFeesMinor??0)}</b><small>ETSY FEES</small></div>
      <div><b className="accent">{m.needsAttention?.missingProductionCosts??0}</b><small>ORDERS NEED A COST</small></div>
      <div><b>{num(moved.reduce((n,x)=>n+x.newly,0))}</b><small>NEW IN YOUR PHRASES</small></div>
    </div>

    <div className="hp-rule"><h2>Where the money came from</h2><i/><small>lifetime against the last 90 days · {num(m.counts?.niches??0)} themes</small></div>
    <div className="themes">
      <div className="theme head"><span>Theme</span><span>Lifetime vs now</span><span>All time</span><span>90 days</span></div>
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

    {un&&un.orders>0&&<>
      <div className="hp-rule"><h2>Worth a look</h2><i/></div>
      <div className="find">
        <div>
          <p className="k">{num(m.needsAttention?.unclassifiedListings??0)} listings sit outside every theme</p>
          <h3>Three of them have taken {usd(un.revenueMinor)} across {num(un.orders)} orders.</h3>
          <p>That is {usd(perListing)} per live listing, against {usd(shopAvg)} across the shop.
            Whatever those three are, nothing in the catalogue is named after them.</p>
        </div>
        <div className="find-num"><b>{usd(perListing)}</b><small>per live listing,<br/>versus {usd(shopAvg)} shop-wide</small></div>
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

    <div className="hp-rule"><h2>Out there, and in here</h2><i/></div>
    <div className="split">
      <div className="box">
        <p className="k">New listings in the phrases you watch</p>
        <div style={{marginTop:14}}>
          {moved.length?moved.map(x=><div className="moved" key={x.phrase}>
            <b>+{x.newly}</b><span>{x.phrase}</span><small>since you last looked</small></div>)
          :<p>Nothing new in your watched phrases today.</p>}
        </div>
      </div>
      <div className="box">
        <p className="k">This week in the factory</p>
        <div className="goal" style={{marginTop:14}}><b>13</b><small>of 20 drafts ready</small></div>
        <div className="meter"><i style={{width:"65%"}}/></div>
        <p>{m.needsAttention?.missingProductionCosts
          ?`${m.needsAttention.missingProductionCosts} orders still need a production cost before September has a profit figure.`
          :"Every order this month has a production cost."}</p>
        <a className="cta" href="/listing-factory?step=setup">Make something new</a>
      </div>
    </div>
  </div>;
}
