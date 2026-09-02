"use client";
import { confirmAction } from "./confirm-dialog";
import { scopeBank } from "./bank-scope";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type Pricing = { targetProfit: number; etsyFeePercent: number; fixedFee: number; listingFee: number; shippingCost: number; shippingCharged: number };
/* etsyDefaults: Etsy attribute values that are properties of the blank itself
   (materials, sleeve length, neckline, …) rather than of any one design.
   Stored on the saved product so they are remembered like defaultColorIds
   instead of being re-inferred from the artwork on every listing of every
   batch — which currently fills only 2–3 of 11 fields and is not stable
   across listings in the same batch. */
export type RecipeEtsyDefaults = Record<string, string | number | null>;
export type Recipe = { id: string; name: string; templateUrl: string; description: string; defaultTitle: string; defaultMockupTheme?:string; mockupIds?:string[]; setupComplete?:boolean; defaultProfitTarget?:number;wholeNumberPricing?:boolean;variantPrices?:Record<string,number>; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean;etsyShippingProfileId?:number;defaultColorIds?:number[];defaultSizeIds?:number[];etsyDefaults?:RecipeEtsyDefaults;printifyShopTitle?:string;printifyShopId?:number;
  requiresColorSelection?:boolean;requiresSizeSelection?:boolean;
  /* D835 · Whether this product's Printify store can publish to the Etsy shop
     the seller is working in. "away" means a proof says it publishes somewhere
     else, so the product is filed under its own store rather than offered. */
  reach?:"here"|"away"|"unproven" };
export type ProductBundle = { id:string;name:string;recipeIds:string[] };

/* D222 · A product cannot join a bundle until it has been set up. Creating a
 * product means going through its setup — colours and sizes are the seller's
 * choices and cannot be inherited from the Printify template — so a product
 * with neither has not been set up yet. Letting it into a bundle is how an
 * unconfigured product reached a batch and had to be answered for there, which
 * is the thing the recipe exists to prevent. */
export function recipeIsSetUp(recipe: Recipe) {
  const colorsReady=recipe.requiresColorSelection===false||Boolean((recipe.defaultColorIds||[]).length);
  const sizesReady=recipe.requiresSizeSelection===false||Boolean((recipe.defaultSizeIds||[]).length);
  return colorsReady&&sizesReady;
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
  /* D272 · Zero saved colours simply dropped the word, so Gildan Tee read
     "5 sizes · keyword bank" — indistinguishable from a product that has no
     colour choices at all, while the batch panel below it showed four colours
     selected. A recipe with sizes but no colours is half-configured, and the
     card is where that has to be visible. */
  if (colors) parts.push(`${colors} color${colors === 1 ? "" : "s"}`);
  else if (recipe.requiresColorSelection!==false&&sizes) parts.push("colors not set");
  if (sizes) parts.push(`${sizes} size${sizes === 1 ? "" : "s"}`);
  else if (recipe.requiresSizeSelection!==false&&colors) parts.push("sizes not set");
  /* Deliberately NOT the saved mockup theme. Whether a set fits depends on its
   * surfaceKind against the product's blueprint title, and this screen never
   * loads either — it would take one Printify fetch per card. Two of the three
   * saved products here carry "BACH TEES", a tee set, against a hoodie and a
   * crewneck, so the card would have asserted a set the wizard immediately
   * calls incompatible. Report only what this screen can actually verify. */
  /* D705 - every saved product carries a keyword bank, so "keyword bank" on
     every card distinguished nothing; it was ink spent to say "normal". Her
     words: "everything saves. So why would we need to notate that there's a
     keyword bank on it?" The summary line is for what differs between two
     products - colours, sizes, store - not for what they all have. */
  /* D649 - a seller with more than one Printify store could not tell which store
     a saved product belonged to, so a product that cannot publish to the
     connected Etsy shop looked identical to one that can, and the only way to
     find out was to choose it and be refused. Shown only when Goldie recorded
     it; an older product saved before this says nothing rather than guessing. */
  return parts.length ? parts.join(" \u00b7 ") : "No details saved yet";
}

