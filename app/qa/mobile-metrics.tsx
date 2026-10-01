"use client";
import { useEffect, useState } from "react";

export default function QaMobileMetrics() {
  const [report,setReport] = useState("QA measurements waiting");
  useEffect(() => {
    const sample = () => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(".shop-map-tabs button")];
      const groups:Array<{top:number;count:number}> = [];
      for (const button of buttons) {
        const top=button.getBoundingClientRect().top;
        const group=groups.find(row=>Math.abs(row.top-top)<3);
        if(group)group.count++;
        else groups.push({top,count:1});
      }
      const main=document.querySelector<HTMLElement>(".shop-map");
      const text=main?.innerText || "";
      const active=buttons.find(button=>button.getAttribute("aria-current")==="page")?.textContent?.trim() || "none";
      const loading=/Loading your shop|Loading this section/i.test(text);
      const alert=main?.querySelector('[role="alert"]')?.textContent?.trim() || "none";
      setReport(`QA viewport: ${window.innerWidth}px; document: ${document.documentElement.scrollWidth}px; body: ${document.body.scrollWidth}px; tab rows: ${groups.map(row=>row.count).join("+")||"waiting"}; active: ${active}; loading: ${loading?"YES":"NO"}; alert: ${alert}; text: ${text.length}`);
    };
    sample();
    const timer=window.setInterval(sample,500);
    return()=>window.clearInterval(timer);
  },[]);
  return <output id="qa-mobile-metrics" aria-live="off"
    style={{position:"fixed",bottom:0,left:0,maxWidth:"100vw",padding:"4px 8px",
      font:"11px/1.3 monospace",color:"#111",background:"#fff",border:"1px solid #111",
      zIndex:9999,pointerEvents:"none"}}>{report}</output>;
}
