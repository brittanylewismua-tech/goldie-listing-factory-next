"use client";

import { useEffect, useState } from "react";
import PlatformUpdate from "../platform-updates/update-view";
import PreviewClient from "../home-preview/preview-client";

type Month={revenueMinor:number;currency:string;orders:number};
type Saved={id:string;name:string};

export default function HomeView(){
  const [month,setMonth]=useState<Month|null>(null);
  const [saved,setSaved]=useState<Saved[]>([]);
  useEffect(()=>{
    void fetch('/api/home').then(r=>r.ok?r.json() as Promise<{blocks?:{thisMonth?:Month}}>:null)
      .then(body=>setMonth(body?.blocks?.thisMonth??null)).catch(()=>undefined);
    void fetch('/api/niche-research').then(r=>r.ok?r.json() as Promise<{projects?:Saved[]}>:null)
      .then(body=>setSaved(body?.projects??[])).catch(()=>undefined);
  },[]);
  const lead=saved[0];
  const monthlyRevenue=month?month.revenueMinor/100:null;
  const leadResearchHref=lead?'/market-watch/research?id='+encodeURIComponent(lead.id):'/market-watch/research';
  return <div data-monthly-revenue={monthlyRevenue??undefined} data-lead-research={leadResearchHref}>
    <PreviewClient platformUpdate={<PlatformUpdate compact/>}/>
  </div>;
}