/* D654 - D649 appended the store to the summary above, which CSS clamps to one
   line. On a real card that rendered "6 colors - 8 sizes - keyword bank - GO..."
   - the store cut to two letters, on the one label whose whole job is naming the
   store. It gets its own line. */
export function recipeShopLabel(recipe: Recipe): string {
  return recipe.printifyShopTitle || "";
}

export function recipePlacementCue(recipe: Recipe): string {
  const name=recipe.name.toLowerCase();
  if(/\b(back|rear)\s*(print|placement)?\b/.test(name))return "Back print";
  if(/\b(front|chest|pocket)\s*(print|placement)?\b/.test(name))return "Front print";
  return "Placement saved in Printify";
}

export function bundleDuplicatePairs(recipes: Recipe[]): string[] {
  const pairs:string[]=[];
  for(let left=0;left<recipes.length;left++)for(let right=left+1;right<recipes.length;right++){
    const a=recipes[left],b=recipes[right];
    const sameTemplate=Boolean(a.templateUrl.trim())&&a.templateUrl.trim().toLowerCase()===b.templateUrl.trim().toLowerCase();
    const sameSavedSetup=a.name.trim().toLowerCase()===b.name.trim().toLowerCase()
      && JSON.stringify([...(a.defaultColorIds||[])].sort((x,y)=>x-y))===JSON.stringify([...(b.defaultColorIds||[])].sort((x,y)=>x-y))
      && JSON.stringify([...(a.defaultSizeIds||[])].sort((x,y)=>x-y))===JSON.stringify([...(b.defaultSizeIds||[])].sort((x,y)=>x-y))
      && (a.printifyShopId||0)===(b.printifyShopId||0);
    if(sameTemplate||sameSavedSetup)pairs.push(`${a.name} and ${b.name}`);
  }
  return pairs;
}

export type KeywordList = { id: string; name: string; keywords: string[] };

type WorkflowProps = {
  /* D523 - with a bundle already chosen, step 1 led with the saved-products
     picker and pushed her three product cards to 1099px, below the fold. The
     choice has been made; the picker is how you change it, not the first thing
     to read. */
  bundleChosen?:boolean;
  connected: boolean; templateUrl: string; templateVerified: boolean; loadingTemplate: boolean;
  selectedProductId:string;
  selectedSummary?:ReactNode;
  showLibrary?:boolean;
  onShowLibraryChange?:(show:boolean)=>void;
  addProductRequest?:number;
  createBundleRequest?:number;
  onBundleAvailabilityChange?:(available:boolean)=>void;
  onBundleModeChange?:(active:boolean)=>void;
  onProductModeChange?:(active:boolean)=>void;
  suggestedProductName?:string;
  verifiedShippingProfileId:number;
  /* D205 · Incremented by the workflow whenever establishing a facet writes to a
     recipe, so the saved-product tiles refetch instead of showing what the list
     looked like on mount. */
  savedRevision?: number;
  onTemplateUrl: (value: string) => void; onUseRecipe: (recipe: Recipe) => Promise<boolean>;onUseBundle:(bundle:ProductBundle,recipeIds:string[])=>Promise<boolean>; onStartNewProduct: () => boolean | Promise<boolean>; onChangeProduct: () => boolean | Promise<boolean>; onVerifyTemplate: (url: string) => Promise<{shippingTemplateId:string;shippingProfileNeedsSelection?:boolean}|null>;
};

