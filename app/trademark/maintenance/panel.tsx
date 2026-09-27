'use client';
import {useState,useEffect} from 'react';
export default function Maintenance(){
 const [status,setStatus]=useState<unknown>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=async()=>{const r=await fetch('/api/trademark/register-status?serials=85312727,85144480');setStatus(await r.json());};
 useEffect(()=>{void refresh();},[]);
 const tick=async()=>{setBusy(true);try{const r=await fetch('/api/trademark/ingest-tick',{method:'POST'});setMessage(JSON.stringify(await r.json(),null,2));await refresh();}catch{setMessage('Update request failed.');}finally{setBusy(false);}};
 return <main style={{padding:32,maxWidth:1000,margin:'auto',background:'white',color:'black'}}><h1>Trademark import maintenance</h1><p>Owner diagnostics</p><button disabled={busy} onClick={()=>void refresh()}>Refresh status</button> <button disabled={busy} onClick={()=>void tick()}>{busy?'Updating records…':'Process next file'}</button><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(status,null,2)}</pre><pre style={{whiteSpace:'pre-wrap'}}>{message}</pre><a href="/trademark">Return to Trademark Check</a></main>;
}
