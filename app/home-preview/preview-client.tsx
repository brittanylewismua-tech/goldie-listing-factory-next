"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Listing={listingId:number;title:string;imageUrl:string;favorites?:number|null;sales:number;revenueMinor:number};
type MapData={shop?:{shopName?:string};shopTotals?:{ordersLast30:number;revenueLast30Minor:number;ordersLast90:number;revenueLast90Minor:number};soldListings?:{period:string;days:number;listings:Listing[]}};
type Home={niches?:Array<{phrase:string;newly:number}>};
type Sold={listingId:number;title:string;image:string|null;price:number|null;savesGained:number;sold:number;url:string;product?:string};
type Hot={listings?:Sold[];watched?:number;totalSold?:number;products?:Array<{key:string;label:string;listings:number;sold:number}>};
type Summary={phrases:number;needReview:number};
type UpdateItem={id?:string;platform:"Etsy"|"Printify";title:string;impact?:string;action?:string;sourceUrl:string;imageUrl?:string|null;priority?:string;publishedAt:number};
type Updates={items?:UpdateItem[];recent?:Array<UpdateItem&{day?:string}>;sources?:Array<unknown>;checkedAt?:number};
type Niche={id?:string;name:string;analysis?:{opportunities?:Array<{phrase:string;reviews:number;prior:number;shops:number;listings:number}>}};
type Batch={id:string;display_name?:string;step?:string;status?:string;draft_count?:number;expected_listing_count?:number};

const usd=(minor:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(minor/100);
const num=(n:number)=>n.toLocaleString("en-US");
const when=(seconds:number)=>{const days=Math.floor((Date.now()/1000-seconds)/86400);return days<=0?"Today":days===1?"Yesterday":days<7?String(days)+" days ago":new Date(seconds*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});};

