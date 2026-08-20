"use client";

import { useEffect,useMemo,useState } from "react";
import type { Recipe } from "./factory-tools";
import { GoldieButton,GoldieStatus } from "./goldie-ui";

type Batch={id:string;status:string;setup_name:string;product_title:string;design_count:number;updated_at:string};
type KeywordBank={id:string;name:string;keywords:string[]};
type Mockup={id:string;theme:string;name:string};
type Usage={usage?:{drafts:number;aiMockups:number;mockupSets:number}};
export type CommandCenterData={batches:Batch[];recipes:Recipe[];keywords:KeywordBank[];mockups:Mockup[];draftsThisMonth:number};

async function loadCommandCenterData():Promise<CommandCenterData>{
  const [batches,recipes,keywords,mockups,usage]=await Promise.all([
    fetch("/api/batches").then(r=>r.ok?r.json():{batches:[]}),fetch("/api/product-recipes").then(r=>r.ok?r.json():{recipes:[]}),
    fetch("/api/keyword-lists").then(r=>r.ok?r.json():{lists:[]}),fetch("/api/mockups/library").then(r=>r.ok?r.json():{templates:[]}),fetch("/api/usage").then(r=>r.ok?r.json():{}),
  ]);
  return {batches:batches.batches||[],recipes:recipes.recipes||[],keywords:keywords.lists||[],mockups:mockups.templates||[],draftsThisMonth:(usage as Usage).usage?.drafts||0};
}

export function ReturningCommandCenter({printifyConnected,etsyConnected,onUseProduct,onStartBlank,onData}:{printifyConnected:boolean;etsyConnected:boolean;onUseProduct:(recipe:Recipe)=>void;onStartBlank:()=>void;onData?:(data:CommandCenterData)=>void}){
  const [data,setData]=useState<CommandCenterData|null>(null),[loading,setLoading]=useState(true);
  useEffect(()=>{void loadCommandCenterData().then(next=>{setData(next);onData?.(next)}).finally(()=>setLoading(false))},[]);
  const sets=useMemo(()=>data?[...new Set(data.mockups.map(item=>item.theme))]:[],[data]);
  if(loading)return <section className="command-center-loading"><span/><div><b>Opening your Goldie workspace</b><small>Loading recent products and batches…</small></div></section>;
  if(!data||(!data.batches.length&&!data.recipes.length))return null;
  const last=data.batches[0],lastRecipe=data.recipes.find(recipe=>recipe.name===last?.setup_name)||data.recipes[0];
  return <section className="returning-command-center">
    <div className="command-center-head"><div><GoldieStatus>Welcome back</GoldieStatus><h1>Your Etsy command center.</h1><p>Resume what matters or start the next batch without rebuilding your setup.</p></div><div className="month-value"><b>{data.draftsThisMonth}</b><span>listings created this month</span></div></div>
    <div className="command-center-actions">
      {last&&<a className="resume-batch" href={`/?batch=${encodeURIComponent(last.id)}`}><span>Resume your last batch</span><b>{last.product_title||last.setup_name||"Untitled batch"}</b><small>{last.design_count} designs · saved {new Date(`${last.updated_at.replace(" ","T")}Z`).toLocaleDateString()}</small></a>}
      {lastRecipe&&<button onClick={()=>onUseProduct(lastRecipe)}><span>Start another batch</span><b>Use {lastRecipe.name} again</b><small>Product setup is already saved</small></button>}
      <GoldieButton tone="secondary" onClick={onStartBlank}>Choose a different product</GoldieButton>
    </div>
    <div className="command-center-grid">
      <article><div><span>Recent products</span><a href="#saved-products" onClick={onStartBlank}>Manage</a></div>{data.recipes.slice(0,3).map(recipe=><button key={recipe.id} onClick={()=>onUseProduct(recipe)}>{recipe.name}<span>Use →</span></button>)}</article>
      <article><div><span>Keyword banks</span><a href="/keywords" target="_blank">Open all ↗</a></div>{data.keywords.slice(0,3).map(bank=><a key={bank.id} href="/keywords" target="_blank">{bank.name}<span>{bank.keywords.length} phrases</span></a>)}</article>
      <article><div><span>Mockup sets</span><a href="/mockups" target="_blank">Open all ↗</a></div>{sets.slice(0,3).map(set=><a key={set} href="/mockups" target="_blank">{set}<span>{data.mockups.filter(item=>item.theme===set).length} mockups</span></a>)}</article>
    </div>
    <div className="account-alerts"><b>Account check</b><span className={printifyConnected?"ready":"attention"}>{printifyConnected?"✓ Printify connected":"! Reconnect Printify before the next batch"}</span><span className={etsyConnected?"ready":"attention"}>{etsyConnected?"✓ Etsy ready to publish":"! Connect Etsy before publishing"}</span></div>
  </section>;
}

export function GoldieCommandBar({data,onUseProduct,onStartBlank}:{data:CommandCenterData|null;onUseProduct:(recipe:Recipe)=>void;onStartBlank:()=>void}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState("");
  useEffect(()=>{function key(event:KeyboardEvent){if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setOpen(value=>!value)}if(event.key==="Escape")setOpen(false)}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[]);
  const commands=[{label:"Start a new batch",detail:"Choose a product",run:onStartBlank},...(data?.recipes||[]).map(recipe=>({label:`Start ${recipe.name} batch`,detail:"Saved product",run:()=>onUseProduct(recipe)})),...(data?.keywords||[]).map(bank=>({label:`Open ${bank.name}`,detail:"Keyword bank",run:()=>window.location.assign("/keywords")})),...(data?.batches||[]).slice(0,5).map(batch=>({label:`Open ${batch.product_title||batch.setup_name||"saved batch"}`,detail:"Batch history",run:()=>window.location.assign(`/?batch=${encodeURIComponent(batch.id)}`)}))],filtered=commands.filter(item=>`${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0,8);
  return <><button className="command-trigger" onClick={()=>setOpen(true)} aria-label="Open Goldie commands">Search Goldie or start a workflow… <kbd>⌘K</kbd></button>{open&&<div className="command-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Goldie commands"><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Start a batch, open keywords, find recent work…"/><div>{filtered.map(item=><button key={`${item.detail}-${item.label}`} onClick={()=>{item.run();setOpen(false)}}><b>{item.label}</b><span>{item.detail}</span></button>)}{!filtered.length&&<p>No matching Goldie command.</p>}</div><small>Press Esc to close</small></section></div>}</>;
}