export function SavedWorkflow(props: WorkflowProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]), [activeShop, setActiveShop] = useState<{shopId:number;shopName:string}|null>(null), [name, setName] = useState(""), [message, setMessage] = useState(""), [editing, setEditing] = useState(false), [editingId, setEditingId] = useState(""), [activeId, setActiveId] = useState("");
  const [recipesLoaded,setRecipesLoaded]=useState(false);
  const showLibrary=Boolean(props.showLibrary);
  const setShowLibrary=(show:boolean)=>props.onShowLibraryChange?.(show);
  /* D654 - "Add a new product" rendered the form below the saved-product grid
     and left the page where it was. Measured live: the form opened at 799px in
     an 812px viewport, so nothing visibly happened. Clicking it also clears the
     selected product, so the part of the page the seller CAN see changes in a
     way that reads as a bug. Take them to the field they now have to fill in. */
  /* D659 · Applied the moment the server records it, so the card stops waiting
     for a reload to admit which store a product came from. */
  useEffect(()=>{
    /* D843 · Applied the moment the product is opened, so a tile stops showing a
       placeholder without waiting for a reload. */
    function onPhoto(event:Event){
      const detail=(event as CustomEvent<{recipeId?:string;previewImage?:string}>).detail;
      if(!detail?.recipeId||!detail.previewImage)return;
      setRecipes(current=>current.map(recipe=>recipe.id===detail.recipeId?{...recipe,previewImage:detail.previewImage}:recipe));
    }
    window.addEventListener("goldie-recipe-photo",onPhoto);
    function onShop(event:Event){
      const detail=(event as CustomEvent<{recipeId?:string;title?:string;shopId?:number}>).detail;
      if(!detail?.recipeId||!detail.title)return;
      setRecipes(current=>current.map(recipe=>recipe.id===detail.recipeId?{...recipe,printifyShopTitle:detail.title,printifyShopId:detail.shopId}:recipe));
    }
    window.addEventListener("goldie-recipe-shop",onShop);
    return ()=>{window.removeEventListener("goldie-recipe-shop",onShop);window.removeEventListener("goldie-recipe-photo",onPhoto)};
  },[]);
  const formRef=useRef<HTMLDivElement|null>(null);
  function revealForm(){
    requestAnimationFrame(()=>{
      const node=formRef.current;
      if(!node)return;
      node.scrollIntoView({block:"center"});
      node.querySelector<HTMLInputElement>("input")?.focus({preventScroll:true});
    });
  }
  const addProductSeen=useRef(props.addProductRequest||0);
  useEffect(()=>{
    const request=props.addProductRequest||0;
    if(request<=addProductSeen.current)return;
    addProductSeen.current=request;
    void beginAddProduct();
  },[props.addProductRequest]);
  const createBundleSeen=useRef(props.createBundleRequest||0);
  useEffect(()=>{
    const request=props.createBundleRequest||0;
    if(request<=createBundleSeen.current)return;
    createBundleSeen.current=request;
    openBundle();
  },[props.createBundleRequest]);
  async function beginAddProduct(){
    if(!await props.onStartNewProduct())return;
    setBundleForm(false);setEditing(true);setEditingId("");setActiveId("");setName("");setKeywordListId("");setMessage("");revealForm();
  }
  const [bundles,setBundles]=useState<ProductBundle[]>([]),[bundleForm,setBundleForm]=useState(false),[bundleName,setBundleName]=useState(""),[bundleIds,setBundleIds]=useState<string[]>([]),[editingBundleId,setEditingBundleId]=useState("");
  useEffect(()=>props.onBundleModeChange?.(bundleForm),[bundleForm,props.onBundleModeChange]);
  useEffect(()=>props.onProductModeChange?.(editing),[editing,props.onProductModeChange]);
  const [bundleSaving,setBundleSaving]=useState(false);
  const [duplicateAcknowledged,setDuplicateAcknowledged]=useState(false);
  useEffect(()=>setDuplicateAcknowledged(false),[bundleIds.join(",")]);
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
  /* D835 · The bank is scoped to the Etsy shop she is working in. A product
     whose Printify store is proven to publish somewhere else can only end in a
     409, so it is filed under its own store rather than offered here. Nothing
     is hidden on a guess: a store with no verdict yet still shows. */
  /* D860 · One answer for every surface. This was five separate derivations
     living next to each other, and the bundle CREATOR quietly kept using the
     unscoped list - see app/bank-scope.ts for what that cost. */
  const { reachable, usableBundles, hiddenCount, blockedMembers } = scopeBank(recipes, bundles);
  useEffect(()=>props.onBundleAvailabilityChange?.(reachable.length>=2),[reachable.length,props.onBundleAvailabilityChange]);
  const bundleBlockers = (bundle: ProductBundle) => {
    const away = blockedMembers(bundle);
    return { away, stores: [...new Set(away.map(recipe => recipe.printifyShopTitle || "another store"))] };
  };

  const reload = () => Promise.all([fetch("/api/product-recipes").then((r) => r.json()),fetch("/api/product-bundles").then(r=>r.json())]).then(([products,groups])=>{setRecipes(products.recipes||[]);setActiveShop(products.activeEtsyShop||null);setBundles(groups.bundles||[]);backfillPhotos(products.recipes||[])}).catch(() => undefined).finally(()=>setRecipesLoaded(true));
  /* D848 · Fill in the flatlays the bank never had. D842 remembers a photo when
     a product is OPENED, which leaves every product saved before it showing the
     placeholder garment forever - all five of hers. Ask the server once, only
     when a tile is actually missing its photo, and paint the answers in.
     photoBackfill guards it so a re-render or a second reload cannot repeat a
     round trip that has already been made. */
  const photoBackfill=useRef(false);
  function backfillPhotos(loaded:Recipe[]){
    if(photoBackfill.current)return;
    photoBackfill.current=true;
    void fetch("/api/product-recipes/photos",{method:"POST"}).then(r=>r.ok?r.json():null).then((payload:{photos?:Record<string,string>}|null)=>{
      const photos=payload?.photos||{};
      if(!Object.keys(photos).length)return;
      setRecipes(current=>current.map(recipe=>photos[recipe.id]?{...recipe,previewImage:photos[recipe.id]}:recipe));
    }).catch(()=>undefined);
  }

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
  useEffect(()=>{setActiveId(props.selectedProductId);setShowLibrary(false)},[props.selectedProductId]);
  async function save() {
    if(actionLock.current)return;
    actionLock.current=true;setPendingAction("save-product");
    setMessage("");
    try{
      const existing=recipes.find(recipe=>recipe.id===editingId);
      /* D296 · The Printify template's shipping profile is the DEFAULT for a
         product that has never had one chosen — it is whatever this product
         already ships with on Etsy, so it is not a decision worth asking for
         twice. Once the seller picks a different profile and saves it, that
         choice IS the product's default and nothing may quietly replace it.
         This line used to overwrite the saved choice with the template value
         every time the template was re-verified, which happens whenever a saved
         product is edited. */
      /* D464 - `existing` is this component's own copy of the recipe, taken when
         its list was last loaded. A shipping profile chosen anywhere else since
         then is not in it, so savedChoice reads 0 and the Printify template's id
         gets written over the seller's actual Etsy choice. Measured on her mug:
         a valid Etsy profile, 86599059553 "Mug 11oz", was replaced by 313830627087,
         which is a Printify shipping template and matches none of her 93 Etsy
         profiles - so the Shipping row went red and stayed red.

         The recipe is re-read here so the guard below sees the current choice
         rather than a remembered one. */
      const current=editingId?await fetch("/api/product-recipes").then(r=>r.ok?r.json():{recipes:[]}).then((payload:{recipes?:Recipe[]})=>(payload.recipes||[]).find(item=>item.id===editingId)).catch(()=>undefined):undefined;
      const savedChoice=Number(current?.etsyShippingProfileId||existing?.etsyShippingProfileId)||0;
      let shippingProfileId=savedChoice||props.verifiedShippingProfileId||0;
      if (!props.templateVerified) {
        const verified=await props.onVerifyTemplate(props.templateUrl);
        if(!verified){setMessage("Connect the Printify product before saving it.");return}
        if(!savedChoice)shippingProfileId=Number(verified.shippingTemplateId)||shippingProfileId;
      }
      const setupComplete=editingId?existing?.setupComplete!==false:false;
      const response = await fetch("/api/product-recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId || undefined, name, templateUrl: props.templateUrl, description:existing?.description, keywordListId, normalizePadding:true,etsyShippingProfileId:shippingProfileId,printifyImageIndices:existing?.printifyImageIndices,etsyDefaults:existing?.etsyDefaults,defaultMockupTheme:existing?.defaultMockupTheme,mockupIds:existing?.mockupIds,setupComplete,defaultProfitTarget:existing?.defaultProfitTarget }) });
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
  async function remove(recipe: Recipe) { if (!await confirmAction({title:`Delete “${recipe.name}”?`,body:"This removes only the saved product in Goldie. The connected Printify product is not touched.",confirmLabel:"Delete product",destructive:true})) return; await fetch("/api/product-recipes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: recipe.id }) }); if (activeId === recipe.id) setActiveId(""); reload(); }
  function openBundle(bundle?:ProductBundle){setBundleForm(true);setEditingBundleId(bundle?.id||"");setBundleName(bundle?.name||"");setBundleIds(bundle?.recipeIds||[]);setDuplicateAcknowledged(false);setBundleSaving(false);bundleSaveLock.current=false;setMessage("");window.setTimeout(()=>{document.querySelector(".bundle-builder")?.scrollIntoView({block:"center"})},0)}
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
  async function removeBundle(bundle:ProductBundle){if(!await confirmAction({title:`Delete “${bundle.name}”?`,body:"Only the bundle is removed. The saved products inside it are kept.",confirmLabel:"Delete bundle",destructive:true}))return;await fetch("/api/product-bundles",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:bundle.id})});await reload()}
  async function chooseBundle(bundle:ProductBundle){
    if(actionLock.current)return;
    actionLock.current=true;setPendingAction(`bundle:${bundle.id}`);setActiveId(`bundle:${bundle.id}`);setMessage("");
    try{
      if(await props.onUseBundle(bundle,bundle.recipeIds)){setEditing(false);setBundleForm(false);setShowLibrary(false);return}
      setActiveId("");setMessage("Goldie could not load every saved product in this bundle. Edit the bundle or refresh the page, then try again.");
    }catch(error){
      console.error("Bundle selection failed",error);
      setActiveId("");setMessage("Goldie could not load this bundle. Try again in a moment.");
    }finally{actionLock.current=false;setPendingAction("")}
  }
  const selectedBundleRecipes=bundleIds.map(id=>reachable.find(recipe=>recipe.id===id)).filter(Boolean) as Recipe[];
  const duplicatePairs=bundleDuplicatePairs(selectedBundleRecipes);
  return <article className="step-card recipe-card"><div className="step-number" aria-hidden="true"/><div className="step-content">{/* The page head and panel header already state the decision. Repeating
          "Select a product" here made the chooser begin with three versions of
          the same instruction before the first product appeared. */}
    {!recipesLoaded&&<div className="recipe-library-loading" role="status"><span className="goldie-spinner" aria-hidden="true"/>Loading saved products…</div>}
    {recipesLoaded&&reachable.length > 0 && (!activeId||showLibrary) && <>{bundleForm&&<div className="bundle-builder"><label><span>{editingBundleId?"Bundle name":"Name your bundle"}</span><input value={bundleName} onChange={event=>setBundleName(event.target.value)} placeholder="Example: Tee + sweatshirt + hoodie" autoFocus/></label><div className="bundle-builder-instruction"><b>Choose 2 to 4 products</b><span>{bundleIds.length===0?"Click the product cards below":`${bundleIds.length} selected`}</span></div></div>}<div className="recipe-library-head"><span>{bundleForm?"Products":"Saved products"}</span></div><div className={`recipe-grid ${bundleForm?"bundle-selection-grid":""}`}>{reachable.map((recipe) => {const selecting=pendingAction===`recipe:${recipe.id}`,inBundle=bundleIds.includes(recipe.id),bundleDisabled=bundleForm&&(!recipeIsSetUp(recipe)||(!inBundle&&bundleIds.length>=4)),bundleReason=bundleForm&&!recipeIsSetUp(recipe)?`Finish setting up ${recipe.name} before adding it to a bundle.`:bundleForm&&!inBundle&&bundleIds.length>=4?"A bundle holds up to 4 products. Remove one to add another.":"";return <article className={`recipe-tile ${bundleForm&&inBundle?"selected bundle-selected":activeId === recipe.id ? "selected" : ""} ${selecting?"selecting":""}`} aria-busy={selecting} key={recipe.id}><button className="recipe-use" title={bundleReason||(bundleForm?(inBundle?`Remove ${recipe.name} from bundle`:`Add ${recipe.name} to bundle`):`Choose ${recipe.name}`)} aria-label={bundleForm?(inBundle?`Remove ${recipe.name} from bundle`:`Add ${recipe.name} to bundle`):`Choose ${recipe.name}`} aria-pressed={bundleForm?inBundle:undefined} disabled={Boolean(pendingAction)||bundleDisabled} onClick={async () => {if(bundleForm){setBundleIds(current=>current.includes(recipe.id)?current.filter(id=>id!==recipe.id):[...current,recipe.id]);return}if(actionLock.current)return;actionLock.current=true;setPendingAction(`recipe:${recipe.id}`);setActiveId(recipe.id);setMessage("");try{if(!await props.onUseRecipe(recipe)){setActiveId("");return}setKeywordListId(recipe.keywordListId||"");setEditing(false);setShowLibrary(false)}finally{actionLock.current=false;setPendingAction("")}}}>{/* D729 · The band the prototype puts above a product's name. D197 removed
                what used to sit in it - a "P" for Printify, identical on every card and
                meaningless on all of them. The band stays because it is what makes the
                tile a product card; a bundle tile still fills it with its member count. */}<span className="recipe-icon" aria-hidden="true">{recipe.previewImage?<img src={recipe.previewImage} alt="" decoding="async"/>:<span className="goldie-spinner"/>}</span><span className="recipe-copy"><b>{recipe.name}</b><small>{selecting?"Loading product details…":recipeSummary(recipe)}</small>{!selecting&&recipeShopLabel(recipe)?<small className="recipe-shop" title={`Printify store: ${recipeShopLabel(recipe)}`}>Shop: {recipeShopLabel(recipe)}</small>:null}{bundleForm&&<small className="bundle-placement-cue">{recipePlacementCue(recipe)}</small>}{bundleForm&&inBundle?<em>✓ Product {bundleIds.indexOf(recipe.id)+1}</em>:bundleForm&&!recipeIsSetUp(recipe)?<em>Finish setup first</em>:selecting?<em>Loading {recipe.name}…</em>:null}</span></button>{!bundleForm&&<><button className="edit-recipe" title="Rename this product or reconnect its Printify template" disabled={Boolean(pendingAction)} onClick={async () => {if(actionLock.current)return;actionLock.current=true;setPendingAction(`edit:${recipe.id}`);setActiveId(recipe.id);try{if(!await props.onUseRecipe(recipe)){setActiveId("");return}setEditingId(recipe.id); setName(recipe.name);setKeywordListId(recipe.keywordListId||"");setEditing(true)}finally{actionLock.current=false;setPendingAction("")}}}>Edit</button><button className="delete-recipe" disabled={Boolean(pendingAction)} aria-label={`Delete ${recipe.name}`} title="Delete saved product" onClick={() => void remove(recipe)}>Delete</button></>}</article>})}</div>{bundleForm&&duplicatePairs.length>0&&<label className="bundle-duplicate-warning"><input type="checkbox" checked={duplicateAcknowledged} onChange={event=>setDuplicateAcknowledged(event.target.checked)}/><span><b>These products appear to use the same garment and print setup.</b><small>{duplicatePairs.join("; ")}. Keep both only if that is intentional.</small></span></label>}{bundleForm&&<div className="bundle-builder-actions"><button className="secondary-action" disabled={bundleSaving} onClick={()=>setBundleForm(false)}>Cancel</button><button className="save-recipe" aria-busy={bundleSaving} disabled={bundleSaving||!bundleName.trim()||bundleIds.length<2||(duplicatePairs.length>0&&!duplicateAcknowledged)} onClick={()=>void saveBundle()}>{bundleSaving?"Saving bundle…":editingBundleId?"Update bundle":`Save bundle${bundleIds.length>=2?` · ${bundleIds.length} products`:""}`}</button></div>}</>}
    {/* D323 · The edit form used to render after the saved-bundles section, so
        clicking Edit on a product opened the form below the bundles and the
        disclosure — far from the tile that was clicked, often off screen. It
        belongs directly under the products it edits. */}
    {(editing || (recipesLoaded&&!recipes.length)) && <div className="recipe-form" ref={formRef}><div className="recipe-form-heading"><b>{editingId ? "Edit saved product" : "New saved product"}</b><span>Paste the link to the completed product in Printify. Goldie names it for you.</span></div>
      <details className="template-instructions-toggle"><summary>How to prepare the Printify product</summary><section className="template-requirements" aria-labelledby="template-requirements-title"><div className="template-requirements-heading"><span>Required before you paste the link</span><div><b id="template-requirements-title">Publish the product to Etsy first</b><small>Use an already-published product or create one specifically for Listing Factory. Either works.</small></div></div><ol><li><span>1</span><div><b>Choose the product and print provider</b><small>Select the exact physical product and manufacturer Goldie should copy.</small></div></li><li><span>2</span><div><b>Add temporary artwork and set its placement</b><small>Resize and position it exactly where every finished design should print. The temporary artwork itself does not matter.</small></div></li><li><span>3</span><div><b>Publish the product from Printify to Etsy</b><small>This is required. Publish it to the same Etsy shop connected to Goldie before copying the link.</small></div></li></ol><div className="template-link-instructions"><b>Copy the URL only from the Printify design editor</b><p>In Printify, open <strong>My Products</strong>, select the published product, and enter its design editor so the artwork placement controls are visible. Copy the complete URL from the browser address bar there—and nowhere else.</p><div><span>✓ Use: the URL from the open Printify design editor</span><span>× Do not use: an Etsy URL, public product URL, Printify product-list URL, or product ID alone</span></div></div></section></details>
      {/* D335 · The link came second, under a name field the seller had to invent
          before Goldie knew what the product was. The link is the source of truth:
          paste it, Goldie verifies it and names the product from the Printify
          brand and model. The name stays editable and a manual edit sticks — the
          nameTouched guard already handled that. */}
        <label className="wide"><span>Printify product link</span><div className="inline-field"><input value={props.templateUrl} onChange={(e) => props.onTemplateUrl(e.target.value)} placeholder="Paste the Printify product-editor link"/><button aria-busy={props.loadingTemplate} onClick={() => void props.onVerifyTemplate(props.templateUrl)} disabled={!props.connected || !props.templateUrl.trim() || props.loadingTemplate||Boolean(pendingAction)}>{props.loadingTemplate ? "Checking…" : props.templateVerified ? "✓ Product connected" : "Check product"}</button></div><small>Paste this once. Goldie imports the variations, placement, shipping, costs, and description.</small></label><label><span>Product name</span><input value={name} onChange={(e) => {nameTouched.current=true;setName(e.target.value)}} placeholder="Example: Comfort Colors 1717 shirts"/>{/* D346 · The name field explained itself under every save. Once the link is
                above it and the field is filled in, the behaviour is visible — the
                name appeared, and it is a text input, so it can be changed. Saying
                so is the same over-explaining as D303 and D314. */}</label><button className="save-recipe" aria-busy={pendingAction==="save-product"} onClick={() => void save()} disabled={Boolean(pendingAction)||!name.trim() || !props.templateUrl.trim()}>{pendingAction==="save-product"?"Saving product…":editingId ? "Update product" : "Save product"}</button>{/* D212 · Cancel rendered only while editing an existing product, so "Add
         another product" opened a form with one button, "Save product", disabled
         until valid — and no way back. The saved-product grid stays visible so
         it was escapable by picking a product, but nothing on screen said so.
         Adding is the case where a seller is most likely to have clicked by
         mistake. */}
{editing&&<button type="button" className="secondary-action" onClick={()=>{setEditing(false);setEditingId("");setName("");setKeywordListId("");setMessage("")}}>Cancel</button>}</div>}
    {activeId&&!bundleForm&&<div className="selected-summary-block">{props.selectedSummary??(props.loadingTemplate?<div className="selected-product-loading" role="status"><span className="goldie-spinner" aria-hidden="true"/>Loading product details…</div>:null)}</div>}
    {/* Once a bundle is the current selection its members are already listed above,
        so re-showing the bundle grid underneath just offered the same bundle again. */}
    {!editing&&usableBundles.length>0&&(!activeId||showLibrary)&&<><div className="recipe-library-head bundle-card-heading"><span>Saved bundles</span>{/* D304 · "Bundles are selected exactly like individual products" removed — it described the mechanism, not anything the seller needs to decide. */}</div><div className="recipe-grid unified-bundle-grid">{usableBundles.map(bundle=>{const included=bundle.recipeIds.map(id=>recipes.find(recipe=>recipe.id===id)).filter(Boolean) as Recipe[],selecting=pendingAction===`bundle:${bundle.id}`,selected=activeId===`bundle:${bundle.id}`,blocked=bundleBlockers(bundle);return <article className={`recipe-tile bundle-as-product ${selected?"selected":""} ${blocked.away.length?"other-shop":""}`} aria-busy={selecting} key={bundle.id}><button className="recipe-use" title={`Choose ${bundle.name}`} aria-label={`Choose ${bundle.name}`} disabled={included.length<2||blocked.away.length>0||Boolean(pendingAction)} onClick={()=>void chooseBundle(bundle)}><span className="recipe-icon">{included.length}</span><span className="recipe-copy"><b>{bundle.name}</b><small>{selecting?<span className="bundle-loading"><span className="goldie-spinner" aria-hidden="true"/>Preparing {included.length} products</span>:included.map(recipe=>recipe.name).join(" · ")||"Saved products missing"}</small>{selecting?<em>Preparing bundle…</em>:blocked.away.length?<em>Different Etsy shop</em>:null}
      {blocked.away.length>0&&<small className="bundle-other-shop">{blocked.away.length===1?`${blocked.away[0].name} is`:`${blocked.away.length} of these are`} saved under {blocked.stores.join(" and ")}, which publishes to a different Etsy shop{activeShop?` than ${activeShop.shopName}`:""}.</small>}</span></button><button className="edit-recipe" disabled={Boolean(pendingAction)} onClick={()=>openBundle(bundle)}>Edit</button><button className="delete-recipe" disabled={Boolean(pendingAction)} aria-label={`Delete ${bundle.name}`} title="Delete bundle" onClick={()=>void removeBundle(bundle)}>Delete</button></article>})}</div></>}
    {recipesLoaded&&!recipes.length && <div className="first-recipe-callout"><span>＋</span><div><b>Create your first saved product</b><p>Name it and connect the completed product from Printify. That is all this step needs.</p></div></div>}

    {message && <p className="field-warning" role="status">{message}</p>}
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
  return <section className={`keyword-bank keyword-workspace ${compact?"compact-keywords":""}`}><div className="keyword-workspace-heading"><div><b>{title}</b><span>{copy}</span></div>{!compact&&<a href="/keywords" target="_blank" rel="noopener noreferrer">Upload or manage keyword banks ↗</a>}</div><div className="keyword-list-picker"><select value={active} onChange={(e) => {const id=e.target.value;setActive(id);onSelect?.(lists.find(list=>list.id===id)||null)}}><option value="">Choose a keyword bank</option>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></div>{chosen ? selectionOnly?(()=>{
      /* D554 - D551 fixed this claim on the Keyword Banks page and missed it here,
         where she reads it before pressing Auto-create all titles. "50 validated
         phrases" is true of the bank and untrue of the tags: Etsy caps a tag at 20
         characters and 30 of her 50 are longer, so the tag pool is 20 before the
         product filter has even run. Both numbers, plainly. */
      const tagUsable=chosen.keywords.filter(word=>word.length<=20).length;
      return <p>✓ {chosen.keywords.length} validated {chosen.keywords.length===1?"phrase":"phrases"} available to Goldie{tagUsable<chosen.keywords.length?` · ${tagUsable} short enough for Etsy tags`:""}.</p>;
    })():<><p>Click any phrase to add it.</p><div className="keyword-chips">{chosen.keywords.map((word) => <button type="button" key={word} onClick={() => onAdd(word)}>+ {word}</button>)}</div></> : <p>Choose a bank to continue.</p>}</section>;
}
