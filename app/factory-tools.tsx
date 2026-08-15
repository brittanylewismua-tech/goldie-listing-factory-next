"use client";
import { useEffect, useState } from "react";

export type Pricing = { targetProfit: number; etsyFeePercent: number; fixedFee: number; listingFee: number; shippingCost: number; shippingCharged: number };
export type Recipe = { id: string; name: string; templateUrl: string; description: string; defaultTitle: string; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean;etsyShippingProfileId?:number };
export type KeywordList = { id: string; name: string; keywords: string[] };

type WorkflowProps = {
  connected: boolean; templateUrl: string; templateVerified: boolean; loadingTemplate: boolean;
  onTemplateUrl: (value: string) => void; onUseRecipe: (recipe: Recipe) => boolean; onStartNewProduct: () => boolean; onVerifyTemplate: (url: string) => Promise<boolean>;
};

export function SavedWorkflow(props: WorkflowProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]), [name, setName] = useState(""), [message, setMessage] = useState(""), [editing, setEditing] = useState(false), [editingId, setEditingId] = useState(""), [activeId, setActiveId] = useState("");
  const [keywordLists,setKeywordLists]=useState<KeywordList[]>([]),[keywordListId,setKeywordListId]=useState("");
  const reload = () => fetch("/api/product-recipes").then((r) => r.json()).then((r) => setRecipes(r.recipes || [])).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); fetch("/api/keyword-lists").then(r=>r.json()).then(r=>setKeywordLists(r.lists||[])); }, []);
  async function save() {
    setMessage("");
    if (!props.templateVerified && !(await props.onVerifyTemplate(props.templateUrl))) return setMessage("Connect the Printify template before saving this product.");
    const existing=recipes.find(recipe=>recipe.id===editingId);const response = await fetch("/api/product-recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId || undefined, name, templateUrl: props.templateUrl, keywordListId, normalizePadding:true,etsyShippingProfileId:existing?.etsyShippingProfileId||0 }) });
    const result = await response.json() as { id?: string; error?: string };
    if (!response.ok) return setMessage(result.error || "The product could not be saved.");
    const saved:Recipe={id:result.id||editingId,name:name.trim(),templateUrl:props.templateUrl,description:"",defaultTitle:"",keywordListId,normalizePadding:true,etsyShippingProfileId:existing?.etsyShippingProfileId||0};
    if(props.onUseRecipe(saved))setActiveId(saved.id);setName(""); setEditingId(""); setMessage(editingId ? "Product updated and selected." : "Product saved and selected. You will not need to paste this Printify template again."); setEditing(false); reload();
  }
  async function remove(recipe: Recipe) { if (!window.confirm(`Delete “${recipe.name}”? This removes only the saved product, not the connected Printify product.`)) return; await fetch("/api/product-recipes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: recipe.id }) }); if (activeId === recipe.id) setActiveId(""); reload(); }
  return <article className="step-card recipe-card"><div className="step-number">02</div><div className="step-content"><div className="step-heading"><div><p className="mini-label">SAVED PRODUCTS</p><h2>Choose a saved product or add another</h2></div>{props.templateVerified && <span className="done-mark">✓ Product ready</span>}</div><p className="step-copy">A saved product remembers only its connected Printify template and imported product facts. Pricing and mockups are chosen later in their own steps.</p>
    {recipes.length > 0 && <><div className="recipe-library-head"><span>{recipes.length} saved {recipes.length === 1 ? "product" : "products"}</span><button onClick={() => { if(!props.onStartNewProduct())return;setEditing(true);setEditingId("");setActiveId("");setName("");setKeywordListId("");setMessage(""); }}>＋ Add another product</button></div><div className="recipe-grid">{recipes.map((recipe) => <article className={`recipe-tile ${activeId === recipe.id ? "selected" : ""}`} key={recipe.id}><button className="recipe-use" onClick={() => { if(!props.onUseRecipe(recipe))return;setActiveId(recipe.id);setKeywordListId(recipe.keywordListId||"");setEditing(false); setMessage(`${recipe.name} selected. Checking its connected Printify template…`); }}><span className="recipe-icon">P</span><span className="recipe-copy"><b>{recipe.name}</b><small>Printify template connected</small><em>{activeId === recipe.id ? "Product selected" : "Use this product →"}</em></span></button><button className="edit-recipe" onClick={() => { if(!props.onUseRecipe(recipe))return;setActiveId(recipe.id); setEditingId(recipe.id); setName(recipe.name);setKeywordListId(recipe.keywordListId||"");setEditing(true); }}>Edit</button><button className="delete-recipe" aria-label={`Delete ${recipe.name}`} title="Delete saved product" onClick={() => void remove(recipe)}>×</button></article>)}</div></>}
    {!recipes.length && <div className="first-recipe-callout"><span>＋</span><div><b>Create your first saved product</b><p>Name it and connect its completed Printify template. That is all this step needs.</p></div></div>}
    {(editing || !recipes.length) && <div className="recipe-form"><div className="recipe-form-heading"><b>{editingId ? "Edit saved product" : "New saved product"}</b><span>Name the product and connect its Printify template. Goldie imports the product facts and permanent description automatically.</span></div><label><span>Product name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Comfort Colors 1717 shirts"/></label><label className="wide"><span>Connect this Printify template</span><div className="inline-field"><input value={props.templateUrl} onChange={(e) => props.onTemplateUrl(e.target.value)} placeholder="Paste the Printify product-editor link"/><button onClick={() => void props.onVerifyTemplate(props.templateUrl)} disabled={!props.connected || !props.templateUrl.trim() || props.loadingTemplate}>{props.loadingTemplate ? "Checking…" : props.templateVerified ? "✓ Template connected" : "Connect template"}</button></div><small>This imports the product, provider, variants, placement, shipping profile, costs, and permanent description. Pricing and mockups are handled later.</small></label><button className="save-recipe" onClick={() => void save()} disabled={!name.trim() || !props.templateUrl.trim()}>{editingId ? "Update product" : "Save product"}</button></div>}
    {!editing && recipes.length > 0 && props.templateUrl && <div className="active-recipe"><b>Product ready</b><span>{props.templateVerified ? "Its Printify template is connected and ready for this batch." : "Checking the connected Printify template…"}</span><button onClick={() => setEditing(true)}>Edit this product</button></div>}{message && <p className="field-warning" role="status">{message}</p>}
  </div></article>;
}

let keywordListsCache:KeywordList[]|null=null;
let keywordListsRequest:Promise<KeywordList[]>|null=null;
function loadKeywordLists(){if(keywordListsCache)return Promise.resolve(keywordListsCache);if(!keywordListsRequest)keywordListsRequest=fetch("/api/keyword-lists").then(r=>r.json()).then(r=>{keywordListsCache=r.lists||[];return keywordListsCache!}).catch(()=>[]).finally(()=>{keywordListsRequest=null});return keywordListsRequest}

export function KeywordBank({ onAdd=()=>undefined,onSelect,title="Choose a keyword bank",copy="Goldie will use only phrases from this validated bank.",compact=false,selectionOnly=false,initialId="" }: { onAdd?: (keyword: string) => void;onSelect?:(list:KeywordList|null)=>void;title?:string;copy?:string;compact?:boolean;selectionOnly?:boolean;initialId?:string }) {
  const [lists, setLists] = useState<KeywordList[]>([]), [active, setActive] = useState("");
  useEffect(() => { void loadKeywordLists().then(setLists); }, []);
  useEffect(()=>{if(!initialId||!lists.some(list=>list.id===initialId)||active)return;setActive(initialId);onSelect?.(lists.find(list=>list.id===initialId)||null)},[lists,initialId,active,onSelect]);
  const chosen = lists.find((list) => list.id === active);
  return <section className={`keyword-bank keyword-workspace ${compact?"compact-keywords":""}`}><div className="keyword-workspace-heading"><div><b>{title}</b><span>{copy}</span></div>{!compact&&<a href="/keywords" target="_blank" rel="noopener noreferrer">Upload or manage keyword banks ↗</a>}</div><div className="keyword-list-picker"><select value={active} onChange={(e) => {const id=e.target.value;setActive(id);onSelect?.(lists.find(list=>list.id===id)||null)}}><option value="">Choose a keyword bank</option>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></div>{chosen ? selectionOnly?<p>✓ {chosen.keywords.length} validated phrases available to Goldie.</p>:<><p>Click any phrase to add it.</p><div className="keyword-chips">{chosen.keywords.map((word) => <button type="button" key={word} onClick={() => onAdd(word)}>+ {word}</button>)}</div></> : <p>Choose a bank to continue.</p>}</section>;
}
