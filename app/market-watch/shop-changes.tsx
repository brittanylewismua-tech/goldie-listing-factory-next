'use client';
import {useEffect,useState} from 'react';
import {shopActivity,type ShopInsights,type ListingChange} from '@/app/shop-watch-insights';
import {shortLabel} from '@/app/design-reach';
import type {Listing} from './market-watch-client';
const date=(at:number)=>new Date(at*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const signed=(n:number|null)=>n===null?'—':`${n>0?'+':''}${n.toLocaleString()}`;
const price=(value:string,currency:string)=>new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'USD'}).format(Number(value)/100);
function ChangeValue({change:c}:{change:ListingChange}){
 if(c.kind==='price')return <p><span className="shop-change-before">{price(c.before,c.currency)}</span><span aria-hidden="true"> → </span><strong>{price(c.after,c.currency)}</strong></p>;
 if(c.kind==='tags'){const before=JSON.parse(c.before) as string[],after=JSON.parse(c.after) as string[];return <div className="shop-tag-diff">{after.filter(t=>!before.includes(t)).map(t=><span key={t}>+ {t}</span>)}{before.filter(t=>!after.includes(t)).map(t=><del key={t}>{t}</del>)}</div>;}
 if(c.kind==='title')return <details><summary>See title edit</summary><p className="shop-change-before">{c.before}</p><p>{c.after}</p></details>;
 return null;
}
export default function ShopChanges({shopId,listings}:{shopId:number;listings:Listing[]}){
 const [data,setData]=useState<ShopInsights|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[days,setDays]=useState(30),[kind,setKind]=useState('all');
 async function load(){setLoading(true);setError('');try{const r=await fetch(`/api/shop-watch/insights?shop=${shopId}`),b=await r.json() as ShopInsights & {error?:string};if(!r.ok)throw Error(b.error||'Shop activity could not load.');setData(b);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[shopId]);
 if(!data)return <section className="current-shop-changes">{error?<p role="alert">{error} <button onClick={()=>void load()}>Try again</button></p>:<p role="status">Loading shop activity…</p>}</section>;
 const now=Date.now()/1000,activity=shopActivity(data.observations,days,now),byId=new Map(listings.map(l=>[l.listingId,l]));
 const changes=data.changes.filter(c=>c.at>=now-days*86400&&(kind==='all'||c.kind===kind)).sort((a,b)=>b.at-a.at);
 const groups=new Map<number,ListingChange[]>();for(const c of changes)groups.set(c.listingId,[...(groups.get(c.listingId)??[]),c]);
 return <section className="current-shop-changes"><header className="nr-section-head"><div><h2>What changed</h2><p>{data.checkedAt?`Checked ${new Date(data.checkedAt).toLocaleString()}`:'First check in progress'}</p></div><label>Period<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></header>
 <div className="shop-change-toolbar"><h3>Product updates</h3><label>Show<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All updates</option><option value="new">New listings</option><option value="price">Price changes</option><option value="title">Title edits</option><option value="tags">Tag edits</option></select></label><button disabled={loading} onClick={()=>void load()}>{loading?'Checking…':'Refresh'}</button></div>{error&&<p role="alert">{error}</p>}
 {changes.length?<div className="shop-change-list">{[...groups].map(([id,updates])=>{const l=byId.get(id);return <article key={id}><time dateTime={new Date(updates[0].at*1000).toISOString()}>{date(updates[0].at)}</time><div><a href={`https://www.etsy.com/listing/${id}`} target="_blank" rel="noreferrer">{l?shortLabel(l.title):shortLabel(updates[0].title||updates.find(c=>c.kind==='new')?.after||'View listing')} ↗</a>{updates.map((c,i)=><div className="shop-change-detail" key={i}><span className="shop-change-kind">{({new:'New listing',price:'Price changed',title:'Title edited',tags:'Tags edited'})[c.kind]} · {date(c.at)}</span><ChangeValue change={c}/></div>)}</div></article>;})}</div>:<p className="empty">{data.catalogObserved?'No product updates recorded in this period.':'Price, title, and tag tracking starts with the first catalog check.'}</p>}
 <details className="shop-sales-history"><summary>Shop totals over this period</summary> <div className="shop-activity-strip"><div><span>New shop sales</span><strong>{activity.sales?.toLocaleString()??'—'}</strong></div><div><span>Change in active listings</span><strong>{signed(activity.active)}</strong></div><div><span>Change in shop favorites</span><strong>{signed(activity.favorites)}</strong></div></div><p className="shop-change-period">{activity.from&&activity.to&&activity.from!==activity.to?`${date(activity.from)}–${date(activity.to)} · recorded shop totals`:'The next check will show your first changes.'}</p>
</details>
 {activity.series.length>0&&<details className="shop-sales-history"><summary>Sales between checks</summary><table><thead><tr><th>From</th><th>To</th><th>New sales</th></tr></thead><tbody>{[...activity.series].reverse().map(r=><tr key={r.to}><td>{date(r.from)}</td><td>{date(r.to)}</td><td>{r.sales??'—'}</td></tr>)}</tbody></table></details>}
 </section>;
}
