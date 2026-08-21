"use client";
import { useEffect, useMemo, useState } from "react";
import { phrasesFromErank } from "../seo-utils";
import GoldieWordmark from "../goldie-wordmark";

type List = { id: string; name: string; keywords: string[] };
type ProductUse = { id:string; name:string; keywordListId?:string };
type Notice = { kind:"success"|"error"; title:string; detail:string } | null;
const SHIRT_CONTEXT=/\b(tee|tees|shirt|shirts|t-?shirt|apparel)\b/i;
const NON_SHIRT_PRODUCT=/\b(koozie|koozies|coozie|coozies|sash|sashes|sunglasses|tapestry|tapestries|tattoo|tattoos|sticker|stickers|mug|mugs|tumbler|tumblers|cup|cups|banner|banners|decor|decoration|decorations|poster|posters|print|prints|blanket|blankets|hoodie|hoodies|sweatshirt|sweatshirts|tote|totes)\b/i;

export default function KeywordBanks() {
  const [lists,setLists]=useState<List[]>([]),[products,setProducts]=useState<ProductUse[]>([]),[name,setName]=useState(""),[raw,setRaw]=useState(""),[notice,setNotice]=useState<Notice>(null),[saving,setSaving]=useState(false),[savedId,setSavedId]=useState("");
  const [returnHref,setReturnHref]=useState("/");
  const reload=()=>fetch("/api/keyword-lists").then(r=>r.json()).then(r=>setLists(r.lists||[]));
  useEffect(()=>{void reload();fetch("/api/product-recipes").then(r=>r.json()).then(r=>setProducts(r.recipes||[])).catch(()=>setProducts([]));const batch=window.localStorage.getItem("goldie-active-batch");setReturnHref(batch?`/?batch=${encodeURIComponent(batch)}`:"/")},[]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(null),5000);return()=>window.clearTimeout(timer)},[notice]);
  const words=useMemo(()=>phrasesFromErank(raw.replace(/;/g,"\n")),[raw]);
  const associatedProducts=products.filter(product=>product.keywordListId===savedId);
  const shirtBank=SHIRT_CONTEXT.test(name)||associatedProducts.some(product=>SHIRT_CONTEXT.test(product.name));
  const mismatchedWords=shirtBank?words.filter(word=>NON_SHIRT_PRODUCT.test(word)):[];

  async function save(){
    const editingId=savedId;
    const savedName=name.trim();
    const savedWords=[...words];
    if(mismatchedWords.length){setNotice({kind:"error",title:"Fix wrong-product phrases before saving",detail:`This shirt bank contains ${mismatchedWords.length} phrase${mismatchedWords.length===1?"":"s"} for another product: ${mismatchedWords.slice(0,4).join(", ")}${mismatchedWords.length>4?"…":""}`});return}
    setSaving(true);
    const response=await fetch("/api/keyword-lists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editingId||undefined,name:savedName,keywords:savedWords})});
    const payload=await response.json() as {id?:string;error?:string};
    setSaving(false);
    if(!response.ok){setNotice({kind:"error",title:"Keyword bank not saved",detail:payload.error||"Please try again."});return}
    setNotice({kind:"success",title:editingId?`“${savedName}” was updated`:`“${savedName}” was created`,detail:`${savedWords.length} keyword ${savedWords.length===1?"phrase":"phrases"} are ready to use in Listing Factory.`});
    await reload();
    if(editingId){
      setSavedId(payload.id||editingId);
    }else{
      setName("");
      setRaw("");
      setSavedId("");
    }
  }
  function startAnother(){setName("");setRaw("");setSavedId("");setNotice(null)}
  async function remove(list:List){if(!window.confirm(`Delete “${list.name}”?`))return;await fetch("/api/keyword-lists",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:list.id})});if(savedId===list.id)startAnother();void reload()}

  return <main className="management-page keyword-page">
    <nav className="management-nav" aria-label="Goldie tools"><GoldieWordmark/><a href={returnHref}>Listing Factory</a><a href="/batches">Batch History</a><a className="active" href="/keywords">Keyword Banks</a><a href="/mockups">Mockup Sets</a><a href="/usage">Usage + Plan</a></nav>
    <header className="keyword-hero"><div><p className="mini-label">KEYWORD LIBRARY</p><h1>Your keyword banks</h1><p>Save your organized eRank phrases here, then choose the bank you want while building listing titles.</p></div></header>
    <div className="keyword-workspace">
      <section className="management-create"><div className="section-heading"><div><p className="mini-label">ADD OR UPDATE</p><h2>{savedId?"Edit saved keyword bank":"Create a keyword bank"}</h2></div>{savedId&&<button className="new-bank-button" onClick={startAnother}>＋ Create another bank</button>}</div><label>Bank name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Example: Western shirts"/></label><label>eRank phrases or CSV column<textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={6} placeholder="Paste one keyword phrase per line"/></label>{mismatchedWords.length>0&&<div className="keyword-product-warning" role="alert"><b>{mismatchedWords.length} wrong-product {mismatchedWords.length===1?"phrase":"phrases"}</b><p>A shirt bank cannot include phrases for koozies, sashes, mugs, hoodies, posters, or other products. Remove: {mismatchedWords.join(", ")}</p></div>}<label className="file-label">Or upload an eRank CSV or text file<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async e=>{const file=e.target.files?.[0];if(file)setRaw(await file.text());e.currentTarget.value=""}}/></label><div className="management-create-foot"><span>{words.length} valid phrases found</span><button disabled={!name.trim()||!words.length||saving||mismatchedWords.length>0} onClick={()=>void save()}>{saving?"Saving…":savedId?"Save changes":"Save keyword bank"}</button></div></section>
      <section className="bank-library"><div><div><p className="mini-label">YOUR LIBRARY</p><h2>Saved banks</h2></div><span>{lists.length} total</span></div>{!lists.length?<div className="empty-bank"><b>No keyword banks yet</b><p>Your first saved bank will appear here immediately.</p></div>:<div className="bank-grid">{lists.map(list=>{const usedBy=products.filter(product=>product.keywordListId===list.id);return <article className={list.id===savedId?"current":""} key={list.id}><div><h3>{list.name}</h3><button onClick={()=>void remove(list)}>Delete</button></div><p>{list.keywords.length} phrases</p><p className="bank-product-use"><b>Used by:</b> {usedBy.length?usedBy.map(product=>product.name).join(", "):"No saved products yet"}</p><div>{list.keywords.slice(0,12).map(word=><span key={word}>{word}</span>)}</div>{list.keywords.length>12&&<small>+ {list.keywords.length-12} more</small>}<button className="edit-bank" onClick={()=>{setName(list.name);setRaw(list.keywords.join("\n"));setSavedId(list.id);document.querySelector(".management-create")?.scrollIntoView({behavior:"smooth",block:"start"})}}>Edit bank</button></article>})}</div>}</section>
    </div>
    {notice&&<div className={`save-toast ${notice.kind}`} role={notice.kind==="error"?"alert":"status"} aria-live="assertive"><span>{notice.kind==="success"?"✓":"!"}</span><div><b>{notice.title}</b><p>{notice.detail}</p></div><button aria-label="Close notification" onClick={()=>setNotice(null)}>×</button></div>}
  </main>
}
