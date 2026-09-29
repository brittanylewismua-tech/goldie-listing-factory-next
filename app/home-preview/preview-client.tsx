"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import SuiteBrand from "../suite-brand";

type MapData={shop?:{shopName?:string}};
type UpdateItem={
  id?:string;
  platform:"Etsy"|"Printify";
  title:string;
  impact?:string;
  sourceUrl:string;
  publishedAt:number;
  priority?:string;
};
type Updates={items?:UpdateItem[];recent?:Array<UpdateItem&{day?:string}>};

const MIRRORBOT_URL="https://chatgpt.com/plugins/plugin_f6fc4d7acee88191aaef800f927b9aaa";

const FEATURES=[
  {key:"shop",number:"01",title:"Your Shop",copy:"Certainty, direction, opportunities.",href:"/shop-map"},
  {key:"factory",number:"02",title:"Listing Factory",copy:"Build and publish at scale.",href:"/listing-factory?step=setup"},
  {key:"radar",number:"03",title:"Market Radar",copy:"See what is selling and changing.",href:"/market-watch"},
  {key:"mirror",number:"04",title:"MirrorBot",copy:"Deep customer and niche research.",href:MIRRORBOT_URL,external:true},
  {key:"trademark",number:"05",title:"Trademark Check",copy:"Screen ideas before you build.",href:"/trademark"},
] as const;

const relativeDate=(seconds:number)=>{
  const days=Math.floor((Date.now()/1000-seconds)/86400);
  if(days<=0)return "Today";
  if(days===1)return "Yesterday";
  if(days<7)return `${days} days ago`;
  return new Date(seconds*1000).toLocaleDateString("en-US",{month:"short",day:"numeric"});
};

