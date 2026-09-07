'use client';
import {readDeliveryStatus} from './delivery-status-read';
import {deliveryWrite,resolvedDeliveryUncertainty,deliveryChoiceRecovery} from './delivery-write';
import {statusReadCoordinator} from './status-read-coordinator';
import {deliveryPollDelay} from './delivery-polling';
import WaitProgress,{WaitCard} from './wait-progress';
import {prepareDraftBatch} from './draft-batch-preparation';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
type Target={id:string;title:string;indices:number[];shippingProfileId:number};
type Delivery={id:string;productId:string;status:string;error:string|null;photoCount:number;createdAt?:number;updatedAt?:number;listingId:number|null;mode?:'draft'|'photos';choicesChanged?:boolean;choiceCheckUnavailable?:boolean};
export type PhotoDeliveryHandle={prepare():Promise<boolean>};
const label=(status:string,draft=false)=>draft?({preparing:'Saving draft choices',waiting:'Preparing your Etsy draft',delivering:'Creating and checking your Etsy draft',completed:'Etsy draft verified',canceled:'Finishing canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Draft needs attention'}[status]||'Not prepared'):({preparing:'Saving photo set',waiting:'Waiting for publication',delivering:'Updating Etsy photos',completed:'Photos verified on Etsy',canceled:'Delivery canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Delivery needs attention'}[status]||'Not prepared');
const PhotoDeliveryHandoff=forwardRef<PhotoDeliveryHandle,{targets:Target[];beforePrepare:()=>Promise<unknown>;onReview?:(id:string,photos:boolean)=>void;onStatusReady?:(ready:boolean)=>void}>(({targets,beforePrepare,onReview,onStatusReady},ref)=>{
 const [statusKnown,setStatusKnown]=useState(false);
 useEffect(()=>{onStatusReady?.(statusKnown);return()=>onStatusReady?.(false)},[statusKnown,onStatusReady]);
 const [deliveries,setDeliveries]=useState<Delivery[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[prepared,setPrepared]=useState<number|null>(null),[preparationErrors,setPreparationErrors]=useState<Record<string,string>>({});
 const recoveryFocus=useRef<string|null>(null),polling=useRef(true),locked=useRef(false),queryKey=useRef(""),panel=useRef<HTMLElement>(null),targetKey=JSON.stringify(targets.map(t=>[t.id,t.indices,t.shippingProfileId]));
 const uncertainProducts=useRef(new Set<string>());
 const statusReads=useRef(statusReadCoordinator<Delivery[]>());
 const pollSchedule=useRef({started:Date.now(),next:0,failures:0});
 queryKey.current=targetKey;
 useEffect(()=>{if(busy||!recoveryFocus.current)return;const id=recoveryFocus.current;recoveryFocus.current=null;panel.current?.querySelector<HTMLButtonElement>(`[data-recovery-product="${CSS.escape(id)}"]`)?.focus()},[busy,preparationErrors]);
 async function refresh(){if(locked.current)return;
  const expectedKey=targetKey;
  try{await statusReads.current.run(expectedKey,async signal=>{
   const query=new URLSearchParams();for(const target of targets){query.append('productId',target.id);query.set(`images.${target.id}`,JSON.stringify(target.indices));query.set(`shipping.${target.id}`,String(target.shippingProfileId));}
   const response=await fetch(`/api/listing-photos/delivery?${query}`,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(response.status===401&&queryKey.current===expectedKey)polling.current=false;
   return readDeliveryStatus<Delivery>(response);
  },next=>{if(queryKey.current===expectedKey){setStatusKnown(true);setDeliveries(next);const resolved=next.filter(item=>uncertainProducts.current.has(item.productId)&&resolvedDeliveryUncertainty(item));if(resolved.length){for(const item of resolved)uncertainProducts.current.delete(item.productId);setPreparationErrors(current=>{const remaining={...current};for(const item of resolved)delete remaining[item.productId];return remaining})}polling.current=next.some(d=>['preparing','waiting','delivering'].includes(d.status));setLoading(false);setError('')}})}catch(value){if(queryKey.current===expectedKey)setStatusKnown(false);throw value}
 }
 useEffect(()=>{let alive=true;setStatusKnown(false);setDeliveries([]);setLoading(true);setError('');setPreparationErrors({});
  polling.current=true;pollSchedule.current={started:Date.now(),next:0,failures:0};
  let reading=false;
  const check=async()=>{if(!alive||document.hidden||reading||locked.current)return;reading=true;try{await refresh();pollSchedule.current.failures=0}catch(e){if(alive){pollSchedule.current.failures++;setLoading(false);setError(e instanceof Error?e.message:'Photo delivery status could not be loaded.')}}finally{reading=false;pollSchedule.current.next=Date.now()+deliveryPollDelay(Date.now()-pollSchedule.current.started,pollSchedule.current.failures)}};
  void check();const interval=setInterval(()=>{if(polling.current&&Date.now()>=pollSchedule.current.next)void check()},1000);document.addEventListener('visibilitychange',check);
  return()=>{alive=false;statusReads.current.invalidate();clearInterval(interval);document.removeEventListener('visibilitychange',check)};
 // Membership and selections both determine whether the verified package is still current.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[targetKey]);
 useImperativeHandle(ref,()=>({prepare:async()=>{
  if(!statusKnown){setError('Check saved progress before preparing or updating Etsy drafts.');return false}
  if(locked.current)return false;locked.current=true;statusReads.current.invalidate();setBusy(true);setError('');setPrepared(null);setPreparationErrors({});
  try{
   await beforePrepare();if(!targets.length)throw Error('No completed drafts are available yet.');
   setPrepared(0);
   const errors=await prepareDraftBatch(targets,async target=>{
    try{
    const response=await deliveryWrite('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,shippingProfileId:target.shippingProfileId,mode:'draft',automaticDraft:true})});
    const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(payload.error||'Photo delivery could not be prepared.');
    polling.current=true;pollSchedule.current={started:Date.now(),next:0,failures:0};setLoading(false);setDeliveries(current=>[...current.filter(d=>d.productId!==target.id),payload.delivery!]);
    }catch(value){uncertainProducts.current.add(target.id);polling.current=true;pollSchedule.current.next=0;const message=value instanceof Error?value.message:'Draft preparation failed.';if(!recoveryFocus.current)recoveryFocus.current=target.id;setPreparationErrors(current=>({...current,[target.id]:message}));throw value}
   },finished=>setPrepared(finished));
   if(errors.length)throw Error(`${errors.length} ${errors.length===1?'listing needs':'listings need'} attention. Review the message beside each listing.`);
   panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return true;
  }catch(e){setError(e instanceof Error?e.message:'Photo delivery could not be prepared.');panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return false}
  finally{locked.current=false;setBusy(false);setPrepared(null)}
 }}));
 async function prepareOne(target:Target,recheckId?:string){if(!statusKnown||locked.current)return;setPreparationErrors(current=>{const next={...current};delete next[target.id];return next});locked.current=true;statusReads.current.invalidate();setBusy(true);setError('');try{await beforePrepare();const response=await deliveryWrite('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,shippingProfileId:target.shippingProfileId,mode:'draft',automaticDraft:true,recheckId})});const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(payload.error||'Draft preparation failed.');polling.current=true;pollSchedule.current={started:Date.now(),next:0,failures:0};setLoading(false);setDeliveries(current=>[...current.filter(d=>d.productId!==target.id),payload.delivery!])}catch(e){uncertainProducts.current.add(target.id);polling.current=true;pollSchedule.current.next=0;const message=e instanceof Error?e.message:'Draft preparation failed.';recoveryFocus.current=target.id;setPreparationErrors(current=>({...current,[target.id]:message}));setError('This listing needs attention. Review its message below.')}finally{locked.current=false;setBusy(false)}}
 async function cancel(id:string){statusReads.current.invalidate();try{const response=await deliveryWrite(`/api/listing-photos/delivery?id=${encodeURIComponent(id)}`,{method:'DELETE'});const payload=await response.json() as {error?:string;deliveries?:Delivery[]};if(!response.ok)throw Error(payload.error);statusReads.current.invalidate();await refresh()}catch(e){setError(e instanceof Error?e.message:'Delivery could not be canceled.')}}
 const activeDeliveries=deliveries.filter(d=>['waiting','delivering'].includes(d.status));
 const completed=deliveries.filter(d=>d.status==='completed'&&!d.choicesChanged).length;
 return <section className="photo-delivery-handoff" ref={panel} aria-label="Finish Etsy drafts" aria-busy={busy}>
  <WaitProgress operation={busy?{title:'Preparing your Etsy drafts',detail:prepared===null?'Saving your selected photos and listing details.':`${prepared} of ${targets.length} prepared. Submitted drafts are already finishing in the background.`}:null}/>
  {activeDeliveries.length>0&&!busy&&<WaitCard title="Finishing your Etsy drafts" detail="Printify is transferring the listings; Goldie checks details and photos before marking each draft complete. Allow several minutes." started={Math.min(...activeDeliveries.map(d=>d.createdAt||d.updatedAt||Date.now()))} lastConfirmed={Math.max(...activeDeliveries.map(d=>d.updatedAt||0))||undefined} done={completed} total={targets.length} background/>}
  <div className="photo-delivery-heading"><h3>{targets.length&&completed===targets.length?'Saved in Etsy Drafts':'Finish your Etsy drafts'}</h3>{completed>0&&<b>{completed} of {targets.length} complete</b>}</div>
  {!statusKnown?<p>Check saved progress before creating or updating Etsy drafts.</p>:completed===targets.length&&targets.length>0?<p>Your drafts are ready in Etsy. Open each draft below to review it and publish when you are ready.</p>:<ol className="draft-handoff-steps">
   <li><strong>Create your Etsy drafts</strong><p>Use the button below to send this batch directly to Etsy Drafts.</p></li>
   <li><strong>Goldie sends and checks everything</strong><p>Your Printify connection stays attached. Goldie adds your photos, listing details and personalization, then checks what Etsy saved.</p></li>
   <li><strong>Open your finished draft</strong><p>After “Etsy draft verified,” choose Open Etsy draft. You can also find it in Etsy Shop Manager → Listings → Drafts. Review it, then publish when ready.</p></li>
  </ol>}
  <p className="photo-delivery-note">No download or second upload. Goldie never makes your listing live or renews it. Etsy charges its listing fee when you publish.</p>
  <div role="status" aria-live="polite">{!statusKnown&&!loading?'Saved progress is unavailable. Check it before preparing any drafts.':busy?(prepared===null?'Saving your choices…':`Preparing batch: ${prepared} of ${targets.length} checked. Ready listings are already finishing in the background.`):loading?'Checking saved progress…':deliveries.some(d=>['waiting','delivering'].includes(d.status))?'Finishing continues even when this page is closed.':completed===targets.length&&targets.length?'Saved deliveries are complete. Review each result below.':'You can send the whole batch or create one Etsy draft below.'}</div>
  <ul className="draft-handoff-results">{targets.map(target=>{const item=deliveries.find(d=>d.productId===target.id),problem=preparationErrors[target.id],messages=[...new Set([item?.error?.trim(),problem?.trim()].filter((value):value is string=>Boolean(value)))];return <li key={target.id}><strong>{target.title}</strong><span>{problem?'Preparation needs attention':item?.choiceCheckUnavailable?'Current choices not verified':item?.choicesChanged&&item.status==='completed'?'Changes not sent':item?label(item.status,item.mode==='draft'):!statusKnown?(loading?'Checking saved progress':'Saved progress unavailable'):'Not prepared'}</span>{item?.choicesChanged&&<small>{deliveryChoiceRecovery(item)}</small>}{messages.map(message=><small role="alert" key={message}>{message}</small>)}{problem&&onReview&&<button type="button" disabled={busy} data-recovery-product={target.id} onClick={()=>onReview(target.id,/photo|image|mockup/i.test(problem))}>{/photo|image|mockup/i.test(problem)?'Review photos':'Review listing'}</button>}{(!item||['completed','failed','expired','canceled','needs_attention'].includes(item.status))&&<button type="button" className={item?.status==='completed'&&!item.choicesChanged?'draft-refresh':'draft-prepare'} disabled={busy||loading||!statusKnown} onClick={()=>void prepareOne(target,item?.mode==='draft'&&item.status==='needs_attention'?item.id:undefined)}>{item?.mode==='draft'&&item.status==='needs_attention'?'Verify last change':item?'Update Etsy draft':'Create Etsy draft'}</button>}{item?.mode==='draft'&&item.status==='needs_attention'&&<button type="button" disabled={busy||!statusKnown} onClick={()=>void prepareOne(target)}>Prepare corrected choices</button>}{item?.status==='waiting'&&<button type="button" disabled={busy} onClick={()=>void cancel(item.id)}>Cancel waiting</button>}{item?.status==='completed'&&item.listingId&&<a className="draft-open" href={item.mode==='draft'?`https://www.etsy.com/your/shops/me/listing-editor/edit/${item.listingId}`:`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noopener noreferrer">{item.mode==='draft'?'Open Etsy draft':'View on Etsy'} ↗</a>}</li>})}</ul>
  <details><summary>What Goldie checks</summary><small>Saved title, tags, description, category, selected attributes, shipping profile, personalization and ordered photos—including custom photos and size guides. Colors, prices and SKUs must match Printify. Checking lasts up to 24 hours and pauses if the listing goes live or the destination changes. Publish only after verification. Later syncing from Printify can replace your Etsy edits.</small></details>
  {(error||Object.keys(preparationErrors).length>0)&&<button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);void refresh().catch(e=>{setLoading(false);setError(e instanceof Error?e.message:'Saved progress could not be checked.')})}}>Check saved progress</button>}
  {error&&<div className="photo-delivery-error" role="alert"><p>{error}</p>{/sign in/i.test(error)&&<a href="/account/sign-in?return_to=%2Flisting-factory" target="_blank" rel="noopener noreferrer">Sign in to Goldie ↗</a>}<p>Completed work stays saved. Check saved progress before trying to prepare a listing again.</p><a href="https://printify.com/app/store/products" target="_blank" rel="noopener noreferrer">Open Printify without preparing these drafts ↗</a></div>}
 </section>;
});
PhotoDeliveryHandoff.displayName='PhotoDeliveryHandoff';export default PhotoDeliveryHandoff;
