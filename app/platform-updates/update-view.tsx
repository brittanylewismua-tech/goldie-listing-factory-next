'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {dailySummary,type UpdateItem} from '../platform-update-model';
type Brief={day:string;items:UpdateItem[];recent?:Array<UpdateItem&{day:string}>;status:string;baseline:boolean;checkedAt:number;owner:boolean;pagesWatched?:number;sources:Array<{name:string;url:string}>};
export default function PlatformUpdate({compact=false}:{compact?:boolean}){const [platform,setPlatform]=useState('all'),[data,setData]=useState<Brief|null>(null),[error,setError]=useState(''),[running,setRunning]=useState(false),[adminResult,setAdminResult]=useState('');
 async function load(){try{const r=await fetch('/api/platform-updates',{cache:'no-store'});if(!r.ok)throw new Error();setData(await r.json());setError('');}catch{setError('Today’s update couldn’t be loaded.');}}
 useEffect(()=>{void load();},[]);
 async function check(){setRunning(true);setAdminResult('');try{const r=await fetch('/api/platform-updates/tick',{method:'POST'});const body=await r.json() as {error?:string;busy?:boolean;failed?:number;failures:Array<{source:string;error:string}>};if(!r.ok)throw new Error(body.error||'Source check failed');setAdminResult(body.busy?'A source check is already running.':body.failed?`${body.failed} ${body.failed===1?'source check needs':'source checks need'} attention. ${body.failures.map((f:any)=>`${f.source}: ${f.error}`).join(' · ')}`:'Official sources checked.');await load();}catch(e){setAdminResult(e instanceof Error?e.message:'Source check failed');}finally{setRunning(false);}}
 const summary=error||!data?'':data.status!=='ready'?'Today’s source check is not complete yet.':data.baseline&&!data.items.length?'First check complete. New platform changes will appear here.':dailySummary(data.items);
 const date=data?new Date(data.day+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}):'';
 if(compact)return <section className="platform-brief-card" data-quiet={data?.status==='ready'&&!data.items.length&&!error?"true":undefined} aria-labelledby="platform-brief-title"><div><p className="platform-brief-eyebrow">ETSY + PRINTIFY</p><h2 id="platform-brief-title">{data?.status==='ready'&&!data.items.length?"No new updates":"Etsy + Printify updates"}</h2><p role="status">{error||(!data?'Checking today’s update…':summary)}</p></div>{error?<button type="button" onClick={()=>void load()}>Try again</button>:<Link href="/platform-updates">{data?.status==='ready'&&!data.items.length?'View checked sources':'Read today’s update'} <span aria-hidden="true">→</span></Link>}</section>;




 /*
   D1913 · BUILT FROM ETSY'S SELLER HANDBOOK.

   Three attempts missed because the references were wrong, not because the
   execution was. A Vercel/Linear changelog is release notes for engineers:
   date rail, hairlines, everything grey, one headline per screen. Correct for
   that audience, alienating for this one - it made a handful of short useful
   blurbs read like enterprise documentation.

   The right reference was sitting in the subject matter the whole time:
   etsy.com/seller-handbook. Same reader, same kind of content - short helpful
   pieces for someone running a shop - and Etsy has already solved how it
   should look. What was taken from it, structurally:

     · a large serif masthead, which is what stops a page of blurbs reading
       like software documentation;
     · flat text tabs underneath with an underline on the active one, rather
       than buttons or pills - lighter, and it is how the Handbook lets you
       choose a section without the choosing becoming furniture;
     · one featured piece on a tinted block, picture beside a serif headline;
     · then a two-across grid of cards that are NOT boxes: picture, bold title,
       two lines, "Read it on Etsy →". No borders, no shadows. The photograph
       is the edge of the card, which is why the Handbook feels like a magazine
       and a bordered grid feels like a dashboard.
 */
 const all=[...(data?.items??[]),...(data?.recent??[])]
   .sort((a,b)=>(Number(b.priority==='ACTION REQUIRED')-Number(a.priority==='ACTION REQUIRED'))
     ||b.publishedAt-a.publishedAt);
 const counts={Etsy:all.filter(i=>i.platform==='Etsy').length,
   Printify:all.filter(i=>i.platform==='Printify').length};
 const rows=platform==='all'?all:all.filter(i=>i.platform===platform);
 /* The Handbook leads with one piece. So does this: whatever matters most. */
 const [lead,...rest]=rows;
 const when=(seconds:number)=>{const days=Math.floor((Date.now()/1000-seconds)/86400);
   return days<=0?'Today':days===1?'Yesterday':days<7?`${days} days ago`
     :new Date(seconds*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});};
 const checked=data?.checkedAt?when(data.checkedAt).toLowerCase():'';
 const Tab=({value,label,count}:{value:string;label:string;count?:number})=>
   <button type="button" className="pu-tab" aria-pressed={platform===value}
     onClick={()=>setPlatform(value)}>{label}{count!==undefined&&` (${count})`}</button>;

 return <main className="pu-page">
  <Link href="/home" className="pu-back">← Home</Link>
  <header className="pu-head">
    <h1>What&rsquo;s New</h1>
    {!!all.length&&<nav className="pu-tabs" aria-label="Platform">
      <Tab value="all" label="Latest"/>
      <Tab value="Etsy" label="Etsy" count={counts.Etsy}/>
      <Tab value="Printify" label="Printify" count={counts.Printify}/>
    </nav>}
  </header>
  <p className="pu-line" role="status">{error?error
    :!data?'Loading…'
    :data.status!=='ready'?'Still checking a few places.'
    :all.length?`Etsy and Printify news worth a minute. Checked ${checked}.`
    :`Nothing new to report. Checked ${checked}.`}</p>
  {error&&<button type="button" className="p-button p-button-quiet" onClick={()=>void load()}>Try again</button>}

  {lead&&<article className="pu-lead" data-priority={lead.priority}>
    {/* No loading="lazy": D832 - a deferred image with no size is an empty box. */}
    {lead.imageUrl
      ? <img className="pu-lead-shot" src={lead.imageUrl} alt=""/>
      : <span className="pu-lead-shot pu-noshot" aria-hidden><b>{lead.platform}</b></span>}
    <div className="pu-lead-copy">
      <p className="pu-kicker">{lead.platform} · {when(lead.publishedAt)}
        {lead.priority==='ACTION REQUIRED'&&<b> · Worth acting on</b>}</p>
      <h2>{lead.title}</h2>
      <p>{lead.impact}</p>
      <p className="pu-todo">{lead.action}</p>
      <a href={lead.sourceUrl} target="_blank" rel="noreferrer">Read it on {lead.platform} →</a>
    </div>
  </article>}

  <div className="pu-grid">
    {rest.map(item=><article key={item.id} className="pu-card" data-priority={item.priority}>
      {item.imageUrl&&<img className="pu-shot" src={item.imageUrl} alt=""/>}
      <p className="pu-kicker">{item.platform} · {when(item.publishedAt)}
        {item.priority==='ACTION REQUIRED'&&<b> · Worth acting on</b>}</p>
      <h3>{item.title}</h3>
      <p className="pu-impact">{item.impact}</p>
      <p className="pu-todo">{item.action}</p>
      <a href={item.sourceUrl} target="_blank" rel="noreferrer">Read it on {item.platform} →</a>
    </article>)}
  </div>

  {data&&!!all.length&&!rows.length&&<p className="pu-empty">Nothing from {platform} lately.</p>}
  {data&&!all.length&&!error&&<p className="pu-empty">Nothing new right now. When Etsy or Printify
    changes something that affects your shop, it shows up here.</p>}
  {data&&<footer className="pu-foot">
    <details><summary>Where this comes from</summary>
      <ul>{data.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a></li>)}</ul></details>
    {data.owner&&<details className="platform-brief-admin"><summary>Owner controls</summary>
      <button type="button" disabled={running} onClick={()=>void check()}>{running?'Checking official sources…':'Check official sources'}</button>
      {adminResult&&<p role="status">{adminResult}</p>}</details>}
  </footer>}
 </main>;
}