export default function PreviewClient({firstName}:{firstName?:string}={}){
  const [shopName,setShopName]=useState("Your shop");
  const [updates,setUpdates]=useState<Updates|null>(null);
  const [updatesLoaded,setUpdatesLoaded]=useState(false);
  const [layout,setLayoutState]=useState<"orbit"|"line">("orbit");
  const [typed,setTyped]=useState("");
  const [typedDone,setTypedDone]=useState(false);
  const orbitRef=useRef<HTMLDivElement|null>(null);
  const layerRef=useRef<HTMLDivElement|null>(null);

  const greeting=useMemo(()=>{
    const hour=new Date().getHours();
    const salutation=hour<12?"Good morning":hour<17?"Good afternoon":"Good evening";
    return `${salutation}${firstName?", "+firstName:""}.`;
  },[firstName]);

  useEffect(()=>{
    try{
      const saved=window.localStorage.getItem("goldie-home-layout");
      if(saved==="line"||saved==="orbit")setLayoutState(saved);
    }catch{}
    void fetch("/api/shop-map/map?home=1&days=30")
      .then(r=>r.ok?r.json() as Promise<MapData>:null)
      .then(data=>{if(data?.shop?.shopName)setShopName(data.shop.shopName);})
      .catch(()=>undefined);
    void fetch("/api/platform-updates",{cache:"no-store"})
      .then(r=>r.ok?r.json() as Promise<Updates>:null)
      .then(setUpdates).catch(()=>undefined).finally(()=>setUpdatesLoaded(true));
  },[]);

  useEffect(()=>{
    setTyped("");
    setTypedDone(false);
    let index=0;
    let timer:number|undefined;
    const tick=()=>{
      index+=1;
      setTyped(greeting.slice(0,index));
      if(index<greeting.length)timer=window.setTimeout(tick,38);
      else setTypedDone(true);
    };
    timer=window.setTimeout(tick,100);
    return()=>{if(timer)window.clearTimeout(timer);};
  },[greeting]);

  useEffect(()=>{
    if(layout!=="orbit")return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const orbit=orbitRef.current;
    const layer=layerRef.current;
    if(!orbit||!layer)return;
    let angle=0;
    let last=performance.now();
    let frame=0;
    let paused=false;
    const enter=()=>{paused=true;};
    const leave=()=>{paused=false;};
    orbit.addEventListener("mouseenter",enter);
    orbit.addEventListener("mouseleave",leave);
    const animate=(now:number)=>{
      const delta=now-last;
      last=now;
      if(!paused)angle=(angle+delta*360/600000)%360;
      layer.style.transform=`rotate(${angle}deg)`;
      layer.querySelectorAll<HTMLElement>(".goldie-feature-card").forEach(card=>{
        const base=Number(card.dataset.angle||0);
        card.style.transform=`rotate(${-base-angle}deg)`;
      });
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    return()=>{
      cancelAnimationFrame(frame);
      orbit.removeEventListener("mouseenter",enter);
      orbit.removeEventListener("mouseleave",leave);
    };
  },[layout]);

  const setLayout=(next:"orbit"|"line")=>{
    setLayoutState(next);
    try{window.localStorage.setItem("goldie-home-layout",next);}catch{}
  };

  const allUpdates=useMemo(()=>[
    ...(updates?.items??[]),
    ...(updates?.recent??[])
  ].sort((a,b)=>(Number(b.priority==="ACTION REQUIRED")-Number(a.priority==="ACTION REQUIRED"))||b.publishedAt-a.publishedAt)
   .filter((item,index,array)=>array.findIndex(other=>(other.id||other.title)===(item.id||item.title))===index)
  ,[updates]);

  const etsy=allUpdates.filter(item=>item.platform==="Etsy").slice(0,3);
  const printify=allUpdates.filter(item=>item.platform==="Printify").slice(0,3);

  return <div className="goldie-home">
    <div className="goldie-home-grid">
      <header className="goldie-home-top">
        <div className="goldie-home-brand"><SuiteBrand current/></div>
        <div className="goldie-home-shop">
          <strong>{shopName}</strong>
          <div className="goldie-layout-toggle" aria-label="Homepage layout">
            <button type="button" className={layout==="orbit"?"active":""} aria-label="Orbit view" aria-pressed={layout==="orbit"} onClick={()=>setLayout("orbit")}>
              <span className="goldie-orbit-icon"/>
            </button>
            <button type="button" className={layout==="line"?"active":""} aria-label="Line view" aria-pressed={layout==="line"} onClick={()=>setLayout("line")}>
              <span className="goldie-line-icon"><i/><i/></span>
            </button>
          </div>
        </div>
      </header>

      <section className="goldie-welcome">
        <p>Your command center</p>
        <h1>{typed}<span className={typedDone?"goldie-cursor done":"goldie-cursor"} aria-hidden/></h1>
        <div className={typedDone?"goldie-connected visible":"goldie-connected"}>
          Your shop, <strong>{shopName}</strong>, is connected. Let&apos;s get to work.
        </div>
      </section>

      <section className="goldie-launcher" aria-label="Goldie Suite tools">
        {layout==="orbit"?<div className="goldie-orbit" ref={orbitRef}>
          <svg className="goldie-orbit-ring" viewBox="0 0 438 438" aria-hidden="true"><circle cx="219" cy="219" r="218"/></svg>
          <div className="goldie-orbit-layer" ref={layerRef}>
            {FEATURES.map((feature,index)=>{
              const angle=index*72;
              return <div className="goldie-slot" style={{"--a":`${angle}deg`} as CSSProperties} key={feature.key}>
                <a className="goldie-feature-card" data-angle={angle} href={feature.href}
                  target={feature.external?"_blank":undefined} rel={feature.external?"noreferrer":undefined}>
                  <i>{feature.number}</i><b>{feature.title}</b><span>{feature.copy}</span>
                </a>
              </div>;
            })}
          </div>
          <div className="goldie-hub" aria-hidden="true">
            <span className="goldie-hub-g">g</span>
            <strong>Goldie Suite</strong>
          </div>
        </div>:<div className="goldie-line-view">
          {FEATURES.map(feature=><a className="goldie-line-card" href={feature.href} key={feature.key}
            target={feature.external?"_blank":undefined} rel={feature.external?"noreferrer":undefined}>
            <i>{feature.number}</i><div><b>{feature.title}</b><span>{feature.copy}</span></div>
          </a>)}
        </div>}
      </section>

      <section className="goldie-updates">
        <div className="goldie-updates-head">
          <h2>Etsy + Printify updates</h2>
          <a href="/platform-updates">See all updates →</a>
        </div>
        <div className="goldie-platform-grid">
          <PlatformPanel title="Etsy" rows={etsy} loaded={updatesLoaded}/>
          <PlatformPanel title="Printify" rows={printify} loaded={updatesLoaded}/>
        </div>
      </section>
    </div>
  </div>;
}

function PlatformPanel({title,rows,loaded}:{title:"Etsy"|"Printify";rows:UpdateItem[];loaded:boolean}){
  return <section className="goldie-platform-panel">
    <header><span/><b>{title}</b></header>
    <div className="goldie-update-list">
      {!loaded&&[0,1,2].map(index=><div className="goldie-update-row loading" key={index}><i/><div><b/><span/></div></div>)}
      {loaded&&rows.map((item,index)=><a className="goldie-update-row" href={item.sourceUrl} target="_blank" rel="noreferrer" key={item.id||item.title}>
        <i>{String(index+1).padStart(2,"0")}</i>
        <div><b>{item.title}</b><span>{item.impact||relativeDate(item.publishedAt)}</span></div>
        <em>→</em>
      </a>)}
      {loaded&&!rows.length&&<div className="goldie-update-empty">Nothing new from {title} right now.</div>}
    </div>
  </section>;
}
