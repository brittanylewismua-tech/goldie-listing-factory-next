"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";

type StoredImage={id:string;key:string;kind:"mockup"|"size-guide";name:string;src:string};
type Photo={id:string;kind:"mockup"|"printify"|"size-guide";name:string;src:string};

export default function ListingPhotoOrder({productId,printifyImages,indices,refreshKey}:{productId:string;printifyImages:string[];indices:number[];refreshKey:string}){
  const[stored,setStored]=useState<StoredImage[]>([]),[savedOrder,setSavedOrder]=useState<string[]>([]),[order,setOrder]=useState<string[]>([]),[dragged,setDragged]=useState<string>(""),[status,setStatus]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);fetch(`/api/etsy/images?productId=${encodeURIComponent(productId)}`).then(async response=>{const payload=await response.json() as {images?:StoredImage[];order?:string[];error?:string};if(!response.ok)throw new Error(payload.error||"Photo order could not be loaded.");if(active){setStored(payload.images||[]);setSavedOrder(payload.order||[])}}).catch(error=>active&&setStatus(error instanceof Error?error.message:"Photo order could not be loaded.")).finally(()=>active&&setLoading(false));return()=>{active=false}},[productId,refreshKey]);
  const photos=useMemo<Photo[]>(()=>[...stored.filter(image=>image.kind==="mockup"),...indices.map(index=>({id:`printify:${index}`,kind:"printify" as const,name:`Printify photo ${index+1}`,src:printifyImages[index]})).filter(image=>Boolean(image.src)),...stored.filter(image=>image.kind==="size-guide")],[stored,indices,printifyImages]);
  useEffect(()=>{const available=new Set(photos.map(photo=>photo.id)),next=[...savedOrder.filter(id=>available.has(id)),...photos.map(photo=>photo.id).filter(id=>!savedOrder.includes(id))];setOrder(next)},[photos.map(photo=>photo.id).join("|"),savedOrder.join("|")]);
  const byId=new Map(photos.map(photo=>[photo.id,photo]));
  async function save(next:string[]){setOrder(next);setStatus("Saving photo order…");try{const response=await fetch("/api/etsy/images",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,order:next})}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Photo order could not be saved.");setSavedOrder(next);setStatus("✓ Photo order saved") }catch(error){setStatus(error instanceof Error?error.message:"Photo order could not be saved.")}}
  function drop(target:string){if(!dragged||dragged===target)return;const next=order.filter(id=>id!==dragged),index=next.indexOf(target);next.splice(index,0,dragged);setDragged("");void save(next)}
  if(loading)return <div className="photo-order-loading">Loading listing photos…</div>;
  if(!photos.length)return null;
  return <section className="listing-photo-order"><div className="photo-order-heading"><div><b>Arrange this listing’s photos</b><span>Drag photos into the exact order shoppers will see on Etsy.</span></div><small>Lifestyle first · Printify next · size guide last</small></div><div className="photo-order-strip">{order.map((id,index)=>{const photo=byId.get(id);if(!photo)return null;return <article key={id} draggable onDragStart={()=>setDragged(id)} onDragOver={event=>event.preventDefault()} onDrop={()=>drop(id)}><span className="photo-rank">{index+1}</span><img src={photo.src} alt={photo.name}/><b>{photo.name}</b><small>{photo.kind==="mockup"?"Lifestyle mockup":photo.kind==="size-guide"?"Size guide":"Printify photo"}</small><span className="drag-handle" aria-hidden="true">⋮⋮</span></article>})}</div>{status&&<p role="status">{status}</p>}</section>;
}
