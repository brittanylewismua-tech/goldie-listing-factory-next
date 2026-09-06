'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
type Target={id:string;title:string;indices:number[]};
type Delivery={id:string;productId:string;status:string;error:string|null;photoCount:number;listingId:number|null};
export type PhotoDeliveryHandle={prepare():Promise<boolean>};
const label=(status:string)=>({preparing:'Saving photo set',waiting:'Waiting for you to publish',delivering:'Updating Etsy photos',completed:'Photos verified on Etsy',canceled:'Delivery canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Delivery needs attention'}[status]||'Not prepared');
const PhotoDeliveryHandoff=forwardRef<PhotoDeliveryHandle,{targets:Target[];beforePrepare:()=>Promise<unknown>}>(({targets,beforePrepare},ref)=>{
 const [deliveries,setDeliveries]=useState<Delivery[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const locked=useRef(false),queryKey=useRef(""),panel=useRef<HTMLElement>(null),targetKey=targets.map(t=>t.id).join(',');
 queryKey.current=targetKey;
 async function refresh(){const expectedKey=targetKey;
  const query=new URLSearchParams();for(const id of targetKey.split(',').filter(Boolean))query.append('productId',id);
  const response=await fetch(`/api/listing-photos/delivery?${query}`,{cache:'no-store'}),payload=await response.json() as {error?:string;deliveries?:Delivery[]};
  if(!response.ok)throw Error(payload.error||'Photo delivery status could not be loaded.');
  if(queryKey.current===expectedKey){setDeliveries(payload.deliveries||[]);setLoading(false);}
 }
 useEffect(()=>{let alive=true;setDeliveries([]);setLoading(true);setError('');
  const check=async()=>{if(!alive||document.hidden)return;try{await refresh()}catch(e){if(alive){setLoading(false);setError(e instanceof Error?e.message:'Photo delivery status could not be loaded.')}}};
  void check();const interval=setInterval(()=>void check(),15000);document.addEventListener('visibilitychange',check);
  return()=>{alive=false;clearInterval(interval);document.removeEventListener('visibilitychange',check)};
 // Query membership, not changing titles or selections, owns the status request.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[targetKey]);
 useImperativeHandle(ref,()=>({prepare:async()=>{
  if(locked.current)return false;locked.current=true;setBusy(true);setError('');
  try{
   await beforePrepare();if(!targets.length)throw Error('No completed drafts are available yet.');
   for(const target of targets){
    const response=await fetch('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices})});
    const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(`${target.title}: ${payload.error||'Photo delivery could not be prepared.'}`);
    setDeliveries(current=>[...current.filter(d=>d.productId!==target.id),payload.delivery!]);
   }
   return true;
  }catch(e){setError(e instanceof Error?e.message:'Photo delivery could not be prepared.');panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return false}
  finally{locked.current=false;setBusy(false)}
 }}));
 async function cancel(id:string){try{const response=await fetch(`/api/listing-photos/delivery?id=${encodeURIComponent(id)}`,{method:'DELETE'});const payload=await response.json() as {error?:string;deliveries?:Delivery[]};if(!response.ok)throw Error(payload.error);await refresh()}catch(e){setError(e instanceof Error?e.message:'Delivery could not be canceled.')}}
 const completed=deliveries.filter(d=>d.status==='completed').length;
 return <section className="photo-delivery-handoff" ref={panel} aria-label="Automatic Etsy photos" aria-busy={busy}>
  <div className="photo-delivery-heading"><h3>Your photos, delivered automatically</h3>{completed>0&&<b>{completed} of {targets.length} complete</b>}</div>
  <p>Open My Products, then publish in Printify. Your saved photo set will replace the Etsy photos in your chosen order.</p>
  <p className="photo-delivery-note">No download or second upload. You control publishing; photo updates have no listing fee.</p>
  <div role="status" aria-live="polite">{busy?'Saving your photo sets. Keep this page open until Printify opens.':loading?'Checking saved photo delivery…':deliveries.length?deliveries.every(d=>d.status==='completed')?'Your photo deliveries are complete.':'Delivery continues even when this page is closed.':'Photo delivery will be prepared when you open My Products.'}</div>
  {deliveries.length>0&&<details><summary>Photo delivery · {deliveries.length} {deliveries.length===1?'listing':'listings'}</summary><ul>{targets.map(target=>{const item=deliveries.find(d=>d.productId===target.id);return <li key={target.id}><strong>{target.title}</strong><span>{item?label(item.status):'Not prepared'}</span>{item?.error&&<small>{item.error}</small>}{item?.status==='waiting'&&<button type="button" onClick={()=>void cancel(item.id)}>Cancel waiting delivery</button>}{item?.status==='completed'&&item.listingId&&<a href={`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noopener noreferrer">View on Etsy ↗</a>}</li>})}</ul></details>}
  <details><summary>How delivery works</summary><small>Includes your selected mockups, custom photos and size guide. Printify’s photos may appear briefly first. Publication checks continue for up to 24 hours, every 30 seconds at first, then less often. Downloads remain optional. Later syncing photos from Printify can replace your Etsy edits.</small></details>
  {error&&<div className="photo-delivery-error" role="alert"><p>{error}</p><p>Your completed deliveries stay saved. Retry Open My Products, or <a href="https://printify.com/app/store/products" target="_blank" rel="noopener noreferrer">open Printify without preparing another photo delivery ↗</a>.</p></div>}
 </section>;
});
PhotoDeliveryHandoff.displayName='PhotoDeliveryHandoff';export default PhotoDeliveryHandoff;
