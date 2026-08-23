"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type Pricing = { targetProfit: number; etsyFeePercent: number; fixedFee: number; listingFee: number; shippingCost: number; shippingCharged: number };
/* etsyDefaults: Etsy attribute values that are properties of the blank itself
   (materials, sleeve length, neckline, …) rather than of any one design.
   Stored on the saved product so they are remembered like defaultColorIds
   instead of being re-inferred from the artwork on every listing of every
   batch — which currently fills only 2–3 of 11 fields and is not stable
   across listings in the same batch. */
export type RecipeEtsyDefaults = Record<string, string | number | null>;
export type Recipe = { id: string; name: string; templateUrl: string; description: string; defaultTitle: string; defaultMockupTheme?:string; mockupIds?:string[]; setupComplete?:boolean; defaultProfitTarget?:number; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean;etsyShippingProfileId?:number;defaultColorIds?:number[];defaultSizeIds?:number[];etsyDefaults?:RecipeEtsyDefaults };
export type ProductBundle = { id:string;name:string;recipeIds:string[] };

/* D222 · A product cannot join a bundle until it has been set up. Creating a
 * product means going through its setup — colours and sizes are the seller's
 * choices and cannot be inherited from the Printify template — so a product
 * with neither has not been set up yet. Letting it into a bundle is how an
 * unconfigured product reached a batch and had to be answered for there, which
 * is the thing the recipe exists to prevent. */
export function recipeIsSetUp(recipe: Recipe) {
  return Boolean((recipe.defaultColorIds || []).length) && Boolean((recipe.defaultSizeIds || []).length);
}


/* D198 · "Printify product connected" rendered identically on every saved
 * product card, so the only descriptive line carried no information at all —
 * exactly the fault D197 removed with the "P" badge. Every product connected
 * to Printify is connected to Printify; that is what "saved product" means.
 * Summarise what is actually saved on the recipe instead, and say plainly when
 * nothing is, which is the one thing the seller can act on from this screen.
 * Clamped to a single line in CSS so tiles stay the same height. */
export function recipeSummary(recipe: Recipe): string {
  const parts: string[] = [];
  const colors = (recipe.defaultColorIds || []).length;
  const sizes = (recipe.defaultSizeIds || []).length;
  if (colors) parts.push(`${colors} color${colors === 1 ? "" : "s"}`);
  if (sizes) parts.push(`${sizes} size${sizes === 1 ? "" : "s"}`);
  /* Deliberately NOT the saved mockup theme. Whether a set fits depends on its
   * surfaceKind against the product's blueprint title, and this screen never
   * loads either — it would take one Printify fetch per card. Two of the three
   * saved products here carry "BACH TEES", a tee set, against a hoodie and a
   * crewneck, so the card would have asserted a set the wizard immediately
   * calls incompatible. Report only what this screen can actually verify. */
  if (recipe.keywordListId) parts.push("keyword bank");
  return parts.length ? parts.join(" \u00b7 ") : "No details saved yet";
}

export type KeywordList = { id: string; name: string; keywords: string[] };

type WorkflowProps = {
  connected: boolean; templateUrl: string; templateVerified: boolean; loadingTemplate: boolean;
  selectedProductId:string;
  selectedSummary?:ReactNode;
  suggestedProductName?:string;
  verifiedShippingProfileId:number;
  /* D205 · Incremented by the workflow whenever establishing a facet writes to a
     recipe, so the saved-product tiles refetch instead of showing what the list
     looked like on mount. */
  savedRevision?: number;
  onTemplateUrl: (value: string) => void; onUseRecipe: (recipe: Recipe) => Promise<boolean>;onUseBundle:(bundle:ProductBundle,recipeIds:string[])=>Promise<boolean>; onStartNewProduct: () => boolean; onChangeProduct: () => boolean; onVerifyTemplate: (url: string) => Promise<{shippingTemplateId:string;shippingProfileNeedsSelection?:boolean}|null>;
};

