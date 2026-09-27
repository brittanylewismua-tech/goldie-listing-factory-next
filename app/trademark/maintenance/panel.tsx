'use client';
import {useState,useEffect} from 'react';
export default function Maintenance(){
 const [serials,setSerials]=useState('85613632,85613641,77406378');
 const [archive,setArchive]=useState('apc18840407-20251231-87.zip');
 const [status,setStatus]=useState<unknown>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=async()=>{const r=await fetch('/api/trademark/register-status?serials='+encodeURIComponent(serials));setStatus(await r.json());};
 useEffect(()=>{void refresh();},[]);
 const tick=async()=>{setBusy(true);try{const r=await fetch('/api/trademark/ingest-tick',{method:'POST'});setMessage(JSON.stringify(await r.json(),null,2));await refresh();}catch{setMessage('Update request failed.');}finally{setBusy(false);}};
 const probe=async()=>{setBusy(true);try{const url='https://tsdrapi.uspto.gov/ts/cd/casestatus/sn'+serials.split(',')[0].trim()+'/info.xml';const r=await fetch('/api/uspto-explore?url='+encodeURIComponent(url));setMessage(JSON.stringify(await r.json(),null,2));}finally{setBusy(false)}};
 const probeLive=async()=>{setBusy(true);try{const r=await fetch('/api/uspto-explore?url='+encodeURIComponent('https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch')+'&phrase=born%20this%20way');setMessage(JSON.stringify(await r.json(),null,2));}finally{setBusy(false)}};
 const probeArchive=async()=>{setBusy(true);try{const r=await fetch('/api/uspto-bulk-probe?file='+encodeURIComponent(archive)+'&records=1');setMessage(JSON.stringify(await r.json(),null,2));}finally{setBusy(false)}};
 return <main style={{padding:32,maxWidth:1000,margin:'auto',background:'white',color:'black'}}><h1>Trademark import maintenance</h1><p>Owner diagnostics</p><button disabled={busy} onClick={()=>void probeLive()}>Probe public phrase search</button><label>Archive file<input value={archive} onChange={e=>setArchive(e.target.value)}/></label> <button disabled={busy} onClick={()=>void probeArchive()}>Probe archive download</button><label>Serial numbers<input value={serials} onChange={e=>setSerials(e.target.value)} /></label> <button disabled={busy} onClick={()=>void probe()}>Probe USPTO record</button><button disabled={busy} onClick={()=>void refresh()}>Refresh status</button> <button disabled={busy} onClick={()=>void tick()}>{busy?'Updating records…':'Process next file'}</button><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(status,null,2)}</pre><pre style={{whiteSpace:'pre-wrap'}}>{message}</pre><a href="/trademark">Return to Trademark Check</a></main>;
}
