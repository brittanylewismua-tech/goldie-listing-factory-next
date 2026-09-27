"use client";
import Link from "next/link";
import CommandCenterClient from "../command-center/command-center-client";
import PlatformUpdate from "../platform-updates/update-view";
import { useEffect, useState } from "react";
import type {ResearchView} from "../niche-research-view";
type Saved={id:string;name:string;phase:string;monitoring:boolean};
type Month={revenueMinor:number;currency:string;orders:number;stale?:boolean;month?:string};
export default function HomeView(){
 const [saved,setSaved]=useState<Saved[]>([]),[research,setResearch]=useState<ResearchView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[month,setMonth]=useState<Month|null>(null),[moneyLoading,setMoneyLoading]=useState(true);
 useEffect(()=>{let alive=true;
 void fetch('/api/niche-research').then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{projects?:Saved[]}>;}).then(async b=>{if(!alive)return;const projects:Saved[]=b.projects??[];setSaved(projects);setLoading(false);if(projects.length){const r=await fetch('/api/niche-research?id='+encodeURIComponent(projects[0].id));if(r.ok){const b=await r.json() as {project:ResearchView};if(alive)setResearch(b.project);}}}).catch(()=>{if(alive){setError('Your research could not be loaded.');setLoading(false);}});
 void fetch('/api/home').then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<{blocks?:{thisMonth?:Month}}>;}).then(b=>{if(alive)setMonth(b.blocks?.thisMonth??null);}).catch(()=>{}).finally(()=>{if(alive)setMoneyLoading(false);});
 return()=>{alive=false;};},[]);
 const lead=saved[0],finding=research?.buyerInsights?.findings[0],photo=research?.listings.find(l=>finding?.evidence.some(e=>e.listingId===l.id)&&l.image&&Date.now()/1000-l.displayAt<21600);
 const money=month?new Intl.NumberFormat(undefined,{style:'currency',currency:month.currency}).format(month.revenueMinor/100):null;
 return <main className="current-home">
 <header className="current-page-heading"><div><p className="current-kicker">{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p><h1>Your workspace</h1><p>Research niches, follow shops, and check your sales.</p></div><Link className="current-button" href="/market-watch/research?new=1">+ New research</Link></header>
 <div className="current-home-layout"><section className="current-radar"><div className="current-section-heading"><h2>Your research</h2><span>{loading?'Loading…':`${saved.length} saved ${saved.length===1?'niche':'niches'}`}</span></div>
 {lead?<><Link className="current-home-feature" href={'/market-watch/research?id='+encodeURIComponent(lead.id)}><div><span className="current-pill">{lead.phase==='ready'?(lead.monitoring?'Monitoring your niche':'Monitoring paused'):'Research in progress'}</span><h2>{lead.name}</h2><p>{finding?finding.title:'Explore why buyers choose these products, with the reviews and listings behind each finding.'}</p><span className="current-home-meta">Open this research →</span></div>{photo&&<img src={photo.image!} alt={photo.title}/>}<span className="current-circle-arrow" aria-hidden="true">→</span></Link>
 {saved.slice(1).map(s=><Link className="current-home-secondary" href={'/market-watch/research?id='+encodeURIComponent(s.id)} key={s.id}><span className="current-niche-icon" aria-hidden="true">⌕</span><span><b>{s.name}</b><small>{s.phase==='ready'?(s.monitoring?'Monitoring':'Paused'):'Research in progress'}</small></span><span aria-hidden="true">→</span></Link>)}</>:<div className="current-home-feature"><div><span className="current-pill">Niche research</span><h2>{loading?'Loading your research…':error?'Research could not load':'Research a niche'}</h2><p>{error||'Find shops in your niche and track their listings, prices, and reviews.'}</p><Link className="current-button current-white" href="/market-watch/research">{error?'Open research':'Research a niche'} →</Link></div></div>}
 </section><aside className="current-home-aside"><PlatformUpdate compact/><section className="current-shop-peek"><p className="current-kicker">Your shop · this month</p><strong>{moneyLoading?'Loading…':money??'Your shop numbers'}</strong><p>{month?`${month.orders} ${month.orders===1?'order':'orders'}${month.stale?' · last synced figures':''}`:'Open your shop to connect Etsy or check your numbers.'}</p><Link href="/shop-map">Your shop numbers <span aria-hidden="true">→</span></Link></section></aside></div>
 <section className="current-home-factory" aria-label="Listing Factory"><div><h2>Listing Factory</h2><p>Create listings and manage your saved batches, keywords, and mockups.</p></div><Link className="current-button" href="/listing-factory?step=setup">Open Listing Factory →</Link><nav aria-label="Listing Factory tools"><Link href="/batches">Batch History</Link><Link href="/keywords">Keyword Banks</Link><Link href="/mockups">Mockup Sets</Link><Link href="/usage">Usage</Link></nav></section>
 <section aria-label="Your tools"><CommandCenterClient embedded/></section>
 <footer className="current-suite-footer">The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</footer></main>;
}