export function SavedWorkflow(props: WorkflowProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]), [name, setName] = useState(""), [message, setMessage] = useState(""), [editing, setEditing] = useState(false), [editingId, setEditingId] = useState(""), [activeId, setActiveId] = useState("");
  const [bundles,setBundles]=useState<ProductBundle[]>([]),[bundleForm,setBundleForm]=useState(false),[bundleName,setBundleName]=useState(""),[bundleIds,setBundleIds]=useState<string[]>([]),[editingBundleId,setEditingBundleId]=useState("");
  const [bundleSaving,setBundleSaving]=useState(false);
  const bundleSaveLock=useRef(false);
  /* D119 · Connecting the Printify product already tells us what it is, so the
   * seller should not have to retype it. Fill the name once, only while it is
   * empty, and never overwrite anything typed. */
  const nameTouched=useRef(false);
  useEffect(()=>{
    if(nameTouched.current||editingId||!props.suggestedProductName)return;
    if(name.trim())return;
    setName(props.suggestedProductName);
  },[props.suggestedProductName,editingId,name]);
  const [pendingAction,setPendingAction]=useState("");
  const actionLock=useRef(false);
  const [,setKeywordLists]=useState<KeywordList[]>([]),[keywordListId,setKeywordListId]=useState("");
  const reload = () => Promise.all([fetch("/api/product-recipes").then((r) => r.json()),fetch("/api/product-bundles").then(r=>r.json())]).then(([products,groups])=>{setRecipes(products.recipes||[]);setBundles(groups.bundles||[])}).catch(() => undefined);

  useEffect(() => { reload(); fetch("/api/keyword-lists").then(r=>r.json()).then(r=>setKeywordLists(r.lists||[])); }, []);
  /* Establishing colors, sizes, mockups or a keyword bank saves straight to the
     recipe, but the tiles above were loaded once on mount. Picking 4 colors and
     8 sizes on the hoodie persisted correctly and its card still read "No
     details saved yet" — the data was right and the screen contradicted it. */
  const firstRevision = useRef(true);
  useEffect(() => {
    if (firstRevision.current) { firstRevision.current = false; return; }
    void reload();
  }, [props.savedRevision]);
  useEffect(()=>setActiveId(props.selectedProductId),[props.selectedProductId]);
  async function save() {
    if(actionLock.current)return;
    actionLock.current=true;setPendingAction("save-product");
    setMessage("");
    try{
      const existing=recipes.find(recipe=>recipe.id===editingId);
      let shippingProfileId=props.verifiedShippingProfileId||Number(existing?.etsyShippingProfileId)||0;
      if (!props.templateVerified) {const verified=await props.onVerifyTemplate(props.templateUrl);if(!verified){setMessage("Connect the Printify product before saving it.");return}shippingProfileId=Number(verified.shippingTemplateId)||shippingProfileId}
      const setupComplete=editingId?existing?.setupComplete!==false:false;
      const response = await fetch("/api/product-recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId || undefined, name, templateUrl: props.templateUrl, description:existing?.description, keywordListId, normalizePadding:true,etsyShippingProfileId:shippingProfileId,defaultColorIds:existing?.defaultColorIds,defaultSizeIds:existing?.defaultSizeIds,printifyImageIndices:existing?.printifyImageIndices,etsyDefaults:existing?.etsyDefaults,defaultMockupTheme:existing?.defaultMockupTheme,mockupIds:existing?.mockupIds,setupComplete,defaultProfitTarget:existing?.defaultProfitTarget }) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok){setMessage(result.error || "The product could not be saved.");return}
      const saved:Recipe={id:result.id||editingId,name:name.trim(),templateUrl:props.templateUrl,description:existing?.description||"",defaultTitle:"",keywordListId,normalizePadding:true,etsyShippingProfileId:shippingProfileId,defaultColorIds:existing?.defaultColorIds,defaultSizeIds:existing?.defaultSizeIds,printifyImageIndices:existing?.printifyImageIndices,etsyDefaults:existing?.etsyDefaults,defaultMockupTheme:existing?.defaultMockupTheme,mockupIds:existing?.mockupIds,setupComplete,defaultProfitTarget:existing?.defaultProfitTarget};
      /* Saving a product used to select it and start building with it. Creating
         a product and choosing one for this batch are two different intentions —
         the Printify link was already verified above, so nothing needs loading
         here. Go back to the list and let the seller pick deliberately. */
      setName(""); setEditingId(""); setMessage(editingId ? "Product updated." : "Product saved. Choose it below when you want to build with it."); setEditing(false); await reload();
    }catch{setMessage("The product could not be saved. Try again.")}
    finally{actionLock.current=false;setPendingAction("")}
  }
  async function remove(recipe: Recipe) { if (!window.confirm(`Delete “${recipe.name}”? This removes only the saved product, not the connected Printify product.`)) return; await fetch("/api/product-recipes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: recipe.id }) }); if (activeId === recipe.id) setActiveId(""); reload(); }
  function openBundle(bundle?:ProductBundle){setBundleForm(true);setEditingBundleId(bundle?.id||"");setBundleName(bundle?.name||"");setBundleIds(bundle?.recipeIds||[]);setBundleSaving(false);bundleSaveLock.current=false;setMessage("");window.setTimeout(()=>{document.querySelector(".bundle-library")?.scrollIntoView({block:"start"})},0)}
  async function saveBundle(){
    if(bundleSaveLock.current)return;
    bundleSaveLock.current=true;setBundleSaving(true);setMessage("");
    try{
      const response=await fetch("/api/product-bundles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:editingBundleId||undefined,name:bundleName,recipeIds:bundleIds})});
      const result=await response.json() as {error?:string};
      if(!response.ok){setMessage(result.error||"The product bundle could not be saved.");return}
      setBundleForm(false);setEditingBundleId("");setBundleName("");setBundleIds([]);setMessage("Product bundle saved. Upload each design once and Goldie will carry it through every product.");await reload();
    }catch{setMessage("The product bundle could not be saved. Try again.")}
    finally{bundleSaveLock.current=false;setBundleSaving(false)}
  }
  async function removeBundle(bundle:ProductBundle){if(!window.confirm(`Delete “${bundle.name}”? Your individual saved products will not be deleted.`))return;await fetch("/api/product-bundles",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:bundle.id})});await reload()}
  async function chooseBundle(bundle:ProductBundle){
    if(actionLock.current)return;
    actionLock.current=true;setPendingAction(`bundle:${bundle.id}`);setActiveId(`bundle:${bundle.id}`);setMessage("");
    try{
      if(await props.onUseBundle(bundle,bundle.recipeIds)){setEditing(false);setBundleForm(false);return}
      setActiveId("");setMessage("Goldie could not load every saved product in this bundle. Edit the bundle or refresh the page, then try again.");
    }catch(error){
      console.error("Bundle selection failed",error);
      setActiveId("");setMessage("Goldie could not load this bundle. Try again in a moment.");
    }finally{actionLock.current=false;setPendingAction("")}
  }
  return <article className="step-card recipe-card"><div className="step-number" aria-hidden="true"/><div className="step-content">{/* D257 · The page title already reads "Choose product" and the rail already
          reads PRODUCT. This card added a third "Product" six pixels below the
          second — the same defect as the Colors panel in D236. */}<p className="step-copy">Choose it once. Goldie remembers the product details, pricing, shipping, keywords, and Etsy settings for every future batch.</p>
    {recipes.length > 0 && <><div className="recipe-library-head"><span>{recipes.length} saved {recipes.length === 1 ? "product" : "products"}</span><button className="add-product-button" disabled={Boolean(pendingAction)} onClick={() => { if(!props.onStartNewProduct())return;setEditing(true);setEditingId("");setActiveId("");setName("");setKeywordListId("");setMessage(""); }}>＋ Add another product</button></div><div className="recipe-grid">{recipes.map((recipe) => {const selecting=pendingAction===`recipe:${recipe.id}`;return <article className={`recipe-tile ${activeId === recipe.id ? "selected" : ""} ${selecting?"selecting":""}`} aria-busy={selecting} key={recipe.id}><button className="recipe-use" title={recipe.name} disabled={Boolean(pendingAction)} onClick={async () => {if(actionLock.current)return;actionLock.current=true;setPendingAction(`recipe:${recipe.id}`);setActiveId(recipe.id);setMessage("");try{if(!await props.onUseRecipe(recipe)){setActiveId("");return}setKeywordListId(recipe.keywordListId||"");setEditing(false)}finally{actionLock.current=false;setPendingAction("")}}}><span className="recipe-icon">P</span><span className="recipe-copy"><b>{recipe.name}</b><small>{selecting?"Loading product details…":recipeSummary(recipe)}</small><em>{selecting?`Loading ${recipe.name}…`:activeId === recipe.id ? (props.templateVerified ? "✓ Ready" : "Checking…") : "Choose →"}</em></span></button>{activeId===recipe.id&&<button className="change-product" disabled={Boolean(pendingAction)} onClick={()=>{if(!props.onChangeProduct())return;setActiveId("");setEditing(false);setMessage("")}}>Change product</button>}<button className="edit-recipe" title="Rename this product or reconnect its Printify template" disabled={Boolean(pendingAction)} onClick={async () => {if(actionLock.current)return;actionLock.current=true;setPendingAction(`edit:${recipe.id}`);setActiveId(recipe.id);try{if(!await props.onUseRecipe(recipe)){setActiveId("");return}setEditingId(recipe.id); setName(recipe.name);setKeywordListId(recipe.keywordListId||"");setEditing(true)}finally{actionLock.current=false;setPendingAction("")}}}>Edit</button><button className="delete-recipe" disabled={Boolean(pendingAction)} aria-label={`Delete ${recipe.name}`} title="Delete saved product" onClick={() => void remove(recipe)}>Delete</button></article>})}</div></>}
    {activeId&&props.selectedSummary}
    {/* Once a bundle is the current selection its members are already listed above,
        so re-showing the bundle grid underneath just offered the same bundle again. */}
    {bundles.length>0&&!activeId.startsWith("bundle:")&&<><div className="recipe-library-head bundle-card-heading"><span>{bundles.length} saved product {bundles.length===1?"bundle":"bundles"}</span><small>Bundles are selected exactly like individual products.</small></div><div className="recipe-grid unified-bundle-grid">{bundles.map(bundle=>{const included=bundle.recipeIds.map(id=>recipes.find(recipe=>recipe.id===id)).filter(Boolean) as Recipe[],selecting=pendingAction===`bundle:${bundle.id}`,selected=activeId===`bundle:${bundle.id}`;return <article className={`recipe-tile bundle-as-product ${selected?"selected":""}`} aria-busy={selecting} key={bundle.id}><button className="recipe-use" title={bundle.name} disabled={included.length<2||Boolean(pendingAction)} onClick={()=>void chooseBundle(bundle)}><span className="recipe-icon">{included.length}</span><span className="recipe-copy"><b>{bundle.name}</b><small>{selecting?"Loading every product in this bundle…":included.map(recipe=>recipe.name).join(" · ")||"Saved products missing"}</small><em>{selecting?"Loading…":selected?"✓ Ready":"Choose →"}</em></span></button><button className="edit-recipe" disabled={Boolean(pendingAction)} onClick={()=>openBundle(bundle)}>Edit</button><button className="delete-recipe" disabled={Boolean(pendingAction)} aria-label={`Delete ${bundle.name}`} title="Delete bundle" onClick={()=>void removeBundle(bundle)}>Delete</button></article>})}</div></>}
    {!recipes.length && <div className="first-recipe-callout"><span>＋</span><div><b>Create your first saved product</b><p>Name it and connect the completed product from Printify. That is all this step needs.</p></div></div>}
    {(editing || !recipes.length) && <div className="recipe-form"><div className="recipe-form-heading"><b>{editingId ? "Edit saved product" : "New saved product"}</b><span>Name it and paste the link to the completed product in Printify.</span></div>
      <details className="template-instructions-toggle"><summary>How to prepare the Printify product</summary><section className="template-requirements" aria-labelledby="template-requirements-title"><div className="template-requirements-heading"><span>Required before you paste the link</span><div><b id="template-requirements-title">Publish the product to Etsy first</b><small>Use an already-published product or create one specifically for Listing Factory. Either works.</small></div></div><ol><li><span>1</span><div><b>Choose the product and print provider</b><small>Select the exact physical product and manufacturer Goldie should copy.</small></div></li><li><span>2</span><div><b>Add temporary artwork and set its placement</b><small>Resize and position it exactly where every finished design should print. The temporary artwork itself does not matter.</small></div></li><li><span>3</span><div><b>Publish the product from Printify to Etsy</b><small>This is required. Publish it to the same Etsy shop connected to Goldie before copying the link.</small></div></li></ol><div className="template-link-instructions"><b>Copy the URL only from the Printify design editor</b><p>In Printify, open <strong>My Products</strong>, select the published product, and enter its design editor so the artwork placement controls are visible. Copy the complete URL from the browser address bar there—and nowhere else.</p><div><span>✓ Use: the URL from the open Printify design editor</span><span>× Do not use: an Etsy URL, public product URL, Printify product-list URL, or product ID alone</span></div></div></section></details>
      <label><span>Product name</span><input value={name} onChange={(e) => {nameTouched.current=true;setName(e.target.value)}} placeholder="Example: Comfort Colors 1717 shirts"/><small>{props.suggestedProductName&&!name.trim()?"Goldie will name this from the Printify product.":"Change this to anything you like."}</small></label><label className="wide"><span>Printify product link</span><div className="inline-field"><input value={props.templateUrl} onChange={(e) => props.onTemplateUrl(e.target.value)} placeholder="Paste the Printify product-editor link"/><button aria-busy={props.loadingTemplate} onClick={() => void props.onVerifyTemplate(props.templateUrl)} disabled={!props.connected || !props.templateUrl.trim() || props.loadingTemplate||Boolean(pendingAction)}>{props.loadingTemplate ? "Checking…" : props.templateVerified ? "✓ Product connected" : "Check product"}</button></div><small>Paste this once. Goldie imports the variations, placement, shipping, costs, and description.</small></label><button className="save-recipe" aria-busy={pendingAction==="save-product"} onClick={() => void save()} disabled={Boolean(pendingAction)||!name.trim() || !props.templateUrl.trim()}>{pendingAction==="save-product"?"Saving product…":editingId ? "Update product" : "Save product"}</button>{/* D212 · Cancel rendered only while editing an existing product, so "Add
         another product" opened a form with one button, "Save product", disabled
         until valid — and no way back. The saved-product grid stays visible so
         it was escapable by picking a product, but nothing on screen said so.
         Adding is the case where a seller is most likely to have clicked by
         mistake. */}
{editing&&<button type="button" className="secondary-action" onClick={()=>{setEditing(false);setEditingId("");setName("");setKeywordListId("");setMessage("")}}>Cancel</button>}</div>}
    {message && <p className="field-warning" role="status">{message}</p>}
    <details className="bundle-library" open={bundleForm}>{/* D232 · "Want one batch to cover several products?" is a pitch for a feature you
           have already used. Once a bundle exists it is a place to make another one, so
           it says that instead. */}
      <summary><span>{bundleForm?(editingBundleId?`Editing ${bundleName||"this bundle"}`:"New product bundle"):bundles.length?"Product bundles":"Want one batch to cover several products?"}</span><small>{bundleForm?"Choose which saved products belong to it, then save.":bundles.length?<>Create another bundle, or edit one you have <em>Optional</em></>:<>Create or edit a product bundle <em>Optional</em></>}</small></summary><div className="bundle-library-content"><div className="recipe-library-head"><div><b>Product bundles</b><small>Combine two to four saved products. Upload each design once, then Goldie carries it through every product.</small></div><button disabled={recipes.length<2||Boolean(pendingAction)} onClick={()=>openBundle()}>{recipes.length<2?"Save 2 products first":"＋ Create a product bundle"}</button></div>{bundleForm&&<div className="bundle-form"><div><b>{editingBundleId?"Edit product bundle":"New product bundle"}</b><span>Choose the products in the order you want to complete them.</span></div><label>Bundle name<input value={bundleName} onChange={event=>setBundleName(event.target.value)} placeholder="Example: Tee + sweatshirt + hoodie"/></label><fieldset><legend>Products</legend>{recipes.map(recipe=><label className={bundleIds.includes(recipe.id)?"selected":""} key={recipe.id}><input type="checkbox" checked={bundleIds.includes(recipe.id)} disabled={!recipeIsSetUp(recipe)||(!bundleIds.includes(recipe.id)&&bundleIds.length>=4)} title={recipeIsSetUp(recipe)?undefined:`Finish setting up ${recipe.name} before adding it to a bundle.`} onChange={()=>setBundleIds(current=>current.includes(recipe.id)?current.filter(id=>id!==recipe.id):[...current,recipe.id])}/><span><b>{recipe.name}</b>{!recipeIsSetUp(recipe)&&<em className="needs-setup-note">Finish this product’s setup first</em>}<small>{bundleIds.includes(recipe.id)?`Product ${bundleIds.indexOf(recipe.id)+1}`:"Add to bundle"}</small></span></label>)}</fieldset><div className="bundle-form-actions"><button className="secondary-action" disabled={bundleSaving} onClick={()=>setBundleForm(false)}>Cancel</button><button className="save-recipe" aria-busy={bundleSaving} disabled={bundleSaving||!bundleName.trim()||bundleIds.length<2} onClick={()=>void saveBundle()}>{bundleSaving?"Saving bundle…":editingBundleId?"Update product bundle":"Save product bundle"}</button></div></div>}</div></details>
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