export default function PreviewClient({platformUpdate}:{platformUpdate?:ReactNode}={}){
  const [period,setPeriod]=useState<30|90>(90);
  const [maps,setMaps]=useState<{30:MapData|null;90:MapData|null}>({30:null,90:null});
  const [home,setHome]=useState<Home|null>(null);
  const [hot,setHot]=useState<Hot|null>(null);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [updates,setUpdates]=useState<Updates|null>(null);
  const [niches,setNiches]=useState<Niche[]>([]);
  const [batch,setBatch]=useState<Batch|null>(null);
  const [account,setAccount]=useState<{name?:string}|null>(null);

  useEffect(()=>{
    void Promise.all([30,90].map(days=>fetch("/api/shop-map/map?days="+days).then(r=>r.ok?r.json() as Promise<MapData>:null)))
      .then(([m30,m90])=>setMaps({30:m30,90:m90})).catch(()=>undefined);
    void fetch("/api/home").then(r=>r.ok?r.json() as Promise<{blocks:Home}>:null).then(x=>setHome(x?.blocks??null)).catch(()=>undefined);
    void fetch("/api/sold-overnight?hours=24").then(r=>r.ok?r.json() as Promise<Hot>:null).then(setHot).catch(()=>undefined);
    void fetch("/api/command-center/summary").then(r=>r.ok?r.json() as Promise<Summary>:null).then(setSummary).catch(()=>undefined);
    void fetch("/api/platform-updates").then(r=>r.ok?r.json() as Promise<Updates>:null).then(setUpdates).catch(()=>undefined);
    void fetch("/api/batches").then(r=>r.ok?r.json() as Promise<{batches?:Batch[]}>:null).then(x=>setBatch(x?.batches?.[0]??null)).catch(()=>undefined);
    void fetch("/api/account").then(r=>r.ok?r.json() as Promise<{name?:string}>:null).then(setAccount).catch(()=>undefined);
    void fetch("/api/niche-research").then(r=>r.ok?r.json() as Promise<{projects?:Array<{id:string}>}>:null).then(async body=>{
      const out:Niche[]=[];
      for(const p of (body?.projects??[]).slice(0,2)){
        const d=await fetch("/api/niche-research?id="+encodeURIComponent(p.id)).then(r=>r.ok?r.json() as Promise<{project:Niche}>:null).catch(()=>null);
        if(d?.project)out.push({...d.project,id:p.id});
      }
      setNiches(out);
    }).catch(()=>undefined);
  },[]);

  const map=maps[period];
  if(!map||!hot)return <div className="home4"><div className="home4-load"/></div>;
  const listings=(map.soldListings?.listings??[]).filter(l=>l.imageUrl).slice(0,10);
  const totals=map.shopTotals;
  const revenue=period===90?(totals?.revenueLast90Minor??0):(totals?.revenueLast30Minor??0);
  const orders=period===90?(totals?.ordersLast90??0):(totals?.ordersLast30??0);
  const units=(map.soldListings?.listings??[]).reduce((sum,l)=>sum+l.sales,0);
  const aov=orders?Math.round(revenue/orders):0;
  const shopName=map.shop?.shopName||"Your shop";
  const marquee=[...listings,...listings];

  const moved=(home?.niches??[]).filter(n=>n.newly>0).sort((a,b)=>b.newly-a.newly);
  const rising=niches.flatMap(n=>(n.analysis?.opportunities??[]).filter(o=>o.reviews>o.prior).map(o=>({...o,niche:n.name,id:n.id,gain:o.reviews-o.prior}))).sort((a,b)=>b.gain-a.gain);
  const daily=[
    moved[0]?{tag:"RESEARCH",title:moved[0].phrase+" moved again.",body:num(moved[0].newly)+" listings started showing momentum since your last check.",href:"/market-watch?keyword="+encodeURIComponent(moved[0].phrase)+"&new=1",image:listings[1]?.imageUrl}:null,
    rising[0]?{tag:"RESEARCH",title:rising[0].phrase+" is gaining buyer activity.",body:num(rising[0].reviews)+" reviews, up "+num(rising[0].gain)+", across "+num(rising[0].shops)+" shops in your "+rising[0].niche+" research.",href:rising[0].id?"/market-watch/research?id="+encodeURIComponent(rising[0].id):"/market-watch/research",image:listings[2]?.imageUrl}:null,
    summary&&summary.needReview>0?{tag:"TRADEMARK",title:String(summary.needReview)+" watched phrase"+(summary.needReview===1?"":"s")+" need review.",body:String(summary.phrases)+" phrase"+(summary.phrases===1?"":"s")+" on your watchlist.",href:"/trademark",image:null}:null
  ].filter(Boolean) as Array<{tag:string;title:string;body:string;href:string;image?:string|null}>;
  const up=updates;
  const changes=(up?.items??[]).length+(up?.recent??[]).length;
  const platform=[...(updates?.items??[]),...(updates?.recent??[])].sort((a,b)=>(Number(b.priority==="ACTION REQUIRED")-Number(a.priority==="ACTION REQUIRED"))||b.publishedAt-a.publishedAt).slice(0,4);
  const overnight=(hot.listings??[]).filter(l=>l.image).sort((a,b)=>b.sold-a.sold||b.savesGained-a.savesGained).slice(0,12);
  const shelves=(hot.products??[]).slice().sort((a,b)=>b.sold-a.sold).slice(0,6);

  return <div className="home4">
    <header className="home4-head home4-contained"><div><p className="home4-kicker">{new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</p><h1>{"Good morning"+(account?.name?", "+account.name.split(" ")[0]:"")+"."}</h1><p className="home4-shop-name">{shopName}</p></div></header>

    <section className="home4-section first home4-contained"><header className="home4-section-head"><div className="home4-title"><b>01</b><div><h2>Shop stats</h2><p>Top 10 listings ranked by units sold</p></div></div><select value={period} onChange={e=>setPeriod(Number(e.target.value) as 30|90)} aria-label="Shop stats period"><option value={90}>Last 90 days</option><option value={30}>Last 30 days</option></select></header>
      <div className="home4-hero"><div className="home4-marquee-mask"><div className="home4-marquee">{marquee.map((l,i)=><a className={"home4-rank "+(i%10===0?"first":"")} key={String(l.listingId)+"-"+String(i)} href={"https://www.etsy.com/listing/"+String(l.listingId)} target="_blank" rel="noreferrer"><span className="home4-rank-num">{i%10+1}</span><img src={l.imageUrl} alt="" loading={i<5?"eager":"lazy"}/><div><b>{num(l.sales)} sold</b><span>{usd(l.revenueMinor)}<small>revenue</small></span></div></a>)}</div></div>
        <div className="home4-stats"><div className="home4-stat-main"><span className="home4-kicker">{shopName+" · last "+String(period)+" days"}</span><strong>{usd(revenue)}</strong><small>revenue</small></div><div className="home4-stat"><b>{num(orders)}</b><span>orders</span></div><div className="home4-stat"><b>{num(units)}</b><span>units sold</span></div><div className="home4-stat"><b>{usd(aov)}</b><span>average order</span></div><a href="/shop-map?tab=sold">See all sold listings <b>→</b></a></div>
      </div>
    </section>

    <section className="home4-section pink-band"><header className="home4-section-head"><div className="home4-title"><b>02</b><div><h2>Daily updates</h2><p>The useful movement across your research, shop, and watches</p></div></div></header><div className="home4-daily">{daily.slice(0,3).map((d,i)=><a className={"home4-daily-card "+(i===0?"lead":"")} href={d.href} key={d.title}><div className="home4-daily-copy"><span>{d.tag}</span><h3>{d.title}</h3><p>{d.body}</p><u>Open →</u></div>{d.image&&<img src={d.image} alt="" width={300} height={360} loading="lazy"/>}</a>)}{!daily.length&&<div className="home4-empty">Nothing new needs your attention today.</div>}</div></section>

    <section className="home4-section home4-contained"><header className="home4-section-head"><div className="home4-title"><b>03</b><div><h2>Etsy + Printify updates</h2><p>Headlines from official sources that affect sellers</p>{up&&<small>last 30 days · {num((up.sources??[]).length)} official sources</small>}</div></div><a className="home4-link" href="/platform-updates">See all updates →</a></header>{platform.length?<div className="home4-platform"><a className="home4-platform-lead" href={platform[0].sourceUrl} target="_blank" rel="noreferrer">{platform[0].imageUrl?<img src={platform[0].imageUrl} alt=""/>:<div className="home4-platform-placeholder">{platform[0].platform}</div>}<div><span>{platform[0].platform+" · "+when(platform[0].publishedAt)}</span><h3>{platform[0].title}</h3><p>{platform[0].impact}</p><u>Read update →</u></div></a><div className="home4-headlines">{platform.slice(1).map(p=><a href={p.sourceUrl} target="_blank" rel="noreferrer" key={p.id||p.title}><span>{p.platform}</span><b>{p.title}</b><u>Read →</u></a>)}</div></div>:(platformUpdate??<div className="home4-empty">Nothing new from Etsy or Printify right now.</div>)}</section>

    <section className="home4-section pink-band"><header className="home4-section-head"><div className="home4-title"><b>04</b><div><h2>Pick up where you left off</h2><p>Resume work already in motion</p></div></div></header><div className="home4-pickup"><a className="home4-work" href={batch?"/listing-factory?batch="+encodeURIComponent(batch.id):"/listing-factory?step=setup"}><span>LISTING FACTORY</span><h3>{batch?.display_name||"Start a new batch"}</h3><p>{batch?[String(batch.draft_count??0)+" drafts created",batch.step?"last step: "+batch.step:null].filter(Boolean).join(" · "):"Turn finished designs into ready-to-publish listings."}</p><u>{batch?"Continue batch":"Start batch"} →</u></a><a className="home4-work" href={niches[0]?.id?"/market-watch/research?id="+encodeURIComponent(niches[0].id):"/market-watch/research"}><span>RESEARCH</span><h3>{niches[0]?.name||"Research a niche"}</h3><p>{niches[0]?.analysis?.opportunities?.length?String(niches[0].analysis!.opportunities!.length)+" opportunities in the current brief":"Open your saved research and keep going."}</p><u>Open research →</u></a></div></section>

    <section className="home4-section home4-contained"><header className="home4-section-head"><div className="home4-title"><b>05</b><div><h2>What sold overnight</h2><p>Observed listing activity across Etsy in the last 24 hours</p></div></div><a className="home4-link" href="/hot-list">Open Hot List →</a></header><div className="home4-night-summary"><strong>{num(hot.totalSold??0)} units</strong><span>across {num(hot.watched??0)} tracked listings</span></div><div className="home4-night-products">{shelves.map(s=><a key={s.key} href={`/hot-list?product=${encodeURIComponent(s.key)}`}>{s.label} · {num(s.sold)}</a>)}</div><div className="home4-night-grid">{overnight.map(l=><a className="home4-night" href={l.url} target="_blank" rel="noreferrer" key={l.listingId}><div className="home4-night-img"><img src={l.image!} alt="" width={300} height={360} loading="lazy"/><span>{l.sold>0?num(l.sold)+" sold":l.savesGained>0?"+"+num(l.savesGained)+" favorites":"activity"}</span></div><div><b>{l.product||"Listing"}</b><small>{l.savesGained>0?"+"+num(l.savesGained)+" favorites":"Stock decreased"}</small></div></a>)}</div></section>
  </div>;
}