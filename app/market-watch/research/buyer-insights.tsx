'use client';
import {useEffect,useState} from 'react';
import type {ResearchView} from '@/app/niche-research-view';
import type {BuyerReport} from '@/app/niche-buyer-evidence';
const date=(at:number)=>new Date(at*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
export default function BuyerInsights({project,onProducts,overview=false,onDetails}:{project:ResearchView;onProducts:(ids:number[])=>void;overview?:boolean;onDetails?:()=>void}){
 const [reviewQuery,setReviewQuery]=useState('');
 const [report,setReport]=useState<BuyerReport|null>(project.buyerInsights),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(!project.buyerInsights);
 useEffect(()=>{
  if(project.buyerInsights){setReport(project.buyerInsights);setError('');setLoading(false);return;}
  if(project.phase!=='ready'){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);setError('');
  void (async()=>{try{let response:Response|undefined;
   for(let retry=0;retry<24;retry++){
    response=await fetch('/api/niche-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'buyers',id:project.id}),signal:controller.signal});
    if(response.status!==409)break;
    await new Promise<void>(resolve=>{const timer=setTimeout(resolve,5000);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});if(controller.signal.aborted)return;
   }
   const body=await response!.json() as {error?:string;project?:ResearchView};
   if(!response!.ok)throw Error(body.error||'Buyer analysis could not finish. Please try again.');
   if(!body.project?.buyerInsights)throw Error('Reviews changed during analysis. Please try again.');
   if(!controller.signal.aborted)setReport(body.project.buyerInsights);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Buyer analysis could not finish. Please try again.');}
  finally{if(!controller.signal.aborted)setLoading(false);}})();
  return()=>controller.abort();
 },[project.id,project.buyerSourceKey,project.buyerInsights?.sourceKey,project.phase,attempt]);
 if(overview)return <section className="research-decision-overview"><header className="nr-section-head"><div><span className="nr-kicker">BUYER RESEARCH</span><h2>What matters to buyers here</h2></div>{report&&<button onClick={onDetails}>Read supporting reviews →</button>}</header>
 {loading?<p role="status">Reading reviews for buying reasons, occasions, and product requests…</p>:error?<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Try again</button></p>:report?.findings.length?<div className="research-decision-grid">{report.findings.map(f=><article key={f.title}><span className="nr-kicker">{f.kind==='request'?'A BUYER’S REQUEST':'FROM BUYER REVIEWS'}</span><h3>{f.title}</h3><p>{f.explanation}</p><blockquote>“{f.evidence[0].quote}”<cite>{f.evidence[0].shop}</cite></blockquote><div className="research-decision-actions"><button onClick={()=>onProducts([...new Set(f.evidence.map(e=>e.listingId))])}>See the products →</button><span>{f.evidence.length} supporting {f.evidence.length===1?'review':'reviews'}</span></div></article>)}</div>:<div className="nr-card"><h3>No clear buying reasons in the reviews yet</h3><p>Browse the products and shops below while new reviews are collected.</p></div>}
 </section>;
 const matchingReviews=reviewQuery.trim()?project.buyerReviews.filter(r=>reviewQuery.toLowerCase().trim().split(/\s+/).every(w=>r.text.toLowerCase().includes(w))).sort((a,b)=>b.at-a.at):[];
 return <section className="buyer-context"><header className="nr-section-head"><div><h2>Why buyers chose these products</h2><p>Motivations, occasions, and requests from their reviews.</p></div>{report&&<span>{report.analyzed.toLocaleString()} reviews read · {date(report.at)}</span>}</header>
 {loading&&<div className="nr-card" role="status"><h3>Reading buyer reviews…</h3><p>Looking for specific reasons people bought, how they use the products, and what they asked for. This may take a minute.</p></div>}
 {error&&<div className="nr-error" role="alert"><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Try again</button></div>}
 {!loading&&!error&&!report&&<p>Buyer analysis will start when the niche’s review check finishes.</p>}
 {report&&!loading&&!error&&<><div className="buyer-context-list">{report.findings.map((f,i)=><article className="buyer-context-finding" key={f.title}><div className="buyer-context-summary"><span className="nr-kicker">{f.kind==='request'?'BUYER REQUEST':`FINDING ${String(i+1).padStart(2,'0')}`}</span><h3>{f.title}</h3><p>{f.explanation}</p><button onClick={()=>onProducts([...new Set(f.evidence.map(e=>e.listingId))])}>View {new Set(f.evidence.map(e=>e.listingId)).size===1?'product':'products'} →</button></div><div className="buyer-context-evidence"><span className="nr-kicker">{f.evidence.length} supporting {f.evidence.length===1?'review':'reviews'} · {new Set(f.evidence.map(e=>e.shopId)).size} {new Set(f.evidence.map(e=>e.shopId)).size===1?'shop':'shops'}</span>{f.evidence.slice(0,2).map(e=><blockquote key={e.id}><p>“{e.quote}”</p><div className="nr-review-meta"><a href={`https://www.etsy.com/listing/${e.listingId}#reviews`} target="_blank" rel="noreferrer">{e.shop} · {e.title}</a><span>{date(e.at)}</span></div></blockquote>)}{f.evidence.length>2&&<details><summary>{f.evidence.length-2} more supporting {f.evidence.length===3?'review':'reviews'}</summary>{f.evidence.slice(2).map(e=><blockquote key={e.id}><p>“{e.quote}”</p><div className="nr-review-meta"><a href={`https://www.etsy.com/listing/${e.listingId}#reviews`} target="_blank" rel="noreferrer">{e.shop} · {e.title}</a><span>{date(e.at)}</span></div></blockquote>)}</details>}</div></article>)}</div>{!report.findings.length&&<div className="nr-card"><h3>No specific buying motivations found yet</h3><p>The available reviews don’t contain enough detail about why people chose these products. New reviews will be checked when you return.</p></div>}</>}
 <details className="nr-secondary-section"><summary>Search the buyer reviews</summary><label>Find a reason, occasion, or product request<input type="search" value={reviewQuery} onChange={e=>setReviewQuery(e.target.value)} placeholder="e.g. concert, birthday, wish"/></label>{reviewQuery.trim()&&<><p role="status">{matchingReviews.length} matching reviews</p>{matchingReviews.slice(0,30).map(r=><blockquote key={r.id}><p>“{r.text}”</p><div className="nr-review-meta"><a href={`https://www.etsy.com/listing/${r.listingId}#reviews`} target="_blank" rel="noreferrer">{r.shop} · {r.title}</a><span>{date(r.at)}</span></div></blockquote>)}</>}</details>
 </section>;
}
