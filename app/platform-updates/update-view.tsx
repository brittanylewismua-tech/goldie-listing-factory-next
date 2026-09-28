'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {dailySummary,type UpdateItem} from '../platform-update-model';
type Brief={day:string;items:UpdateItem[];recent?:Array<UpdateItem&{day:string}>;status:string;baseline:boolean;checkedAt:number;owner:boolean;sources:Array<{name:string;url:string}>};
export default function PlatformUpdate({compact=false}:{compact?:boolean}){const [data,setData]=useState<Brief|null>(null),[error,setError]=useState(''),[running,setRunning]=useState(false),[adminResult,setAdminResult]=useState('');
 async function load(){try{const r=await fetch('/api/platform-updates',{cache:'no-store'});if(!r.ok)throw new Error();setData(await r.json());setError('');}catch{setError('Today’s update couldn’t be loaded.');}}
 useEffect(()=>{void load();},[]);
 async function check(){setRunning(true);setAdminResult('');try{const r=await fetch('/api/platform-updates/tick',{method:'POST'});const body=await r.json() as {error?:string;busy?:boolean;failed?:number;failures:Array<{source:string;error:string}>};if(!r.ok)throw new Error(body.error||'Source check failed');setAdminResult(body.busy?'A source check is already running.':body.failed?`${body.failed} ${body.failed===1?'source check needs':'source checks need'} attention. ${body.failures.map((f:any)=>`${f.source}: ${f.error}`).join(' · ')}`:'Official sources checked.');await load();}catch(e){setAdminResult(e instanceof Error?e.message:'Source check failed');}finally{setRunning(false);}}
 const summary=error||!data?'':data.status!=='ready'?'Today’s source check is not complete yet.':data.baseline&&!data.items.length?'First check complete. New platform changes will appear here.':dailySummary(data.items);
 const date=data?new Date(data.day+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}):'';
 if(compact)return <section className="platform-brief-card" data-quiet={data?.status==='ready'&&!data.items.length&&!error?"true":undefined} aria-labelledby="platform-brief-title"><div><p className="platform-brief-eyebrow">ETSY + PRINTIFY</p><h2 id="platform-brief-title">{data?.status==='ready'&&!data.items.length?"No new updates":"Etsy + Printify updates"}</h2><p role="status">{error||(!data?'Checking today’s update…':summary)}</p></div>{error?<button type="button" onClick={()=>void load()}>Try again</button>:<Link href="/platform-updates">{data?.status==='ready'&&!data.items.length?'View checked sources':'Read today’s update'} <span aria-hidden="true">→</span></Link>}</section>;

 /*
   D1902 · THE PAGE GAVE ITS LARGEST ELEMENT TO HAVING NOTHING TO SAY.

   A full-width bordered hero card announced "Today's update" and then, most
   days, that there was no update - the emptiest thing on the page was also the
   loudest. Below it the same items were split into "today" and "earlier" by
   which edition bucket they were filed in, which is an implementation detail
   and produced a "Sep 28" date on an item published today.

   One list now, newest first, grouped by how much the reader has to care.
   The header is a line of text, and it states what was checked rather than
   claiming the week was quiet.
 */
 const all=[...(data?.items??[]),...(data?.recent??[])]
   .sort((a,b)=>b.publishedAt-a.publishedAt);
 const groups=([['ACTION REQUIRED','Needs your attention'],['GOOD TO KNOW','Worth knowing'],
   ['IGNORE THE PANIC','Rumours, settled']] as const)
   .map(([priority,heading])=>({heading,priority,rows:all.filter(i=>i.priority===priority)}))
   .filter(g=>g.rows.length);
 const when=(seconds:number)=>{const days=Math.floor((Date.now()/1000-seconds)/86400);
   return days<=0?'Today':days===1?'Yesterday':days<30?`${days} days ago`
     :new Date(seconds*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});};
 const checked=data?.checkedAt?when(data.checkedAt).toLowerCase():'';
 const Item=({item}:{item:UpdateItem})=><article key={item.id} className="pu-item">
   <div className="pu-meta"><span className="pu-platform" data-platform={item.platform}>{item.platform}</span>
     <span className="pu-when">{when(item.publishedAt)}</span>
     <span className="pu-evidence">{item.evidence}</span></div>
   <h3>{item.title}</h3>
   <p className="pu-impact">{item.impact}</p>
   <p className="pu-action"><b>What to do</b>{item.action}</p>
   <a className="pu-source" href={item.sourceUrl} target="_blank" rel="noreferrer">Read it on {item.platform} ↗</a>
 </article>;
 return <main className="pu-page">
  <Link href="/home" className="pu-back">← Home</Link>
  <header className="pu-head">
    <h1>Etsy + Printify</h1>
    <p className="pu-line" role="status">{error?error
      :!data?'Loading…'
      :data.status!=='ready'?'Some official sources have not finished checking yet.'
      :all.length?`${all.length} ${all.length===1?'change':'changes'} in the last 30 days · ${data.sources.length} official sources · checked ${checked}`
      :`Nothing new across ${data.sources.length} official sources · checked ${checked}`}</p>
    {error&&<button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button>}
  </header>
  {groups.map(group=><section key={group.priority} className="pu-group">
    <h2 data-priority={group.priority}>{group.heading}<i/><small>{group.rows.length}</small></h2>
    {group.rows.map(item=><Item key={item.id} item={item}/>)}
  </section>)}
  {data&&!all.length&&!error&&<p className="pu-empty">Every source below was read. When one of them
    announces something that changes what you do, it appears here.</p>}
  {data&&<footer className="pu-foot">
    <details><summary>The {data.sources.length} sources checked</summary>
      <ul>{data.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a></li>)}</ul></details>
    {data.owner&&<details className="platform-brief-admin"><summary>Owner controls</summary>
      <button type="button" disabled={running} onClick={()=>void check()}>{running?'Checking official sources…':'Check official sources'}</button>
      {adminResult&&<p role="status">{adminResult}</p>}</details>}
  </footer>}
 </main>;
}
