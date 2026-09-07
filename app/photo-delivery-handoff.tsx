'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
type Target={id:string;title:string;indices:number[]};
type Delivery={id:string;productId:string;status:string;error:string|null;photoCount:number;listingId:number|null;mode?:'draft'|'photos'};
export type PhotoDeliveryHandle={prepare():Promise<boolean>};
const label=(status:string,draft=false)=>draft?({preparing:'Saving draft choices',waiting:'Waiting for your Etsy draft',delivering:'Finishing and checking your draft',completed:'Etsy draft verified',canceled:'Finishing canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Draft needs attention'}[status]||'Not prepared'):({preparing:'Saving photo set',waiting:'Waiting for publication',delivering:'Updating Etsy photos',completed:'Photos verified on Etsy',canceled:'Delivery canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Delivery needs attention'}[status]||'Not prepared');
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
    const response=await fetch('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,mode:'draft'})});
    const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(`${target.title}: ${payload.error||'Photo delivery could not be prepared.'}`);
    setDeliveries(current=>[...current.filter(d=>d.productId!==target.id),payload.delivery!]);
   }
   return true;
  }catch(e){setError(e instanceof Error?e.message:'Photo delivery could not be prepared.');panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return false}
  finally{locked.current=false;setBusy(false)}
 }}));
 async function prepareOne(target:Target){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await beforePrepare();const response=await fetch('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,mode:'draft'})});const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(payload.error||'Draft preparation failed.');await refresh()}catch(e){setError(e instanceof Error?e.message:'Draft preparation failed.')}finally{locked.current=false;setBusy(false)}}
 async function cancel(id:string){try{const response=await fetch(`/api/listing-photos/delivery?id=${encodeURIComponent(id)}`,{method:'DELETE'});const payload=await response.json() as {error?:string;deliveries?:Delivery[]};if(!response.ok)throw Error(payload.error);await refresh()}catch(e){setError(e instanceof Error?e.message:'Delivery could not be canceled.')}}
 const completed=deliveries.filter(d=>d.status==='completed').length;
 return <section className="photo-delivery-handoff" ref={panel} aria-label="Finish Etsy drafts" aria-busy={busy}>
  <div className="photo-delivery-heading"><h3>Ready in Etsy. Live only when you choose.</h3>{completed>0&&<b>{completed} of {targets.length} complete</b>}</div>
  <ol className="draft-handoff-steps">
   <li><strong>Save your choices here</strong><p>Goldie prepares your photos, listing details and personalization when you continue to Printify.</p></li>
   <li><strong>Send a hidden draft from Printify</strong><p>Open each product, check <b>Hide in store</b> under Publishing settings, then click Printify’s <b>Publish</b>. With Hide in store checked, a new listing goes to Etsy Drafts.</p></li>
   <li><strong>Wait for “Etsy draft verified”</strong><p>Goldie finishes the linked draft and checks what Etsy saved. Then open the draft to review and publish in Etsy yourself.</p></li>
  </ol>
  <p className="photo-delivery-note">No download or second upload. Goldie never publishes or renews your listing. Etsy charges its listing fee when you publish.</p>
  <div role="status" aria-live="polite">{busy?'Saving your choices…':loading?'Checking saved progress…':deliveries.some(d=>['waiting','delivering'].includes(d.status))?'Finishing continues even when this page is closed.':completed===targets.length&&targets.length?'Saved deliveries are complete. Review each result below.':'You can also prepare one listing below without leaving this page.'}</div>
  <ul className="draft-handoff-results">{targets.map(target=>{const item=deliveries.find(d=>d.productId===target.id);return <li key={target.id}><strong>{target.title}</strong><span>{item?label(item.status,item.mode==='draft'):'Not prepared'}</span>{item?.error&&<small role="alert">{item.error}</small>}{(!item||['completed','failed','expired','canceled','needs_attention'].includes(item.status))&&<button type="button" disabled={busy||loading} onClick={()=>void prepareOne(target)}>{item?'Prepare updated choices':'Prepare Etsy draft'}</button>}{item?.status==='waiting'&&<button type="button" disabled={busy} onClick={()=>void cancel(item.id)}>Cancel waiting</button>}{item?.status==='completed'&&item.listingId&&<a href={item.mode==='draft'?`https://www.etsy.com/your/shops/me/listing-editor/edit/${item.listingId}`:`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noopener noreferrer">{item.mode==='draft'?'Open Etsy draft':'View on Etsy'} ↗</a>}</li>})}</ul>
  <details><summary>What Goldie checks</summary><small>Saved title, tags, description, category, selected attributes, shipping profile, personalization and ordered photos—including custom photos and size guides. Colors, prices and SKUs must match Printify. Checking lasts up to 24 hours and pauses if the listing goes live or the destination changes. Publish only after verification. Later syncing from Printify can replace your Etsy edits.</small></details>
  {error&&<div className="photo-delivery-error" role="alert"><p>{error}</p><p>Completed work stays saved. Correct the indicated item and prepare that listing again.</p><a href="https://printify.com/app/store/products" target="_blank" rel="noopener noreferrer">Open Printify without preparing these drafts ↗</a></div>}
 </section>;
});
PhotoDeliveryHandoff.displayName='PhotoDeliveryHandoff';export default PhotoDeliveryHandoff;
