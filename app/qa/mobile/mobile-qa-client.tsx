"use client";
import { useEffect, useRef, useState } from "react";

type Metrics = {
  viewport: number; document: number; rows: number[]; overflow: boolean;
  heading: string; loading: boolean; alert: string; textLength: number;
};

export default function MobileQaClient() {
  const [tab,setTab] = useState("overview");
  const [width,setWidth] = useState(390);
  const [metrics,setMetrics] = useState<Metrics|null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const sample = () => {
      const win = frame.current?.contentWindow;
      const doc = frame.current?.contentDocument;
      if (!win || !doc?.body) return;
      const buttons = [...doc.querySelectorAll<HTMLButtonElement>(".shop-map-tabs button")];
      const groups: Array<{ top:number; count:number }> = [];
      for (const button of buttons) {
        const top = button.getBoundingClientRect().top;
        const group = groups.find(row => Math.abs(row.top-top) < 3);
        if (group) group.count++;
        else groups.push({top,count:1});
      }
      const bodyText = doc.body.innerText || "";
      setMetrics({
        viewport:win.innerWidth,document:doc.documentElement.scrollWidth,
        rows:groups.map(row=>row.count),
        overflow:doc.documentElement.scrollWidth > win.innerWidth + 1,
        heading:doc.querySelector(".shop-map h1")?.textContent || "",
        loading:/Loading your shop|Loading this section/i.test(bodyText),
        alert:doc.querySelector('[role="alert"]')?.textContent?.trim() || "",
        textLength:bodyText.length,
      });
    };
    const timer = window.setInterval(sample, 700);
    sample();
    return () => window.clearInterval(timer);
  }, [tab,width]);

  return <main style={{fontFamily:"Arial,sans-serif",padding:20,background:"#f8f3f5",minHeight:"100vh"}}>
    <h1>Goldie mobile reviewer check</h1>
    <p>The frame below loads the live production <code>/shop-map</code> page at its own mobile viewport width.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      {([["overview","Opportunity Engine"],["money","Your Numbers"],["themes","Product Themes"],["sold","Sold Listings"]] as const)
        .map(([key,label])=><button key={key} type="button" onClick={()=>{setMetrics(null);setTab(key)}} aria-pressed={tab===key}>{label}</button>)}
      <button type="button" onClick={()=>{setMetrics(null);setWidth(current=>current===390?320:390)}}>Width: {width}px</button>
    </div>
    <output aria-live="polite" style={{display:"block",padding:12,background:"white",marginBottom:12}}>
      {metrics ? `Measured iframe viewport: ${metrics.viewport}px · document: ${metrics.document}px · horizontal overflow: ${metrics.overflow?"YES":"NO"} · tab rows: ${metrics.rows.join("+")||"waiting"} · heading: ${metrics.heading||"waiting"} · loading: ${metrics.loading?"YES":"NO"} · alert: ${metrics.alert||"none"} · body text characters: ${metrics.textLength}` : "Waiting for live page metrics…"}
    </output>
    <iframe ref={frame} key={tab+"-"+width} title={"Live Shop Map "+tab+" at "+width+" pixels"}
      src={"/shop-map?tab="+encodeURIComponent(tab)} width={width} height={844}
      style={{display:"block",width,height:844,border:"2px solid #333",background:"#fff"}} />
  </main>;
}
