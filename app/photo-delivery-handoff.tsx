'use client';
import WaitProgress,{WaitCard} from './wait-progress';
import {prepareDraftBatch} from './draft-batch-preparation';
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
type Target={id:string;title:string;indices:number[];shippingProfileId:number};
type Delivery={id:string;productId:string;status:string;error:string|null;photoCount:number;createdAt?:number;updatedAt?:number;listingId:number|null;mode?:'draft'|'photos';choicesChanged?:boolean;choiceCheckUnavailable?:boolean};
export type PhotoDeliveryHandle={prepare():Promise<boolean>};
const label=(status:string,draft=false)=>draft?({preparing:'Saving draft choices',waiting:'Preparing your Etsy draft',delivering:'Creating and checking your Etsy draft',completed:'Etsy draft verified',canceled:'Finishing canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Draft needs attention'}[status]||'Not prepared'):({preparing:'Saving photo set',waiting:'Waiting for publication',delivering:'Updating Etsy photos',completed:'Photos verified on Etsy',canceled:'Delivery canceled',expired:'Checking ended — prepare again',failed:'Preparation needs another try',needs_attention:'Delivery needs attention'}[status]||'Not prepared');
const PhotoDeliveryHandoff=forwardRef<PhotoDeliveryHandle,{targets:Target[];beforePrepare:()=>Promise<unknown>;onReview?:(id:string,photos:boolean)=>void}>(({targets,beforePrepare,onReview},ref)=>{
 const [deliveries,setDeliveries]=useState<Delivery[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[prepared,setPrepared]=useState<number|null>(null),[preparationErrors,setPreparationErrors]=useState<Record<string,string>>({});
 const recoveryFocus=useRef<string|null>(null),polling=useRef(true),locked=useRef(false),queryKey=useRef(""),panel=useRef<HTMLElement>(null),targetKey=JSON.stringify(targets.map(t=>[t.id,t.indices,t.shippingProfileId]));
 queryKey.current=targetKey;
 useEffect(()=>{if(busy||!recoveryFocus.current)return;const id=recoveryFocus.current;recoveryFocus.current=null;panel.current?.querySelector<HTMLButtonElement>(`[data-recovery-product="${CSS.escape(id)}"]`)?.focus()},[busy,preparationErrors]);
 async function refresh(){const expectedKey=targetKey;
  const query=new URLSearchParams();for(const target of targets){query.append('productId',target.id);query.set(`images.${target.id}`,JSON.stringify(target.indices));query.set(`shipping.${target.id}`,String(target.shippingProfileId));}
  const response=await fetch(`/api/listing-photos/delivery?${query}`,{cache:'no-store'}),payload=await response.json() as {error?:string;deliveries?:Delivery[]};
  if(!response.ok)throw Error(payload.error||'Photo delivery status could not be loaded.');
  if(queryKey.current===expectedKey){setDeliveries(payload.deliveries||[]);polling.current=(payload.deliveries||[]).some(d=>['preparing','waiting','delivering'].includes(d.status));setLoading(false);}
 }
 useEffect(()=>{let alive=true;setDeliveries([]);setLoading(true);setError('');setPreparationErrors({});
  const check=async()=>{if(!alive||document.hidden)return;try{await refresh()}catch(e){if(alive){setLoading(false);setError(e instanceof Error?e.message:'Photo delivery status could not be loaded.')}}};
  void check();const interval=setInterval(()=>{if(polling.current)void check()},15000);document.addEventListener('visibilitychange',check);
  return()=>{alive=false;clearInterval(interval);document.removeEventListener('visibilitychange',check)};
 // Membership and selections both determine whether the verified package is still current.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[targetKey]);
 useImperativeHandle(ref,()=>({prepare:async()=>{
  if(locked.current)return false;locked.current=true;setBusy(true);setError('');setPrepared(null);setPreparationErrors({});
  try{
   await beforePrepare();if(!targets.length)throw Error('No completed drafts are available yet.');
   setPrepared(0);
   const errors=await prepareDraftBatch(targets,async target=>{
    try{
    const response=await fetch('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,shippingProfileId:target.shippingProfileId,mode:'draft',automaticDraft:true})});
    const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(payload.error||'Photo delivery could not be prepared.');
    polling.current=true;setDeliveries(current=>[...current.filter(d=>d.productId!==target.id),payload.delivery!]);
    }catch(value){const message=value instanceof Error?value.message:'Draft preparation failed.';if(!recoveryFocus.current)recoveryFocus.current=target.id;setPreparationErrors(current=>({...current,[target.id]:message}));throw value}
   },finished=>setPrepared(finished));
   if(errors.length)throw Error(`${errors.length} ${errors.length===1?'listing needs':'listings need'} attention. Review the message beside each listing.`);
   panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return true;
  }catch(e){setError(e instanceof Error?e.message:'Photo delivery could not be prepared.');panel.current?.scrollIntoView({block:'center',behavior:'smooth'});return false}
  finally{locked.current=false;setBusy(false);setPrepared(null)}
 }}));
 async function prepareOne(target:Target,recheckId?:string){if(locked.current)return;setPreparationErrors(current=>{const next={...current};delete next[target.id];return next});locked.current=true;setBusy(true);setError('');try{await beforePrepare();const response=await fetch('/api/listing-photos/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:target.id,printifyImageIndices:target.indices,shippingProfileId:target.shippingProfileId,mode:'draft',automaticDraft:true,recheckId})});const payload=await response.json() as {error?:string;delivery?:Delivery};if(!response.ok||!payload.delivery)throw Error(payload.error||'Draft preparation failed.');await refresh()}catch(e){const message=e instanceof Error?e.message:'Draft preparation failed.';recoveryFocus.current=target.id;setPreparationErrors(current=>({...current,[target.id]:message}));setError('This listing needs attention. Review its message below.')}finally{locked.current=false;setBusy(false)}}
 async function cancel(id:string){try{const response=await fetch(`/api/listing-photos/delivery?id=${encodeURIComponent(id)}`,{method:'DELETE'});const payload=await response.json() as {error?:string;deliveries?:Delivery[]};if(!response.ok)throw Error(payload.error);await refresh()}catch(e){setError(e instanceof Error?e.message:'Delivery could not be canceled.')}}
 const activeDeliveries=deliveries.filter(d=>['waiting','delivering'].includes(d.status));
 const completed=deliveries.filter(d=>d.status==='completed'&&!d.choicesChanged).length;
 return <section className="photo-delivery-handoff" ref={panel} aria-label="Finish Etsy drafts" aria-busy={busy}>
  <WaitProgress operation={busy?{title:'Preparing your Etsy drafts',detail:prepared===null?'Saving your selected photos and listing details.':`${prepared} of ${targets.length} prepared. Submitted drafts are already finishing in the background.`}:null}/>
  {activeDeliveries.length>0&&!busy&&<WaitCard title="Finishing your Etsy drafts" detail="Printify is transferring the listings; Goldie checks details and photos before marking each draft complete. Allow several minutes." started={Math.min(...activeDeliveries.map(d=>d.createdAt||d.updatedAt||Date.now()))} lastConfirmed={Math.max(...activeDeliveries.map(d=>d.updatedAt||0))||undefined} done={completed} total={targets.length} background/>}
  <div className="photo-delivery-heading"><h3>Ready in Etsy. Live only when you choose.</h3>{completed>0&&<b>{completed} of {targets.length} complete</b>}</div>
  <ol className="draft-handoff-steps">
   <li><strong>Create your Etsy drafts</strong><p>Use the button below to send this batch directly to Etsy Drafts.</p></li>
   <li><strong>Goldie sends and checks everything</strong><p>Your Printify connection stays attached. Goldie adds your photos, listing details and personalization, then checks what Etsy saved.</p></li>
   <li><strong>Review in Etsy when you’re ready</strong><p>Wait for “Etsy draft verified,” then open your draft. Only you decide when it goes live.</p></li>
  </ol>
  <p className="photo-delivery-note">No download or second upload. Goldie never makes your listing live or renews it. Etsy charges its listing fee when you publish.</p>
  <div role="status" aria-live="polite">{busy?(prepared===null?'Saving your choices…':`Preparing batch: ${prepared} of ${targets.length} checked. Ready listings are already finishing in the background.`):loading?'Checking saved progress…':deliveries.some(d=>['waiting','delivering'].includes(d.status))?'Finishing continues even when this page is closed.':completed===targets.length&&targets.length?'Saved deliveries are complete. Review each result below.':'You can send the whole batch or create one Etsy draft below.'}</div>
  <ul className="draft-handoff-results">{targets.map(target=>{const item=deliveries.find(d=>d.productId===target.id),problem=preparationErrors[target.id];return <li key={target.id}><strong>{target.title}</strong><span>{problem?'Preparation needs attention':item?.choiceCheckUnavailable?'Current choices not verified':item?.choicesChanged&&item.status==='completed'?'Changes not sent':item?label(item.status,item.mode==='draft'):'Not prepared'}</span>{item?.choicesChanged&&<small>{item.choiceCheckUnavailable?'Current saved choices could not be checked. Reload this page before publishing.':item.status==='completed'?'Your saved choices changed. Update this Etsy draft before publishing.':'This delivery uses your earlier choices. Send the updated choices after it finishes, or cancel while waiting.'}</small>}{item?.error&&<small role="alert">{item.error}</small>}{problem&&<small role="alert">{problem}</small>}{problem&&onReview&&<button type="button" disabled={busy} data-recovery-product={target.id} onClick={()=>onReview(target.id,/photo|image|mockup/i.test(problem))}>{/photo|image|mockup/i.test(problem)?'Review photos':'Review listing'}</button>}{(!item||['completed','failed','expired','canceled','needs_attention'].includes(item.status))&&<button type="button" className="draft-prepare" disabled={busy||loading} onClick={()=>void prepareOne(target,item?.mode==='draft'&&item.status==='needs_attention'?item.id:undefined)}>{item?.mode==='draft'&&item.status==='needs_attention'?'Verify last change':item?'Update Etsy draft':'Create Etsy draft'}</button>}{item?.mode==='draft'&&item.status==='needs_attention'&&<button type="button" disabled={busy} onClick={()=>void prepareOne(target)}>Prepare corrected choices</button>}{item?.status==='waiting'&&<button type="button" disabled={busy} onClick={()=>void cancel(item.id)}>Cancel waiting</button>}{item?.status==='completed'&&item.listingId&&<a href={item.mode==='draft'?`https://www.etsy.com/your/shops/me/listing-editor/edit/${item.listingId}`:`https://www.etsy.com/listing/${item.listingId}`} target="_blank" rel="noopener noreferrer">{item.mode==='draft'?'Open Etsy draft':'View on Etsy'} ↗</a>}</li>})}</ul>
  <details><summary>What Goldie checks</summary><small>Saved title, tags, description, category, selected attributes, shipping profile, personalization and ordered photos—including custom photos and size guides. Colors, prices and SKUs must match Printify. Checking lasts up to 24 hours and pauses if the listing goes live or the destination changes. Publish only after verification. Later syncing from Printify can replace your Etsy edits.</small></details>
  {error&&<div className="photo-delivery-error" role="alert"><p>{error}</p><p>Completed work stays saved. Correct the indicated item and prepare that listing again.</p><a href="https://printify.com/app/store/products" target="_blank" rel="noopener noreferrer">Open Printify without preparing these drafts ↗</a></div>}
 </section>;
});
PhotoDeliveryHandoff.displayName='PhotoDeliveryHandoff';export default PhotoDeliveryHandoff;
