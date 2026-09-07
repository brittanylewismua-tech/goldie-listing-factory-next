'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {waitProgress,progressValue} from './wait-progress-model';
export type WaitOperation={title:string;detail?:string;done?:number;total?:number};
/** One visible wait surface. A clock is elapsed time, never an invented completion percentage. */
export function WaitCard({title,detail,started,lastConfirmed,done,total,background=false}:{title:string;detail?:string;started:number;lastConfirmed?:number;done?:number;total?:number;background?:boolean}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const state=waitProgress(now,started,lastConfirmed),value=progressValue(done,total);
 return <div className="goldie-wait-card">
  <h2>{title}</h2><p role="status">{state.stale?'No recent update has been confirmed. Automatic checking is still scheduled; do not start this batch again.':detail||'Waiting for this step to finish.'}</p>
  <progress aria-label={title} max={total||1} value={value}/>
  <div className="goldie-wait-count"><b>{value!=null?`${value} of ${total} ${background?'verified':'processed'}`:'Waiting for confirmation'}</b><span aria-label={`Elapsed time ${state.elapsed}`}>{state.elapsed} elapsed</span></div>
  <p>{background?'Your submitted drafts continue in the background. You can leave this page and return to this saved batch.':'Keep this page open while this step finishes. Please do not refresh or start it again.'}</p>
  {state.long&&<p className="goldie-wait-long">{state.stale?'This is taking longer than expected. Your confirmed work is saved; the results below will show any recovery needed.':background?'Draft transfers can take several minutes. Completion is shown only after Etsy confirms the saved result.':'Large batches and files can take several minutes. Goldie is still waiting for confirmation. Do not repeat this action; a result or reported error will appear when the request finishes.'}</p>}
 </div>;
}
export default function WaitProgress({operation,observeTools=false}:{operation:WaitOperation|null;observeTools?:boolean}){
 const [started,setStarted]=useState(0),[visible,setVisible]=useState(false),[fallback,setFallback]=useState<WaitOperation|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const title=operation?.title;
 useEffect(()=>{setVisible(false);setStarted(Date.now());if(!title)return;const timer=setTimeout(()=>setVisible(true),1500);return()=>clearTimeout(timer)},[title]);
 // Catch scoped tools (photo rendering, downloads, product-library saves) that own their busy state.
 useEffect(()=>{if(!observeTools)return;let element:Element|null=null,since=0;const timer=setInterval(()=>{
  if(title){setFallback(null);element=null;return}
  const next=[...document.querySelectorAll<HTMLElement>('[aria-busy="true"]')].find(node=>node.getClientRects().length&&!node.closest('.goldie-wait-dialog')&&!node.closest('.photo-delivery-handoff'))||null;
  if(next!==element){element=next;since=Date.now();setFallback(null)}
  if(element&&Date.now()-since>=15000){const label=element.getAttribute('aria-label')||(element.tagName==='BUTTON'?element.textContent:'');setStarted(since);setFallback({title:(label||'Finishing this step').trim().slice(0,100),detail:'Waiting for the requested operation to finish. Keep this page open.'})}
 },1000);return()=>clearInterval(timer)},[title,observeTools]);
 const active=visible?operation:fallback;
 useEffect(()=>{if(!active||!dialog.current)return;const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.current.showModal();return()=>{dialog.current?.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[Boolean(active)]);
 if(!active||typeof document==='undefined')return null;
 return createPortal(<dialog className="goldie-wait-dialog" ref={dialog} tabIndex={-1} onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();event.stopPropagation();dialog.current?.focus()}}} aria-label={active.title} onCancel={event=>event.preventDefault()}><WaitCard {...active} started={started}/></dialog>,document.body);
}
