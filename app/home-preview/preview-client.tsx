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
  /*
    D1870 · THE FINDING THAT IS ACTUALLY IN THE DATA.

    This panel used to point at the 58 listings the classifier could not place
    and call three of them the shop's strongest, which was the arithmetic read
    backwards: $170 a listing against a $1,096 average is the weakest corner
    of the shop, not the strongest, and "nothing in the catalogue is named
    after them" meant nothing at all.

    What the same two columns do say is this: a theme that has sold hundreds
    of items and has almost nothing live in it. Money per live listing, most
    first, and only where it beats the shop's own average.
  */
  const shopAvg=t&&t.activeListings?Math.round(t.revenueMinor/t.activeListings):0;
  const perLive=(w:World)=>Math.round(w.lifetimeRevenueMinor/Math.max(1,w.activeListings));
  const thin=worlds.filter(w=>w.activeListings>0&&w.lifetimeUnits>=50&&perLive(w)>shopAvg)
    .sort((a,b)=>perLive(b)-perLive(a))[0];
  const biggest=worlds.slice().sort((a,b)=>b.activeListings-a.activeListings)[0];
  const gallery=shots.length?shots:sellers;
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

    <div className="hp-rule"><h2>What your themes have earned</h2><i/>
      <small><em className="key life"/> all time &nbsp; <em className="key now"/> last 90 days</small></div>
    <div className="themes">
      <div className="theme head"><span>Theme</span><span/><span>All time</span><span>Last 90 days</span></div>
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

    {thin&&<>
      <div className="hp-rule"><h2>One thing worth a look</h2><i/></div>
      <div className="find">
        <div>
          <p className="k">{thin.label}</p>
          <h3>{num(thin.lifetimeUnits)} of these have sold, and you have {thin.activeListings} listings live in it.</h3>
          <p>This theme has taken {usd(thin.lifetimeRevenueMinor)} all time — {usd(Math.round(thin.lifetimeRevenueMinor/Math.max(1,thin.activeListings)))} for
            every listing you currently have live, more than any other theme in your shop.
            {biggest?` ${biggest.label} has ${biggest.activeListings} live and has taken ${usd(biggest.lifetimeRevenueMinor)}.`:""}</p>
        </div>
        <div className="find-num"><b>{thin.activeListings}</b><small>listings live<br/>in {thin.label.toLowerCase()}</small></div>
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
