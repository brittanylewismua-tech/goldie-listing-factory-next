'use client';
import {useRef,useState} from 'react';
import {scrollWorkspaceTo} from '@/app/workspace-scroll';
import type {ResearchView} from '@/app/niche-research-view';
import type {BuyerReport} from '@/app/niche-buyer-evidence';
const productName=(s:string)=>({tee:'Shirts',tank:'Tank tops',crewneck:'Sweatshirts',hoodie:'Hoodies',mug:'Mugs',tote:'Totes',longSleeve:'Long sleeves',phoneCase:'Phone cases',poster:'Posters',sticker:'Stickers',pillow:'Pillows',hat:'Hats',blanket:'Blankets',other:'Other products',digital:'Digital downloads',mixedApparel:'Mixed apparel'}[s]??s);
const money=(n:number,currency:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:n%100?2:0}).format(n/100);
export default function CurrentOverview({project,report,onProducts,onDetails,loading,error,onRetry}:{project:ResearchView;report:BuyerReport|null;onProducts:(ids:number[])=>void;onDetails?:()=>void;loading:boolean;error:string;onRetry:()=>void}){
 const [selected,setSelected]=useState('products');
 const overview=useRef<HTMLElement>(null);
 function select(id:string){setSelected(id);scrollWorkspaceTo(overview.current);}
 const a=project.analysis;
 const products=[...a.products].filter(p=>p.listings>0).sort((x,y)=>y.reviews-x.reviews||y.listings-x.listings);
 const primary=products[0];
 const findings=[...(report?.findings??[])].filter(f=>f.kind!=='example').sort((x,y)=>Number(y.kind==='request')-Number(x.kind==='request'));
 const finding=selected.startsWith('buyer:')?findings[Number(selected.slice(6))]:undefined;
 const active=project.listings.filter(l=>l.active&&project.selected.includes(l.shopId));
 const ids=finding?[...new Set(finding.evidence.map(e=>e.listingId))]:primary?.listingIds??active.map(l=>l.id);
 const photos=project.listings.filter(l=>ids.includes(l.id)&&l.image&&Date.now()/1000-l.displayAt<21600).sort((x,y)=>y.reviews30-x.reviews30).slice(0,3);
 const ranges=[...(primary?.prices??[])].filter(p=>p.currency&&p.count>0).sort((x,y)=>y.count-x.count);
 const range=ranges[0];
 const maxReviews=Math.max(1,...products.map(p=>p.reviews));
 return <section ref={overview} className="current-overview" aria-label="Niche overview">
  <div className="co-board">
   <section className="co-feature">
    <div className="co-feature-copy">
     <span className="co-pill">{finding?(finding.kind==='request'?'Buyer request':'Buying reason'):primary?productName(primary.product):'Products'}</span>
     <h2>{finding?finding.title:'Designs & prices'}</h2>
     {!finding&&<p>Explore the products in this niche, with current prices and the buyer feedback behind them.</p>}
     <button className="co-primary" onClick={()=>onProducts(ids)}>{finding?'See the products':'Browse '+(primary?productName(primary.product).toLowerCase():'products')} <span aria-hidden="true">→</span></button>
     {finding&&<button className="co-text" onClick={onDetails}>Read the supporting reviews →</button>}
    </div>
    <div className="co-photo-story">
     <div className="co-photos">{photos.map(l=><button key={l.id} onClick={()=>onProducts([l.id])} aria-label={`Open ${l.title}`}><img src={l.image} alt={l.title}/><span>{l.price!==null&&l.currency?money(l.price,l.currency):'View product'}</span></button>)}</div>
     <span>{finding?`${ids.length} ${ids.length===1?'product':'products'} in the supporting reviews`:primary?productName(primary.product)+' from your tracked shops':'From your tracked shops'}</span>
    </div>
   </section>
   <aside className="co-price">
    <span className="co-label">{primary?productName(primary.product):'Product'} prices</span>
    {range?<><strong>{money(range.low,range.currency)}<span>– {money(range.high,range.currency)}</span></strong><p>Middle price range · {range.currency}</p><button onClick={()=>onProducts((primary?.listingIds??[]).filter(id=>active.some(l=>l.id===id&&l.currency===range.currency)))}>Browse this product type <span aria-hidden="true">→</span></button></>:<><strong>—</strong><p>Prices are being checked.</p></>}
   </aside>
  </div>
  <div className="co-stats"><div><strong>{a.listings.toLocaleString()}</strong><span>Matching active listings</span></div><div><strong>{project.selected.length}</strong><span>Shops followed</span></div><div><strong>{a.complete?a.reviews30.toLocaleString():'Checking'}</strong><span>Reviews · last 30 days</span></div></div>
  <div className="co-bottom">
   <section className="co-findings"><header><h3>Worth a closer look</h3></header><div className="co-finding-rows">
    <button aria-pressed={selected==='products'} onClick={()=>select('products')}><span className="co-index">01</span><span><strong>Designs & prices</strong><small>{primary?productName(primary.product):'Products'} across your tracked shops</small></span><span aria-hidden="true">→</span></button>
    {findings.slice(0,3).map((f,i)=><button key={f.title} aria-pressed={selected===`buyer:${i}`} onClick={()=>select(`buyer:${i}`)}><span className="co-index">{String(i+2).padStart(2,'0')}</span><span><strong>{f.title}</strong><small>{f.kind==='request'?'Buyer request':f.kind==='example'?'One buyer’s reason':'Buying reason'} · {new Set(f.evidence.map(e=>e.listingId)).size} {new Set(f.evidence.map(e=>e.listingId)).size===1?'product':'products'}</small></span><span aria-hidden="true">→</span></button>)}
   </div>{loading&&<p className="co-status" role="status">Reading buyer reviews…</p>}{error&&<p className="co-status" role="alert">{error} <button onClick={onRetry}>Try again</button></p>}{!loading&&!error&&!findings.length&&<p className="co-status">Buyer findings will appear when reviews include a specific reason or request.</p>}</section>
   <section className="co-mix"><header><h3>Products receiving reviews</h3><span>Last 30 days</span></header>{products.slice(0,5).map(p=><button className="co-mix-row" key={p.product} onClick={()=>onProducts(p.listingIds)}><span>{productName(p.product)}</span><span className="co-track"><i style={{width:`${p.reviews/maxReviews*100}%`}}/></span><strong>{a.complete?p.reviews:'—'}</strong></button>)}</section>
  </div>
 </section>;
}
