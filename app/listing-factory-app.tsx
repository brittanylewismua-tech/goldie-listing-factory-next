"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";
import { productReadiness, type Readiness } from "./product-readiness";
import { KeywordBank, SavedWorkflow, type KeywordList, type Pricing, type ProductBundle, type Recipe } from "./factory-tools";
import IntegratedMockups from "./integrated-mockups";
import ListingPhotoOrder from "./listing-photo-order";
import { tagsFromTitle } from "./seo-utils";
import { printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchFiles, saveBatchFiles } from "./batch-cache";
import { estimatedProfit, recommendedPrice } from "./pricing";
import { ActionReceipt, GoldieInsight, OutcomeReceipt, WorkflowMomentum, type BatchReceipt } from "./goldie-ui";
import { navigationIssues, type NavigationGateState } from "./workflow-gates";
import { GoldieCommandBar } from "./returning-command-center";
import FinalListingReview from "./final-listing-review";
import ContextHelp from "./context-help";
import GoldieWordmark from "./goldie-wordmark";
import { productFamily } from "./product-type-utils";
import { photoStats, PHOTO_SAMPLE_SIZE } from "./product-photo";
import { NavIcon } from "./nav-icons";

/* D202 · "25 selected variants" is Printify's word, not a seller's. A seller
 * picked five colours and five sizes; "variants" is the internal name for the
 * product of those two choices, and the number on its own does not say which
 * choices produced it. Say the choices instead — they multiply to the same
 * figure and need no glossary. Falls back to the count when an axis is missing,
 * which is the one-size and no-colour products. */
function variantSummary(axes:{colorsChosen:boolean;sizesChosen:boolean;colors:number;sizes:number;availableColors:number;availableSizes:number;total:number}){
  const {colorsChosen,sizesChosen,colors,sizes,availableColors,availableSizes,total}=axes;
  const plural=(n:number,word:string)=>`${n} ${word}${n===1?"":"s"}`;
  const hasColors=colorsChosen?colors>0:availableColors>0;
  const hasSizes=sizesChosen?sizes>0:availableSizes>0;
  if(!hasColors&&!hasSizes)return plural(total,"option");
  if(colorsChosen&&sizesChosen&&hasColors&&hasSizes)return `${plural(colors,"color")} × ${plural(sizes,"size")}`;
  const parts:string[]=[];
  if(hasColors)parts.push(colorsChosen?plural(colors,"color"):`${plural(availableColors,"color")} available`);
  if(hasSizes)parts.push(sizesChosen?plural(sizes,"size"):`${plural(availableSizes,"size")} available`);
  return parts.join(" · ");
}



type VisibleBounds={left:number;top:number;right:number;bottom:number};

function BatchPreferencesPortal({children}:{children:ReactNode}){
  const [target,setTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>setTarget(document.getElementById("batch-preferences-after-designs")));
  return target?createPortal(children,target):null;
}
type EtsyCategoryOption={id:number;path:string};
type EtsyPropertySelection={propertyId:number;label:string;required:boolean;multiple:boolean;maxValues:number;possibleValues:Array<{value_id:number;name:string}>;valueId:number|null;value:string};
type PersonalizationQuestion={id:string;type:"text_input"|"dropdown"|"unlabeled_upload";question:string;instructions:string;required:boolean;maxCharacters:number;maxFiles:number;options:string[]};
type EtsyPersonalization={enabled:boolean;questions:PersonalizationQuestion[]};
type EtsyDetails={category:string;taxonomyId?:number;properties?:EtsyPropertySelection[];attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review";personalization?:EtsyPersonalization};
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; title: string; tags: string[]; titleWarning?:string;titleError?:string;contentHash?:string; blurb?:string; descriptionOverride?:string; sizeGuideName?:string; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";etsy?:EtsyDetails;etsyError?:string };
type ProductVariant={id:number;title:string;cost:number;templatePrice:number;shipping?:number|null;options?:number[];colorId?:number|null;sizeId?:number|null;templateEnabled?:boolean};
type ProductColor={id:number;title:string;swatch:string;available:boolean;templateEnabled:boolean};
type ProductSize={id:number;title:string;available:boolean;templateEnabled:boolean};
type InternationalShippingRate={key:string;label:string;primary:number;additional:number};
type EditableInternationalShippingRate={key:string;label:string;primary:string;additional:string};
type EtsyShippingProfile={id:number;title:string;originCountry:string;currency:string;domesticPrimary:number;domesticAdditional:number;international:InternationalShippingRate[]};
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number;previewImage?:string;previewImages?:string[];colorOptions?:ProductColor[];sizeOptions?:ProductSize[]; variants:ProductVariant[]; shop: string; standardShipping?:number|null;shippingCurrency?:string;shippingTemplateId:string;shippingProfileNeedsSelection?:boolean;freeShipping:boolean;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed" | "NeedsRetry"; error?: string; productName?:string; placement?:{x:number;y:number;scale:number};placementScale?:number };
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
type FinishPhase = "details" | "etsy" | "mockups" | "final";
type PendingCategoryChange={designId:string;details:EtsyDetails;clearedCount:number};

function restoredWorkflowStep(saved:WorkflowStep,requested:string|null,complete:boolean):WorkflowStep{
  const order:WorkflowStep[]=["connect","setup","designs","review","finish"];
  if(!requested||!order.includes(requested as WorkflowStep))return saved;
  const target=requested as WorkflowStep;
  return complete||order.indexOf(target)<=order.indexOf(saved)?target:saved;
}

/* D147 · The same problem D108 solved for steps, but for Finish phases.
 * Restoration replaced the requested phase with the batch's saved one, so
 * reloading or bookmarking any Finish phase bounced the seller elsewhere —
 * asking for phase=etsy landed on phase=details. Phases are views over drafts
 * that already exist, so on a completed batch any phase is legitimate; on an
 * unfinished one, honour the request up to the phase actually reached. */
function restoredFinishPhase(saved:FinishPhase,requested:string|null,complete:boolean):FinishPhase{
  const order:FinishPhase[]=["details","etsy","mockups","final"];
  if(!requested||!order.includes(requested as FinishPhase))return saved;
  const target=requested as FinishPhase;
  return complete||order.indexOf(target)<=order.indexOf(saved)?target:saved;
}

function preserveCompatibleEtsyProperties(current:EtsyPropertySelection[],next:EtsyPropertySelection[]){
  const currentById=new Map(current.map(property=>[property.propertyId,property]));
  const preservedIds=new Set<number>();
  const properties=next.map(property=>{
    const previous=currentById.get(property.propertyId);
    if(!previous?.value.trim())return property;
    if(!property.possibleValues.length){preservedIds.add(property.propertyId);return {...property,value:previous.value,valueId:previous.valueId}}
    const compatible=property.possibleValues.find(option=>option.value_id===previous.valueId||option.name.toLowerCase()===previous.value.trim().toLowerCase());
    if(!compatible)return property;
    preservedIds.add(property.propertyId);
    return {...property,value:compatible.name,valueId:compatible.value_id};
  });
  const clearedCount=current.filter(property=>property.value.trim()&&!preservedIds.has(property.propertyId)).length;
  return {properties,clearedCount};
}

function productPhotoGuide(blueprintTitle:string,availableCount:number){
  const count=Math.max(1,Math.min(5,availableCount||1)),family=productFamily(blueprintTitle);
  if(["tee","hoodie","crewneck","tank","longSleeve"].includes(family))return {count,items:["A clear front product view","Available angles or color views that show the real garment","Lifestyle scenes that match this exact garment type","A size guide when buyers need sizing help"]};
  if(family==="poster")return {count,items:["A clear straight-on artwork view","Available framed or unframed Printify views","Room scenes that show realistic scale","A size reference when sizes vary"]};
  if(family==="mug"||family==="tumbler")return {count,items:["A clear view of the full design","Available opposite-side and handle or lid angles","An in-use scene that matches this exact drinkware","A size or capacity reference when useful"]};
  if(family==="tote")return {count,items:["A clear front view of the full design","Available side or detail views","An in-use scene that shows the bag’s scale","A size reference when useful"]};
  if(family==="sticker")return {count,items:["A clear close-up of the full design","Available Printify product views","An application scene that shows realistic scale"]};
  return {count,items:["The clearest available Printify product view","Available alternate angles that add new information","A product-appropriate lifestyle scene","A size or scale reference when useful"]};
}

/* Etsy returns shipping-profile titles HTML-escaped. Rendering them straight
 * into an <option> shows the raw entity: sellers saw "Kid&#39;s Hero Tee"
 * instead of "Kid's Hero Tee". Decode once, here, so every place that prints a
 * profile name gets the real characters. */
function decodeProfileTitle(title:string){
  return title.replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCharCode(parseInt(code,16)))
    .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
}
function friendlyShippingProfileTitle(raw?:string){const title=raw?decodeProfileTitle(raw):raw;if(!title)return"Shipping profile needed";if(/^standard:/i.test(title))return"Standard shipping";return title.length>42?`${title.slice(0,39).trim()}…`:title}

const APPAREL_PRODUCT_FAMILIES=new Set(["tee","hoodie","crewneck","tank","longSleeve"]);
function shippingProfileGroup(profileTitle:string,blueprintTitle:string){
  const product=productFamily(blueprintTitle),profile=productFamily(decodeProfileTitle(profileTitle));
  if(product&&profile===product)return"recommended";
  if(APPAREL_PRODUCT_FAMILIES.has(product)&&APPAREL_PRODUCT_FAMILIES.has(profile))return"related";
  return"other";
}
function shippingProfileOptionLabel(profile:EtsyShippingProfile){return`${decodeProfileTitle(profile.title)} · $${profile.domesticPrimary.toFixed(2)} first · $${profile.domesticAdditional.toFixed(2)} additional`}

function personalizationProblem(details?:EtsyDetails){const personalization=details?.personalization;if(!personalization?.enabled)return"";if(!personalization.questions.length)return"Add at least one personalization question.";if(personalization.questions.length>5)return"Etsy allows up to five personalization questions.";for(const [index,question] of personalization.questions.entries()){if(!question.question.trim())return`Personalization question ${index+1} needs a question.`;if(question.type==="dropdown"){const options=question.options.map(option=>option.trim()).filter(Boolean);if(options.length<2)return`Personalization question ${index+1} needs at least two dropdown choices.`;if(options.length>30)return`Personalization question ${index+1} has more than 30 dropdown choices.`;if(options.some(option=>option.length>20))return`Every dropdown choice in personalization question ${index+1} must be 20 characters or fewer.`}}return""}

const WORKFLOW_STEPS: Array<{id:WorkflowStep;number:string;label:string}> = [
  {id:"connect",number:"01",label:"Connect Printify"},
  {id:"setup",number:"02",label:"Choose product"},
  {id:"designs",number:"03",label:"Add designs"},
  {id:"review",number:"04",label:"Review batch"},
  {id:"finish",number:"05",label:"Finish listings"},
];
/* D217 · Index 3 was "Review pricing". Pricing now lives on the Product page,
   directly under the colours and sizes that decide which variants exist, so this
   step is only draft creation and is named for that. */
const PROGRESS_STEPS = ["Connect Printify","Choose product","Add designs","Create Printify drafts","Create drafts","Titles, tags + descriptions","Etsy listing details","Images + mockups","Final review"];
const PROGRESS_SHORT_LABELS = ["Connect","Product","Designs","Drafts","Drafts","Titles + tags","Etsy details","Images + mockups","Publish"];
/* The rail used to show all 9 PROGRESS_STEPS as equal peers. That did not match
   the real state machine (WorkflowStep has 5 values) and it invented a "Drafts"
   step that is really the outcome of Pricing. The indices below are unchanged —
   only the rendering groups them: 4 top-level steps, then a Finish node whose 4
   phases nest underneath it. openProgressStep/progressStatus still take the
   original 0-8 index, so none of the gating math changes. */
/* D216 · Connect leaves the rail. It is account setup you clear once, not a
   stage of every batch, and carrying it as bubble 01 made a four-part job look
   like five. It remains a reachable page and still gates everything after it —
   only its bubble is gone. Numbering below comes from rail POSITION, not from
   the PROGRESS_STEPS index, which still runs 0-8 so no gating math changes. */
const RAIL_TOP = [1,2,3];
const RAIL_PRICING = 3;
const RAIL_DRAFTS = 4;
const RAIL_FINISH = [5,6,7,8];
const RAIL_FINISH_FIRST = 5;
const FINISH_RAIL_LABELS = ["Titles + tags","Etsy details","Images + mockups","Review + publish"];
const WORKFLOW_HELP = [
  {title:"Connect Printify and Etsy",intro:"Both accounts must be connected before Goldie can build a complete listing.",sections:[{heading:"Printify connection",copy:"Connect the Printify account that contains your saved product. Goldie uses it to read product costs and variants, upload artwork, and create unpublished product drafts."},{heading:"Etsy connection",copy:"Connect the Etsy shop linked to that saved product. Goldie uses Etsy’s real categories, attributes, shipping profiles, and publishing connection."},{heading:"Nothing publishes here",copy:"This step only verifies access. Goldie cannot publish a listing until you reach the final review and confirm publishing a second time."},{heading:"Use matching accounts",copy:"Connect the Printify account that contains the saved product and the Etsy shop where that product was published. If the product belongs to a different shop, Goldie will stop and explain the mismatch."},{heading:"Your publishing safeguard",copy:"Connecting does not publish anything. Goldie first creates unpublished Printify drafts. Listings go live on Etsy only after the final review and a second explicit confirmation."}]},
  {title:"Prepare the Printify product Goldie will copy",intro:"Use an existing product from your Etsy shop or create one specifically for Listing Factory. Either option works, but the product must be published from Printify to the connected Etsy shop before you copy its link.",sections:[{heading:"The product must already be published to Etsy",copy:"This is required. In Printify, publish the product to the same Etsy shop you connected to Goldie. A Printify draft that has never been published to Etsy is not ready to become a saved product."},{heading:"Only set up these essentials in Printify",copy:"Goldie needs the physical product and a dependable artwork position.",bullets:["Choose the product type.","Choose the print provider or manufacturer.","Place temporary artwork at the size and position you want Goldie to reuse.","Publish that product from Printify to your connected Etsy shop."]},{heading:"Copy the URL only from the Printify design editor",copy:"Open My Products, select the published product, and click into its design editor so the artwork placement controls are visible. Copy the complete URL from that editor’s browser address bar. Do not copy the Etsy listing URL, the Printify product-list URL, a public storefront URL, or only the product ID."},{heading:"Goldie handles the batch-specific listing choices",copy:"The temporary artwork only establishes placement. Inside Listing Factory you will choose the batch colors, sizes, prices, shipping profile, listing photos, mockups, titles, tags, description, Etsy details, and personalization."},{heading:"Existing product or dedicated Listing Factory product—both work",copy:"You may use a product that is already selling in your Etsy shop, or publish a separate product specifically for Listing Factory. What matters is that it belongs to the connected Printify account and Etsy shop, is published to Etsy, and is opened in the Printify design editor when you copy the URL."},{heading:"Product bundles",copy:"Choose a bundle only when the same uploaded artwork should be created on two to four different saved products, such as a T-shirt, sweatshirt, and hoodie. Upload each design once. Goldie then walks you through the pricing and listing choices for each product separately."}]},
  {title:"Add finished artwork",intro:"This batch becomes one listing per uploaded design for the selected product.",sections:[{heading:"Use production-ready files",copy:"Upload PNG or JPG artwork, not mockup photos. Use transparent PNGs when the background should not print."},{heading:"Upload in more than one round",copy:"Choosing another folder or more individual files adds them to the existing batch. It does not replace earlier uploads. Exact duplicate files are skipped."},{heading:"Check resolution",copy:"Goldie reads the original pixel dimensions without reducing DPI. If artwork falls below Printify’s recommendation for the selected product, review the warning before continuing."},{heading:"Batch limits",copy:"Each batch can contain up to 20 designs, with a maximum of 100 MB per individual design."}]},
  {title:"Review prices and shipping",intro:"Set the buyer-facing item prices and confirm the Etsy shipping profile before any Printify drafts are created.",sections:[{heading:"Use the profit goal",copy:"Goldie calculates a recommended price for every exact Printify product cost using the Etsy fee settings shown in the calculation details. Buyer-paid shipping stays separate from item profit."},{heading:"Edit matching-cost groups",copy:"Variants with the exact same Printify cost share one price field. More expensive colors, sizes, materials, finishes, or other options remain separate automatically."},{heading:"Choose shipping",copy:"Keep the shipping profile imported from the saved product, or create a named copy with different domestic, additional-item, or international charges."},{heading:"Approve the result",copy:"Review the lowest estimated profit in every group. Buyer-paid shipping, Offsite Ads, and sales tax are excluded from item profit because they are separate or vary by order."}]},
  {title:"Create the Printify drafts",intro:"This creates one unpublished Printify product draft for every uploaded design.",sections:[{heading:"What Goldie copies",copy:"Goldie copies the selected product, enabled variants, artwork placement, approved prices, and uploaded design into each new draft."},{heading:"What this does not do",copy:"The products are not published to Etsy at this point. They remain unpublished Printify drafts while you finish titles, Etsy details, and images."},{heading:"Keep the page open",copy:"Large artwork and large batches can take time. Goldie processes the batch safely and shows progress as each draft is completed."},{heading:"If one draft fails",copy:"Goldie keeps successful drafts and identifies the failed design so it can be retried without duplicating the completed products."}]},
  {title:"Create titles, tags, and descriptions",intro:"Finish the searchable words and buyer-facing description for every listing.",sections:[{heading:"Start with a validated keyword bank",copy:"Goldie only uses exact phrases from the bank you choose. It does not invent or add keywords."},{heading:"Review AI judgment",copy:"Goldie chooses the phrases it believes fit each design, but it cannot rescue a mismatched keyword bank. Review every title and change anything that does not fit."},{heading:"Edit listings independently",copy:"You can rebuild or manually edit one title and its tags without changing any other listing in the batch."},{heading:"Use the shared description",copy:"The batch description comes from the saved product. Edit it once for every listing, then add an individual override only where a specific design needs different wording."}]},
  {title:"Review Etsy details",intro:"Goldie pre-fills the fields it can confidently match. You remain responsible for confirming that every choice is accurate.",sections:[{heading:"Verify the category first",copy:"Changing the Etsy category changes the product fields that Etsy requires and offers. Correct the category before editing the fields beneath it."},{heading:"Check every selected attribute",copy:"Review materials, style, occasion, recipient, room, and other product-specific choices. Optional fields should stay blank when there is no clear match."},{heading:"Add personalization only when needed",copy:"Personalization can collect buyer text, a dropdown choice, or files. Make each question specific, set whether it is required, and stay within the limits shown."},{heading:"Save all listings",copy:"Goldie will not continue until the required Etsy details are complete for every listing in the batch."}]},
  {title:"Choose and arrange listing images",intro:"Every listing needs at least one image. This step combines real Printify product images, optional lifestyle mockups, and an optional size guide.",sections:[{heading:"Review the real Printify placement",copy:"Open a draft in Printify when the artwork needs resizing or repositioning. The Printify preview is the reference Goldie uses for generated lifestyle mockups."},{heading:"Choose Printify photos",copy:"Select the flatlays and product views that belong on the listing. Apply the same selection to every listing only when those photos make sense for the entire batch."},{heading:"Generate matching mockups",copy:"Choose up to eight lifestyle scenes and review every result before publishing."},{heading:"Set the Etsy order",copy:"Drag images into the order buyers should see: lifestyle images first, Printify product photos next, and the size guide last. You can rearrange this for each listing."}]},
  {title:"Complete the final review",intro:"This is the last checkpoint before the listings are published live on Etsy.",sections:[{heading:"Open every listing summary",copy:"Review the title, tags, description, Etsy details, prices, shipping, and selected images. Use the edit buttons to return to any unfinished section."},{heading:"Understand the publish action",copy:"The final action publishes live Etsy listings. It does not create Etsy drafts. Goldie shows a second confirmation before publishing begins."},{heading:"Do not close the page",copy:"Publishing may be queued briefly to protect Etsy’s shared API limits. Keep the page open until Goldie confirms the result or tells you the batch is safely queued."},{heading:"Review the receipt",copy:"After publishing, Goldie shows how many listings went live and what was completed. Use the Etsy links to inspect the live listings."}]},
];

const MAX_BATCH_FILES = 20;
const MAX_CONCURRENT_DESIGNS = 2;
const LARGE_BATCH_THRESHOLD = 400 * 1024 * 1024;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
const PHYSICAL_ETSY_FIELDS=/^(materials?|sleeve length|neckline|clothing style|size|shape|orientation|capacity)$/i;
function productEtsyDefaults(template:TemplateDetails|null,saved?:Record<string,string|number|null>){
  const facts=`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`.toLowerCase(),derived:Record<string,string>={};
  if(/cotton/.test(facts))derived.Materials="Cotton";else if(/polyester/.test(facts))derived.Materials="Polyester";else if(/ceramic/.test(facts))derived.Materials="Ceramic";else if(/canvas/.test(facts))derived.Materials="Canvas";else if(/paper|poster|print/.test(facts))derived.Materials="Paper";
  if(/short.?sleeve|t-?shirt|\btee\b/.test(facts))derived["Sleeve length"]="Short sleeve";else if(/long.?sleeve|sweatshirt|crewneck|hoodie/.test(facts))derived["Sleeve length"]="Long sleeve";
  if(/v.?neck/.test(facts))derived.Neckline="V-neck";else if(/crewneck|crew neck|t-?shirt|\btee\b|sweatshirt/.test(facts))derived.Neckline="Crew";
  if(/hoodie/.test(facts))derived["Clothing style"]="Hoodie";else if(/sweatshirt|crewneck/.test(facts))derived["Clothing style"]="Sweatshirt";else if(/t-?shirt|\btee\b/.test(facts))derived["Clothing style"]="T-shirt";
  if(/\bunisex\b/.test(facts))derived.Size="Unisex";else if(/\byouth\b|\bkids?\b|\bchildren\b/.test(facts))derived.Size="Youth";else if(/\binfant\b|\bbaby\b/.test(facts))derived.Size="Baby";
  return {...derived,...Object.fromEntries(Object.entries(saved||{}).filter(([key,value])=>PHYSICAL_ETSY_FIELDS.test(key)&&String(value??"").trim()).map(([key,value])=>[key,String(value)]))};
}
function isRigidPaperProduct(template:TemplateDetails|null){return /poster|print|canvas|paper/i.test(`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`)}
function PrintifyImagePicker({ images,indices,reservedPhotos=0,onApplyOne,onApplyAll,onSaveRecipe }: { images: string[];indices:number[];reservedPhotos?:number;onApplyOne:(indices:number[])=>void;onApplyAll:(indices:number[])=>void;onSaveRecipe?:(indices:number[])=>void|Promise<void> }) {
  const [selected,setSelected]=useState<Set<number>>(new Set(indices.slice(0,Math.max(0,20-reservedPhotos)))),[expanded,setExpanded]=useState<string>(""),[action,setAction]=useState<"clear"|"all"|"future"|"">(""),[feedback,setFeedback]=useState(""),[savingFuture,setSavingFuture]=useState(false);
  useEffect(()=>setSelected(new Set(indices.slice(0,Math.max(0,20-reservedPhotos)))),[indices,images.length,reservedPhotos]);
  if(!images.length)return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>;
  const chosen=[...selected].sort((a,b)=>a-b),selectionHint=chosen.length?"":"Select a Printify photo below first.",slotsLeft=Math.max(0,20-reservedPhotos-selected.size),atLimit=slotsLeft===0;
  function toggle(index:number){const next=new Set(selected);if(next.has(index))next.delete(index);else{if(atLimit){setFeedback("Etsy allows 20 listing photos. Remove a selected photo before adding another.");return}next.add(index)}setSelected(next);setAction("");setFeedback("");onApplyOne([...next].sort((a,b)=>a-b))}
  function deselect(){setSelected(new Set());setAction("clear");setFeedback("");onApplyOne([])}
  function applyAll(){if(!chosen.length)return;onApplyAll(chosen);setAction("all");setFeedback("✓ These Printify photos are now selected on every listing in this batch.")}
  async function saveFuture(){if(!onSaveRecipe||savingFuture||!chosen.length)return;setSavingFuture(true);setFeedback("Saving your preference…");try{await onSaveRecipe(chosen);setAction("future");setFeedback("✓ These Printify photos will be preselected for future batches using this product.")}catch(error){setAction("");setFeedback(error instanceof Error?error.message:"These preferences could not be saved.")}finally{setSavingFuture(false)}}
  const lightbox=expanded&&typeof document!=="undefined"?createPortal(<div className="printify-photo-lightbox" role="dialog" aria-modal="true" aria-label="Expanded Printify photo" onMouseDown={event=>{if(event.target===event.currentTarget)setExpanded("")}}><button type="button" onClick={()=>setExpanded("")} aria-label="Close expanded photo">×</button><img src={expanded} alt="Expanded Printify product mockup"/></div>,document.body):null;
  return <><details className="printify-image-picker" open><summary>Printify product photos — {selected.size} selected · {slotsLeft} of 20 photo slots left</summary><p>Etsy allows 20 listing photos total. Lifestyle mockups and a size guide already chosen for this listing count toward that limit. Use the visible checkbox to select a photo.</p><div className="image-pref-actions"><button type="button" className={`clear ${action==="clear"?"confirmed":""}`} disabled={!chosen.length} onClick={deselect}>{action==="clear"&&<span className="action-check">✓</span>}<b>{action==="clear"?"Selections cleared":"Clear this listing’s selections"}</b><small>{selectionHint||"Remove every selected Printify photo from this listing only."}</small></button><button type="button" className={action==="all"?"confirmed":""} disabled={!chosen.length} onClick={applyAll}>{action==="all"&&<span className="action-check">✓</span>}<b>{action==="all"?"Applied to every listing":"Apply these photos to every listing"}</b><small>{selectionHint||"Choose the same Printify photos across the entire batch."}</small></button>{onSaveRecipe&&<button type="button" aria-busy={savingFuture} disabled={!chosen.length||savingFuture} className={action==="future"?"confirmed":""} onClick={()=>void saveFuture()}>{action==="future"&&<span className="action-check">✓</span>}<b>{savingFuture?"Saving…":action==="future"?"Saved for future batches":"Use these as this product’s default"}</b><small>{selectionHint||"Preselect these photos whenever you use this saved product again."}</small></button>}</div>{feedback&&<p className="image-pref-feedback" role="status">{feedback}</p>}<div className="printify-image-grid">{images.map((src,index)=><div className={`printify-image-option ${selected.has(index)?"selected":""}`} key={src}><label className="printify-photo-selector"><input type="checkbox" checked={selected.has(index)} disabled={!selected.has(index)&&atLimit} onChange={()=>toggle(index)}/><span aria-hidden="true">{selected.has(index)?"✓":""}</span><span className="sr-only">Select Printify photo {index+1}</span></label><button type="button" className="printify-photo-expand" onClick={()=>setExpanded(src)} aria-label={`View Printify photo ${index+1} larger`}><img src={src} alt={`Printify product mockup ${index+1}`} loading="lazy" decoding="async"/></button></div>)}</div></details>{lightbox}</>;
}

function PriceField({value,minimum,label,onCommit}:{value:number;minimum:number;label:string;onCommit:(cents:number)=>void}){const [draft,setDraft]=useState((value/100).toFixed(2)),[confirmed,setConfirmed]=useState(false);useEffect(()=>setDraft((value/100).toFixed(2)),[value]);function commit(){const amount=Number(draft);if(!Number.isFinite(amount)){setDraft((value/100).toFixed(2));return}const cents=Math.round(Math.max(minimum,amount)*100);onCommit(cents);setDraft((cents/100).toFixed(2));setConfirmed(true);window.setTimeout(()=>setConfirmed(false),520)}return <label className={confirmed?"price-confirmed":""} aria-label={label}>$<input type="text" inputMode="decimal" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.currentTarget.blur()}if(event.key==="Escape"){setDraft((value/100).toFixed(2));event.currentTarget.blur()}}}/></label>}

function ProductColorSelector({product,selected,onChange,onRemember,remembering,remembered}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean}){
  const colors=product.colorOptions||[],available=colors.filter(color=>color.available),selectedSet=new Set(selected),[expanded,setExpanded]=useState(!remembered);
  if(!colors.length)return <section className="product-color-selector no-colors"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>This product has no separate color choices.</h3><span>Goldie will keep the valid variants from the saved Printify product.</span></div></section>;
  function toggle(id:number){const next=new Set(selectedSet);if(next.has(id))next.delete(id);else next.add(id);onChange([...next])}
  const selectedColors=colors.filter(color=>selectedSet.has(color.id));
  /* First-run framing now lives above the product controls and is persisted by
     setupComplete. Keep this reusable selector free of parent-only state. */
  const productFirstRun=false;
  return <section className="product-color-selector" aria-label={`Choose colors for ${product.blueprintTitle}`}><div className="color-selector-head"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>Colors</h3><span>{productFirstRun?"Choose the colors you want to offer, then save them as this product's default.":remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selected.length} selected</b></div>{!expanded&&selectedColors.length>0&&<div className="remembered-color-row">{selectedColors.map(color=><span key={color.id}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/>{color.title}</span>)}<button type="button" onClick={()=>setExpanded(true)}>Change colors</button></div>}{expanded&&<><div className="color-choice-grid">{colors.map(color=><button type="button" key={color.id} disabled={!color.available} aria-pressed={selectedSet.has(color.id)} onClick={()=>toggle(color.id)} className={selectedSet.has(color.id)?"selected":""}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/><span>{color.title}</span>{selectedSet.has(color.id)&&<em>✓</em>}{!color.available&&<small>Unavailable</small>}</button>)}</div><div className="color-selector-actions"><button type="button" onClick={()=>onChange(available.map(color=>color.id))}>Select all available</button><button type="button" onClick={()=>onChange([])}>Clear all</button>{selected.length>0&&<button type="button" onClick={()=>setExpanded(false)}>Done choosing colors</button>}<button type="button" className={remembered?"remembered":""} disabled={!selected.length||remembering||remembered} onClick={onRemember}>{remembering?"Saving…":remembered?"✓ Saved for this product":"Save these as this product’s default colors"}</button></div></>}{!selected.length&&<p className="color-required" role="alert">Choose at least one available color before continuing.</p>}</section>
}

function ProductSizeSelector({product,selected,onChange,onRemember,remembering,remembered}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean}){
  const sizes=product.sizeOptions||[],available=sizes.filter(size=>size.available),selectedSet=new Set(selected);
  /* A blueprint with no size axis (a mug, a sticker) renders nothing at all
     rather than an empty card. */
  if(!sizes.length)return null;
  function toggle(id:number){const next=new Set(selectedSet);if(next.has(id))next.delete(id);else next.add(id);onChange([...next])}
  return <section className="product-size-selector" aria-label={`Choose sizes for ${product.blueprintTitle}`}>
    <div className="size-selector-head"><div><p className="mini-label">SIZES FOR THIS BATCH</p><h3>Sizes</h3><span>{remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selected.length} selected</b></div>
    <div className="size-choice-grid">{sizes.map(size=><button type="button" key={size.id} disabled={!size.available} aria-pressed={selectedSet.has(size.id)} onClick={()=>toggle(size.id)} className={selectedSet.has(size.id)?"selected":""}><span>{size.title}</span>{selectedSet.has(size.id)&&<em>✓</em>}{!size.available&&<small>Unavailable</small>}</button>)}</div>
    <div className="size-selector-actions"><button type="button" onClick={()=>onChange(available.map(size=>size.id))}>Select all available</button><button type="button" onClick={()=>{const templateSizes=(product.sizeOptions||[]).filter(size=>size.available&&size.templateEnabled).map(size=>size.id);
                /* D213 · This used to fall back to every available size when the
                   template had none enabled, so a button reading "Match Printify
                   template" quietly selected the whole blueprint. If there is
                   nothing to match, match nothing and let the seller choose. */
                onChange(templateSizes)}}>Match Printify template</button><button type="button" className={remembered?"remembered":""} disabled={!selected.length||remembering||remembered} onClick={onRemember}>{remembering?"Saving…":remembered?"✓ Saved for this product":"Save these as this product’s default sizes"}</button></div>
    {!selected.length&&<p className="size-required" role="alert">Choose at least one size before continuing.</p>}
  </section>
}

function productAcceptsMockup(surfaceKind:string,productName:string){const product=productName.toLowerCase();if(!/t-shirt|sweatshirt|hoodie|other-apparel|apparel/.test(surfaceKind))return true;if(/hoodie|hooded/.test(product))return surfaceKind==="hoodie";if(/crewneck|sweatshirt|sweater/.test(product))return surfaceKind==="sweatshirt";if(/t[ -]?shirt|\btee\b/.test(product))return surfaceKind==="t-shirt"||surfaceKind==="apparel";return surfaceKind==="other-apparel"||surfaceKind==="apparel"}
function MockupSetSelector({value,onChange,selectedIds=[],savedValue,savedIds,onSaveDefault,saving,firstRun=false,productName=""}:{value:string;onChange:(value:string,ids?:string[])=>void;selectedIds?:string[];savedValue:string;savedIds?:string[];onSaveDefault:()=>void;saving:boolean;firstRun?:boolean;productName?:string}){
  const [templates,setTemplates]=useState<Array<{id:string;theme:string;name:string;src:string;surfaceKind:string}>>([]),[loaded,setLoaded]=useState(false),seededDefault=useRef(false);
  useEffect(()=>{fetch("/api/mockups/library").then(response=>response.json()).then((payload:{templates?:Array<{id?:string;theme?:string;name?:string;src?:string;surfaceKind?:string}>})=>setTemplates((payload.templates||[]).map(item=>({id:String(item.id||""),theme:String(item.theme||"").trim(),name:String(item.name||"Mockup"),src:String(item.src||""),surfaceKind:String(item.surfaceKind||"rigid-flat")})).filter(item=>item.id&&item.theme&&item.src))).catch(()=>undefined).finally(()=>setLoaded(true))},[]);
  const compatibleTemplates=templates.filter(item=>productAcceptsMockup(item.surfaceKind,productName)),themes=[...new Set(compatibleTemplates.map(item=>item.theme))],matchingTemplates=compatibleTemplates.filter(item=>item.theme===value);
  /* Seed a starting set ONCE. This used to run on every render where `value`
   * was empty, so choosing "No mockups for this batch" was undone instantly by
   * the effect — the select snapped back to the saved set within a frame and
   * the seller could never remove mockups. Verified live: setting the value to
   * "" reverted to "BACH TEES" while an identical change on the keyword-bank
   * select stuck. Seeding once keeps the convenience; a deliberate clear now
   * survives. */
  useEffect(()=>{if(!productName||seededDefault.current||!templates.length)return;seededDefault.current=true;if(value&&!themes.includes(value)){onChange("",[]);return}if(value===savedValue&&savedIds===undefined){onChange(value,matchingTemplates.slice(0,8).map(item=>item.id));return}if(!value&&savedValue&&themes.includes(savedValue)){const ids=savedIds===undefined?compatibleTemplates.filter(item=>item.theme===savedValue).slice(0,8).map(item=>item.id):savedIds;onChange(savedValue,ids)}},[value,savedValue,savedIds,themes.join("|"),templates.length,productName]);
  if(!productName)return null;
  const selected=new Set(selectedIds),changed=value!==savedValue||JSON.stringify([...selectedIds].sort())!==JSON.stringify([...(savedIds||[])].sort());
  function chooseTheme(theme:string){const ids=theme===savedValue?(savedIds===undefined?compatibleTemplates.filter(item=>item.theme===theme).slice(0,8).map(item=>item.id):savedIds):[];onChange(theme,ids)}
  function toggle(id:string){const next=new Set(selected);if(next.has(id))next.delete(id);else if(next.size<8)next.add(id);onChange(value,[...next])}
  const savedSetIsCompatible=Boolean(savedValue&&themes.includes(savedValue));
  return <section className="batch-default-block mockup-default-block">
    <div className="batch-default-heading"><div><h3>Mockups</h3><span>{firstRun?"Choose the exact scenes this product should start with.":savedSetIsCompatible?"Saved for this product — remove or add any scene.":value?"Choose the individual scenes you want. Nothing is inherited from another product.":loaded&&!themes.length?"No compatible mockup set is saved for this product yet.":themes.length?"No mockup set chosen for this product yet.":"Loading your saved mockup choices…"}</span></div><b>{value?`${selectedIds.length} selected`:loaded?"None chosen":"Loading…"}</b></div>
    <label><span>Mockup set</span><select value={value} onChange={event=>chooseTheme(event.target.value)} disabled={!themes.length}>{themes.length?<option value="">No mockups for this batch</option>:<option value="">{loaded?"No compatible mockup sets for this product":"Loading mockup sets…"}</option>}{themes.map(theme=><option key={theme} value={theme}>{theme}</option>)}</select></label>
    <a className="manage-mockup-sets" href="/mockups" target="_blank" rel="noopener noreferrer">Create or edit mockup sets ↗</a>
    {value&&<><div className="product-mockup-scenes" aria-label={`Choose scenes from ${value}`}>{matchingTemplates.map((item,index)=><label key={item.id} className={selected.has(item.id)?"selected":""}><input type="checkbox" checked={selected.has(item.id)} disabled={!selected.has(item.id)&&selected.size>=8} onChange={()=>toggle(item.id)}/><img src={item.src} alt={`Scene ${index+1}`}/><span>{`Scene ${index+1}`}</span></label>)}</div><small>{selected.size} of 8 selected. Click any scene to remove or re-add it.</small></>}
    {!firstRun&&changed&&<button type="button" className="save-product-default" disabled={saving} onClick={onSaveDefault}>{saving?"Saving…":value?`Save these ${selectedIds.length} mockups as this product’s default`:"Save no mockups as this product’s default"}</button>}
  </section>
}

function normalizePricesByCost(variants:ProductVariant[],next:Record<string,number>){
  const safestByCost=new Map<number,number>();
  for(const variant of variants)safestByCost.set(variant.cost,Math.max(safestByCost.get(variant.cost)||0,next[String(variant.id)]??variant.templatePrice));
  return Object.fromEntries(variants.map(variant=>[String(variant.id),safestByCost.get(variant.cost)??next[String(variant.id)]??variant.templatePrice]));
}

async function autoTitleForDesign(design:DesignFile,keywords:string[],useCommas:boolean,template:TemplateDetails|null){const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"title",image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:template?.blueprintTitle,brand:template?.brand,model:template?.model},keywords,useCommas})}),payload=await response.json() as {title?:string;keywords?:string[];tags?:string[];titleWarning?:string;error?:string};if(!response.ok||!payload.title)throw new Error(payload.error||"Goldie could not create this title.");return {title:payload.title,keywords:payload.keywords||[],tags:payload.tags||[],titleWarning:payload.titleWarning||""}}

function IndividualAutoTitle({design,template,useCommas,initialBankId,onApply}:{design:DesignFile;template:TemplateDetails|null;useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[],titleWarning?:string)=>void}){const [bank,setBank]=useState<KeywordList|null>(null),[building,setBuilding]=useState(false),[message,setMessage]=useState("");async function build(){if(!bank)return;setBuilding(true);setMessage("");try{const result=await autoTitleForDesign(design,bank.keywords,useCommas,template);onApply(result.title,result.tags,result.titleWarning);setMessage(result.titleWarning||"✓ New title and separately ranked Etsy tags applied to this listing only.")}catch(error){setMessage(error instanceof Error?error.message:"Goldie could not create this title.")}finally{setBuilding(false)}}return <>{design.titleWarning&&<p className="title-match-warning" role="status">{design.titleWarning}</p>}{design.titleError&&<p className="field-error" role="alert">{design.titleError}</p>}<details className="individual-title-builder" onClick={event=>event.stopPropagation()}><summary>Create a different title with AI</summary><KeywordBank compact selectionOnly initialId={initialBankId||""} title="Keyword bank" copy="Goldie selects exact validated phrases from this bank. It never adds keywords." onSelect={setBank}/><button className="ai-title-button" disabled={!bank||building} onClick={()=>void build()}>{building?"Creating this title…":"Create title for this design"}</button>{message&&<p className="title-build-message" role="status">{message}</p>}</details><IndividualManualTitle useCommas={useCommas} initialBankId={initialBankId} onApply={(title,tags)=>onApply(title,tags,"")}/></>}

function IndividualManualTitle({useCommas,initialBankId,onApply}:{useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[])=>void}){const [bankId,setBankId]=useState(initialBankId||""),[keywords,setKeywords]=useState<string[]>([]),[message,setMessage]=useState("");const title=keywords.join(useCommas?", ":" ");function add(keyword:string){setKeywords(current=>current.includes(keyword)?current:[...current,keyword]);setMessage("")}function apply(){if(!title)return;onApply(title,tagsFromTitle(keywords.join(", ")));setMessage("✓ Your title and matching tags were applied to this listing only.")}return <details className="individual-title-builder individual-manual-title" onClick={event=>event.stopPropagation()}><summary>Build this title yourself from a keyword bank</summary><KeywordBank compact initialId={bankId} title="Choose a keyword bank" copy="Click keywords in the order you want them for this listing." onSelect={list=>{setBankId(list?.id||"");setKeywords([]);setMessage("")}} onAdd={add}/><div className="individual-keyword-selection"><div><b>Selected keywords</b>{keywords.length>0&&<button type="button" onClick={()=>setKeywords([])}>Clear all</button>}</div>{keywords.length?<><div className="selected-keyword-chips">{keywords.map(keyword=><button type="button" key={keyword} onClick={()=>setKeywords(current=>current.filter(item=>item!==keyword))}>{keyword}<span>×</span></button>)}</div><div className="individual-title-preview"><small>Title preview</small><span>{title}</span></div><button type="button" className="apply-manual-title" onClick={apply}>Apply to this listing</button></>:<p>Choose a bank, then click the keywords you want to use.</p>}{message&&<p className="title-build-message" role="status">{message}</p>}</div></details>}

function PersonalizationEditor({value,onChange}:{value?:EtsyPersonalization;onChange:(value:EtsyPersonalization)=>void}){
  const enabled=Boolean(value?.enabled),questions=value?.questions||[];
  function blank(type:PersonalizationQuestion["type"]="text_input"):PersonalizationQuestion{return{id:crypto.randomUUID(),type,question:type==="text_input"?"Personalization":"",instructions:"",required:false,maxCharacters:256,maxFiles:1,options:type==="dropdown"?["Option 1","Option 2"]:[]}}
  function update(id:string,patch:Partial<PersonalizationQuestion>){onChange({enabled:true,questions:questions.map(question=>question.id===id?{...question,...patch}:question)})}
  function toggle(next:boolean){onChange({enabled:next,questions:next?(questions.length?questions:[blank()]):questions})}
  return <section className="personalization-editor"><div className="personalization-heading"><div><b>Personalization</b><small>Let buyers answer questions or upload files for this listing.</small></div><label className="personalization-switch"><input type="checkbox" role="switch" aria-label="Personalization" aria-checked={enabled} checked={enabled} onChange={event=>toggle(event.target.checked)}/><span>{enabled?"On":"Off"}</span></label></div>{enabled&&<><div className="personalization-questions">{questions.map((question,index)=><article key={question.id}><div className="personalization-question-head"><b>Question {index+1}</b><button type="button" onClick={()=>onChange({enabled:true,questions:questions.filter(item=>item.id!==question.id)})}>Remove</button></div><label>Answer type<select value={question.type} onChange={event=>{const type=event.target.value as PersonalizationQuestion["type"];update(question.id,{type,options:type==="dropdown"&&question.options.length<2?["Option 1","Option 2"]:question.options})}}><option value="text_input">Text answer</option><option value="dropdown">Dropdown choices</option><option value="unlabeled_upload">File upload</option></select></label><label>Question<input maxLength={120} value={question.question} placeholder="Example: What name should appear on the shirt?" onChange={event=>update(question.id,{question:event.target.value})}/></label>{question.type!=="dropdown"&&<label>Instructions <span>{question.instructions.length}/120</span><textarea rows={2} maxLength={120} value={question.instructions} placeholder="Tell the buyer exactly what to provide." onChange={event=>update(question.id,{instructions:event.target.value})}/></label>}{question.type==="text_input"&&<label>Maximum characters<input type="number" min="1" max="1024" value={question.maxCharacters} onChange={event=>update(question.id,{maxCharacters:Math.max(1,Math.min(1024,Number(event.target.value)||1))})}/></label>}{question.type==="unlabeled_upload"&&<label>Maximum files<input type="number" min="1" max="10" value={question.maxFiles} onChange={event=>update(question.id,{maxFiles:Math.max(1,Math.min(10,Number(event.target.value)||1))})}/></label>}{question.type==="dropdown"&&<label>Dropdown choices<textarea rows={3} value={question.options.join("\n")} placeholder={"Small\nMedium\nLarge"} onChange={event=>update(question.id,{options:event.target.value.split(/\r?\n/).slice(0,30)})}/><small>Enter one choice per line. Etsy allows up to 30 choices, with 20 characters per choice.</small></label>}<label className="personalization-required"><input type="checkbox" checked={question.required} onChange={event=>update(question.id,{required:event.target.checked})}/>Buyer must answer this question</label></article>)}</div>{questions.length<5&&<button type="button" className="add-personalization-question" onClick={()=>onChange({enabled:true,questions:[...questions,blank()]})}>Add another question</button>}<small className="personalization-note">Etsy allows up to five questions. Review every question before publishing.</small></>}</section>
}

function EtsyDetailsEditor({design,categories,onChange,onCategory}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>}){
  const details=design.etsy!,[loading,setLoading]=useState(false);
  const properties=details.properties||[],completed=properties.filter(property=>property.value.trim()),physical=completed.filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)),preview=physical.slice(0,3).map(property=>property.value).join(", ");
  async function choose(id:number){setLoading(true);try{await onCategory(id)}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:(details.properties||[]).map(item=>item.propertyId===property.propertyId?next:item)})}
  return <details className="etsy-details-editor"><summary><span><b>Etsy details</b><small>{(()=>{const required=properties.filter(property=>property.required),requiredDone=required.filter(property=>property.value.trim());return required.length?`${requiredDone.length} of ${required.length} required set`:`${completed.length} added · all optional`})()}{preview?` · ${preview}`:""}</small></span><em>Edit</em></summary><div className="etsy-details-editor-fields"><label>Etsy category<select value={details.taxonomyId||""} disabled={loading} onChange={event=>void choose(Number(event.target.value))}>{!details.taxonomyId&&<option value="">Choose an Etsy category</option>}{Boolean(details.taxonomyId)&&!categories.some(category=>category.id===details.taxonomyId)&&<option value={details.taxonomyId}>{details.category||"Category already chosen for this listing"}</option>}{categories.map(category=><option key={category.id} value={category.id}>{category.path}</option>)}</select></label>{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-grid">{properties.map(property=><label key={property.propertyId}>{property.label}{property.required&&<em>Required</em>}{property.possibleValues.length?<select value={property.valueId||""} onChange={event=>setProperty(property,event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input value={property.value} onChange={event=>setProperty(property,event.target.value)}/>}</label>)}</div><small className="optional-note">These are Etsy’s actual fields for the selected category. Optional fields can stay blank.</small><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></div></details>
}

function IndividualSizeGuide({productId,name,onSaved}:{productId:string;name?:string;onSaved:(name:string)=>void}){const picker=useRef<HTMLInputElement>(null),[status,setStatus]=useState(""),[saving,setSaving]=useState(false);async function save(file:File){if(saving)return;setSaving(true);setStatus(`Saving ${file.name}…`);try{const form=new FormData();form.set("productId",productId);form.set("kind","size-guide");form.set("file",file);const response=await fetch("/api/etsy/images",{method:"POST",body:form}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"This size guide could not be saved.");onSaved(file.name);setStatus(`✓ ${file.name} will be used for this listing.`)}catch(error){setStatus(error instanceof Error?error.message:"This size guide could not be saved.")}finally{setSaving(false)}}return <div className="individual-size-guide"><div><b>Size guide for this listing</b><small>{name||"Using the batch size guide"}</small></div><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void save(file)}}/><button type="button" aria-busy={saving} disabled={saving} onClick={()=>picker.current?.click()}>{saving?"Saving size guide…":name?"Replace custom size guide":"Use a different size guide"}</button>{status&&<p role="status">{status}</p>}</div>}

function DownloadListingPhotos({productId,name,indices}:{productId:string;name:string;indices:number[]}){const [downloading,setDownloading]=useState(false),[message,setMessage]=useState("");async function download(){if(downloading)return;setDownloading(true);setMessage("");try{const response=await fetch("/api/listing-photos/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,printifyImageIndices:indices})});if(!response.ok){const payload=await response.json() as {error?:string};throw new Error(payload.error||"These listing photos could not be downloaded.")}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`${name.replace(/[^a-z0-9._-]+/gi,"-").slice(0,90)||"listing"}-listing-photos.zip`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage("✓ Download ready.")}catch(error){setMessage(error instanceof Error?error.message:"These listing photos could not be downloaded.")}finally{setDownloading(false)}}return <div className="listing-photo-download"><div><b>Keep a local copy</b><small>Selected Printify photos and created lifestyle mockups in one ZIP.</small></div><button type="button" aria-busy={downloading} disabled={downloading} onClick={()=>void download()}>{downloading?"Preparing photos…":"Download this listing’s photos"}</button>{message&&<p role="status">{message}</p>}</div>}

function PricingReview({variants,pricing,prices,productName,profiles,selectedProfileId,profilesLoading,profilesError,approved,onPricing,onPrices,onSelectProfile,onCreateProfile,onApprovalChange}:{variants:ProductVariant[];pricing:Pricing;prices:Record<string,number>;productName:string;profiles:EtsyShippingProfile[];selectedProfileId:number;profilesLoading:boolean;profilesError:string;approved:boolean;onPricing:(value:Pricing)=>void;onPrices:(value:Record<string,number>)=>void;onSelectProfile:(id:number)=>void;onCreateProfile:(baseId:number,charge:number,additional:number,title:string,international:InternationalShippingRate[])=>Promise<void>;onApprovalChange:(ready:boolean)=>void}){
  const selectedProfile=profiles.find(profile=>profile.id===selectedProfileId);
  const printifyShipping=Math.max(0,...variants.map(variant=>Number(variant.shipping)||0));
  const shippingShortfall=selectedProfile?printifyShipping-selectedProfile.domesticPrimary:0;
  const [customCharge,setCustomCharge]=useState(""),[customAdditional,setCustomAdditional]=useState(""),[customInternational,setCustomInternational]=useState<EditableInternationalShippingRate[]>([]),[customProfileName,setCustomProfileName]=useState(""),[savingProfile,setSavingProfile]=useState(false),[profileMessage,setProfileMessage]=useState(""),[recommendationMessage,setRecommendationMessage]=useState(""),[wholeNumberPricing,setWholeNumberPricing]=useState(false),[profileSearch,setProfileSearch]=useState("");
  const [attachedProfileId,setAttachedProfileId]=useState(0),attachedProductName=useRef(productName);
  useEffect(()=>{if(attachedProductName.current!==productName){attachedProductName.current=productName;setAttachedProfileId(selectedProfileId||0);return}if(!attachedProfileId&&selectedProfileId)setAttachedProfileId(selectedProfileId)},[productName,selectedProfileId,attachedProfileId]);
  function resetProfileEditor(profile=selectedProfile){setCustomCharge(profile?profile.domesticPrimary.toFixed(2):"");setCustomAdditional(profile?profile.domesticAdditional.toFixed(2):"");setCustomInternational(profile?profile.international.map(rate=>({...rate,primary:rate.primary.toFixed(2),additional:rate.additional.toFixed(2)})):[]);setCustomProfileName("");setProfileMessage("")}
  useEffect(()=>{resetProfileEditor()},[selectedProfileId,selectedProfile?.title]);
  const enteredCharge=Number(customCharge),enteredAdditional=Number(customAdditional),buyerShipping=Number.isFinite(enteredCharge)&&enteredCharge>=0?enteredCharge:selectedProfile?.domesticPrimary||0,internationalDirty=Boolean(selectedProfile&&customInternational.some((rate,index)=>Math.abs(Number(rate.primary)-selectedProfile.international[index]?.primary)>.004||Math.abs(Number(rate.additional)-selectedProfile.international[index]?.additional)>.004)),customDirty=Boolean(selectedProfile&&(Math.abs(buyerShipping-selectedProfile.domesticPrimary)>.004||Math.abs(enteredAdditional-selectedProfile.domesticAdditional)>.004||internationalDirty||Boolean(customProfileName.trim())));
  function markShippingEdit(){onApprovalChange(false);setProfileMessage("")}
  const priceGroups=useMemo(()=>{const grouped=new Map<number,ProductVariant[]>();for(const variant of variants)grouped.set(variant.cost,[...(grouped.get(variant.cost)||[]),variant]);return [...grouped.entries()].sort(([a],[b])=>a-b).map(([cost,items])=>({cost,items}))},[variants]);
  const wholePrice=(cents:number)=>wholeNumberPricing?Math.ceil(cents/100)*100:cents;
  function recalculate(nextPricing=pricing){const calculated=Object.fromEntries(variants.map(variant=>[String(variant.id),wholePrice(recommendedPrice(variant.cost,nextPricing))])),next=normalizePricesByCost(variants,calculated),changed=variants.filter(variant=>next[String(variant.id)]!==(prices[String(variant.id)]??variant.templatePrice)).length;onPrices(next);setRecommendationMessage(changed?`✓ Updated ${changed} ${changed===1?"price":"prices"}. Review each cost group below before continuing.`:"✓ Your current prices already meet this profit goal. Nothing needed to change.")}
  const initialPriceSignature=variants.map(variant=>`${variant.id}:${variant.cost}:${variant.shipping||0}:${variant.templatePrice}`).join("|");
  useEffect(()=>{if(!selectedProfile||!variants.length)return;const stillUsingTemplatePrices=variants.every(variant=>(prices[String(variant.id)]??variant.templatePrice)===variant.templatePrice);if(!stillUsingTemplatePrices)return;const calculated=Object.fromEntries(variants.map(variant=>[String(variant.id),recommendedPrice(variant.cost,pricing)]));onPrices(normalizePricesByCost(variants,calculated));setRecommendationMessage("✓ Goldie calculated every price from your profit goal, product costs, and Etsy fees. Buyer-paid shipping stays separate.")},[selectedProfile?.id,initialPriceSignature]);
  function changeProfit(value:number){const nextPricing={...pricing,targetProfit:Math.max(0,value)};onPricing(nextPricing);recalculate(nextPricing);}
  function changeCostGroupPrice(cost:number,cents:number){const matching=variants.filter(item=>item.cost===cost),safeCents=Math.max(wholePrice(cents),cost),next={...prices};for(const item of matching)next[String(item.id)]=safeCents;onPrices(next);setRecommendationMessage(`✓ $${(safeCents/100).toFixed(2)} applied to all ${matching.length} ${matching.length===1?"variant":"variants"} with a $${(cost/100).toFixed(2)} Printify cost.`)}
  function changeIndividualPrice(variant:ProductVariant,cents:number){onPrices({...prices,[String(variant.id)]:Math.max(wholePrice(cents),variant.cost)});setRecommendationMessage(`✓ ${variant.title} now has its own price. The rest of its cost group was not changed.`)}
  function toggleWholeNumberPricing(checked:boolean){setWholeNumberPricing(checked);if(!checked)return;const rounded=Object.fromEntries(variants.map(variant=>{const current=prices[String(variant.id)]??variant.templatePrice;return[String(variant.id),Math.max(Math.ceil(current/100)*100,variant.cost)]}));onPrices(normalizePricesByCost(variants,rounded));setRecommendationMessage("✓ Every item price is now a whole number without dropping below the displayed profit goal. Matching Printify-cost groups still share one price.")}
  function chooseProfile(id:number){const profile=profiles.find(item=>item.id===id);onSelectProfile(id);resetProfileEditor(profile);if(profile)recalculate(pricing)}
  function changeInternational(index:number,field:"primary"|"additional",value:string){setCustomInternational(current=>current.map((rate,i)=>i===index?{...rate,[field]:value}:rate));markShippingEdit()}
  async function createProfile(){if(!selectedProfile)return;const charge=Number(customCharge),additional=Number(customAdditional),title=customProfileName.trim(),international=customInternational.map(rate=>({...rate,primary:Number(rate.primary),additional:Number(rate.additional)})),ratesValid=international.every(rate=>rate.primary>=0&&Number.isFinite(rate.primary)&&rate.additional>=0&&Number.isFinite(rate.additional));if(customCharge===""||customAdditional===""||!Number.isFinite(charge)||charge<0||!Number.isFinite(additional)||additional<0||!ratesValid||!title)return setProfileMessage("Name the profile and enter valid first-item and additional-item charges for every destination.");setSavingProfile(true);setProfileMessage("");try{await onCreateProfile(selectedProfile.id,charge,additional,title,international);setProfileMessage("✓ New Etsy shipping profile saved and selected.")}catch(error){setProfileMessage(error instanceof Error?error.message:"The shipping profile could not be saved.")}finally{setSavingProfile(false)}}
  const normalizedProfileSearch=profileSearch.trim().toLocaleLowerCase();
  const searchedProfiles=profiles.filter(profile=>!normalizedProfileSearch||decodeProfileTitle(profile.title).toLocaleLowerCase().includes(normalizedProfileSearch));
  const attachedProfile=profiles.find(profile=>profile.id===attachedProfileId);
  const withoutAttached=searchedProfiles.filter(profile=>profile.id!==attachedProfile?.id);
  const recommendedProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="recommended");
  const relatedProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="related");
  const otherProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="other");
  const selectedProfileGroup=selectedProfile?shippingProfileGroup(selectedProfile.title,productName):"other";
  const selectedProfileNeedsReview=Boolean(selectedProfile&&selectedProfile.id!==attachedProfile?.id&&selectedProfileGroup!=="recommended");
  const selectedOutsideSearch=selectedProfile&&!searchedProfiles.some(profile=>profile.id===selectedProfile.id)?selectedProfile:null;
  const renderProfileOptions=(items:EtsyShippingProfile[])=>items.map(profile=><option key={profile.id} value={profile.id}>{shippingProfileOptionLabel(profile)}</option>);
  return (
    <section className={"variant-pricing "+(approved?"approved":"")}>
      <div className="variant-pricing-head">
        <div><h3>Item prices + buyer-paid shipping</h3></div>
        {approved&&<span>✓ Approved</span>}
      </div>
      <section className="item-pricing-section"><div className="item-pricing-heading pricing-section-heading"><div><div className="heading-with-help"><h4>1. Item prices <span>· {productName}</span></h4><ContextHelp label="Explain item pricing" title="How grouped pricing works" intro="Goldie groups variants only when Printify charges the exact same product cost. This saves repetitive typing without taking away your control." sections={[{heading:"Set your profit goal",copy:"Enter the item profit you want left after the Printify product cost and Etsy fees. Buyer-paid shipping is configured and shown separately below."},{heading:"Change one matching-cost group",copy:"Editing the price on a group updates every variant with that exact Printify cost. A higher-cost color, size, material, finish, capacity, or model stays in a separate group automatically."},{heading:"Override one variant only",copy:"Open “View included variants” when one specific option needs a different retail price. That individual edit does not change the rest of its group."},{heading:"Review before continuing",copy:"The item profit shown includes product cost and the saved Etsy fee profile. It does not include buyer-paid shipping, Offsite Ads, or sales tax."}]}/></div><p>Variants with the exact same Printify product cost share one price. Item profit includes the Printify product cost and Etsy fees. Buyer-paid shipping is shown separately below.</p></div><div className="pricing-heading-actions"><label className="whole-pricing-toggle"><input type="checkbox" checked={wholeNumberPricing} onChange={event=>toggleWholeNumberPricing(event.target.checked)}/><span aria-hidden="true"/><b>Create whole-number pricing</b></label><div className="profit-goal-control"><label>Profit goal<span className="money-input">$<input aria-label="Profit goal" type="number" min="0" step="0.01" value={pricing.targetProfit} onChange={event=>changeProfit(Number(event.target.value))}/></span><small>Prices update automatically.</small></label></div></div></div>{recommendationMessage&&<p className="recommendation-result" role="status">{recommendationMessage}</p>}
      <div className="price-group-list">{priceGroups.map(group=>{const groupPrices=group.items.map(variant=>prices[String(variant.id)]??variant.templatePrice),groupPrice=Math.max(...groupPrices),profits=group.items.map(variant=>estimatedProfit(groupPrice,variant.cost,pricing)),lowestProfit=Math.min(...profits),examples=group.items.map(item=>item.title).filter(Boolean);return <article className="price-group" key={group.cost}>
        <div className="price-group-row"><div className="price-group-variants"><b>{group.items.length} {group.items.length===1?"variant":"variants"}</b><small>{examples.slice(0,2).join(" · ")}{examples.length>2?` · +${examples.length-2} more`:""}</small></div><div><small>Printify product cost</small><b>${(group.cost/100).toFixed(2)}</b></div><div><small>Your item price</small><PriceField value={groupPrice} minimum={group.cost/100} label={`Price for all variants costing $${(group.cost/100).toFixed(2)}`} onCommit={cents=>changeCostGroupPrice(group.cost,cents)}/></div><div className={lowestProfit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}><small>Lowest estimated item profit</small><b>${lowestProfit.toFixed(2)}</b><small className="profit-fee-note">Shipping not included</small></div></div>
        <details className="price-group-details"><summary>View included variants or edit one separately</summary><div className="individual-variant-list">{group.items.map(variant=>{const itemCents=prices[String(variant.id)]??variant.templatePrice,profit=estimatedProfit(itemCents,variant.cost,pricing);return <div key={variant.id}><span><b>{variant.title}</b><small>Printify cost ${(variant.cost/100).toFixed(2)}</small></span><PriceField value={itemCents} minimum={variant.cost/100} label={`Individual price for ${variant.title}`} onCommit={cents=>changeIndividualPrice(variant,cents)}/><span className={profit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}><b>${profit.toFixed(2)} item profit</b><small>Shipping not included</small></span></div>})}</div></details>
      </article>})}</div>
      <details className="pricing-math"><summary>See how Goldie calculated these prices</summary><p>Each item-profit estimate includes the exact Printify product cost for that variant, your Etsy transaction and payment fees, and the listing fee. Buyer-paid shipping is configured separately below and is not included in this profit number. Offsite Ads and sales tax are excluded because they vary by order.</p><div className="fee-profile-summary"><span>{pricing.etsyFeePercent.toFixed(1)}% Etsy percentage fees</span><span>${pricing.fixedFee.toFixed(2)} payment fee</span><span>${pricing.listingFee.toFixed(2)} listing fee</span><a href="/usage" target="_blank" rel="noopener noreferrer">Change fee settings ↗</a></div></details>
      </section>
      <section className="shipping-pricing-section">
      <div className="pricing-section-heading shipping-section-heading"><div><div className="heading-with-help"><h4>2. Etsy shipping profile — what buyers pay <span>· {productName}</span></h4><ContextHelp label="Explain shipping profiles" title="Choose the shipping buyers will see on Etsy" intro="Goldie starts with the Etsy shipping profile attached to your saved product. You can keep it or create a new reusable copy for this batch." sections={[{heading:"Keep the saved profile",copy:"If the first-item, additional-item, and international rates are already correct, leave the selected profile unchanged."},{heading:"Create a custom profile",copy:"Open the optional custom-profile section, name the new profile, and edit any domestic or international charge. Goldie creates a copy. Your original Etsy profile is not changed."},{heading:"Understand first and additional item",copy:"First item is what a buyer pays for one product. Additional item is the extra shipping charge when the same order contains another eligible product."},{heading:"Separate from item profit",copy:"Shipping is configured here and charged to the buyer separately. It does not change the item-profit figures in the pricing section above."}]}/></div><p>Review the Etsy shipping profile that controls what buyers pay for every listing in this batch.</p></div></div>
      <div className="pricing-controls">
        <div className="shipping-profile-picker"><label className="shipping-profile-select"><span>Etsy shipping profile — what buyers pay</span>{profiles.length>20&&<input className="shipping-profile-search" type="search" value={profileSearch} placeholder={`Search ${profiles.length} shipping profiles`} aria-label="Search shipping profiles" onChange={event=>setProfileSearch(event.target.value)}/>}<select value={selectedProfileId||""} disabled={profilesLoading} onChange={event=>chooseProfile(Number(event.target.value))}><option value="">{profilesLoading?"Loading your shipping profiles…":"Choose your Etsy shipping profile"}</option>{selectedOutsideSearch&&<optgroup label="Current selection">{renderProfileOptions([selectedOutsideSearch])}</optgroup>}{attachedProfile&&(!normalizedProfileSearch||searchedProfiles.some(profile=>profile.id===attachedProfile.id))&&<optgroup label="Currently attached to this product">{renderProfileOptions([attachedProfile])}</optgroup>}{recommendedProfiles.length>0&&<optgroup label={`Recommended for ${productName}`}>{renderProfileOptions(recommendedProfiles)}</optgroup>}{relatedProfiles.length>0&&<optgroup label="Other apparel profiles">{renderProfileOptions(relatedProfiles)}</optgroup>}{otherProfiles.length>0&&<optgroup label="All other shipping profiles">{renderProfileOptions(otherProfiles)}</optgroup>}</select><small>{normalizedProfileSearch?`${searchedProfiles.length} matching profiles · clear search to see all ${profiles.length}`:"Current profile first · product matches next · every profile remains available"}</small></label>{normalizedProfileSearch&&!searchedProfiles.length&&<p className="shipping-profile-empty" role="status">No shipping profiles match “{profileSearch.trim()}”. Clear the search to see all profiles.</p>}</div>
      </div>
      {profilesError&&<div className="shipping-api-note error"><b>Shipping profiles could not be loaded.</b><span>{profilesError}</span></div>}
      {selectedProfile&&<>{selectedProfileNeedsReview&&<div className="shipping-profile-family-warning" role="status"><b>Double-check this profile for {productName}.</b><span>Its name does not clearly match this product type. Goldie has not changed it; confirm the buyer charges below before approving.</span></div>}<div className="shipping-quick-summary"><span><b>Etsy buyer charge · {selectedProfile.originCountry}</b> ${selectedProfile.domesticPrimary.toFixed(2)} first item · ${selectedProfile.domesticAdditional.toFixed(2)} additional</span><span><b>Printify shipping cost — what you pay</b> Up to ${printifyShipping.toFixed(2)} for the first item</span><span><b>International buyer charges</b> {selectedProfile.international.length?`${selectedProfile.international.length} rates saved`:"Not included"}</span></div>{shippingShortfall>.004?<div className="shipping-rate-warning" role="alert"><b>Your Etsy buyer charge is ${shippingShortfall.toFixed(2)} below Printify’s current shipping cost.</b><span>Printify may charge up to ${printifyShipping.toFixed(2)} while the buyer pays ${selectedProfile.domesticPrimary.toFixed(2)}. You would cover the difference. Shipping still remains separate from the item-profit calculation above.</span></div>:<div className="shipping-rate-confirmation"><b>✓ The Etsy buyer charge covers Printify’s current shipping cost.</b><span>Shipping remains separate from the item-profit calculation above.</span></div>}</>}
      {selectedProfile&&<details className="custom-shipping-builder"><summary>{customDirty?"⚠ Unsaved shipping changes":"Create a custom shipping profile (optional)"}</summary><div className="custom-shipping-body"><div className="shipping-builder-intro"><b>Create a copy. Your original profile will not change.</b><span>Name it, adjust any rates you want, then save it. Goldie will select the new profile for this batch.</span></div><label><span>1. Name your new shipping profile<small>This name will appear in Etsy and in Goldie next time.</small></span><b className="shipping-profile-name-label">Profile name</b><input aria-label="New shipping profile name" placeholder={`Example: ${selectedProfile.title}, $4 US shipping`} value={customProfileName} maxLength={60} onChange={event=>{setCustomProfileName(event.target.value);markShippingEdit()}}/></label><h5>2. Edit {selectedProfile.originCountry} shipping</h5><div className="shipping-rate-row"><b>Domestic</b><label>First item<span className="money-input">$<input inputMode="decimal" value={customCharge} onChange={event=>{setCustomCharge(event.target.value);markShippingEdit()}}/></span></label><label>Additional<span className="money-input">$<input inputMode="decimal" value={customAdditional} onChange={event=>{setCustomAdditional(event.target.value);markShippingEdit()}}/></span></label></div><details className="international-shipping-editor"><summary>3. Edit international rates (optional) · {customInternational.length} destinations</summary>{customInternational.length?<div className="international-rate-list">{customInternational.map((rate,index)=><div className="shipping-rate-row" key={rate.key}><b>{rate.label}</b><label>First item<span className="money-input">$<input aria-label={`${rate.label} first item`} inputMode="decimal" value={rate.primary} onChange={event=>changeInternational(index,"primary",event.target.value)}/></span></label><label>Additional<span className="money-input">$<input aria-label={`${rate.label} additional item`} inputMode="decimal" value={rate.additional} onChange={event=>changeInternational(index,"additional",event.target.value)}/></span></label></div>)}</div>:<p className="no-international-rates">No international destinations.</p>}</details>{customDirty?<div className="custom-shipping-actions"><button aria-busy={savingProfile} disabled={savingProfile} onClick={()=>void createProfile()}>{savingProfile?"Saving shipping profile…":"Save new shipping profile"}</button><button type="button" disabled={savingProfile} onClick={()=>resetProfileEditor()}>Discard changes</button></div>:<div className="shipping-saved-state">No changes made.</div>}{profileMessage&&<small role="status">{profileMessage}</small>}</div></details>}
      <button type="button" className={`pricing-approval-button ${approved?"approved":""}`} disabled={!selectedProfile||customDirty} onClick={()=>onApprovalChange(true)}>{approved?"✓ Prices and shipping approved":"Approve prices and shipping"}</button>
      </section>
    </section>
  );
}

async function fetchWithDeadline(input: RequestInfo | URL, init: RequestInit, milliseconds: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), milliseconds);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (error) {
    if (controller.signal.aborted) throw new Error("The request took too long and was stopped safely.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}

function friendlyUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const supportReference = message.match(/Support reference:\s*([A-Z0-9-]+)/i)?.[1];
  const withReference = (text: string) => `${text}${supportReference ? ` Support reference: ${supportReference}.` : ""}`;
  if (/8253|Provided images do not exist|did not finish (?:processing|registering)/i.test(message)) return withReference("Printify has not finished registering this design after one minute. Keep the successful drafts and use Retry failed designs when the batch finishes.");
  if (/image could not be decoded|could not be read|invalidstateerror|source image could not be decoded/i.test(message)) return withReference("Goldie can see this filename, but cannot read the actual image. Download it fully to your computer, then upload it again as a PNG or JPG.");
  if (/failed to fetch|networkerror|load failed|secure artwork delivery|temporarily unavailable/i.test(message)) return withReference("The upload connection was interrupted. Goldie retried automatically, but Printify still could not receive this design. Retry it when the batch finishes.");
  if (/request took too long|still completing this exact draft/i.test(message)) return withReference("This draft took longer than the safe waiting period. Goldie recorded it so a retry will recover the same draft instead of creating a duplicate.");
  if (/batch session expired/i.test(message)) return withReference("The protected batch session expired. Load the same Printify template again; your selected files will stay on this page.");
  if (/401|token|unauthorized|not accept/i.test(message)) return withReference("Printify rejected the saved connection. Disconnect Printify, create a new token with all scopes, and reconnect.");
  if (/template product was not found|not found in the connected Printify/i.test(message)) return withReference("This template belongs to a different Printify account or shop than the connected token.");
  if (/8150|validation failed|print_areas|placeholder/i.test(message)) return withReference("Printify rejected this template’s print-area setup. Reload the template; if it continues, use a freshly saved copy of the Printify product.");
  if (/429|longer than expected|rate limit/i.test(message)) return withReference("Printify is temporarily limiting requests. Goldie already waited and retried; retry this design when the batch finishes.");
  if (/413|post data is too large|file is too large/i.test(message)) return withReference("This design is still too large for Printify after safe preparation. Export an optimized PNG or JPG under 40 MB; keep the pixel dimensions needed for 300 DPI.");
  return message || "Goldie could not create this draft. Retry it when the batch finishes.";
}

export default function ListingFactoryApp() {
  const folderPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const sizeGuidePicker = useRef<HTMLInputElement>(null);
  const listingResultsRef = useRef<HTMLDivElement>(null);
  const syncedListingSignatures = useRef<Map<string,string>>(new Map());
  const batchIdRef=useRef("");
  const snapshotReady=useRef(false);
  const resumeAttempted=useRef(false);
  const draftRunActive=useRef(false);
  const templateLoadVersion=useRef(0);
  const etsyPreparationVersion=useRef(0);
  const etsyPreparationActive=useRef(false);
  const etsySaveActive=useRef(false);
  const etsyProductBaseline=useRef<{taxonomyId?:number;category:string;attributes:Record<string,string>}|null>(null);
  const connectionAutoSkip=useRef(false);
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState("");
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [template, setTemplate] = useState("");
  const [templateDetails, setTemplateDetails] = useState<TemplateDetails | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [fileNotice,setFileNotice]=useState("");
  const [fileError, setFileError] = useState("");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [openedDrafts, setOpenedDrafts] = useState<string[]>([]);
  const [openAllMessage, setOpenAllMessage] = useState("");
  const [owner, setOwner] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [localPreview,setLocalPreview]=useState(false);
  const [preparationMessage, setPreparationMessage] = useState("");
  const [runTotal, setRunTotal] = useState(0);
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [mockupTheme, setMockupTheme] = useState("");
  const [savingProductDefault,setSavingProductDefault]=useState("");
  const [bulkTitles, setBulkTitles] = useState("");
  const [activeDesign, setActiveDesign] = useState<string>("");
  const [activeRecipe,setActiveRecipe]=useState<Recipe|null>(null);
  const [activeBundle,setActiveBundle]=useState<ProductBundle|null>(null);
  const [bundleRecipes,setBundleRecipes]=useState<Recipe[]>([]);
  const [bundleIndex,setBundleIndex]=useState(0);
  const [bundleColorProducts,setBundleColorProducts]=useState<Record<string,TemplateDetails>>({});
  const [bundleColorChoices,setBundleColorChoices]=useState<Record<string,number[]>>({}),[bundleSizeChoices,setBundleSizeChoices]=useState<Record<string,number[]>>({}),[bundleMockupChoices,setBundleMockupChoices]=useState<Record<string,{theme:string;ids:string[]}>>({}),[bundleKeywordChoices,setBundleKeywordChoices]=useState<Record<string,string>>({});
  const [bundleQualityDecisions,setBundleQualityDecisions]=useState<Record<string,"include"|"exclude">>({});
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [printifyImageIndices,setPrintifyImageIndices]=useState<number[]>([]);
  const [printifyImageSelections,setPrintifyImageSelections]=useState<Record<string,number[]>>({});
  const [sharedMockups,setSharedMockups]=useState<{theme:string;ids:string[]}|undefined>();
  const [preparingEtsy,setPreparingEtsy]=useState(false);
  const [preparingListingId,setPreparingListingId]=useState("");
  const [savingEtsyDetails,setSavingEtsyDetails]=useState(false);
  const [workflowStep,setWorkflowStep]=useState<WorkflowStep>("connect");
  const [restoringBatch,setRestoringBatch]=useState(true);
  const [resumeProcessing,setResumeProcessing]=useState(false);
  const [finishPhase,setFinishPhase]=useState<FinishPhase>("details");
  const [uploadNoticeOpen,setUploadNoticeOpen]=useState(false);
  const [leaveTarget,setLeaveTarget]=useState("");
  const [publishConfirmOpen,setPublishConfirmOpen]=useState(false);
  const [draftSaveOpen,setDraftSaveOpen]=useState(false);
  const [draftSavedOpen,setDraftSavedOpen]=useState(false);
  const [restartBatchOpen,setRestartBatchOpen]=useState(false);
  const [restartBatchName,setRestartBatchName]=useState("");
  const [restartingBatch,setRestartingBatch]=useState(false);
  const [batchDisplayName,setBatchDisplayName]=useState("");
  const [savingDraftBatch,setSavingDraftBatch]=useState(false);
  const [keptAsDrafts,setKeptAsDrafts]=useState(false);
  const [titleJoiner,setTitleJoiner]=useState(", ");
  const [titleCaps,setTitleCaps]=useState(true);
  const [variantPrices,setVariantPrices]=useState<Record<string,number>>({});
  const [selectedColorIds,setSelectedColorIds]=useState<number[]>([]);
  const [rememberingColors,setRememberingColors]=useState(false);
  const [colorsRemembered,setColorsRemembered]=useState(false);
  const [selectedSizeIds,setSelectedSizeIds]=useState<number[]>([]);
  const [openFacet,setOpenFacet]=useState<Record<string,string>>({});
  const [bestPhoto,setBestPhoto]=useState<Record<string,string>>({});
  /* D206 · With a three-product bundle selected, the connected-product row
   * described a single member: "Unisex Midweight Softstyle Fleece Hoodie ·
   * 4 colors × 8 sizes". templateDetails holds whichever product is active, and
   * for a bundle that is just the first one, so the row silently spoke for the
   * whole bundle while naming one garment and one garment's colour count.
   * A bundle is not its first member — say what was actually selected. */
  const bundleSelected=Boolean(activeBundle&&bundleRecipes.length>1);
  /* D205 · Bumped after every establish() so the saved-product tiles refetch. */
  const [savedRevision,setSavedRevision]=useState(0);
  const photoProbe=useRef<Set<string>>(new Set());
  function pickProductPhoto(product:TemplateDetails){
    const candidates=(product.previewImages||[]).filter(Boolean);
    if(candidates.length<2)return product.previewImage||candidates[0]||"";
    const key=String(product.id);
    if(bestPhoto[key])return bestPhoto[key];
    if(!photoProbe.current.has(key)){
      photoProbe.current.add(key);
      void (async()=>{
        /* D200 · Score every candidate on subject isolation, not on how much of
           the frame it fills. See app/product-photo.ts for the measurements —
           the old "most ink wins" rule selected a macro shot of a folded corner
           and ranked the only usable flat lay last. All six are sampled now,
           not four: the winning tee shot was candidate #2 but the hoodie's was
           #4, so a slice(0,4) would have missed it. */
        let winner=candidates[0],bestScore=-Infinity;
        for(const src of candidates.slice(0,6)){
          const score=await new Promise<number>(resolve=>{
            const image=document.createElement("img"); image.crossOrigin="anonymous";
            image.onload=()=>{try{
              const size=PHOTO_SAMPLE_SIZE;
              const canvas=document.createElement("canvas"); canvas.width=size; canvas.height=size;
              const ctx=canvas.getContext("2d",{willReadFrequently:true});
              if(!ctx)return resolve(-Infinity);
              ctx.drawImage(image,0,0,size,size);
              resolve(photoStats(ctx.getImageData(0,0,size,size).data,size).score);
            }catch{resolve(-Infinity)}};
            image.onerror=()=>resolve(-Infinity);
            image.src=src;
          });
          if(score>bestScore){bestScore=score;winner=src}
        }
        setBestPhoto(current=>({...current,[key]:winner}));
      })();
    }
    return product.previewImage||candidates[0]||"";
  }
  const [keywordBanks,setKeywordBanks]=useState<Array<{id:string;name:string}>>([]);
  const [mockupLibrary,setMockupLibrary]=useState<Array<{theme:string;surfaceKind:string}>>([]);
  useEffect(()=>{void fetch("/api/keyword-lists").then(r=>r.json()).then((payload:{lists?:Array<{id?:string;name?:string}>})=>setKeywordBanks((payload.lists||[]).map(list=>({id:String(list.id||""),name:String(list.name||"Bank")})).filter(list=>list.id))).catch(()=>undefined);
    void fetch("/api/mockups/library").then(r=>r.json()).then((payload:{templates?:Array<{theme?:string;surfaceKind?:string}>})=>setMockupLibrary((payload.templates||[]).map(item=>({theme:String(item.theme||"").trim(),surfaceKind:String(item.surfaceKind||"rigid-flat")})).filter(item=>item.theme))).catch(()=>undefined)},[]);
  /* Readiness is computed per product, never read from setupComplete. */
  function readinessFor(product:TemplateDetails,recipe:Recipe|null):Readiness{
    const compatible=[...new Set(mockupLibrary.filter(item=>productAcceptsMockup(item.surfaceKind,product.blueprintTitle)).map(item=>item.theme))];
    return productReadiness({colorOptions:product.colorOptions||[],sizeOptions:product.sizeOptions||[],compatibleMockupThemes:compatible,keywordBanks,
      shippingProfiles:etsyShippingProfiles.map(profile=>({id:profile.id,title:friendlyShippingProfileTitle(profile.title)||String(profile.id)})),
      templateShippingProfileId:Number(product.shippingTemplateId)||0,
      etsyFieldsRequired:11,
      saved:{defaultColorIds:recipe?.defaultColorIds,defaultSizeIds:recipe?.defaultSizeIds,defaultMockupTheme:recipe?.defaultMockupTheme,mockupIds:recipe?.mockupIds,keywordListId:recipe?.keywordListId,
        etsyShippingProfileId:recipe?.etsyShippingProfileId,defaultProfitTarget:recipe?.defaultProfitTarget,etsyDefaults:recipe?.etsyDefaults}});
  }

  /* D204 · The connected-product line reported selectedColorIds/selectedSizeIds,
   * which are seeded from the Printify template's enabled variants long before
   * the seller answers anything. On an unestablished hoodie that produced three
   * different numbers for the same facts on one screen: the line claimed
   * "4 colors × 6 sizes", the Colors row said "Pick colors · 25 available", and
   * the Sizes row offered 8. Template defaults are Printify's doing, not a
   * choice — presenting them as chosen is the exact failure that would publish
   * listings in colours the seller never picked.
   *
   * The line now asks the same readiness the rows do, so the two cannot
   * disagree: chosen facets report the choice, unanswered ones report what is
   * available. */
  function summaryAxes(product:TemplateDetails,recipe:Recipe|null){
    const readiness=readinessFor(product,recipe);
    const asked=new Set(readiness.questions);
    return {
      colorsChosen:!asked.has("colors"),
      sizesChosen:!asked.has("sizes"),
      colors:selectedColorIds.length,
      sizes:selectedSizeIds.length,
      availableColors:(product.colorOptions||[]).filter(color=>color.available).length,
      availableSizes:(product.sizeOptions||[]).filter(size=>size.available).length,
      total:pricedVariants.length,
    };
  }
  /* A choice made in the batch IS the product being established, so it is saved
     to the recipe immediately rather than behind a separate "save as default". */
  async function establish(recipe:Recipe,change:Partial<Recipe>){
    const updated={...recipe,...change};
    if(activeRecipe&&activeRecipe.id===recipe.id)setActiveRecipe(updated);
    setBundleRecipes(current=>current.map(item=>item.id===recipe.id?updated:item));
    await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)}).catch(()=>undefined);
    /* The saved-product tiles read a list fetched once on mount, so without this
       the card kept saying "No details saved yet" about a product we had just
       written colors and sizes to. */
    setSavedRevision(current=>current+1);
  }
  const [rememberingSizes,setRememberingSizes]=useState(false);
  const [sizesRemembered,setSizesRemembered]=useState(false);
  const [etsyShippingProfiles,setEtsyShippingProfiles]=useState<EtsyShippingProfile[]>([]);
  const [etsyShippingProfileId,setEtsyShippingProfileId]=useState(0);
  const [shippingProfilesLoading,setShippingProfilesLoading]=useState(false);
  const [shippingProfilesError,setShippingProfilesError]=useState("");
  const [pricingApproved,setPricingApproved]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [publishMessage,setPublishMessage]=useState("");
  const [selectedPublishIds,setSelectedPublishIds]=useState<string[]>([]);
  const [batchReceipt,setBatchReceipt]=useState<BatchReceipt|null>(null);
  const [titleBuilding,setTitleBuilding]=useState(false);
  const [titleBuildMessage,setTitleBuildMessage]=useState("");
  const [batchKeywords,setBatchKeywords]=useState<string[]>([]);
  const [titleBuilderMode,setTitleBuilderMode]=useState<"ai"|"manual">("ai");
  const [autoTitleBank,setAutoTitleBank]=useState<KeywordList|null>(null);
  const [autoTitleBankId,setAutoTitleBankId]=useState("");
  const [manualKeywordBankId,setManualKeywordBankId]=useState("");
  const [blockingModal,setBlockingModal]=useState<{title:string;issues:string[];copy?:string}|null>(null);
  const [pixelWarningOpen,setPixelWarningOpen]=useState(false);
  const [etsyConnected,setEtsyConnected]=useState(false);
  const [etsyShop,setEtsyShop]=useState("");
  const [etsyConnecting,setEtsyConnecting]=useState(false);
  const [etsyError,setEtsyError]=useState("");
  const [etsyCategories,setEtsyCategories]=useState<EtsyCategoryOption[]>([]);
  const [pendingCategoryChange,setPendingCategoryChange]=useState<PendingCategoryChange|null>(null);
  const [sizeGuideName,setSizeGuideName]=useState("");
  const [sizeGuideStatus,setSizeGuideStatus]=useState("");
  const commandCenterData=null;
  const [sidebarUsage,setSidebarUsage]=useState<{used:number;limit:number}|null>(null);
  const [preparedMockupCounts,setPreparedMockupCounts]=useState<Record<string,number>>({});
  const [imageStepError,setImageStepError]=useState("");
  const [missingPhotoDraftIds,setMissingPhotoDraftIds]=useState<string[]>([]);
  const [titlePulseIds,setTitlePulseIds]=useState<Set<string>>(new Set());

  useEffect(()=>{if(imageStepError&&allCreatedListingsHaveImages())setImageStepError("")},[imageStepError,printifyImageIndices,printifyImageSelections,preparedMockupCounts,drafts]);
  useEffect(()=>{if(finishPhase!=="etsy"||etsyCategories.length)return;const restored=files.find(file=>file.etsy)?.etsy;if(!restored)return;void resolveEtsyOptions(restored,restored.taxonomyId).catch(()=>undefined)},[finishPhase,etsyCategories.length,files]);
  useEffect(()=>{if(finishPhase!=="mockups"||printifyImageIndices.length||Object.keys(printifyImageSelections).length)return;const guide=productPhotoGuide(templateDetails?.blueprintTitle||"",drafts.find(draft=>draft.printifyImages?.length)?.printifyImages?.length||0),defaults=Object.fromEntries(drafts.filter(draft=>draft.id&&draft.status==="Created"&&draft.printifyImages?.length).map(draft=>[draft.id!,Array.from({length:Math.min(guide.count,draft.printifyImages!.length)},(_,index)=>index)]));if(Object.keys(defaults).length)setPrintifyImageSelections(defaults)},[finishPhase,printifyImageIndices.length,printifyImageSelections,drafts,templateDetails?.blueprintTitle]);
  useEffect(()=>{const created=drafts.filter(draft=>draft.status==="Created"&&draft.id).map(draft=>draft.id!);setSelectedPublishIds(current=>[...new Set([...current.filter(id=>created.includes(id)),...created])])},[drafts]);
  useEffect(()=>{const select=(event:Event)=>setSelectedPublishIds((event as CustomEvent<string[]>).detail||[]),retry=(event:Event)=>{const clientId=(event as CustomEvent<string>).detail;const design=files.find(file=>file.id===clientId);if(design)void runDrafts([design],true)};window.addEventListener("goldie-publish-selection",select);window.addEventListener("goldie-retry-listing",retry);return()=>{window.removeEventListener("goldie-publish-selection",select);window.removeEventListener("goldie-retry-listing",retry)}},[files,drafts]);

  const templateLoaded = templateDetails !== null;
  const productSelected = Boolean(activeRecipe);
  const currentProductName=activeRecipe?.name||templateDetails?.blueprintTitle||"This product";
  const ready = connected && productSelected && templateLoaded && files.length > 0;
  const missingRequirement = !connected ? "Connect Printify first" : !productSelected ? "Choose or add a saved product" : !templateLoaded ? "Connect its Printify template" : files.length === 0 ? "Add at least one design" : "";
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const designsReady=useMemo(()=>files.filter(file=>Boolean(file.width&&file.height&&file.paddingStatus!=="checking")).length,[files]);
  const designsPreparing=Math.max(0,files.length-designsReady);
  const designsFinished=files.length>0&&designsPreparing===0;
  const progressIndex = workflowStep==="finish" ? finishPhase==="details"?5:finishPhase==="etsy"?6:finishPhase==="mockups"?7:8 : workflowStep==="connect"?0:workflowStep==="setup"?1:workflowStep==="designs"?2:(preflightOpen||running)?4:3;
  // The guided factory always opens on the real connection step. The returning
  // dashboard remains available as a component, but must never replace step 1
  // or appear when a seller uses Back from the product step.
  const returningHome=false;
  useEffect(()=>{fetch("/api/usage").then(async response=>{if(!response.ok)return null;return response.json() as Promise<{usage?:{drafts?:number};plan?:{drafts?:number}}>}).then(result=>{if(result?.usage&&result.plan)setSidebarUsage({used:Number(result.usage.drafts||0),limit:Number(result.plan.drafts||100)})}).catch(()=>undefined)},[]);
  const bundleProductCount=activeBundle?Math.max(1,bundleRecipes.length):1;
  const planDraftsRemaining=sidebarUsage?Math.max(0,sidebarUsage.limit-sidebarUsage.used):null;
  const batchDesignLimit=Math.min(MAX_BATCH_FILES,planDraftsRemaining===null?MAX_BATCH_FILES:Math.floor(planDraftsRemaining/bundleProductCount));
  const requestedListingCount=Math.max(0,files.length*bundleProductCount-Object.values(bundleQualityDecisions).filter(value=>value==="exclude").length);
  const additionalDesignsAvailable=Math.max(0,batchDesignLimit-files.length);
  const pricedVariants=useMemo(()=>{
    const variants=templateDetails?.variants||[];
    const byColor=!templateDetails?.colorOptions?.length?variants:(()=>{const selected=new Set(selectedColorIds);return variants.filter(variant=>variant.colorId==null||selected.has(variant.colorId))})();
    /* Batches saved before sizes were selectable restore a templateDetails with no
       sizeOptions, and their variants carry no sizeId — so they fall straight
       through here and behave exactly as they did before. */
    if(!templateDetails?.sizeOptions?.length)return byColor;
    const chosen=new Set(selectedSizeIds);
    /* Never let the size axis empty the variant set. An empty selection would
       price nothing and enable nothing on the Printify draft, which is the one
       failure here that costs money rather than looks wrong. */
    if(!chosen.size)return byColor;
    const bySize=byColor.filter(variant=>variant.sizeId==null||chosen.has(variant.sizeId));
    return bySize.length?bySize:byColor;
  },[templateDetails,selectedColorIds,selectedSizeIds]);
  useEffect(()=>{if(!templateDetails?.id||!selectedColorIds.length)return;window.localStorage.setItem(`goldie-colors-${templateDetails.id}`,JSON.stringify(selectedColorIds))},[templateDetails?.id,selectedColorIds]);
  useEffect(()=>{if(!templateDetails?.id||!selectedSizeIds.length)return;window.localStorage.setItem(`goldie-sizes-${templateDetails.id}`,JSON.stringify(selectedSizeIds))},[templateDetails?.id,selectedSizeIds]);
  const createdDraftCount=drafts.filter(draft=>draft.status==="Created").length,titleCount=files.filter(file=>file.title.trim()).length,etsyReadyCount=files.filter(file=>file.etsy).length;
  const lowDpiCount=files.filter(file=>{
    const details=templateDetails,fileWidth=Number(file.width||0);
    if(!details||!fileWidth)return false;
    const printWidth=Number(details.maxPrintWidth||0),placementScale=Number(details.placementScale||0);
    if(!printWidth||!placementScale)return false;
    const scale=isRigidPaperProduct(details)?Math.min(placementScale,1):placementScale;
    const quality=printifyDpi(fileWidth,printWidth,scale);
    return Boolean(quality&&quality.dpi<300);
  }).length;
  const recommendedPixelSize=useMemo(()=>{const scale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale||0;return {width:Math.round((templateDetails?.maxPrintWidth||0)*scale),height:Math.round((templateDetails?.maxPrintHeight||0)*scale)}},[templateDetails]);
  const belowRecommendedPixels=useMemo(()=>{if(!recommendedPixelSize.width||!recommendedPixelSize.height)return [];return files.filter(file=>Boolean(file.width&&file.height&&(file.width<recommendedPixelSize.width||file.height<recommendedPixelSize.height)))},[files,recommendedPixelSize]);
  const criticalDpiFiles=useMemo(()=>{const scale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale||0,printWidth=templateDetails?.maxPrintWidth||0;if(!scale||!printWidth)return [];return files.map(file=>({file,dpi:file.width?printifyDpi(file.width,printWidth,scale)?.dpi||0:0})).filter(item=>item.dpi>0&&item.dpi<215)},[files,templateDetails]);
  const bundleQualityIssues=useMemo(()=>activeBundle?files.flatMap(file=>bundleRecipes.flatMap(recipe=>{const details=bundleColorProducts[recipe.id];if(!details||!file.width||!file.height)return [];const scale=isRigidPaperProduct(details)?Math.min(details.placementScale||1,1):details.placementScale||1,requiredWidth=Math.round((details.maxPrintWidth||0)*scale),requiredHeight=Math.round((details.maxPrintHeight||0)*scale),dpi=printifyDpi(file.width,details.maxPrintWidth||0,scale)?.dpi||0;if(!requiredWidth||!requiredHeight||file.width>=requiredWidth&&file.height>=requiredHeight)return [];return [{key:`${recipe.id}:${file.id}`,fileId:file.id,fileName:file.name,recipeId:recipe.id,productName:recipe.name,requiredWidth,requiredHeight,actualWidth:file.width,actualHeight:file.height,dpi,critical:dpi>0&&dpi<215}] })):[],[activeBundle,files,bundleRecipes,bundleColorProducts]);

  /* One flagged pair per design AND per product meant a 3-design bundle across 3
     products asked for up to 9 separate acknowledgements — Brittany hit 6 and
     could not continue until every one was clicked. The per-product detail is
     real (the same art can be sharp on a tee and too small on a tote), but the
     DECISION belongs to the design. Group the pairs by design so one choice
     settles every product it affects, and offer a bulk control for the common
     case where the answer is the same for all of them. Excluding still only
     removes the flagged pairs, so a design that is fine on one product still
     publishes there. */
  const bundleQualityGroups=useMemo(()=>{
    const byFile=new Map<string,{fileId:string;fileName:string;keys:string[];products:string[];critical:boolean;worstDpi:number;actualWidth:number;actualHeight:number}>();
    for(const issue of bundleQualityIssues){
      const existing=byFile.get(issue.fileId);
      if(existing){existing.keys.push(issue.key);existing.products.push(issue.productName);existing.critical=existing.critical||issue.critical;if(issue.dpi&&(!existing.worstDpi||issue.dpi<existing.worstDpi))existing.worstDpi=issue.dpi;}
      else byFile.set(issue.fileId,{fileId:issue.fileId,fileName:issue.fileName,keys:[issue.key],products:[issue.productName],critical:issue.critical,worstDpi:issue.dpi||0,actualWidth:issue.actualWidth,actualHeight:issue.actualHeight});
    }
    return [...byFile.values()];
  },[bundleQualityIssues]);
  function decideQualityGroup(keys:string[],value:"include"|"exclude"){setBundleQualityDecisions(current=>{const next={...current};for(const key of keys)next[key]=value;return next})}
  function decideAllQuality(value:"include"|"exclude"){decideQualityGroup(bundleQualityIssues.map(issue=>issue.key),value)}
  const qualityGroupDecision=(keys:string[])=>{const values=keys.map(key=>bundleQualityDecisions[key]);return values.every(v=>v==="include")?"include":values.every(v=>v==="exclude")?"exclude":""};
  function createdListingsMissingImages(source=drafts){return source.filter(draft=>draft.status==="Created"&&draft.id&&!(printifyImageSelections[draft.id]??printifyImageIndices).length&&!(preparedMockupCounts[draft.id]||0))}
  function allCreatedListingsHaveImages(source=drafts){const created=source.filter(draft=>draft.status==="Created"&&draft.id);return created.length>0&&createdListingsMissingImages(source).length===0}
  function selectedPublishDrafts(){const selected=new Set(selectedPublishIds);return drafts.filter(draft=>draft.status==="Created"&&draft.id&&selected.has(draft.id))}
  function suggestedBatchName(){const product=activeRecipe?.name||templateDetails?.blueprintTitle||"Listing batch",niche=files[0]?.tags?.[0]||files[0]?.title?.split(",")[0]?.trim()||"New designs",date=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(new Date());return `${product} · ${niche} · ${date}`.slice(0,160)}
  function batchStateSnapshot(){const designs=files.map(({file:ignoredFile,previewUrl:ignoredPreview,...design})=>design);return {template,templateDetails,description,pricing,selectedColorIds,selectedSizeIds,variantPrices,etsyShippingProfileId,pricingApproved,mockupTheme,activeRecipe,activeBundle,bundleRecipes,bundleIndex,designs,drafts,complete,finishPhase,bulkTitles,batchKeywords,titleJoiner,titleBuilderMode,autoTitleBankId,manualKeywordBankId,sharedMockups,preparedMockupCounts,printifyImageIndices,printifyImageSelections,sizeGuideName,keptAsDrafts,batchReceipt}}
  async function saveDraftBatch(){const name=batchDisplayName.trim();if(!name)return;setSavingDraftBatch(true);try{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);await saveBatchFiles(id,files.map(file=>file.file));if(!localPreview){const response=await fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:"draft",step:"finish",setupName:name,productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{...batchStateSnapshot(),keptAsDrafts:true}})});if(!response.ok)throw new Error("Goldie could not save this batch.")}setKeptAsDrafts(true);setDraftSaveOpen(false);setDraftSavedOpen(true)}catch(error){stopWith("This batch was not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setSavingDraftBatch(false)}}
  function jumpToMissingPhotoListing(clientId:string){setMissingPhotoDraftIds([]);window.setTimeout(()=>document.getElementById(`listing-images-${clientId}`)?.scrollIntoView({block:"start"}),0)}
  function continueFromDesigns(){if(belowRecommendedPixels.length){setPixelWarningOpen(true);return}goToStep("review")}
  const railInFinish=progressIndex>=RAIL_FINISH_FIRST;
  const railTopNumber=railInFinish?RAIL_TOP.length+1:Math.max(1,RAIL_TOP.indexOf(Math.min(progressIndex,RAIL_PRICING))+1);
  function gateState():NavigationGateState{return {connected,etsyConnected,productSelected,templateReady:templateLoaded,shippingReady:Boolean(templateDetails?.shippingTemplateId||templateDetails?.shippingProfileNeedsSelection),variantsReady:Boolean(templateDetails?.enabledVariants),colorsReady:!templateDetails?.colorOptions?.length||selectedColorIds.length>0,pricesReady:pricedVariants.length>0,designCount:files.length,designsReady:files.every(file=>Boolean(file.width&&file.height&&file.paddingStatus!=="checking")),etsyShippingProfileReady:Boolean(etsyShippingProfileId),pricingApproved,draftsComplete:complete,createdDraftCount,titlesReady:files.length>0&&files.every(file=>Boolean(file.title.trim())&&!file.titleError),tagsReady:files.length>0&&files.every(file=>file.tags.length>0&&!file.titleError),descriptionReady:Boolean(description.trim()),etsyDetailsReady:files.length>0&&files.every(file=>Boolean(file.etsy)),personalizationReady:files.every(file=>!personalizationProblem(file.etsy)),imagesReady:allCreatedListingsHaveImages()}}
  function progressGateIssues(index:number){return localPreview?[]:navigationIssues(index,gateState())}
  function progressStatus(index:number,active:boolean,done:boolean,blocked:boolean){const live=active||!blocked;if(index===0)return connected?"Printify connected":live?"Connect your account":"Not connected";if(index===1)return templateDetails?templateDetails.blueprintTitle:live?"Choose a saved product":"Complete the prior step";if(index===2)return files.length?`${files.length} designs ready`:live?"Add finished designs":"Complete the prior step";if(index===3)return pricingApproved?(pricedVariants.length?`${pricedVariants.length} variants approved`:"Pricing approved"):live?"Review every variant":"Complete the prior step";if(index===4)return complete?`${createdDraftCount} drafts created`:live&&running?`${processed} of ${runTotal} created`:ready?"Ready to create":"Complete the prior step";if(index===5)return titleCount===files.length&&files.length?`${titleCount} titles complete`:live?`${titleCount} of ${files.length} titles complete`:done?"Titles complete":"Complete the prior step";if(index===6)return etsyReadyCount===files.length&&files.length?`${etsyReadyCount} listings ready`:live?`${etsyReadyCount} of ${files.length} ready`:done?"Etsy details complete":"Complete the prior step";if(index===7)return done?"Listing images reviewed":live?`${createdDraftCount} previews ready`:"Complete the prior step";return batchReceipt?`${batchReceipt.publishedCount} listings published`:live?"Ready to publish":"Complete the prior step"}
  function currentInsight(){if(progressIndex===1)return activeRecipe?`You used ${activeRecipe.name} recently. Its product facts and saved Etsy shipping profile will carry into this batch.`:"Choose a saved product once and Goldie will reuse its placement, variants, costs, and description.";if(progressIndex===2)return files.length?lowDpiCount?`${lowDpiCount} ${lowDpiCount===1?"design is":"designs are"} below 300 DPI at the largest enabled size. Review the DPI label before creating drafts.`:`All ${files.length} designs are loaded. Goldie will preserve their original artwork resolution.`:"Add finished artwork and Goldie will check each design against the real Printify print size.";if(progressIndex===3)return pricingApproved?`All ${pricedVariants.length} enabled variants are approved. Goldie will keep those cost-grouped prices across every listing.`:"Goldie is calculating each enabled variant from its own product cost, Etsy fees, and your target profit. Buyer-paid shipping is handled separately.";if(progressIndex===4)return running?`${processed} of ${runTotal} Printify drafts are complete. Successful drafts will not be duplicated if a retry is needed.`:"Goldie is ready to create one unpublished Printify draft for every design.";if(progressIndex===5)return `Goldie selects only exact phrases from your validated eRank keyword bank and creates matching Etsy tags. It never invents keywords.`;if(progressIndex===6)return `${etsyReadyCount} of ${files.length} listings have product-specific Etsy categories and attributes ready for review.`;if(progressIndex===7)return `The Printify preview is the placement reference. Apply one flatlay selection to the batch when the listings use the same product setup.`;return batchReceipt?`The batch is complete and every Etsy link is recorded below.`:"Every required section is ready. Publishing will send these listings live, not to Etsy drafts."}
  async function loadPreviewDemo(){
    const imageResponse=await fetch('/mockups/pink-dorm-01-leaning-frame.png'),blob=await imageResponse.blob(),file=new File([blob],'western-poster.png',{type:blob.type||'image/png'}),secondFile=new File([blob],'cowgirl-poster.png',{type:blob.type||'image/png'});
    const details:TemplateDetails={id:'preview-poster',batchId:'preview-batch',title:'Matte vertical poster',description:'Museum-quality poster printed on premium matte paper.\n\nMade to order and carefully packaged for shipping.',blueprintId:1,blueprintTitle:'Matte Vertical Poster',brand:'Generic brand',model:'Matte Vertical Poster',provider:'Sensaria',enabledVariants:6,variants:[{id:101,title:'Black / 8×10',cost:650,templatePrice:1600,shipping:6.22},{id:104,title:'White / 8×10',cost:650,templatePrice:1600,shipping:6.22},{id:106,title:'Natural / 8×10',cost:675,templatePrice:1650,shipping:6.22},{id:102,title:'Black / 12×18',cost:1025,templatePrice:2400,shipping:6.22},{id:105,title:'White / 12×18',cost:1025,templatePrice:2400,shipping:6.22},{id:103,title:'24×36',cost:1850,templatePrice:3800,shipping:6.22}],shop:'Preview shop',standardShipping:6.22,shippingCurrency:'USD',shippingTemplateId:'9001',freeShipping:false,maxPrintWidth:7200,maxPrintHeight:10800,placementScale:1};
    const previewCategory:EtsyCategoryOption={id:1,path:'Home & Living · Wall Decor · Prints'};
    const etsy:EtsyDetails={category:previewCategory.path,taxonomyId:previewCategory.id,properties:[],attributes:{},optional:{},blurb:'',confidence:'high'};
    const previewFiles:DesignFile[]=[{name:file.name,size:file.size,id:'preview-design-1',file,previewUrl:URL.createObjectURL(file),title:'western wall art, cowgirl poster, pink western decor',tags:['western wall art','cowgirl poster','pink western decor'],width:6000,height:9000,paddingStatus:'full',etsy},{name:secondFile.name,size:secondFile.size,id:'preview-design-2',file:secondFile,previewUrl:URL.createObjectURL(secondFile),title:'retro cowgirl print, western poster, dorm wall art',tags:['retro cowgirl print','western poster','dorm wall art'],width:6000,height:9000,paddingStatus:'full',etsy}];
    const profile:EtsyShippingProfile={id:9001,title:'Poster shipping · $4 US',originCountry:'United States',currency:'USD',domesticPrimary:4,domesticAdditional:2.5,international:[{key:'CA',label:'Canada',primary:13.92,additional:8.5},{key:'EU',label:'European Union',primary:17.42,additional:10.25}]};
    setTemplate('https://printify.com/app/products/preview');setTemplateDetails(details);setDescription(details.description);setFiles(previewFiles);setDrafts(previewFiles.map((design,index)=>({id:`preview-draft-${index+1}`,clientId:design.id,name:design.name,title:design.title,tags:design.tags,previewUrl:'/mockups/pink-dorm-01-leaning-frame.png',printifyImages:['/mockups/pink-dorm-01-leaning-frame.png','/mockups/pink-dorm-02-hanging-poster.png','/mockups/pink-dorm-03-maximalist-bed.png'],editorUrl:'https://printify.com/app/products',status:'Created'})));setEtsyCategories([previewCategory]);setEtsyShippingProfiles([profile]);setEtsyShippingProfileId(profile.id);setVariantPrices({'101':1600,'104':1600,'102':2400,'105':2400,'103':3800});setPricingApproved(false);setComplete(true);setFinishPhase('details');setWorkflowStep('review');const url=new URL(window.location.href);url.searchParams.set('step','review');window.history.replaceState({},'',url);window.scrollTo({top:0,behavior:'smooth'});
  }

  function confirmUploadInterruption(){return !running||window.confirm("Are you sure you want to leave this step? Doing so may halt your current design uploads before the Printify drafts are finished.")}
  function stopWith(title:string,issues:string[],copy?:string){setBlockingModal({title,issues,copy});return false}
  function requiredForProgress(index:number){return progressGateIssues(index)}
  const bundleKeywordGaps=useMemo(()=>{
    if(!activeBundle||bundleRecipes.length<2)return [] as string[];
    return bundleRecipes.filter((recipe,index)=>{
      const chosen=index===bundleIndex?(autoTitleBankId||activeRecipe?.keywordListId||""):(bundleKeywordChoices[recipe.id]??recipe.keywordListId??"");
      return !chosen;
    }).map(recipe=>recipe.name);
  },[activeBundle,bundleRecipes,bundleIndex,bundleKeywordChoices,autoTitleBankId,activeRecipe]);
  function requiredForStep(step:WorkflowStep){if(localPreview)return [];const issues:string[]=[];if(step!=="connect"&&!connected)issues.push("Connect your Printify account.");if(step!=="connect"&&!etsyConnected)issues.push("Connect the Etsy shop that will receive these listings.");if(["designs","review","finish"].includes(step)){if(!productSelected)issues.push("Save or select a product or product bundle.");if(!templateDetails?.shippingTemplateId&&!templateDetails?.shippingProfileNeedsSelection)issues.push("Choose a valid Printify product with an imported shipping profile.");if(!templateDetails?.enabledVariants)issues.push("The product needs at least one enabled size or color.");if(bundleKeywordGaps.length)issues.push(`Choose a keyword bank for ${bundleKeywordGaps.join(", ")}.`);const missingColors=Boolean(templateDetails?.colorOptions?.length&&!selectedColorIds.length);const missingSizes=Boolean(templateDetails?.sizeOptions?.length&&!selectedSizeIds.length);if(missingColors)issues.push("Choose at least one product color for this batch.");else if(missingSizes)issues.push("Choose at least one product size for this batch.");else if(!pricedVariants.length)issues.push(`No color and size combination you picked is available for ${templateDetails?.blueprintTitle||"this product"}. Open its Colors or Sizes and choose a pairing Printify offers.`);if(!templateDetails?.batchId)issues.push("Reload the Printify product so Goldie can prepare this batch.");}if(["review","finish"].includes(step)){if(!files.length)issues.push("Add at least one finished design.");if(files.some(file=>!file.width||!file.height||file.paddingStatus==="checking"))issues.push("Wait until every design finishes loading and checking.");}if(step==="finish"){if(!etsyShippingProfileId)issues.push("Choose the Etsy shipping profile for this batch.");if(!pricingApproved)issues.push("Review and approve every enabled variant price.");if(!complete)issues.push("Finish the Printify draft run first.");if(!drafts.some(draft=>draft.status==="Created"))issues.push("At least one listing must be created successfully before publishing.");}return issues}
  async function openProgressStep(index:number){if(!confirmUploadInterruption())return;if(localPreview){if(index===0)return goToStep("connect",false,true);if(index===1)return goToStep("setup",false,true);if(index===2)return goToStep("designs",false,true);if(index>=3&&!templateDetails)await loadPreviewDemo();if(index===3){setPreflightOpen(false);return goToStep("review",false,true)}if(index===4){goToStep("review",false,true);setPreflightOpen(true);return}setPreflightOpen(false);setFinishPhase(index===5?"details":index===6?"etsy":index===7?"mockups":"final");return goToStep("finish",false,true)}const issues=requiredForProgress(index);if(issues.length)return stopWith("Finish all sections first.",issues);if(index===0)return goToStep("connect");if(index===1)return goToStep("setup");if(index===2)return goToStep("designs");if(index===3)return goToStep("review");if(index===4){goToStep("review");return createDrafts()}setFinishPhase(index===5?"details":index===6?"etsy":index===7?"mockups":"final");goToStep("finish",false,true)}

  function goBackOneStep(){
    if(!confirmUploadInterruption())return;
    if(progressIndex===0){window.history.back();return}
    if(progressIndex===1)return goToStep("connect",false,true);
    if(progressIndex===2)return goToStep("setup",false,true);
    if(progressIndex===3||progressIndex===4)return goToStep(progressIndex===3?"designs":"review",false,true);
    if(progressIndex===5)return goToStep("review",false,true);
    setFinishPhase(progressIndex===6?"details":progressIndex===7?"etsy":"mockups");
    goToStep("finish",false,true);
  }

  function canOpenStep(step:WorkflowStep){if(localPreview)return true;if(step==="connect")return true;if(step==="setup")return connected&&etsyConnected;if(step==="designs")return connected&&etsyConnected&&productSelected&&templateLoaded;if(step==="review")return etsyConnected&&ready;return etsyConnected&&productSelected&&complete}
  function goToStep(step:WorkflowStep,replace=false,force=false){if(!force){const issues=requiredForStep(step);if(issues.length)return stopWith("Finish all sections first.",issues);if(!canOpenStep(step))return;}setWorkflowStep(step);const url=new URL(window.location.href);url.searchParams.set("step",step);window.history[replace?"replaceState":"pushState"]({},"",url);window.scrollTo(0,0)}

  useEffect(()=>{const read=()=>{const url=new URL(window.location.href),value=url.searchParams.get("step") as WorkflowStep|null,phase=url.searchParams.get("phase") as FinishPhase|null;if(value&&WORKFLOW_STEPS.some(step=>step.id===value))setWorkflowStep(value);if(phase&&["details","etsy","mockups","final"].includes(phase))setFinishPhase(phase)};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read)},[]);
  useEffect(()=>{if(workflowStep!=="finish")return;const url=new URL(window.location.href);url.searchParams.set("phase",finishPhase);window.history.replaceState({},"",url)},[workflowStep,finishPhase]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"auto"})},[workflowStep,finishPhase]);
  useEffect(()=>{if(connectionAutoSkip.current||localPreview||checkingConnection||restoringBatch||workflowStep!=="connect"||!connected||!etsyConnected)return;if(new URL(window.location.href).searchParams.get("step")==="connect")return;connectionAutoSkip.current=true;goToStep("setup",true,true)},[localPreview,checkingConnection,restoringBatch,workflowStep,connected,etsyConnected]);
  useEffect(()=>{if(localPreview||checkingConnection||restoringBatch||canOpenStep(workflowStep))return;const fallback=!connected||!etsyConnected?"connect":!templateLoaded?"setup":!files.length?"designs":!complete?"review":"finish";goToStep(fallback,true,true);
  },[localPreview,checkingConnection,restoringBatch,connected,etsyConnected,templateLoaded,files.length,complete,workflowStep]);

  useEffect(()=>{if(restoringBatch)return;const url=new URL(window.location.href);if(url.searchParams.get("open")!=="results")return;const hasCreatedDrafts=complete&&drafts.some(draft=>draft.status==="Created");url.searchParams.delete("open");if(!hasCreatedDrafts){window.history.replaceState({},"",url);return}if(!pricingApproved)setPricingApproved(true);url.searchParams.set("step","finish");url.searchParams.set("phase",finishPhase||"details");setWorkflowStep("finish");window.history.replaceState({},"",url);window.scrollTo({top:0,behavior:"auto"})},[restoringBatch,complete,drafts,pricingApproved,finishPhase]);

  useEffect(()=>{void(async()=>{try{const url=new URL(window.location.href);const id=url.searchParams.get("batch")||"";if(!id)return;const response=await fetch(`/api/batches?id=${encodeURIComponent(id)}`);if(!response.ok)return;const payload=await response.json() as {batch?:{id:string;step:WorkflowStep;status:string;setup_name?:string;state?:Record<string,unknown>}};if(!payload.batch?.state)return;const state=payload.batch.state as {template?:string;templateDetails?:TemplateDetails;description?:string;pricing?:Pricing;mockupTheme?:string;activeRecipe?:Recipe;activeBundle?:ProductBundle;bundleRecipes?:Recipe[];bundleIndex?:number;designs?:Array<Omit<DesignFile,"file"|"previewUrl">>;drafts?:DraftResult[];complete?:boolean;finishPhase?:FinishPhase;bulkTitles?:string;printifyImageIndices?:number[];printifyImageSelections?:Record<string,number[]>;selectedColorIds?:number[];selectedSizeIds?:number[];variantPrices?:Record<string,number>;etsyShippingProfileId?:number;pricingApproved?:boolean;sizeGuideName?:string;batchKeywords?:string[];titleJoiner?:string;titleBuilderMode?:"ai"|"manual";autoTitleBankId?:string;manualKeywordBankId?:string;sharedMockups?:{theme:string;ids:string[]};preparedMockupCounts?:Record<string,number>;keptAsDrafts?:boolean};const cached=await loadBatchFiles(id).catch(()=>[]);const designs=(state.designs||[]).map((design,index)=>{const file=cached[index];return file?{...design,file,previewUrl:URL.createObjectURL(file)}:null}).filter(Boolean) as DesignFile[];const savedProductColors=state.templateDetails?.id?JSON.parse(window.localStorage.getItem(`goldie-colors-${state.templateDetails.id}`)||"[]") as number[]:[];const savedProductSizes=state.templateDetails?.id?JSON.parse(window.localStorage.getItem(`goldie-sizes-${state.templateDetails.id}`)||"[]") as number[]:[];batchIdRef.current=id;setBatchDisplayName(payload.batch.setup_name||"");setKeptAsDrafts(Boolean(state.keptAsDrafts));setTemplate(state.template||"");setTemplateDetails(state.templateDetails||null);setDescription(state.description||"");if(state.pricing)setPricing(state.pricing);setVariantPrices(state.variantPrices||{});setSelectedColorIds(state.selectedColorIds?.length?state.selectedColorIds:state.activeRecipe?.defaultColorIds?.length?state.activeRecipe.defaultColorIds:savedProductColors);setSelectedSizeIds(state.selectedSizeIds?.length?state.selectedSizeIds:state.activeRecipe?.defaultSizeIds?.length?state.activeRecipe.defaultSizeIds:savedProductSizes);setEtsyShippingProfileId(Number(state.etsyShippingProfileId)||0);setPricingApproved(Boolean(state.pricingApproved)||Boolean(state.complete&&(state.drafts||[]).some(draft=>draft.status==="Created")));setMockupTheme(state.mockupTheme||"");setActiveRecipe(state.activeRecipe||null);setActiveBundle(state.activeBundle||null);setBundleRecipes(state.bundleRecipes||[]);setBundleIndex(Math.max(0,Number(state.bundleIndex)||0));setFiles(designs);setDrafts(state.drafts||[]);setComplete(Boolean(state.complete));setFinishPhase(restoredFinishPhase(state.finishPhase||"details",url.searchParams.get("phase"),Boolean(state.complete)));setBulkTitles(state.bulkTitles||"");setBatchKeywords(state.batchKeywords||[]);setTitleJoiner(state.titleJoiner||", ");setTitleBuilderMode(state.titleBuilderMode||"ai");setAutoTitleBankId(state.autoTitleBankId||"");setManualKeywordBankId(state.manualKeywordBankId||"");setSharedMockups(state.sharedMockups);setPreparedMockupCounts(state.preparedMockupCounts||{});setPrintifyImageIndices(state.printifyImageIndices||[]);setPrintifyImageSelections(state.printifyImageSelections||{});setSizeGuideName(state.sizeGuideName||"");setResumeProcessing(payload.batch.status==="processing"&&designs.length>0);const step=restoredWorkflowStep(payload.batch.step||"connect",url.searchParams.get("step"),Boolean(state.complete));setWorkflowStep(step);url.searchParams.set("step",step);window.history.replaceState({},"",url);if(payload.batch.status==="processing"&&state.template)void loadTemplateUrl(state.template)}finally{snapshotReady.current=true;setRestoringBatch(false)}})()},[]);
  useEffect(()=>{setLocalPreview(["localhost","127.0.0.1"].includes(window.location.hostname));fetch("/api/account").then(response=>response.json()).then((result:{signedIn?:boolean})=>setSignedIn(Boolean(result.signedIn))).catch(()=>setSignedIn(null))},[]);
  useEffect(()=>{if(signedIn!==true||publishing)return;const jobId=window.localStorage.getItem("goldie-active-publish-job");if(jobId)void monitorPublishJob(jobId);
  },[signedIn]);

  useEffect(()=>{if(!resumeProcessing||resumeAttempted.current||!connected||!templateLoaded||!files.length)return;resumeAttempted.current=true;setResumeProcessing(false);const succeeded=new Set(drafts.filter(draft=>draft.status==="Created").map(draft=>draft.clientId));const remaining=files.filter(file=>!succeeded.has(file.id));if(remaining.length)void runDrafts(remaining,true)},[resumeProcessing,connected,templateLoaded,files,drafts]);

  useEffect(()=>{if(!snapshotReady.current||restoringBatch||(!files.length&&!drafts.length))return;const timer=window.setTimeout(()=>{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);void fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:running?"processing":keptAsDrafts?"draft":complete?drafts.some(draft=>draft.status!=="Created")?"needs_attention":"complete":"draft",step:workflowStep,setupName:batchDisplayName||activeBundle?.name||activeRecipe?.name||"",productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:batchStateSnapshot()})})},700);return()=>window.clearTimeout(timer);
  },[restoringBatch,workflowStep,finishPhase,template,templateDetails,description,pricing,selectedColorIds,selectedSizeIds,variantPrices,etsyShippingProfileId,pricingApproved,mockupTheme,activeRecipe,activeBundle,bundleRecipes,bundleIndex,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}:${file.blurb||""}:${file.descriptionOverride??""}:${file.sizeGuideName||""}:${JSON.stringify(file.etsy||{})}`).join(";"),drafts,complete,running,bulkTitles,batchKeywords,titleJoiner,titleBuilderMode,autoTitleBankId,manualKeywordBankId,sharedMockups,preparedMockupCounts,printifyImageIndices,printifyImageSelections,sizeGuideName,batchDisplayName,keptAsDrafts,batchReceipt]);

  useEffect(() => {
    fetch("/api/printify")
      .then((response) => response.json())
      .then((result: { connected?: boolean; owner?: boolean; reason?: string; warning?: string }) => { setConnected(Boolean(result.connected)); setOwner(Boolean(result.owner)); if (result.reason || result.warning) setConnectionError(result.reason || result.warning || ""); })
      .catch(() => setConnected(false))
      .finally(() => setCheckingConnection(false));
  }, []);

  useEffect(()=>{fetch("/api/seller-preferences").then(response=>response.json()).then((result:{pricing?:Partial<Pricing>|null})=>{if(!result.pricing)return;setPricing(current=>({...current,etsyFeePercent:Number(result.pricing?.etsyFeePercent??current.etsyFeePercent),fixedFee:Number(result.pricing?.fixedFee??current.fixedFee),listingFee:Number(result.pricing?.listingFee??current.listingFee)}))}).catch(()=>undefined)},[]);

  useEffect(()=>{fetch("/api/etsy").then(response=>response.json()).then((result:{connected?:boolean;shopName?:string})=>{setEtsyConnected(Boolean(result.connected));setEtsyShop(result.shopName||"")}).catch(()=>setEtsyConnected(false));const message=new URL(window.location.href).searchParams.get("etsy");if(message){if(message==="connected"){setEtsyConnected(true);setEtsyError("")}else setEtsyError(message);const url=new URL(window.location.href);url.searchParams.delete("etsy");window.history.replaceState({},"",url)}},[]);
  async function loadEtsyShippingProfiles(preselect=0){setShippingProfilesLoading(true);setShippingProfilesError("");try{const response=await fetch("/api/etsy/shipping-profiles"),result=await response.json() as {profiles?:EtsyShippingProfile[];error?:string};if(!response.ok)throw new Error(result.error||"Your Etsy shipping profiles could not be loaded.");const profiles=(result.profiles||[]).map(profile=>({...profile,title:profile.title.replace(/\.{2,}$/,"…")}));setEtsyShippingProfiles(profiles);setEtsyShippingProfileId(current=>{const wanted=preselect||current;return wanted&&profiles.some(profile=>profile.id===wanted)?wanted:0})}catch(error){setShippingProfilesError(error instanceof Error?error.message:"Your Etsy shipping profiles could not be loaded.")}finally{setShippingProfilesLoading(false)}}
  useEffect(()=>{if(etsyConnected)void loadEtsyShippingProfiles()},[etsyConnected]);
  useEffect(()=>{const templateProfileId=Number(templateDetails?.shippingTemplateId);if(!templateProfileId||!etsyShippingProfiles.some(profile=>profile.id===templateProfileId))return;setEtsyShippingProfileId(current=>current||templateProfileId)},[templateDetails?.shippingTemplateId,etsyShippingProfiles]);

  useEffect(() => {
    if (!running) return;
    const protectBatch = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectBatch);
    return () => window.removeEventListener("beforeunload", protectBatch);
  }, [running]);

  useEffect(()=>{
    const guardFinalActions=(event:MouseEvent)=>{
      const element=event.target instanceof Element?event.target.closest("button"):null;
      if(!element)return;
      let issues:string[]=[];
      if(element.classList.contains("publish-all-button")){
        issues=[...(!localPreview&&!etsyConnected?["Connect the Etsy shop that will receive these listings."]:[]),...missingPublishFields().map(field=>`${field} must be completed before publishing.`),...createdListingsMissingImages().map(draft=>`${draft.name} needs at least one listing photo.`),...requiredForStep("finish")];
      }
      if(!issues.length)return;
      event.preventDefault();event.stopImmediatePropagation();stopWith("Finish all sections first.",[...new Set(issues)]);
    };
    document.addEventListener("click",guardFinalActions,true);
    return()=>document.removeEventListener("click",guardFinalActions,true);
  },[files,description,printifyImageIndices,printifyImageSelections,preparedMockupCounts,pricingApproved,complete,drafts,connected,templateDetails,etsyConnected,localPreview]);

  useEffect(()=>{if(localPreview||!complete)return;const pending=files.filter(file=>!file.etsy&&file.title.trim());if(!pending.length)return;const timer=window.setTimeout(()=>{setPreparingEtsy(true);void runBounded(pending,1,async file=>{await prepareOne(file);return file},()=>undefined).finally(()=>setPreparingEtsy(false))},900);return()=>window.clearTimeout(timer);
  },[localPreview,complete,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);
  useEffect(()=>{if(localPreview||!complete)return;const pending=files.filter(file=>{const draft=drafts.find(item=>item.clientId===file.id);const signature=`${file.title}\n${file.tags.join("|")}`;return Boolean(draft?.id&&file.title.trim()&&syncedListingSignatures.current.get(file.id)!==signature)});if(!pending.length)return;setDrafts(current=>current.map(draft=>{const file=files.find(item=>item.id===draft.clientId);return file?{...draft,title:file.title,tags:file.tags}:draft}));const timer=window.setTimeout(()=>{void Promise.all(pending.map(async file=>{try{await syncListingFields(file);syncedListingSignatures.current.set(file.id,`${file.title}\n${file.tags.join("|")}`)}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"Printify could not save this listing."})}}))},600);return()=>window.clearTimeout(timer);
  },[localPreview,complete,drafts.map(draft=>draft.id||draft.clientId).join(";"),files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);

  useEffect(()=>{if(localPreview||!complete||preparingEtsy)return;const prepared=files.filter(file=>file.etsy);if(!prepared.length)return;const timer=window.setTimeout(()=>{void runBounded(prepared,2,async file=>{try{await syncPreparedListing(file,file.etsy!);updateDesign(file.id,{etsyError:""})}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"The listing changes could not be saved."})}return file},()=>undefined)},1200);return()=>window.clearTimeout(timer);
  },[localPreview,complete,preparingEtsy,files.map(file=>file.etsy?`${file.id}:${file.title}:${file.tags.join("|")}:${JSON.stringify(file.etsy)}`:"").join(";")]);

  async function fileContentHash(file:File){const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("")}

  async function chooseFiles(list: FileList | null) {
    if (!list) return;
    const selected = Array.from(list).filter((file) => /\.(png|jpe?g)$/i.test(file.name));
    if (selected.length === 0) {
      setFileNotice("");
      setFileError("No supported designs were found. Choose PNG or JPG images.");
      return;
    }
    const oversized = selected.find((image) => image.size > MAX_FILE_BYTES);
    if (oversized) {
      setFileNotice("");
      setFileError(oversizedFileMessage(oversized.name,oversized.size));
      return;
    }
    const existingHashes=new Set<string>();
    for(const design of files){const hash=design.contentHash||await fileContentHash(design.file);existingHashes.add(hash)}
    const unique:DesignFile[]=[];let duplicateCount=0;
    for(const file of selected){const contentHash=await fileContentHash(file);if(existingHashes.has(contentHash)){duplicateCount+=1;continue}existingHashes.add(contentHash);unique.push({name:file.name,size:file.size,id:crypto.randomUUID(),file,previewUrl:URL.createObjectURL(file),title:"",tags:[],contentHash,paddingStatus:"checking"})}
    const available=Math.max(0,Math.min(MAX_BATCH_FILES-files.length,batchDesignLimit-files.length));
    if(unique.length>available){unique.forEach(image=>URL.revokeObjectURL(image.previewUrl));setFileNotice(duplicateCount?`${duplicateCount} exact ${duplicateCount===1?"duplicate was":"duplicates were"} skipped.`:"");setFileError(available?`This selection contains ${unique.length} new designs, but this batch has room for ${available}. Choose ${available} or fewer so nothing is partially added.`:"This batch has no listing allowance left. No designs were added and no batch was created.");if(folderPicker.current)folderPicker.current.value="";if(imagePicker.current)imagePicker.current.value="";return}
    const images=unique;
    if(!images.length){if(duplicateCount){setFileError("");setFileNotice(`${duplicateCount===1?"That design is":"Those designs are"} already in this batch. No duplicate was added.`)}else{setFileNotice("");setFileError(`This batch already has ${MAX_BATCH_FILES} designs.`)}if(folderPicker.current)folderPicker.current.value="";if(imagePicker.current)imagePicker.current.value="";return}
    const combined=[...files,...images];
    setFileError("");setFileNotice(duplicateCount?`${duplicateCount} exact ${duplicateCount===1?"duplicate was":"duplicates were"} skipped.`:"");
    setFiles(combined);
    const durableBatchId=batchIdRef.current||crypto.randomUUID();batchIdRef.current=durableBatchId;window.localStorage.setItem("goldie-active-batch",durableBatchId);const batchUrl=new URL(window.location.href);batchUrl.searchParams.set("batch",durableBatchId);window.history.replaceState({},"",batchUrl);void saveBatchFiles(durableBatchId,combined.map(image=>image.file)).catch(()=>undefined);
    setComplete(false);
    setDrafts([]);
    setProcessed(0);
    images.forEach((design) => { const probe = document.createElement("img"); probe.onload = () => { setFiles((current) => current.map((item) => item.id === design.id ? { ...item, width: probe.naturalWidth, height: probe.naturalHeight } : item)); URL.revokeObjectURL(probe.src); }; probe.src = URL.createObjectURL(design.file); });
    void analyzePadding(images);
    if(folderPicker.current)folderPicker.current.value="";
    if(imagePicker.current)imagePicker.current.value="";
  }

  async function analyzePadding(images:DesignFile[]) { for(const design of images){ if(!/\.png$/i.test(design.name)){updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:false,paddingStatus:"full"});continue} try{const bitmap=await createImageBitmap(design.file,{resizeWidth:512,resizeHeight:512,resizeQuality:"low"});const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext("2d",{willReadFrequently:true})!;context.drawImage(bitmap,0,0);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1,hasTransparency=false;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const alpha=pixels[(y*canvas.width+x)*4+3];if(alpha<250)hasTransparency=true;if(alpha>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}const bounds=right<0?{left:0,top:0,right:1,bottom:1}:{left:left/canvas.width,top:top/canvas.height,right:(right+1)/canvas.width,bottom:(bottom+1)/canvas.height};const trimmed=bounds.left>.015||bounds.top>.015||bounds.right<.985||bounds.bottom<.985;updateDesign(design.id,{visibleBounds:bounds,hasTransparency,paddingStatus:trimmed?"trimmed":"full"})}catch{updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:true,paddingStatus:"full"})} } }

  function removeDesign(id:string){const removed=files.find(file=>file.id===id);if(!removed)return;if(drafts.length&&!window.confirm(`Remove ${removed.name}? Its existing Printify draft will remain in Printify, but this listing will be removed from this Goldie batch.`))return;const next=files.filter(file=>file.id!==id);URL.revokeObjectURL(removed.previewUrl);setFiles(next);setFileError("");setFileNotice(`${removed.name} was removed.`);setComplete(false);setDrafts([]);setProcessed(0);const batchId=batchIdRef.current;if(batchId){if(next.length)void saveBatchFiles(batchId,next.map(file=>file.file)).catch(()=>undefined);else void clearBatchFiles(batchId)}}

  function updateDesign(id: string, change: Partial<DesignFile>) { const clearedChange=change.title!==undefined&&change.titleError===undefined?{...change,titleError:"",titleWarning:""}:change;const nextChange=clearedChange.title!==undefined&&titleCaps?{...clearedChange,title:clearedChange.title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase())}:clearedChange;setFiles((current) => current.map((file) => file.id === id ? { ...file, ...nextChange } : file)); if(nextChange.title!==undefined)setDrafts(current=>current.map(draft=>draft.clientId===id?{...draft,title:nextChange.title}:draft)); }
  function pulseTitle(id:string){setTitlePulseIds(current=>new Set(current).add(id));window.setTimeout(()=>setTitlePulseIds(current=>{const next=new Set(current);next.delete(id);return next}),520)}
  function clearCurrentBatch(clearProduct=true,preserveSavedBatch=false){
    etsyProductBaseline.current=null;
    const priorBatch=batchIdRef.current;
    if(priorBatch&&!preserveSavedBatch){void clearBatchFiles(priorBatch);void fetch(`/api/batches?id=${encodeURIComponent(priorBatch)}`,{method:"DELETE"})}
    if(!preserveSavedBatch)drafts.forEach(draft=>{if(draft.id)void fetch(`/api/etsy/images?productId=${encodeURIComponent(draft.id)}`,{method:"DELETE"})});
    batchIdRef.current="";window.localStorage.removeItem("goldie-active-batch");
    const freshUrl=new URL(window.location.href);freshUrl.searchParams.delete("batch");window.history.replaceState({},"",freshUrl);
    files.forEach(file=>URL.revokeObjectURL(file.previewUrl));
    templateLoadVersion.current+=1;setLoadingTemplate(false);setFiles([]);setFileError("");setDrafts([]);setProcessed(0);setRunTotal(0);setComplete(false);setOpenedDrafts([]);setOpenAllMessage("");setBulkTitles("");setBatchKeywords([]);setTitleJoiner(", ");setTitleBuilderMode("ai");setAutoTitleBank(null);setAutoTitleBankId("");setManualKeywordBankId("");setActiveDesign("");setPreflightOpen(false);setUploadNoticeOpen(false);setPrintifyImageIndices([]);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setSelectedColorIds([]);setColorsRemembered(false);setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");syncedListingSignatures.current.clear();
    if(clearProduct){setTemplate("");setTemplateDetails(null);setTemplateError("");setDescription("");setMockupTheme("");setActiveRecipe(null);setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);setBundleColorProducts({});setBundleColorChoices({});setBundleQualityDecisions({});setPricing(current=>({...current,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0}))}
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
  }
  async function selectRecipe(recipe:Recipe):Promise<TemplateDetails|null>{etsyProductBaseline.current=null;setActiveRecipe(recipe);setPrintifyImageIndices(recipe.printifyImageIndices||[]);setEtsyShippingProfileId(Number(recipe.etsyShippingProfileId)||0);setTemplate(recipe.templateUrl);const savedTheme=recipe.defaultMockupTheme||"",savedMockups=savedTheme?{theme:savedTheme,ids:recipe.mockupIds||[]}:undefined;setMockupTheme(savedTheme);setSharedMockups(savedMockups);window.sessionStorage.setItem("goldie-batch-mockups",JSON.stringify(savedMockups||null));setAutoTitleBankId(recipe.keywordListId||"");const nextPricing={...pricing,targetProfit:Number(recipe.defaultProfitTarget)||DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);const details=await loadTemplateUrl(recipe.templateUrl,nextPricing,Number(recipe.etsyShippingProfileId)||0,recipe.defaultColorIds||[],recipe.defaultSizeIds||[]);if(!details)return null;const savedDescription=recipe.description?.trim(),importedDescription=details.description?.trim();if(savedDescription)setDescription(recipe.description);else if(importedDescription){const updated={...recipe,description:details.description};setDescription(details.description);setActiveRecipe(updated);void fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)}).catch(()=>undefined)}return details}
  async function saveProductDefaults(change:Partial<Recipe>,key:string){if(!activeRecipe)return;setSavingProductDefault(key);try{const updated={...activeRecipe,...change};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(!response.ok)throw new Error("Goldie could not save this product default.");setActiveRecipe(updated)}catch(error){stopWith("This default was not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setSavingProductDefault("")}}
  async function rememberBatchDefaultsAfterPublish(){if(!activeRecipe)return;const updated={...activeRecipe,defaultColorIds:selectedColorIds,defaultSizeIds:selectedSizeIds,defaultMockupTheme:mockupTheme,mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(response.ok){setActiveRecipe(updated);setColorsRemembered(true);setSizesRemembered(true)}}
  async function completeProductSetup(){if(!activeRecipe)return;await saveProductDefaults({setupComplete:true,defaultColorIds:selectedColorIds,defaultSizeIds:selectedSizeIds,defaultMockupTheme:mockupTheme,mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]},"initial-setup")}
  async function chooseRecipe(recipe: Recipe) { const changingProduct=Boolean((activeRecipe?.id&&activeRecipe.id!==recipe.id)||(template&&template!==recipe.templateUrl));if(changingProduct&&(files.length>0||drafts.length>0||complete)){const count=files.length;if(!window.confirm(`Switch to “${recipe.name}” and start a new batch? This removes ${count} ${count===1?"design":"designs"} and all work from the current batch on this page.`))return false;clearCurrentBatch(false)}setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);return Boolean(await selectRecipe(recipe)); }
  async function useBundle(bundle:ProductBundle,recipeIds:string[]){
    const requestedIds=[...new Set(recipeIds.filter(Boolean))];
    if(requestedIds.length<2){stopWith("This product bundle needs attention.",["Choose at least two available saved products."]);return false}
    const payload=await fetch("/api/product-recipes").then(response=>response.ok?response.json():Promise.reject(new Error("Saved products could not be loaded."))).catch(()=>({recipes:[]})) as {recipes?:Recipe[]};
    const available=payload.recipes||[],recipes=requestedIds.map(id=>available.find(recipe=>recipe.id===id)).filter(Boolean) as Recipe[];
    if(recipes.length!==requestedIds.length){stopWith("This product bundle needs attention.",["One or more saved products in this bundle are missing. Edit the bundle and choose the products again."]);return false}
    /* Selecting a bundle used to open a chain of native browser dialogs asking
     * the seller to predict her design count, then stored that number only to
     * block her later if the upload did not match it. The upload-time guard
     * already multiplies designs by products against the remaining allowance
     * and explains the result in the page, so the prediction was redundant and
     * its only unique effect was a failure she could not avoid. See D129. */
    if((files.length>0||drafts.length>0||complete)&&!window.confirm(`Start “${bundle.name}” and clear the current batch? Your current designs and unfinished work will be removed.`))return false;
    clearCurrentBatch(true);setActiveBundle(bundle);setBundleRecipes(recipes);setBundleIndex(0);const first=await selectRecipe(recipes[0]);if(!first)return false;const loaded:Record<string,TemplateDetails>={[recipes[0].id]:first},choices:Record<string,number[]>={};for(const recipe of recipes){const details=recipe.id===recipes[0].id?first:await fetchWithDeadline("/api/printify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productUrl:recipe.templateUrl,savedShippingProfileId:Number(recipe.etsyShippingProfileId)||0})},90000).then(async response=>response.ok?(await response.json() as {product?:TemplateDetails}).product:undefined).catch(()=>undefined);if(!details)continue;loaded[recipe.id]=details;const available=new Set((details.colorOptions||[]).filter(color=>color.available).map(color=>color.id));/* D213 · A bundle member with no saved colours has not been set up. Leave it
         empty so its card asks, instead of adopting Printify's template. */
      const ids=(recipe.defaultColorIds||[]).filter(id=>available.has(id));choices[recipe.id]=ids}setBundleColorProducts(loaded);setBundleColorChoices(choices);return true;
  }
  async function continueBundle(){
    const next=bundleRecipes[bundleIndex+1];if(!activeBundle||!next)return;
    const carriedFiles=files.map(file=>({...file,id:crypto.randomUUID(),previewUrl:URL.createObjectURL(file.file),title:"",tags:[],blurb:undefined,descriptionOverride:undefined,sizeGuideName:undefined,etsy:undefined,etsyError:""}));
    const nextBatchId=crypto.randomUUID();batchIdRef.current=nextBatchId;window.localStorage.setItem("goldie-active-batch",nextBatchId);const url=new URL(window.location.href);url.searchParams.set("batch",nextBatchId);url.searchParams.set("step","review");url.searchParams.delete("phase");window.history.pushState({},"",url);
    setBundleIndex(current=>current+1);setDrafts([]);setComplete(false);setProcessed(0);setRunTotal(0);setOpenedDrafts([]);setOpenAllMessage("");setPreflightOpen(false);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");setFiles(carriedFiles);setDescription("");setActiveDesign("");syncedListingSignatures.current.clear();
    await saveBatchFiles(nextBatchId,carriedFiles.map(file=>file.file)).catch(()=>undefined);setActiveRecipe(next);setPrintifyImageIndices(next.printifyImageIndices||[]);setEtsyShippingProfileId(Number(next.etsyShippingProfileId)||0);setTemplate(next.templateUrl);setMockupTheme(next.defaultMockupTheme||"");setAutoTitleBankId(next.keywordListId||"");const nextPricing={...pricing,targetProfit:Number(next.defaultProfitTarget)||DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);const nextDetails=await loadTemplateUrl(next.templateUrl,nextPricing,Number(next.etsyShippingProfileId)||0,next.defaultColorIds||[],next.defaultSizeIds||[]);if(next.keywordListId&&nextDetails){const payload=await fetch("/api/keyword-lists").then(response=>response.json()).catch(()=>({lists:[]})) as {lists?:KeywordList[]},bank=payload.lists?.find(list=>list.id===next.keywordListId);if(bank){const titled=await Promise.all(carriedFiles.map(async file=>{try{const result=await autoTitleForDesign(file,bank.keywords,titleJoiner===", ",nextDetails);return {...file,title:styledTitle(result.title),tags:result.tags,titleWarning:result.titleWarning,titleError:""}}catch(error){return {...file,titleError:error instanceof Error?error.message:"Goldie could not create a complete title for this design."}}}));setFiles(titled)}}setWorkflowStep("review");window.scrollTo({top:0});
  }
  async function createCustomShippingProfile(baseProfileId:number,domesticPrimary:number,domesticAdditional:number,title:string,international:InternationalShippingRate[]){const response=await fetch("/api/etsy/shipping-profiles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({baseProfileId,domesticPrimary,domesticAdditional,title,international})}),result=await response.json() as {id?:number;error?:string};if(!response.ok||!result.id)throw new Error(result.error||"The Etsy shipping profile could not be saved.");await loadEtsyShippingProfiles(result.id);if(activeRecipe){const updated={...activeRecipe,etsyShippingProfileId:result.id};await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});setActiveRecipe(updated)}setPricingApproved(false)}
  /* D125 · A product that has saved none of its own defaults is being set up for
   * the first time. The returning-product framing ("from your last batch",
   * "Saved for this product") is false for it and hides that these are choices
   * still to be made. */
  const productFirstRun=Boolean(activeRecipe)&&!activeBundle
    &&!activeRecipe?.defaultColorIds?.length
    &&!activeRecipe?.defaultMockupTheme
    &&!activeRecipe?.keywordListId;
  function startNewProduct(){
    if((files.length>0||drafts.length>0||complete)&&!window.confirm("Add a new product and clear the current product setup? Any designs and unfinished work in this batch will be removed."))return false;
    clearCurrentBatch(true);
    return true;
  }
  function changeProduct(){
    if((files.length>0||drafts.length>0||complete)&&!window.confirm("Change products and start a new batch? Your uploaded designs and unfinished work in this batch will be removed."))return false;
    clearCurrentBatch(true);return true;
  }
  async function saveImagePreferences(indices:number[]){if(!activeRecipe)return;const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...activeRecipe,printifyImageIndices:indices})});if(!response.ok)throw new Error("These Printify photo preferences could not be saved. Please try again.");setPrintifyImageIndices(indices);setActiveRecipe({...activeRecipe,printifyImageIndices:indices})}
  function styledTitle(title:string){return (titleCaps?title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase()):title).slice(0,140)}
  function applyBatchTitle(title:string,explicitTags?:string[]){const next=styledTitle(title);setFiles(current=>current.map(file=>({...file,title:next,tags:explicitTags||tagsFromTitle(next),etsy:undefined,etsyError:""})))}
  function addBatchKeyword(keyword:string){if(batchKeywords.some(value=>value.toLocaleLowerCase()===keyword.trim().toLocaleLowerCase()))return;const next=[...batchKeywords,keyword.trim()];setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function removeBatchKeyword(keyword:string){const next=batchKeywords.filter(value=>value!==keyword);setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function clearBatchKeywords(){setBatchKeywords([]);applyBatchTitle("",[])}
  function changeTitleJoiner(joiner:string){setTitleJoiner(joiner);if(batchKeywords.length)applyBatchTitle(batchKeywords.join(joiner),tagsFromTitle(batchKeywords.join(", ")))}
  function changeTitleCaps(enabled:boolean){setTitleCaps(enabled);setFiles(current=>current.map(file=>({...file,title:(enabled?file.title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase()):file.title).slice(0,140),etsy:undefined,etsyError:""})))}
  async function buildBatchTitle(){if(!autoTitleBank)return setTitleBuildMessage("Choose a keyword bank first.");setTitleBuilding(true);setTitleBuildMessage(`Creating 0 of ${files.length} titles…`);let completed=0,failed=0;await runBounded(files,2,async design=>{try{const result=await autoTitleForDesign(design,autoTitleBank.keywords,titleJoiner===", ",templateDetails);return {design,result}}catch(error){return {design,error:error instanceof Error?error.message:"Goldie could not create this title."}}},item=>{completed+=1;if("result" in item&&item.result){updateDesign(item.design.id,{title:styledTitle(item.result.title),tags:item.result.tags,titleWarning:item.result.titleWarning,titleError:"",etsy:undefined,etsyError:""});pulseTitle(item.design.id)}else{failed+=1;updateDesign(item.design.id,{titleError:item.error,titleWarning:""})}setTitleBuildMessage(`Creating ${completed} of ${files.length} titles…`)});setTitleBuildMessage(failed?`${files.length-failed} titles created. ${failed} need another try; each affected listing explains why below.`:`✓ ${files.length} unique titles and separately ranked Etsy tags created. Review them below.`);setTitleBuilding(false);window.setTimeout(()=>{const target=listingResultsRef.current;if(target)window.scrollTo({top:window.scrollY+target.getBoundingClientRect().top-24})},100)}

  function missingPublishFields(){const chosen=selectedPublishDrafts(),clientIds=new Set(chosen.map(draft=>draft.clientId)),chosenFiles=files.filter(file=>clientIds.has(file.id)),missing:string[]=[];if(!chosen.length)missing.push("Select at least one successful listing");if(chosenFiles.some(file=>!file.title.trim()))missing.push("Titles");if(chosenFiles.some(file=>!file.tags.length))missing.push("Tags");if(!description.trim())missing.push("Permanent product description");if(chosenFiles.some(file=>!file.etsy))missing.push("Etsy details");if(chosenFiles.some(file=>personalizationProblem(file.etsy)))missing.push("Personalization settings");if(chosen.length&&!allCreatedListingsHaveImages(chosen))missing.push("At least one image on every selected listing");return missing}
  function openPublishConfirmation(){const chosen=selectedPublishDrafts(),missing=missingPublishFields();if(missing.length)return void stopWith("Complete every required selected listing field.",missing.map(field=>`${field} must be completed before publishing.`));const missingPhotos=createdListingsMissingImages(chosen);if(missingPhotos.length)return void stopWith("Add a photo to every selected listing before publishing.",missingPhotos.map(draft=>draft.name));setPublishConfirmOpen(true)}
  async function monitorPublishJob(jobId:string){
    setPublishing(true);setPublishMessage("Goldie is safely resuming your queued batch…");
    try{let job:{id:string;status:string;total:number;completed:number;failed:number;queued:number;processing:number;finished:Array<{etsyListingId:number;url:string}>;budget?:{remaining:number}}|undefined;
      while(!job||!["completed","needs_attention"].includes(job.status)){if(job){const currentJob=job,lowBudget=currentJob.budget?.remaining!==undefined&&currentJob.budget.remaining<25;setPublishMessage(lowBudget?"Your batch is safe in Goldie’s queue. Etsy’s shared allowance is resting before the next listing starts.":`Publishing safely: ${currentJob.completed} of ${currentJob.total} listings are live. You may leave this page and return later.`);await new Promise(resolve=>setTimeout(resolve,lowBudget?30000:1500))}const response=await fetch(`/api/printify/drafts/publish?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store"}),payload=await response.json() as {job?:typeof job;error?:string};if(!response.ok||!payload.job)throw new Error(payload.error||"Goldie could not check this queued batch.");job=payload.job}
      if(!job)throw new Error("Goldie could not load this queued batch.");localStorage.removeItem("goldie-active-publish-job");if(job.status==="needs_attention")throw new Error(`${job.completed} of ${job.total} listings published. ${job.failed} ${job.failed===1?"listing needs":"listings need"} your attention before Goldie can finish the batch.`);await rememberBatchDefaultsAfterPublish();setBatchReceipt({publishedCount:job.completed,etsyUrls:(job.finished||[]).map(item=>item.url).filter(Boolean),completedAt:new Date().toISOString()});setPublishMessage("");
    }catch(error){setPublishMessage(error instanceof Error?error.message:"Goldie could not resume this queued batch.")}finally{setPublishing(false)}
  }
  async function publishAll(){
    const ids=selectedPublishDrafts().map(draft=>draft.id!);if(!ids.length)return;setPublishConfirmOpen(false);setPublishing(true);setPublishMessage(`Goldie is safely queuing ${ids.length} selected ${ids.length===1?"listing":"listings"}…`);setBatchReceipt(null);
    try{
      const response=await fetch("/api/printify/drafts/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productIds:ids,printifyImageIndices,printifyImageSelections,etsyShippingProfileId})}),payload=await response.json() as {job?:{id:string;status:string;total:number;completed:number;failed:number;queued:number;processing:number;finished:Array<{etsyListingId:number;url:string}>;budget?:{remaining:number}};error?:string};if(!response.ok||!payload.job)throw new Error(payload.error||"The batch could not be queued.");
      const jobId=payload.job.id;localStorage.setItem("goldie-active-publish-job",jobId);await monitorPublishJob(jobId);
    }catch(error){setPublishMessage(error instanceof Error?error.message:"The batch could not be published.")}finally{setPublishing(false)}
  }
  async function applySizeGuide(file:File){const ids=drafts.filter(draft=>draft.status==="Created"&&draft.id).map(draft=>draft.id!);if(!ids.length)return;setSizeGuideStatus(`Applying ${file.name} to 0 of ${ids.length} listings…`);try{let completeCount=0;for(const productId of ids){const form=new FormData();form.set("productId",productId);form.set("kind","size-guide");form.set("file",file);const response=await fetch("/api/etsy/images",{method:"POST",body:form}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"The size guide could not be saved.");completeCount+=1;setSizeGuideStatus(`Applying ${file.name} to ${completeCount} of ${ids.length} listings…`)}setFiles(current=>current.map(design=>({...design,sizeGuideName:undefined})));setSizeGuideName(file.name);setSizeGuideStatus(`✓ ${file.name} will be added to all ${ids.length} Etsy listings when you publish.`)}catch(error){setSizeGuideStatus(error instanceof Error?error.message:"The size guide could not be saved.")}}

  async function connectPrintify() {
    setConnecting(true); setConnectionError("");
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }, 60000);
      const result = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !result.connected) throw new Error(result.error || "Printify could not be connected.");
      setConnected(true); setToken("");
    } catch (error) { setConnected(false); setConnectionError(error instanceof Error ? error.message : "Printify could not be connected."); }
    finally { setConnecting(false); }
  }

  async function connectEtsy(){setEtsyConnecting(true);setEtsyError("");try{const response=await fetch("/api/etsy",{method:"POST"}),result=await response.json() as {authorizeUrl?:string;error?:string};if(!response.ok||!result.authorizeUrl)throw new Error(result.error||"Etsy connection could not start.");window.location.href=result.authorizeUrl}catch(error){setEtsyError(error instanceof Error?error.message:"Etsy connection could not start.");setEtsyConnecting(false)}}

  async function loadTemplateUrl(productUrl = template, pricingOverride?:Pricing, savedShippingProfileId=0,rememberedColorIds:number[]=[],rememberedSizeIds:number[]=[]):Promise<TemplateDetails|null> {
    const requestVersion=++templateLoadVersion.current;
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl,savedShippingProfileId }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string;issues?:string[] };
      if(requestVersion!==templateLoadVersion.current)return null;
      if (!response.ok || !result.product){setBlockingModal({title:"This Printify product isn’t ready yet.",issues:result.issues?.length?result.issues:[result.error||"The product could not be loaded."],copy:"Fix these items in Printify, save the product, then submit the same link again."});throw new Error(result.error || "The product could not be loaded.")}
      const available=new Set((result.product.colorOptions||[]).filter(color=>color.available).map(color=>color.id));let sessionColors:number[]=[];try{sessionColors=JSON.parse(window.localStorage.getItem(`goldie-colors-${result.product.id}`)||"[]") as number[]}catch{/* Ignore an invalid browser preference. */}const remembered=rememberedColorIds.filter(id=>available.has(id));const session=sessionColors.filter(id=>available.has(id));/* D213 · Printify's template settings are not the seller's choices.
   The seller sets colors and sizes ONCE, in the saved-product setup, and that
   becomes the recipe. A product with no recipe defaults has not been set up, so
   it must be set up — in the batch if that is where it first appears. Seeding
   the selection from templateEnabled made an unestablished product look decided
   and would publish listings in colors the seller never picked. The `available`
   fallback was worse: every colour the blueprint offers.
   Empty is the honest state. productReadiness already marks these "ask", gates
   Continue, and opens the picker pre-selected with the template as a SUGGESTION
   the seller has to accept. */
            const defaults=remembered.length?remembered:session;setSelectedColorIds(defaults);setColorsRemembered(Boolean(remembered.length));
      /* Same four-step precedence as colours: saved product default, then this
         browser's last choice, then whatever the Printify template had enabled,
         and finally every available size. The third step is what makes an
         existing product behave exactly as it did before sizes were selectable. */
      const sizeAvailable=new Set((result.product.sizeOptions||[]).filter(size=>size.available).map(size=>size.id));let sessionSizes:number[]=[];try{sessionSizes=JSON.parse(window.localStorage.getItem(`goldie-sizes-${result.product.id}`)||"[]") as number[]}catch{/* Ignore an invalid browser preference. */}
      const rememberedSizes=rememberedSizeIds.filter(id=>sizeAvailable.has(id)),sessionSizeIds=sessionSizes.filter(id=>sizeAvailable.has(id));
      /* D213 · Same rule as colours: no template seeding. */
            const sizeDefaults=rememberedSizes.length?rememberedSizes:sessionSizeIds;
      setSelectedSizeIds(sizeDefaults);setSizesRemembered(Boolean(rememberedSizes.length));
      setTemplateDetails(result.product);setDescription(result.product.description||"");if(result.product.standardShipping!=null)setPricing(current=>({...current,shippingCost:result.product!.standardShipping!,shippingCharged:0}));setVariantPrices(Object.fromEntries((result.product.variants||[]).map(variant=>[String(variant.id),variant.templatePrice])));setPricingApproved(false); return result.product;
    } catch (error) { if(requestVersion===templateLoadVersion.current)setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return null; }
    finally { if(requestVersion===templateLoadVersion.current)setLoadingTemplate(false); }
  }

  async function rememberProductColors(){if(!activeRecipe||!selectedColorIds.length)return;setRememberingColors(true);try{const updated={...activeRecipe,defaultColorIds:selectedColorIds};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(!response.ok)throw new Error("Goldie could not save these color defaults.");setActiveRecipe(updated);setColorsRemembered(true)}catch(error){stopWith("These color defaults were not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setRememberingColors(false)}}

  async function rememberProductSizes(){if(!activeRecipe||!selectedSizeIds.length)return;setRememberingSizes(true);try{const updated={...activeRecipe,defaultSizeIds:selectedSizeIds};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(!response.ok)throw new Error("Goldie could not save these size defaults.");setActiveRecipe(updated);setSizesRemembered(true)}catch(error){stopWith("These size defaults were not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setRememberingSizes(false)}}

  async function preparedUpload(design: DesignFile) {
    // Preserve original bytes whenever Printify can accept them directly.
    // Oversized opaque artwork is recompressed without changing dimensions;
    // transparent artwork is never flattened or silently degraded.
    const file=design.file;
    if (!/\.(png|jpe?g)$/i.test(file.name) || !/^image\/(png|jpeg)$/i.test(file.type || "image/png")) {
      throw new Error("Choose a PNG or JPG file. WebP artwork must be exported as PNG before uploading.");
    }
    const rigidPaperProduct=isRigidPaperProduct(templateDetails);
    return prepareArtworkFile(file, design.hasTransparency !== false, rigidPaperProduct);
  }

  async function stageUpload(blob: Blob, fileName: string, reference: string) {
    const waits = [0, 1500, 4000];
    let lastError = "The design could not be prepared for Printify.";
    for (const wait of waits) {
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      try {
        const response = await fetchWithDeadline(`/api/printify/stage?fileName=${encodeURIComponent(fileName)}&reference=${encodeURIComponent(reference)}`, {
          method: "POST",
          headers: { "Content-Type": blob.type || (/\.png$/i.test(fileName) ? "image/png" : "image/jpeg") },
          body: blob,
        }, 90000);
        const result = await response.json() as { stagedId?: string; error?: string };
        if (response.ok && result.stagedId) return { stagedId: result.stagedId, reference };
        lastError = result.error || lastError;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
    }
    throw new Error(`${lastError}${/Support reference:/i.test(lastError) ? "" : ` Support reference: ${reference}.`}`);
  }

  async function recoverDraft(batchId: string, clientId: string) {
    const delays = [1000, 2000, 4000, 8000, 12000, 15000];
    for (const delay of delays) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      const response = await fetchWithDeadline(`/api/printify/drafts?batchId=${encodeURIComponent(batchId)}&clientId=${encodeURIComponent(clientId)}`, {}, 30000);
      const result = await response.json() as { status?: string; draft?: DraftResult };
      if (result.status === "succeeded" && result.draft) return result.draft;
      if (result.status === "failed" || result.status === "not_found") return null;
    }
    return null;
  }

  async function processDesign(design: DesignFile): Promise<DraftResult> {
      const referenceRoot = `GLF-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      let finalError: Error | null = null;
      try {
        const upload = await preparedUpload(design);
        for (let pipelineAttempt = 1; pipelineAttempt <= 3; pipelineAttempt += 1) {
          const supportReference = `${referenceRoot}-A${pipelineAttempt}`;
          try {
            const staged = await stageUpload(upload.blob, upload.fileName, supportReference);
            const fullDescription=[design.blurb||design.etsy?.blurb,description].filter(Boolean).join("\n\n");
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: design.title || undefined, tags: design.tags, pricing, etsyBuyerShipping:etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.domesticPrimary||0, shippingTemplateId:etsyShippingProfileId, variantPrices, selectedVariantIds:pricedVariants.map(variant=>variant.id), description:fullDescription, maxPlacementScale:isRigidPaperProduct(templateDetails)?1:undefined, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
            const result = await response.json() as { draft?: DraftResult; error?: string };
            if ((!response.ok || !result.draft) && (response.status === 409 || /still completing this exact draft/i.test(result.error ?? ""))) {
              const recovered = await recoverDraft(templateDetails!.batchId, design.id);
              if (recovered) result.draft = recovered;
            }
            if (!result.draft) throw new Error(result.error || "Printify did not create this draft.");
            return result.draft;
          } catch (attemptError) {
            finalError = attemptError instanceof Error ? attemptError : new Error("The design failed.");
            const permanent = isPermanentUploadError(finalError.message);
            if (permanent || pipelineAttempt === 3) break;
            await new Promise((resolve) => window.setTimeout(resolve, pipelineAttempt * 5000));
          }
        }
        throw finalError ?? new Error("Printify did not create this draft.");
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "The design failed.";
        const supportReference = `${referenceRoot}-A3`;
        if (!/Support reference:/i.test(rawMessage)) {
          void fetch("/api/printify/diagnostics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: supportReference, fileName: design.name, stage: "browser_image_preparation", message: rawMessage }) });
        }
        return { clientId: design.id, name: design.name, status: "NeedsRetry", error: friendlyUploadError(new Error(`${rawMessage}${/Support reference:/i.test(rawMessage) ? "" : ` Support reference: ${supportReference}.`}`)) };
      }
  }

  async function runDrafts(targetFiles: DesignFile[], keepSuccessful = false) {
    if (!ready || !targetFiles.length || draftRunActive.current) return;
    draftRunActive.current=true;
    const completedDesignIds=new Set<string>();
    setRunning(true);
    setRunTotal(targetFiles.length);
    setComplete(false);
    const batchBytes=targetFiles.reduce((sum,file)=>sum+file.size,0);
    const batchConcurrency=batchBytes>LARGE_BATCH_THRESHOLD?1:MAX_CONCURRENT_DESIGNS;
    setPreparationMessage(batchConcurrency===1?"This is a large high-resolution batch, so Goldie is processing one design at a time safely":`Processing up to ${Math.min(batchConcurrency, targetFiles.length)} designs at a time without lowering their print resolution`);
    if (!keepSuccessful) setDrafts([]);
    else setDrafts((current) => current.filter((draft) => draft.status === "Created"));
    setProcessed(0);
    try {
      await runBounded(targetFiles, batchConcurrency, processDesign, (result) => {
        if(completedDesignIds.has(result.clientId))return;
        completedDesignIds.add(result.clientId);
        const productResult={...result,productName:activeRecipe?.name||templateDetails?.blueprintTitle||"Saved product"};
        setDrafts((current) => [...current, productResult]);
        if(result.id)setPrintifyImageSelections(current=>current[result.id!]?current:{...current,[result.id!]:printifyImageIndices});
        if(result.previewUrl)updateDesign(result.clientId,{previewUrl:result.previewUrl});
        setProcessed(Math.min(completedDesignIds.size,targetFiles.length));
      });
      setComplete(true);
      setFinishPhase("details");goToStep("finish",false,true);
    } finally {
      draftRunActive.current=false;
      setRunning(false);
      setPreparationMessage("");
      setRunTotal(0);
    }
  }

  function finalDescription(design:DesignFile,details?:EtsyDetails){return design.descriptionOverride??[design.blurb??details?.blurb??"",description].filter(value=>value.trim()).join("\n\n")}
  async function syncListingFields(design:DesignFile,details?:EtsyDetails){const draft=drafts.find(item=>item.clientId===design.id);if(!draft?.id)throw new Error("The matching Printify draft could not be found.");const response=await fetch("/api/printify/drafts/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:draft.id,title:design.title,tags:design.tags,description:finalDescription(design,details),etsyDetails:details})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Printify could not save the completed listing.")}
  async function syncPreparedListing(design:DesignFile,details:EtsyDetails){await syncListingFields(design,details)}
  async function resolveEtsyOptions(details:EtsyDetails,taxonomyId?:number){const response=await fetch("/api/etsy/taxonomy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...details,taxonomyId,product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model}})}),payload=await response.json() as {categories?:EtsyCategoryOption[];selected?:{id:number;path:string};properties?:EtsyPropertySelection[];error?:string};if(!response.ok||!payload.selected)throw new Error(payload.error||"Etsy listing options could not be loaded.");if(payload.categories?.length)setEtsyCategories(payload.categories);return {...details,category:payload.selected.path,taxonomyId:payload.selected.id,properties:payload.properties||[]} }
  async function rememberEtsyDefaults(details:EtsyDetails){if(!activeRecipe)return;const physical=Object.fromEntries((details.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));if(!Object.keys(physical).length)return;const updated={...activeRecipe,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(!response.ok)throw new Error("Goldie prepared the Etsy details but could not remember the product defaults.");setActiveRecipe(updated)}
  async function prepareOne(design:DesignFile){try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model,description},title:design.title,tags:design.tags})}),payload=await response.json() as {details?:EtsyDetails;error?:string};if(!response.ok||!payload.details)throw new Error(payload.error||"Etsy details could not be prepared.");const defaults=productEtsyDefaults(templateDetails,activeRecipe?.etsyDefaults),initial={...payload.details,attributes:{...payload.details.attributes,...defaults},blurb:design.blurb?.trim()||payload.details.blurb},baseline=etsyProductBaseline.current,prepared=baseline?{...initial,taxonomyId:baseline.taxonomyId,category:baseline.category,attributes:{...initial.attributes,...baseline.attributes}}:initial,details=await resolveEtsyOptions(prepared);if(!baseline){const physical=Object.fromEntries((details.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));etsyProductBaseline.current={taxonomyId:details.taxonomyId,category:details.category,attributes:physical}}const updatedDesign={...design,blurb:details.blurb};await syncListingFields(updatedDesign,details);updateDesign(design.id,{blurb:details.blurb,etsy:details,etsyError:""});return details}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be prepared."});return null}}
  async function retryOneEtsyListing(design:DesignFile){if(preparingListingId)return;setPreparingListingId(design.id);try{await prepareOne(design)}finally{setPreparingListingId("")}}
  async function changeEtsyCategory(design:DesignFile,taxonomyId:number){if(!design.etsy||taxonomyId===design.etsy.taxonomyId)return;try{const resolved=await resolveEtsyOptions(design.etsy,taxonomyId),merged=preserveCompatibleEtsyProperties(design.etsy.properties||[],resolved.properties||[]),details={...resolved,properties:merged.properties};if(merged.clearedCount){setPendingCategoryChange({designId:design.id,details,clearedCount:merged.clearedCount});return}updateDesign(design.id,{etsy:details,etsyError:""})}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy options could not be loaded."})}}
  async function continueToEtsyDetails(){
    if(etsyPreparationActive.current)return;
    const missing:string[]=[];
    if(files.some(file=>!file.title.trim()))missing.push("Every listing needs a title.");
    if(files.some(file=>!file.tags.length))missing.push("Every listing needs at least one tag.");
    if(!description.trim())missing.push("Add the reusable product description.");
    if(missing.length)return void stopWith("Finish all sections first.",missing);
    etsyPreparationActive.current=true;
    const version=++etsyPreparationVersion.current;
    setPreparingEtsy(true);
    try{
      let failed=0,firstPrepared:EtsyDetails|null=null;
      await runBounded(files,2,prepareOne,result=>{if(!result)failed+=1;else firstPrepared??=result});
      if(version!==etsyPreparationVersion.current)return;
      if(failed)return void stopWith("Goldie could not complete every Etsy listing.",[`${failed} ${failed===1?"listing needs":"listings need"} another attempt. Use the retry button beside each listing.`]);
      if(firstPrepared)await rememberEtsyDefaults(firstPrepared);
      setFinishPhase("etsy");
      const url=new URL(window.location.href);url.searchParams.set("step","finish");url.searchParams.set("phase","etsy");window.history.replaceState({},"",url);
      window.scrollTo(0,0);
    }finally{
      if(version===etsyPreparationVersion.current)setPreparingEtsy(false);
      etsyPreparationActive.current=false;
    }
  }
  async function saveAllEtsyDetails(){if(etsySaveActive.current)return;const unfinished=files.filter(file=>!file.etsy);if(unfinished.length)return void stopWith("Finish every Etsy listing first.",unfinished.map(file=>`${file.name} still needs Etsy details.`));const invalid=files.map(file=>({file,problem:personalizationProblem(file.etsy)})).filter(item=>item.problem);if(invalid.length)return void stopWith("Finish the personalization options first.",invalid.map(item=>`${item.file.name}: ${item.problem}`));etsySaveActive.current=true;++etsyPreparationVersion.current;setPreparingEtsy(false);setSavingEtsyDetails(true);try{let failed=0;if(!localPreview)await runBounded(files,2,async design=>{try{await syncListingFields(design,design.etsy!);return true}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be saved."});return false}},saved=>{if(!saved)failed+=1});if(failed)return void stopWith("Some Etsy details were not saved.",[`${failed} ${failed===1?"listing needs":"listings need"} another attempt.`]);if(activeRecipe){const physical=Object.fromEntries((files[0]?.etsy?.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));if(Object.keys(physical).length){const updated={...activeRecipe,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});if(response.ok)setActiveRecipe(updated)}}setFinishPhase("mockups");const url=new URL(window.location.href);url.searchParams.set("step","finish");url.searchParams.set("phase","mockups");window.history.replaceState({},"",url);window.scrollTo(0,0)}finally{etsySaveActive.current=false;setSavingEtsyDetails(false)}}
  function createDrafts() {const issues=requiredForStep("review");if(issues.length)return void stopWith("This batch isn’t ready to create.",issues);const undecided=bundleQualityGroups.filter(group=>group.keys.some(key=>!bundleQualityDecisions[key]));if(undecided.length)return void stopWith("Choose what to do with every design flagged below.",undecided.map(group=>`${group.fileName} is below the recommended size for ${[...new Set(group.products)].join(", ")}. Choose Proceed anyway or Exclude.`));if(planDraftsRemaining!==null&&requestedListingCount>planDraftsRemaining)return void stopWith("This batch is larger than your remaining plan allowance.",[activeBundle?`${files.length} designs × ${bundleProductCount} products = ${requestedListingCount} listings after exclusions. You have ${planDraftsRemaining} listings remaining this month.`:`${planDraftsRemaining} ${planDraftsRemaining===1?"listing remains":"listings remain"} this month, but this batch contains ${files.length} designs.`]);if(!etsyShippingProfileId)return void stopWith("Choose shipping before creating drafts.",["Choose the Etsy shipping profile Goldie should apply to every listing."]);if(!pricingApproved)return void stopWith("Finish shipping first.",["Choose a shipping profile, then save or discard any custom shipping profile changes."]);setPreflightOpen(true);}
  function confirmDrafts() { const recipeId=activeRecipe?.id;const targets=files.filter(file=>bundleQualityDecisions[`${recipeId}:${file.id}`]!=="exclude");setPreflightOpen(false);void runDrafts(targets); }

  function retryFailed() {
    const failedIds = new Set(drafts.filter((draft) => draft.status !== "Created").map((draft) => draft.clientId));
    void runDrafts(files.filter((file) => failedIds.has(file.id)), true);
  }

  function startOver() {
    setRestartBatchName(batchDisplayName||suggestedBatchName());
    setRestartBatchOpen(true);
  }

  function finishRestart(preserveSavedBatch=false){clearCurrentBatch(true,preserveSavedBatch);setRestartBatchOpen(false);setRestartBatchName("");goToStep(connected?"setup":"connect",true,true)}
  async function saveAndRestart(){const name=restartBatchName.trim();if(!name)return;setRestartingBatch(true);try{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;await saveBatchFiles(id,files.map(file=>file.file));if(!localPreview){const response=await fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:"draft",step:workflowStep,setupName:name,productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{...batchStateSnapshot(),keptAsDrafts:true}})});if(!response.ok)throw new Error("Goldie could not save this batch.")}finishRestart(true)}catch(error){stopWith("This batch was not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setRestartingBatch(false)}}

  function openDraft(draft: DraftResult) {
    if (!draft.id || !draft.editorUrl) return;
    window.open(draft.editorUrl, "_blank", "noopener,noreferrer");
    setOpenedDrafts((current) => current.includes(draft.id!) ? current : [...current, draft.id!]);
  }

  function guardNavigation(event:{preventDefault:()=>void},href:string){if(!running)return;event.preventDefault();setLeaveTarget(href);setUploadNoticeOpen(true)}

  function openAllDrafts() {
    const editableDrafts = drafts.filter((draft) => draft.id && draft.editorUrl);
    let opened = 0;
    const openedIds: string[] = [];
    editableDrafts.forEach((draft) => {
      const printifyTab = window.open(draft.editorUrl!, "_blank", "noopener,noreferrer");
      if (!printifyTab) return;
      opened += 1;
      openedIds.push(draft.id!);
    });
    setOpenedDrafts((current) => [...new Set([...current, ...openedIds])]);
    setOpenAllMessage(opened === editableDrafts.length ? `${opened} Printify editor tabs opened.` : `Your browser opened ${opened} of ${editableDrafts.length}. Allow pop-ups for this site to open the rest.`);
  }

  const workflowHero = {
    connect: { eyebrow: "ACCOUNT SETUP", title: "Connect your accounts", copy: connected&&etsyConnected?"Both accounts are connected and ready.":"Connect Printify and Etsy so Goldie can build and publish your listings." },
    setup: templateDetails&&productSelected
      ? { eyebrow: "STEP 1 OF 4", title: "Build this batch", copy: "Check each product’s colours, sizes and pricing, then continue to your designs." }
      : { eyebrow: "STEP 1 OF 4", title: "Choose product", copy: "Choose a saved product or connect a completed Printify product." },
    designs: { eyebrow: "STEP 2 OF 4", title: "Add your designs", copy: "Add up to 20 finished designs for this batch." },
    review: { eyebrow: "STEP 3 OF 4", title: "Create Printify drafts", copy: "Goldie creates an unpublished draft in Printify for every design in this batch." },
    finish: finishPhase==="details" ? { eyebrow: "STEP 4 OF 4 · TITLES + TAGS", title: "Titles, tags + descriptions", copy: "Create the titles and tags, then review the description for every listing." } : finishPhase==="etsy" ? { eyebrow: "STEP 4 OF 4 · ETSY DETAILS", title: "Etsy listing details", copy: "Review the Etsy category and product-specific details." } : finishPhase==="mockups" ? { eyebrow: "STEP 4 OF 4 · IMAGES", title: "Images + mockups", copy: "Choose the final images for every listing." } : { eyebrow: "STEP 4 OF 4 · REVIEW", title: "Final review", copy: "Review every listing before publishing it live on Etsy." },
  }[workflowStep];

  return (
    <main className="app-shell" data-product-selected={templateDetails?"true":"false"} style={{"--active-product":`"${currentProductName.replace(/["\\]/g,"")}"`} as React.CSSProperties}>
      <section className="mobile-gate" aria-label="Desktop required">
        <div className="mobile-brand"><div className="approved-wm">Gold<span className="approved-i">ı<span>✦</span></span>e</div><div className="approved-sub">Listing Factory</div></div>
        <div className="mobile-card"><div className="mobile-command">⌘</div><h1>Oops, this one needs a bigger screen.</h1><p>Goldie Listing Factory is built for desktop. Hop onto your computer and sign in. Your saved work will be waiting for you.</p><div className="mobile-saved">✓ Your progress is saved automatically.</div></div>
        <div className="mobile-footer">Powered by Goldie AI · © 2026 Be A Wolf Biz</div>
      </section>
      <header className="topbar">
        <div className="brand-lockup">
          <GoldieWordmark className="approved-brand" />
        </div>
        <div className="top-actions">
          <nav className="top-nav" aria-label="Goldie navigation">
            <a className="active" href="/listing-factory" onClick={event=>guardNavigation(event,"/listing-factory")}><NavIcon name="listingFactory"/>Listing Factory</a>
            <a href="/batches" onClick={event=>guardNavigation(event,"/batches")}><NavIcon name="batches"/>Batch History</a>
            <a href="/keywords" target="_blank" rel="noopener noreferrer"><NavIcon name="keywords"/>Keyword Banks</a>
            <a href="/mockups" target="_blank" rel="noopener noreferrer"><NavIcon name="mockups"/>Mockup Library</a>
            <a href="/usage" onClick={event=>guardNavigation(event,"/usage")}><NavIcon name="usage"/>Usage + Plan</a>
          </nav>
          <button className="workflow-restart-button" type="button" disabled={running} onClick={startOver}><span aria-hidden="true">↻</span> Start a new batch</button>
          <GoldieCommandBar data={commandCenterData} onUseProduct={recipe=>{void chooseRecipe(recipe).then(selected=>{if(selected)goToStep("setup")})}} onStartBlank={()=>{clearCurrentBatch(true);goToStep("setup")}}/>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <a className="usage-link" href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + Plan</a>
          {signedIn!==null&&(localPreview&&!signedIn?<span className="account-link" title="Account sign-in is available on the published Listing Factory site.">Preview mode</span>:<a className="account-link" href={signedIn?"/account/sign-out?return_to=%2Flisting-factory":"/account/sign-in?return_to=%2Flisting-factory"}>{signedIn?"Sign out":"Sign in"}</a>)}
        </div>
        <div className="approved-sidebar-footer"><a className="approved-usage" href="/usage"><b>Usage + Plan</b><span>{sidebarUsage?`${sidebarUsage.used} / ${sidebarUsage.limit} listings`:"Loading usage…"}</span><div className="approved-usage-track" aria-hidden="true"><i style={{width:sidebarUsage?`${Math.min(100,sidebarUsage.used/sidebarUsage.limit*100)}%`:"0%"}} /></div></a><div className="approved-powered"><span>Powered by</span><b>Gold<span className="approved-footer-i">ı<i>✦</i></span>e AI</b></div><small>© 2026 Be A Wolf Biz</small><p className="etsy-api-disclosure">The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p></div>
      </header>

      {running&&uploadNoticeOpen&&<div className="upload-notice-backdrop" role="presentation"><section className="upload-notice" role="alertdialog" aria-modal="true" aria-labelledby="upload-notice-title" aria-describedby="upload-notice-copy"><span className="upload-notice-icon">!</span><p className="mini-label">UPLOADS IN PROGRESS</p><h2 id="upload-notice-title">Wait. Your files are still uploading.</h2><p id="upload-notice-copy">Are you sure you want to leave? Leaving now may stop the unfinished uploads.</p><div className="upload-notice-progress"><span className="upload-guard-pulse"/><b>{processed} of {runTotal} finished</b></div><div className="upload-notice-actions"><button autoFocus onClick={()=>{setUploadNoticeOpen(false);setLeaveTarget("")}}>Stay on this page</button><button className="danger" onClick={()=>{if(leaveTarget)window.location.href=leaveTarget}}>Leave and stop uploads</button></div></section></div>}

      {!returningHome&&<section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{workflowHero.eyebrow}</p>
          <div className="heading-with-help hero-title-help"><h1>{workflowHero.title}</h1><ContextHelp label={`Open detailed help for ${PROGRESS_STEPS[progressIndex]}`} title={WORKFLOW_HELP[progressIndex].title} intro={WORKFLOW_HELP[progressIndex].intro} sections={WORKFLOW_HELP[progressIndex].sections}/></div>
          <p className="hero-step-count">{railInFinish?`Finish · ${PROGRESS_SHORT_LABELS[progressIndex]} (${progressIndex-RAIL_FINISH_FIRST+1} of ${RAIL_FINISH.length})`:`Step ${railTopNumber} of ${RAIL_TOP.length+1}`}</p>
          <p className="hero-copy">{workflowHero.copy}</p>
          {workflowStep==="connect"&&<div className="value-proof" aria-label="What this batch supports"><span><b>Up to 20 designs</b><small>in one batch</small></span><span><b>Costs and fees</b><small>shown for every variant</small></span><span><b>You approve</b><small>before anything goes live</small></span></div>}
        </div>
      </section>}

      {!returningHome&&<section className={`workspace ${complete&&workflowStep==="finish"&&finishPhase==="mockups"?"mockup-workspace":""}`}>
        <nav className="workflow-progress" aria-label="Listing Factory progress">
          <div className="workflow-progress-head"><div><p className="mini-label">YOUR BATCH</p><b>{railInFinish?`Finish · ${PROGRESS_SHORT_LABELS[progressIndex]} (${progressIndex-RAIL_FINISH_FIRST+1} of ${RAIL_FINISH.length})`:`Step ${railTopNumber} of ${RAIL_TOP.length+1}`}</b></div>{(template||files.length>0||drafts.length>0)&&<button className="start-new-batch" disabled={running} onClick={startOver}>Clear batch + start over</button>}</div>
          {localPreview&&<p className="preview-mode-note">Preview mode · every step is unlocked <a href="/design-lab">Open design lab →</a></p>}
          {RAIL_TOP.map((index,position)=>{const label=PROGRESS_STEPS[index],active=progressIndex===index||(index===RAIL_PRICING&&progressIndex===RAIL_DRAFTS),done=index<progressIndex&&!(index===RAIL_PRICING&&progressIndex===RAIL_DRAFTS),issues=progressGateIssues(index),available=!issues.length,draftLine=index===RAIL_PRICING&&complete?` · ${createdDraftCount} drafts created`:"";return <button key={label} className={`${active?"active":""} ${done?"done":""}`} disabled={!available} aria-current={active?"step":undefined} title={issues[0]||undefined} onClick={()=>openProgressStep(index)}><em className="progress-bubble-label">{PROGRESS_SHORT_LABELS[index]}</em><span>{done?"✓":String(position+1).padStart(2,"0")}</span><span><b>{label}</b><small>{issues[0]||`${progressStatus(index,active,done,Boolean(issues.length))}${draftLine}`}</small></span></button>})}
          {(()=>{const issues=progressGateIssues(RAIL_FINISH_FIRST);return <button className={railInFinish?"active":""} disabled={Boolean(issues.length)} aria-current={railInFinish?"step":undefined} title={issues[0]||undefined} onClick={()=>openProgressStep(RAIL_FINISH_FIRST)}><em className="progress-bubble-label">Finish</em><span>{String(RAIL_TOP.length+1).padStart(2,"0")}</span><span><b>Finish listings</b><small>{issues[0]||(railInFinish?`${PROGRESS_SHORT_LABELS[progressIndex]} · ${progressIndex-RAIL_FINISH_FIRST+1} of ${RAIL_FINISH.length}`:complete?"Titles, photos, publish":"Complete the prior step")}</small></span></button>})()}
          {(railInFinish||complete)&&<div className="rail-substeps" role="group" aria-label="Finish listings steps">{RAIL_FINISH.map((index,position)=>{const active=progressIndex===index,done=index<progressIndex,issues=progressGateIssues(index);return <button key={PROGRESS_STEPS[index]} className={`rail-substep ${active?"active":""} ${done?"done":""}`} disabled={Boolean(issues.length)} aria-current={active?"step":undefined} title={issues[0]||undefined} onClick={()=>openProgressStep(index)}><span className="rail-substep-dot">{done?"✓":position+1}</span><span><b>{FINISH_RAIL_LABELS[position]}</b><small>{issues[0]||progressStatus(index,active,done,Boolean(issues.length))}</small></span></button>})}</div>}
          <p className="workflow-help">Goldie saves completed work. You can return to an earlier step without starting over.</p>
        </nav>
        <div className="workflow-stage">
        {progressIndex>0&&<WorkflowMomentum
          current={railTopNumber}
          total={RAIL_TOP.length+1}
          label={progressIndex===PROGRESS_STEPS.length-1?"Final review":`Next: ${PROGRESS_STEPS[Math.min(progressIndex+1,PROGRESS_STEPS.length-1)]}`}
        />}
        {activeBundle&&bundleRecipes.length>1&&<section className="bundle-progress" aria-label={`Product bundle ${activeBundle.name}`}><div><span>PRODUCT BUNDLE · PRODUCT {bundleIndex+1} OF {bundleRecipes.length}</span><b>{bundleRecipes[bundleIndex]?.name}</b><small>{activeBundle.name}</small></div><ol>{bundleRecipes.map((recipe,index)=><li className={index<bundleIndex?"complete":index===bundleIndex?"current":""} key={recipe.id}><span>{index<bundleIndex?"✓":index+1}</span><b>{recipe.name}</b><small>{index<bundleIndex?"Complete":index===bundleIndex?"You are here":"Up next"}</small></li>)}</ol></section>}
        {progressIndex>0&&<GoldieInsight>{currentInsight()}</GoldieInsight>}
        {progressIndex===3&&files.length>0&&<ActionReceipt items={[{value:`${files.length} designs checked`,label:"Original artwork resolution preserved"},{value:`${pricedVariants.length} variants`,label:pricingApproved?"Pricing approved":"Ready for pricing review"}]}/>}
        {progressIndex===5&&titleCount>0&&<ActionReceipt items={[{value:`${titleCount} titles ready`,label:"Validated keyword phrases only"},{value:`${files.reduce((sum,file)=>sum+file.tags.length,0)} matching tags`,label:"Zero invented keywords"}]}/>}
        <div className={`steps-column ${workflowStep}-column`}>
          {workflowStep==="finish"&&finishPhase==="etsy"&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Titles, tags, and descriptions complete</b><small>{files.length} {files.length===1?"listing is":"listings are"} ready for Etsy details.</small></div></div>}
          {workflowStep==="finish"&&finishPhase==="mockups"&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Etsy details complete</b><small>{files.length} {files.length===1?"listing is":"listings are"} ready for photos and mockups.</small></div></div>}
          {workflowStep==="finish"&&finishPhase==="final"&&allCreatedListingsHaveImages()&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Listing photos complete</b><small>Every listing has at least one photo and is ready for final review.</small></div></div>}
          <article className={`step-card connect-step workflow-panel ${connected ? "done" : ""} ${workflowStep==="connect"?"active-panel":"hidden-panel"}`}>
            <div className="step-number">01</div>
            <div className="step-content">
              <div className="step-heading"><div><div className="heading-with-help"><h2>Connect your accounts</h2></div></div></div>
              <p className="step-copy">{connected&&etsyConnected?"Both connections are verified. Goldie will remember them for future batches.":"Connect the Printify account that creates your products and the Etsy shop that receives them."}</p>
              {(!connected||!etsyConnected)&&<p className="connect-timing">◷ First-time connection usually takes about 2 minutes.</p>}
              {checkingConnection ? (
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Secure connection check…</b><small>This takes just a moment</small></div></div>
              ) : !connected ? (
                <div className="connection-stack connection-setup">
                  <section className="printify-service-group">
                  <div className="connection-row service-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify</b><small>Create and update your product drafts.</small></div><button onClick={()=>setShowTokenForm(value=>!value)}>{showTokenForm?"Close":"Connect Printify"}</button></div>
                  {showTokenForm&&<div className="inline-field approved-token-form"><label>Paste the token you copied from Printify</label><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token here" aria-label="Printify token" /><button aria-busy={connecting} onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect securely"}</button></div>}
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                  <details className="token-help approved-token-help">
                    <summary>How to get your Printify token <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></summary>
                    <div className="approved-token-instructions"><b>Get your Printify token step by step</b><div className="token-shop-warning"><b>First, make sure you are in the right Printify account</b><span>Sign in to the account that contains the Etsy shop and saved products you want Goldie to use. A token connects the whole Printify account. In Step 2, your saved product tells Goldie which exact shop to use.</span></div>
                    <ol>
                      <li>Open Printify and click your profile icon.</li>
                      <li>Choose <b>My Profile</b>, then open <b>Connections</b>.</li>
                      <li>If Printify asks for a developer contact email, enter an email address you check and save it.</li>
                      <li>Find <b>Personal Access Tokens</b> and click <b>Generate</b>.</li>
                      <li>Name the token <b>Goldie Listing Factory</b>.</li>
                      <li>Turn on these permissions: <b>shops.read, catalog.read, products.read, products.write, uploads.read, uploads.write, and print_providers.read</b>. Goldie does not need order permissions.</li>
                      <li>Click <b>Generate token</b>, then copy it immediately. Printify only shows the full token once.</li>
                      <li>Come back to this page, paste the token below, and click <b>Connect Printify</b>. Goldie will verify the account before letting you continue.</li>
                    </ol>
                    <a href="https://help.printify.com/hc/en-us/articles/4483626447249-How-can-I-generate-an-API-token" target="_blank" rel="noreferrer">Open Printify’s official token instructions ↗</a></div>
                  </details>
                  </section>
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<span className="sr-only">Connect Etsy before publishing</span><small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="disconnect-link" onClick={async()=>{await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" aria-busy={etsyConnecting} onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                  <small className="secure-copy">♢ Encrypted and saved securely.</small>
                </div>
              ) : (
                <div className="connection-stack connection-setup connected-connection-stack">
                  <div className="connection-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button className="disconnect-link" onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="disconnect-link" onClick={async()=>{await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                </div>
              )}
              {connected&&connectionError&&<p className="field-warning" role="status">{connectionError}</p>}
              {etsyError&&<p className="field-error" role="alert">{etsyError}</p>}
              {(localPreview||(connected&&etsyConnected))&&<button className="workflow-next" onClick={()=>goToStep("setup",false,localPreview)}>Next step <span>→</span></button>}
            </div>
          </article>

          <div className={`product-step workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}><SavedWorkflow savedRevision={savedRevision} connected={connected||localPreview} templateUrl={template} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} suggestedProductName={templateDetails?[templateDetails.brand,templateDetails.model].filter(Boolean).join(" ").trim()||templateDetails.blueprintTitle||"":""} selectedProductId={activeBundle?`bundle:${activeBundle.id}`:activeRecipe?.id||""} selectedSummary={templateDetails?<div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info">{bundleSelected?<><b>{activeBundle?.name}</b><span>{bundleRecipes.length} products · {bundleRecipes.map(item=>item.name).join(" · ")}</span><span>✓ Each product keeps its own colors, sizes, mockups, and keywords</span></>:<><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {variantSummary(summaryAxes(templateDetails,activeRecipe))}</span><span>✓ Product, placement, sizes, and shipping profile imported</span></>}</div><span className="template-badge">{bundleSelected?"Bundle selected":productSelected?"Product selected":"Save this product"}</span></div>:null} verifiedShippingProfileId={Number(templateDetails?.shippingTemplateId)||0} onTemplateUrl={(value) => { templateLoadVersion.current+=1;setLoadingTemplate(false);setTemplate(value);setTemplateDetails(null);setTemplateError(""); }} onUseRecipe={chooseRecipe} onUseBundle={useBundle} onStartNewProduct={startNewProduct} onChangeProduct={changeProduct} onVerifyTemplate={loadTemplateUrl} />
          {localPreview&&!templateDetails&&<button className="preview-demo-button" onClick={()=>void loadPreviewDemo()}>Load a complete poster demo to review every step</button>}
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          <BatchPreferencesPortal>
          {templateDetails&&productSelected&&activeRecipe?.setupComplete===false&&<div className="product-setup-framing first-product-setup"><p className="mini-label">{`SET UP ${activeRecipe.name}`}</p><span>Choose this product’s starting defaults once. Nothing is copied from another product.</span></div>}
          
          {templateDetails&&productSelected&&<div className="saved-product-batch-page"><section className="batch-products" aria-label="Products in this batch">{(activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[])).map((recipe,index)=>{const isActive=!activeBundle||bundleRecipes.length<2||index===bundleIndex;const product=isActive?templateDetails:bundleColorProducts[recipe.id];if(!product)return <p className="bundle-product-loading" key={recipe.id}>Loading {recipe.name}…</p>;const ready=readinessFor(product,recipe);const open=openFacet[recipe.id]??(ready.questions[0]||"");const toggle=(name:string)=>setOpenFacet(current=>({...current,[recipe.id]:current[recipe.id]===name?"":name}));
          /* D218 · Every picker used to render after the whole row list, so clicking
             Change on Colours opened the palette below Etsy details and the seller had
             to scroll past six rows to reach the thing they just asked for. The panel
             JSX is unchanged; it is emitted inside the row map now, directly beneath
             the row that opened it. The parameter shadows `open` so the existing
             guards read correctly without rewriting them. */
          const panelFor=(open:string)=><>{open==="colors"&&<ProductColorSelector product={product} selected={shownColors} onChange={ids=>{if(isActive){setSelectedColorIds(ids);setPricingApproved(false)}else setBundleColorChoices(current=>({...current,[recipe.id]:ids}));void establish(recipe,{defaultColorIds:ids})}} onRemember={()=>{}} remembering={false} remembered={false}/>}{open==="sizes"&&<ProductSizeSelector product={product} selected={shownSizes} onChange={ids=>{if(isActive){setSelectedSizeIds(ids);setPricingApproved(false)}else setBundleSizeChoices(current=>({...current,[recipe.id]:ids}));void establish(recipe,{defaultSizeIds:ids})}} onRemember={()=>{}} remembering={false} remembered={false}/>}{open==="shipping"&&<div className="row-panel shipping-row-panel"><label><span>Shipping profile — what the buyer pays</span><select aria-label={`Shipping profile for ${recipe.name}`} value={isActive?etsyShippingProfileId:(Number(recipe.etsyShippingProfileId)||0)} onChange={event=>{const id=Number(event.target.value);if(isActive){setEtsyShippingProfileId(id);setPricingApproved(false)}void establish(recipe,{etsyShippingProfileId:id})}}><option value={0}>Choose a shipping profile</option>{etsyShippingProfiles.map(profile=><option key={profile.id} value={profile.id}>{shippingProfileOptionLabel(profile)}</option>)}</select></label></div>}{open==="profit"&&<div className="row-panel profit-row-panel"><label><span>Profit goal per item</span><span className="profit-input">$<input type="number" min="0" max="500" step="1" value={isActive?pricing.targetProfit:(Number(recipe.defaultProfitTarget)||DEFAULT_PRICING.targetProfit)} onChange={event=>{const value=Number(event.target.value)||0;if(isActive){setPricing(current=>({...current,targetProfit:value}));setPricingApproved(false)}void establish(recipe,{defaultProfitTarget:value})}}/></span></label><small>Shipping stays separate because the buyer pays it.</small></div>}{open==="mockups"&&<MockupSetSelector productName={product.blueprintTitle} value={isActive?mockupTheme:(bundleMockupChoices[recipe.id]?.theme??recipe.defaultMockupTheme??"")} selectedIds={isActive?(sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]):(bundleMockupChoices[recipe.id]?.ids??recipe.mockupIds??[])} savedValue={recipe.defaultMockupTheme||""} savedIds={recipe.mockupIds} onChange={(theme,ids=[])=>{if(isActive){const next=theme?{theme,ids}:undefined;setMockupTheme(theme);setSharedMockups(next);window.sessionStorage.setItem("goldie-batch-mockups",JSON.stringify(next||null))}else setBundleMockupChoices(current=>({...current,[recipe.id]:{theme,ids}}));void establish(recipe,{defaultMockupTheme:theme,mockupIds:ids})}} saving={false} onSaveDefault={()=>{}}/>}{open==="keywords"&&<div className="bundle-product-keywords"><KeywordBank compact selectionOnly initialId={isActive?(autoTitleBankId||recipe.keywordListId||""):(bundleKeywordChoices[recipe.id]??recipe.keywordListId??"")} onSelect={list=>{const id=list?.id||"";if(isActive){setAutoTitleBank(list);setAutoTitleBankId(id)}else setBundleKeywordChoices(current=>({...current,[recipe.id]:id}));void establish(recipe,{keywordListId:id})}}/></div>}</>;const colorFacet=ready.facets.find(facet=>facet.name==="colors");const sizeFacet=ready.facets.find(facet=>facet.name==="sizes");const shownColors=(isActive?selectedColorIds:bundleColorChoices[recipe.id])||recipe.defaultColorIds||colorFacet?.suggested?.colorIds||[];const shownSizes=(isActive?selectedSizeIds:bundleSizeChoices[recipe.id])||recipe.defaultSizeIds||sizeFacet?.suggested?.sizeIds||[];return <article className={`batch-product-card ${ready.established?"is-ready":"needs-setup"} ${bundleSelected?"in-batch":""}`} key={recipe.id}><header>{pickProductPhoto(product)?<img className="bundle-product-photo" src={pickProductPhoto(product)} alt="" loading="lazy" decoding="async"/>:<span className="bundle-product-photo placeholder" aria-hidden="true"/>}<span className="bundle-product-id">{bundleSelected&&<em className="batch-product-position">Product {index+1} of {bundleRecipes.length}</em>}<b>{recipe.name}</b><small>{product.blueprintTitle}</small></span><span className={`batch-product-state ${ready.established?"":"attention"}`}>{ready.established?"Ready":`${ready.questions.length} to set`}</span></header><div className="batch-product-rows">{[...ready.facets].sort((a,b)=>(a.state==="ask"?0:1)-(b.state==="ask"?0:1)).map(facet=>{const label=({colors:"Colors",sizes:"Sizes",mockups:"Mockups",keywords:"Keywords",shipping:"Shipping",profit:"Profit",etsy:"Etsy details"} as Record<string,string>)[facet.name];const action=({colors:"Pick colors",sizes:"Pick sizes",mockups:"Pick a mockup set",keywords:"Pick a keyword bank",shipping:"Pick a shipping profile",profit:"Set a profit goal",etsy:"Add Etsy details"} as Record<string,string>)[facet.name];const needed=facet.state==="ask";const inCard=["colors","sizes","mockups","keywords","shipping","profit"].includes(facet.name);const suggestion=(facet.suggested?.colorIds||facet.suggested?.sizeIds||[]).length;const openThis=()=>{if(inCard){toggle(facet.name);return}const block=document.querySelector<HTMLDetailsElement>(".everything-else");if(block){block.open=true;block.scrollIntoView({block:"start"});block.classList.add("just-opened");window.setTimeout(()=>block.classList.remove("just-opened"),1600)}};return <Fragment key={facet.name}><div className={`batch-product-row ${needed?"needed":"settled"} ${open===facet.name?"open":""}`}><span className="row-mark" aria-hidden="true">{needed?"!":"\u2713"}</span><span className="row-label">{label}</span><span className="row-value">{needed?action:facet.label}{facet.note?<small>{facet.note}</small>:null}</span>{needed&&suggestion>0?<button type="button" className="row-shortcut" onClick={()=>{if(facet.name==="colors"){const ids=facet.suggested?.colorIds||[];if(isActive){setSelectedColorIds(ids);setPricingApproved(false)}else setBundleColorChoices(current=>({...current,[recipe.id]:ids}));void establish(recipe,{defaultColorIds:ids})}else{const ids=facet.suggested?.sizeIds||[];if(isActive){setSelectedSizeIds(ids);setPricingApproved(false)}else setBundleSizeChoices(current=>({...current,[recipe.id]:ids}));void establish(recipe,{defaultSizeIds:ids})}}}>Use Printify&rsquo;s {suggestion} {facet.name==="colors"?(suggestion===1?"color":"colors"):(suggestion===1?"size":"sizes")}</button>:null}<button type="button" className="row-open" onClick={openThis}>{inCard?(open===facet.name?"Close":needed?"Choose":"Change"):"Open settings"}</button></div>{inCard&&open===facet.name?panelFor(facet.name):null}</Fragment>;})}</div></article>})}</section><MockupSetSelector value={mockupTheme} savedValue={activeRecipe?.defaultMockupTheme||""} onChange={setMockupTheme} saving={savingProductDefault==="mockups"} onSaveDefault={()=>void saveProductDefaults({defaultMockupTheme:mockupTheme},"mockups")}/><details className="everything-else"><summary><span><b>{`${activeRecipe?.name||"This product"} — description and Etsy details`}</b><small>{[description.trim()?"description saved":"no description yet",`Etsy details ${Object.keys(activeRecipe?.etsyDefaults||{}).length} saved`].join(" · ")}</small>{(!activeRecipe?.keywordListId||!description.trim())&&<b className="setup-todo">{`${[!activeRecipe?.keywordListId&&"keyword bank",!description.trim()&&"description"].filter(Boolean).join(" and ")} still to set`}</b>}</span><em>Edit</em></summary><div className="everything-else-body"><section><div><b>Keyword bank</b><span>Used for generated titles and matching tags.</span></div><KeywordBank compact selectionOnly initialId={autoTitleBankId||activeRecipe?.keywordListId||""} onSelect={list=>{setAutoTitleBank(list);setAutoTitleBankId(list?.id||"")}}/>{autoTitleBankId!==String(activeRecipe?.keywordListId||"")&&<button type="button" className="save-product-default" disabled={!autoTitleBankId||savingProductDefault==="keywords"} onClick={()=>void saveProductDefaults({keywordListId:autoTitleBankId},"keywords")}>{savingProductDefault==="keywords"?"Saving…":"Save this keyword bank as the default"}</button>}</section><section className="description-default-editor"><div><b>Product description</b><span>Used for every listing unless you customize one later.</span></div><textarea aria-label="Description for this batch" rows={5} value={description} onChange={event=>setDescription(event.target.value)}/>{description.trim()!==String(activeRecipe?.description||"").trim()&&<button type="button" className="save-product-default" disabled={!description.trim()||savingProductDefault==="description"} onClick={()=>void saveProductDefaults({description},"description")}>{savingProductDefault==="description"?"Saving…":"Save this description as the default"}</button>}</section><section className="saved-setting-list"><span><b>Etsy details</b>{Object.keys(activeRecipe?.etsyDefaults||{}).length?`${Object.keys(activeRecipe?.etsyDefaults||{}).length} product facts remembered`:"Goldie will pre-fill them from this product"}</span><span><b>Listing photos</b>{activeRecipe?.printifyImageIndices?.length?`${activeRecipe.printifyImageIndices.length} Printify photos remembered`:"Choose after previews are created"}</span></section><details className="product-connection-details"><summary>Product connection</summary><p>This link stays attached to the saved product. Change it only if you replace the published Printify product.</p><code>{activeRecipe?.templateUrl}</code></details></div></details></div>}
          
          {templateDetails&&!productSelected&&<p className="field-warning recipe-error" role="status">Name and save this product before continuing, or select one of your saved products above.</p>}
          
          
          
          {templateDetails&&productSelected&&activeRecipe?.setupComplete===false&&<button type="button" className="save-initial-product-setup" disabled={!selectedColorIds.length||savingProductDefault==="initial-setup"} onClick={()=>void completeProductSetup()}>{savingProductDefault==="initial-setup"?"Saving this product’s defaults…":`Save these as ${activeRecipe.name}’s defaults`}</button>}
          {/* D217 · Pricing moves onto the Product page. Colours and sizes decide which
              variants exist, and the price is set per variant, so pricing could never
              be answered before them — it was a whole separate step for a panel that
              belongs directly underneath the thing it prices. This is the existing
              PricingReview component moved intact: grouped per-size prices, the
              matching-cost grouping, whole-number pricing and the shipping profile all
              come with it. Nothing here is rebuilt. */}
          {pricedVariants.length>0&&<PricingReview
            variants={pricedVariants}
            pricing={pricing}
            prices={variantPrices}
            productName={activeRecipe?.name||templateDetails?.blueprintTitle||"This product"}
            profiles={etsyShippingProfiles}
            selectedProfileId={etsyShippingProfileId}
            profilesLoading={shippingProfilesLoading}
            profilesError={shippingProfilesError}
            approved={pricingApproved}
            onPricing={value=>{setPricing(value);setPricingApproved(false)}}
            onPrices={value=>{setVariantPrices(value);setPricingApproved(false)}}
            onSelectProfile={value=>{setEtsyShippingProfileId(value);setPricingApproved(false)}}
            onCreateProfile={createCustomShippingProfile}
            onApprovalChange={setPricingApproved}
          />}
          {templateDetails&&productSelected&&<button type="button" className="workflow-next setup-forward" disabled={!complete&&(!selectedColorIds.length||(Boolean(templateDetails?.sizeOptions?.length)&&!selectedSizeIds.length)||!autoTitleBankId||bundleKeywordGaps.length>0||activeRecipe?.setupComplete===false)} onClick={()=>complete?goToStep("finish",false,true):goToStep("designs")}>{complete?"Back to finishing your listings":activeRecipe?.setupComplete===false?"Save this product’s defaults to continue":!selectedColorIds.length?"Choose product colors to continue":Boolean(templateDetails?.sizeOptions?.length)&&!selectedSizeIds.length?"Choose product sizes to continue":!autoTitleBankId?"Pick a keyword bank to continue":bundleKeywordGaps.length?`Pick a keyword bank for ${bundleKeywordGaps.join(", ")}`:"Continue to designs"} <span>→</span></button>}
          </BatchPreferencesPortal>
          </div>

          <article className={`step-card designs-step workflow-panel ${workflowStep==="setup"?"batch-design-drop":""} ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${workflowStep==="designs"||(workflowStep==="finish"&&finishPhase==="details")?"active-panel":"hidden-panel"}`}>
            <div className="step-number">{workflowStep==="finish"?"06":"03"}</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">{workflowStep==="finish"?"TITLES, TAGS + DESCRIPTIONS":"DESIGNS FOR THIS BATCH"}</p><div className="heading-with-help"><h2>{workflowStep==="finish"?"Finish titles, tags, and descriptions":"Drop your designs here"}</h2></div></div>{files.length > 0 && workflowStep==="finish" && <span className="done-mark">✓ {files.length} listings</span>}</div>
              <p className="step-copy">{workflowStep==="finish"?"Create titles and matching tags, review each listing, and confirm the description shared across the batch.":`Build one focused batch of up to ${batchDesignLimit} finished designs. Upload a folder or select individual images.`}</p>
              {workflowStep==="finish"&&<div className="finish-guide"><span><b>1</b> Create titles + tags</span><span><b>2</b> Review each listing</span><span><b>3</b> Confirm description</span></div>}
              {!files.length&&<p className="batch-limits" aria-label="Batch limits"><span className="batch-limits-quota"><b>{planDraftsRemaining===null?"Checking your plan limit…":`${batchDesignLimit} designs available for this batch`}</b><i /><b>{activeBundle?`${bundleProductCount} listings per design`:`${planDraftsRemaining??"—"} listings remain on your plan`}</b></span><span className="batch-limits-note">100 MB per design · original print quality preserved</span></p>}
              <div className="file-reminder"><b>Before uploading</b><span>Designs should already be full size. Save as a PNG with a see-through background if you don’t want a colored box printed behind your art.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => void chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => void chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? designsFinished?"Choose a folder to add more":`Choose a folder · preparing ${designsReady} of ${files.length}` : "Choose a folder"}</b><small>{files.length ? `${files.length} design${files.length===1?"":"s"} ready · ${(totalSize / 1024 / 1024).toFixed(1)} MB selected${totalSize>LARGE_BATCH_THRESHOLD?" · will process one at a time":""} · Choose again to add more` : `Add up to ${batchDesignLimit} designs in this batch`}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Choose individual images</b><small>Select one image or several at once</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
              {fileError && <p className="file-limit-error" role="alert"><b>That batch can’t be added.</b><span>{fileError}</span></p>}
              {fileNotice&&(workflowStep==="setup"||workflowStep==="designs")&&<p className="file-add-notice" role="status"><b>Upload updated</b><span>{fileNotice}</span></p>}
              {files.length>0&&!designsFinished&&<section className="design-preparation-status working" role="status" aria-live="polite"><span className="design-status-icon" aria-hidden="true"/><div><b>{`Goldie is preparing your designs: ${designsReady} of ${files.length} ready`}</b><small>Keep this page open. Goldie is reading every file and checking its dimensions before you can continue.</small><div className="design-status-track"><i style={{width:`${files.length?designsReady/files.length*100:0}%`}}/></div></div><strong>{designsReady}/{files.length}</strong></section>}
              {files.length > 0 && designsFinished && <div className="batch-capacity"><b>{planDraftsRemaining===null?"Checking plan allowance…":activeBundle?`${files.length} designs × ${bundleProductCount} products = ${requestedListingCount} listings · ${additionalDesignsAvailable} more designs available`:`${files.length} of ${batchDesignLimit} designs ready · ${additionalDesignsAvailable} more available · ${planDraftsRemaining} listings left on your plan`}</b></div>}
              {activeBundle&&bundleQualityGroups.length>0&&<section className="bundle-quality-review" aria-label="Product-specific print quality warnings"><div><b>{bundleQualityGroups.length} of {files.length} {files.length===1?"design needs":"designs need"} a print decision</b><span>The same artwork can be sharp on one product and too small for another. Anything below 215 DPI is flagged as very low resolution. Nothing is skipped silently.</span><div className="bundle-quality-bulk"><button type="button" onClick={()=>decideAllQuality("include")}>Proceed with all {bundleQualityGroups.length}</button><button type="button" onClick={()=>decideAllQuality("exclude")}>Exclude all {bundleQualityGroups.length}</button></div></div>{bundleQualityGroups.map(group=>{const decision=qualityGroupDecision(group.keys);const productList=[...new Set(group.products)];return <article className={group.critical?"critical-dpi":""} key={group.fileId}><div><b>{group.fileName}</b><span>{group.critical?<strong>VERY LOW RESOLUTION · {group.worstDpi} DPI · </strong>:null}{group.actualWidth} × {group.actualHeight}px is below the recommended size for <strong>{productList.join(", ")}</strong>{productList.length>1?` — ${productList.length} products in this bundle`:""}.</span></div><div><button className={decision==="include"?"selected":""} onClick={()=>decideQualityGroup(group.keys,"include")}>{group.critical?"I understand — proceed":"Proceed anyway"}</button><button className={decision==="exclude"?"selected exclude":""} onClick={()=>decideQualityGroup(group.keys,"exclude")}>{productList.length>1?"Exclude these listings":"Exclude this listing"}</button></div></article>})}</section>}
              {files.length>0&&(workflowStep==="setup"||workflowStep==="designs")&&<div className="design-upload-review" aria-label="Review uploaded designs">{files.map(file=><article key={file.id}><img src={file.previewUrl} alt="" loading="lazy" decoding="async"/><div><b title={file.name}>{file.name}</b><small>{file.width&&file.height?`${file.width} × ${file.height}px`:"Checking dimensions…"}</small></div><button type="button" onClick={()=>removeDesign(file.id)} aria-label={`Remove ${file.name}`}>Remove</button></article>)}</div>}
              {files.length>0&&!complete&&(workflowStep==="setup"||workflowStep==="designs")&&<>{designsFinished&&belowRecommendedPixels.length>0&&<div className={`pixel-warning-inline ${criticalDpiFiles.length?"critical-dpi":""}`} role="status"><span>!</span><div><b>{criticalDpiFiles.length?`${criticalDpiFiles.length} ${criticalDpiFiles.length===1?"design is":"designs are"} below 215 DPI — very low resolution.`:belowRecommendedPixels.length===1?"One design is below Printify’s recommended pixel size.":"Some designs are below Printify’s recommended pixel size."}</b><small>{criticalDpiFiles.length?"Goldie will identify every affected design and require confirmation before continuing.":"You can still continue, but Goldie will ask you to confirm first."}</small></div></div>}{workflowStep!=="setup"&&<button className="workflow-next" disabled={!designsFinished} onClick={continueFromDesigns}>{designsFinished?"Review this batch":`Preparing ${designsPreparing} ${designsPreparing===1?"design":"designs"}…`} {designsFinished&&<span>→</span>}</button>}</>}
              {files.length>0&&complete&&workflowStep==="designs"&&<button className="workflow-next" onClick={()=>goToStep("finish",false,true)}>Back to finishing your listings <span>→</span></button>}
              {files.length > 0 && complete && workflowStep==="finish" && finishPhase==="details" && <div className={`listing-editor ${titlePulseIds.size?"titles-resolving":""}`}>
                <div className="editor-heading"><div><b>1. Create titles and tags</b><span>Goldie analyzes every design separately and selects only exact phrases from your validated keyword bank. Goldie never adds keywords. Review or edit any listing afterward.</span></div><span>{files.length} listings</span></div>
                <div className="title-capitalization-control"><div><b>Title capitalization</b><span>Capitalize the first letter of every word in generated and batch-built titles.</span></div><button type="button" className={titleCaps?"active":""} aria-pressed={titleCaps} onClick={()=>changeTitleCaps(!titleCaps)}>Capitalization: {titleCaps?"On":"Off"}</button></div>
                <section className="batch-title-builder"><div><p className="mini-label">BATCH TITLE BUILDER</p><h3>Create titles for the whole batch</h3><p>Let Goldie select from your validated bank for each design, or choose the exact phrases yourself. No new keywords are ever added.</p></div><div className="title-builder-choice" role="group" aria-label="How do you want to create batch titles?"><button className={titleBuilderMode==="ai"?"active":""} onClick={()=>setTitleBuilderMode("ai")}><b>Goldie selects from my bank</b><span>Creates a different title for each design</span></button><button className={titleBuilderMode==="manual"?"active":""} onClick={()=>setTitleBuilderMode("manual")}><b>I choose from my bank</b><span>Uses your selections across the batch</span></button></div><div className="title-style-toggle"><span>Title style</span><button className={titleJoiner===", "?"active":""} onClick={()=>changeTitleJoiner(", ")}>Title with commas</button><button className={titleJoiner===" "?"active":""} onClick={()=>changeTitleJoiner(" ")}>Title without commas</button></div>{titleBuilderMode==="ai"?<div className="title-builder-pane"><KeywordBank selectionOnly initialId={autoTitleBankId||activeRecipe?.keywordListId||""} onSelect={list=>{setAutoTitleBank(list);setAutoTitleBankId(list?.id||"")}} title="Choose a keyword bank" copy="Goldie selects only exact phrases from this bank. It will not add keywords."/><div className="ai-title-disclaimer"><b>Review every title Goldie creates.</b><span>Goldie chooses the phrases it believes fit each design best from the bank you select. It does not verify that the keyword bank itself matches the design, and it will not reject mismatched phrases. Use your judgment before continuing.</span></div><button className="ai-title-button" disabled={titleBuilding||!autoTitleBank||!files.length} onClick={()=>void buildBatchTitle()}>{titleBuilding?`Creating ${files.length} titles…`:"Auto-create all titles"}</button>{titleBuildMessage&&<p className="title-build-message" role="status">{titleBuildMessage}</p>}</div>:<div className="title-builder-pane manual-title-builder"><KeywordBank initialId={manualKeywordBankId||activeRecipe?.keywordListId||""} onSelect={list=>setManualKeywordBankId(list?.id||"")} onAdd={addBatchKeyword} title="Choose a keyword bank" copy="Click keywords in the order you want them. Every click updates all listings below."/><div className="selected-batch-keywords"><div><b>Selected keywords</b>{batchKeywords.length>0&&<button onClick={clearBatchKeywords}>Clear all</button>}</div>{batchKeywords.length?<div className="selected-keyword-chips">{batchKeywords.map(keyword=><button key={keyword} onClick={()=>removeBatchKeyword(keyword)}>{keyword}<span>×</span></button>)}</div>:<p>No keywords selected yet.</p>}</div>{batchKeywords.length>0&&<div className="batch-title-preview"><b>Batch title preview</b><span>{batchKeywords.join(titleJoiner)}</span><small>Applied to every listing below. You can still edit any listing individually.</small></div>}</div>}</section>
                <details className="permanent-description batch-description"><summary><span><b>2. Edit description</b><small>Review or change the description used for every listing</small></span><em>{description.trim()?"✓ Added":"Review"}</em></summary><div className="batch-description-body"><p>This came from your saved product. Edit it once here to change the shared description on every listing in this batch.</p><label>Description for every listing<textarea rows={9} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add sizing, materials, production, care, and shipping information"/></label><small>Open any listing below only when that listing needs different wording.</small></div></details>
                <div className="design-table" ref={listingResultsRef}>{files.map((design) => { const displayScale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale;const quality = design.width && templateDetails?.maxPrintWidth && displayScale ? printifyDpi(design.width, templateDetails.maxPrintWidth, displayScale) : null; const qualityReady = Boolean(quality && quality.dpi >= 300),completeDescription=finalDescription(design,design.etsy),draftPreview=design.previewUrl||drafts.find(draft=>draft.clientId===design.id)?.previewUrl; return <article className={`design-line ${activeDesign === design.id ? "active" : ""}`} key={design.id} onClick={() => setActiveDesign(design.id)}><button type="button" className="listing-preview-button" onClick={event=>{event.stopPropagation();window.open(draftPreview,"_blank","noopener,noreferrer")}} aria-label={`Open larger Printify preview for ${design.title||design.name}`}><img src={draftPreview} alt={design.name||"Design artwork"} loading="lazy" decoding="async"/><span>Enlarge</span></button><div className="design-fields"><label>Title <span>{design.title.length}/140</span><textarea className="listing-title-field" rows={3} value={design.title} maxLength={140} onChange={(e) => { const title = e.target.value; updateDesign(design.id, { title, tags: tagsFromTitle(title),etsy:undefined }); }}/></label><label>Tags <span>{design.tags.length}/13</span><textarea className="listing-tags-field" rows={3} value={design.tags.join(", ")} onChange={(e) => updateDesign(design.id, { tags: [...new Set(e.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag.length <= 20))].slice(0, 13),etsy:undefined })} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map((tag) => <span key={tag}>{tag}</span>)}{!design.tags.length && <small>Goldie will create matching tags with the title.</small>}</div><IndividualAutoTitle design={design} template={templateDetails} useCommas={titleJoiner===", "} onApply={(title,tags)=>{setActiveDesign(design.id);updateDesign(design.id,{title,tags,etsy:undefined,etsyError:""})}}/><details className="individual-description" onClick={event=>event.stopPropagation()}><summary><span>Customize this listing’s description</span><small>{design.descriptionOverride!==undefined?"✓ Customized":"Same as batch"}</small></summary><div><p>The complete description is shown below. Edit it only if this listing needs different wording or an additional blurb.</p><label>Description for this listing<textarea rows={10} value={completeDescription} onChange={event=>updateDesign(design.id,{descriptionOverride:event.target.value,etsyError:""})}/></label>{design.descriptionOverride!==undefined&&<button type="button" onClick={()=>updateDesign(design.id,{descriptionOverride:undefined,etsyError:""})}>Use the batch description again</button>}<small>Spacing and line breaks are preserved when this description is sent to Printify and Etsy.</small></div></details>{design.etsy&&<details className="etsy-auto"><summary>✓ Etsy details completed · {design.etsy.category}</summary><small>Category and Etsy-specific fields are reviewed on the next step.</small></details>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}{design.paddingStatus==="trimmed"&&<small className="padding-note">Your design has clear space around it — Goldie kept the print at the right size</small>}</div><div className={`quality-pill ${qualityReady ? "pass" : "check"}`}><b>{!quality ? "Checking print quality…" : qualityReady ? `✓ ${quality.dpi} DPI · good to print` : `${quality.dpi} DPI · review before printing`}</b><small>{quality ? `${quality.level} resolution · 300 DPI recommended` : design.width ? `${design.width} × ${design.height}px` : "Reading dimensions…"}</small></div></article>; })}</div>
                <button className="workflow-next" aria-busy={preparingEtsy} disabled={preparingEtsy||progressGateIssues(6).length>0} title={progressGateIssues(6)[0]} onClick={()=>void continueToEtsyDetails()}>{preparingEtsy?"Preparing Etsy details…":"Next step"} <span>→</span></button>{preparingEtsy?<p className="etsy-preparing-note" role="status">This can take a moment when your batch has several listings. Keep this page open while Goldie prepares each one.</p>:progressGateIssues(6)[0]&&<p className="etsy-preparing-note gate-reason" role="status">{progressGateIssues(6)[0]}</p>}
              </div>}
            </div>
          </article>
          {workflowStep==="setup"&&<div id="batch-preferences-after-designs" className="batch-preferences-after-designs"/>}
          {workflowStep==="finish"&&finishPhase==="etsy"&&<article className="step-card etsy-details-step active-panel"><div className="step-number">07</div><div className="step-content"><div className="step-heading"><div><h2>Review your Etsy listing details</h2></div><span className="done-mark">{files.filter(file=>file.etsy).length}/{files.length} ready</span></div><p className="step-copy">Goldie has pre-filled the Etsy category and every product field it could confidently match for each listing. Look everything over and change any selection that does not fit.</p><div className="variant-transfer-note"><span>✓</span><div><b>Core listing information is ready for your review.</b><small>This step contains additional Etsy category and product fields. Optional fields stay blank when there is not a clear match.</small></div></div><div className="etsy-detail-list">{files.map(design=><article className="etsy-detail-card" key={design.id}><img src={design.previewUrl} alt="" loading="lazy" decoding="async"/><div><span className="etsy-listing-name">{design.title||design.name}</span>{design.etsy?<EtsyDetailsEditor design={design} categories={etsyCategories} onChange={etsy=>updateDesign(design.id,{etsy,etsyError:""})} onCategory={taxonomyId=>changeEtsyCategory(design,taxonomyId)}/>:<div className="etsy-detail-error"><b>Etsy details still need to be created.</b><span>{design.etsyError}</span><button aria-busy={preparingListingId===design.id} disabled={Boolean(preparingListingId)} onClick={()=>void retryOneEtsyListing(design)}>{preparingListingId===design.id?"Preparing this listing…":"Try this listing again"}</button></div>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}</div></article>)}</div><button className="workflow-next" aria-busy={savingEtsyDetails} disabled={savingEtsyDetails||progressGateIssues(7).length>0} title={progressGateIssues(7)[0]} onClick={()=>void saveAllEtsyDetails()}>{savingEtsyDetails?"Saving Etsy details…":"Next step"} <span>→</span></button>{!savingEtsyDetails&&progressGateIssues(7)[0]&&<p className="etsy-preparing-note gate-reason" role="status">{progressGateIssues(7)[0]}</p>}</div></article>}
          {workflowStep==="finish"&&finishPhase==="final"&&<article className="step-card final-review active-panel"><div className="step-number">09</div><div className="step-content">{batchReceipt?<OutcomeReceipt receipt={batchReceipt} productName={templateDetails?.blueprintTitle||""} shippingProfile={etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||""} imageCount={printifyImageIndices.length} sizeGuideName={sizeGuideName} tagCount={files.reduce((sum,file)=>sum+file.tags.length,0)} mockupCount={Object.values(preparedMockupCounts).reduce((sum,count)=>sum+count,0)} variantCount={pricedVariants.length*files.length} minutesSaved={Math.max(12,Math.round(files.length*11.1))} nextBundleProduct={bundleRecipes[bundleIndex+1]?.name} bundleComplete={Boolean(activeBundle&&bundleIndex===bundleRecipes.length-1)} onNextBundleProduct={()=>void continueBundle()} onDuplicate={()=>{clearCurrentBatch(false);goToStep("designs")}} onNewBatch={()=>{clearCurrentBatch(true);goToStep("setup")}}/>:<><div className="step-heading"><div><p className="mini-label">FINAL REVIEW</p><h2>Your batch is ready for its final check</h2></div><span className="done-mark">✓ {drafts.filter(draft=>draft.status==="Created").length} drafts</span></div><p className="step-copy">Confirm the checklist below. Nothing is published until you use the final button.</p><div className="final-checklist"><span className={pricingApproved?"":"content-review"}>{pricingApproved?"✓ Prices and buyer-paid shipping were approved":"! Prices and buyer-paid shipping need review"}</span><span>✓ {etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||"Etsy shipping profile"} will be applied automatically</span><span className={files.every(file=>file.title.trim().length>=100)?"":"content-review"}>{files.every(file=>file.title.trim().length>=100)?"✓ Titles are complete":"! One or more titles need review"}</span><span className={files.every(file=>file.tags.length>=13)?"":"content-review"}>{files.every(file=>file.tags.length>=13)?"✓ Tags are complete":"! One or more listings have fewer than 13 tags"}</span><span>{description.trim()?"✓":"!"} Description {description.trim()?"is attached":"is blank"}</span><span>{files.every(file=>file.etsy)?"✓":"!"} Etsy categories and product details {files.every(file=>file.etsy)?"are ready":"still need review"}</span><span>✓ Printify placement and listing images were reviewed</span>{sizeGuideName&&<span>✓ {sizeGuideName} will be applied to every Etsy listing</span>}</div>
<div className="final-safety-readiness" aria-label="Final publishing readiness"><span className={files.every(file=>file.etsy)&&files.every(file=>!personalizationProblem(file.etsy))?"ready":"needs-review"}>{files.every(file=>file.etsy)&&files.every(file=>!personalizationProblem(file.etsy))?"✓":"!"} Etsy details and personalization {files.every(file=>file.etsy)&&files.every(file=>!personalizationProblem(file.etsy))?"are ready":"still need review"}</span><span className={allCreatedListingsHaveImages(selectedPublishDrafts())?"ready":"needs-review"}>{allCreatedListingsHaveImages(selectedPublishDrafts())?"✓":"!"} {allCreatedListingsHaveImages(selectedPublishDrafts())?"Every selected listing has at least one photo":"One or more selected listings still need a photo"}</span></div><FinalListingReview drafts={drafts} files={files} selections={printifyImageSelections} defaultIndices={printifyImageIndices} preparedMockupCounts={preparedMockupCounts} batchSizeGuide={sizeGuideName} onRetry={clientId=>{const design=files.find(file=>file.id===clientId);if(design)void runDrafts([design],true)}} onEdit={setFinishPhase}/><div className="publish-live-warning"><b>Only the listings selected above will be published live on Etsy.</b><span>Listings that need another try stay here while successful listings can publish now.</span><small>Etsy charges its standard $0.20 USD listing fee for each listing created. This fee is charged by Etsy and is separate from your Goldie subscription.</small></div><button className="publish-all-button" aria-busy={publishing} disabled={publishing||!allCreatedListingsHaveImages(selectedPublishDrafts())||!selectedPublishDrafts().length} onClick={openPublishConfirmation}>{publishing?"Publishing…":`Publish ${selectedPublishDrafts().length} selected ${selectedPublishDrafts().length===1?"listing":"listings"} live on Etsy`}</button><button className="keep-drafts-button" type="button" disabled={publishing} onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());setDraftSaveOpen(true)}}>Keep as Printify drafts for now</button><small className="keep-drafts-note">Nothing will publish to Etsy. Return to this exact batch from Batch History.</small>{publishMessage&&<p className="publish-message" role="status">{publishMessage}</p>}</>}</div></article>}
        </div>

        <aside className={`launch-panel workflow-panel ${workflowStep==="review"?"active-panel":"hidden-panel"}`}>
          <div className={`step-number launch-step-icon ${progressIndex===4?"create-drafts-icon":"pricing-icon"}`}>{String(progressIndex+1).padStart(2,"0")}</div>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            {(running||workflowStep!=="review")&&<h2>{running ? `${processed} of ${runTotal} complete` : complete ? "Batch finished" : "Current batch"}</h2>}
            <p>{running ? "Goldie is uploading each design and creating its Printify draft." : workflowStep==="review" ? "Goldie creates an unpublished Printify draft for every design in this batch." : complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : "Complete this step to create unpublished drafts in Printify."}</p>
          </div>

          

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Saved product</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button onClick={()=>goToStep("setup")}>Edit</button></div>
            <div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            <div><span>This step creates</span><b>Unpublished Printify drafts</b></div>
          </div>

          {running && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="progress-ring" aria-hidden="true"><span>{processed}/{runTotal}</span></div>
              <div className="progress-copy"><b>Creating your Printify drafts</b><span>{preparationMessage || "Keep this page open while Goldie finishes the batch."}</span></div>
              <div className="progress-track"><span style={{ width: `${runTotal ? (processed / runTotal) * 100 : 0}%` }} /></div>
            </div>
          )}

          {!complete ? (
            <button className="launch-button" aria-busy={running||preparingEtsy} disabled={!ready || !pricingApproved || running||preparingEtsy} onClick={createDrafts}>
              <span className="button-glint" />{preparingEtsy?"Completing Etsy details…":running ? `${processed} of ${runTotal} complete…` : ready ? "Continue to create drafts" : missingRequirement}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status !== "Created") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status !== "Created").length} listings that need another try</button>}
              <button className="workflow-next" onClick={()=>goToStep("finish",false,true)}>Back to finishing your listings <span>→</span></button>
            </div>
          )}
          <p className="launch-note">This step creates unpublished Printify drafts. The final Goldie step publishes them live to Etsy only after a second confirmation.</p>
        </aside>
        <div className="workflow-footer-actions">{progressIndex>0&&<button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button>}<span className="autosave-note"><i aria-hidden="true">✓</i> Saved automatically</span></div>
        </div>
      </section>}

      {complete && workflowStep==="finish" && finishPhase==="mockups" && (()=>{const sample=drafts.find(draft=>draft.id&&draft.printifyImages?.length),available=sample?.printifyImages?.length||0,selected=sample?.id?(printifyImageSelections[sample.id]??printifyImageIndices).length:0,guide=productPhotoGuide(templateDetails?.blueprintTitle||"",available);return <details className="recommended-listing-photos"><summary>Recommended photos for {templateDetails?.blueprintTitle||"this product"}</summary><p>{selected?`This batch currently uses ${selected} of ${available} available Printify views.`:`Goldie found ${available} Printify ${available===1?"view":"views"} and will start with the best available ${Math.min(guide.count,available)}.`} Change any selection below.</p><ul>{guide.items.map(item=><li key={item}>{item}</li>)}</ul></details>})()}
      {complete && workflowStep==="finish" && finishPhase==="mockups" && <section className="post-draft-workspace">
        <div className="post-draft-heading"><div><h2>Review placement and choose listing images.</h2><p>The large preview below is the real Printify placement Goldie uses as the required reference for lifestyle mockups.</p></div>{drafts.filter(draft=>draft.status==="Created").length>1&&<button className="open-all-button" onClick={openAllDrafts}>Review all listings in Printify ↗</button>}</div>
        <section className="batch-size-guide"><div><p className="mini-label">OPTIONAL · APPLY TO THE WHOLE BATCH</p><h3>Add one size guide to every Etsy listing</h3><span>Choose it once. Goldie attaches it to every listing in this batch automatically when you publish.</span></div><input ref={sizeGuidePicker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void applySizeGuide(file)}}/><button onClick={()=>sizeGuidePicker.current?.click()}>{sizeGuideName?"Replace size guide":"Choose size guide"}</button>{sizeGuideStatus&&<p role="status">{sizeGuideStatus}</p>}</section>
        {openAllMessage&&<p className="open-all-message" role="status">{openAllMessage}</p>}
        <div className="draft-card-grid">{drafts.map(draft=>{const design=files.find(file=>file.id===draft.clientId),selectedImages=draft.id?(printifyImageSelections[draft.id]??printifyImageIndices):printifyImageIndices;return <article id={`listing-images-${draft.clientId}`} className={`draft-card ${draft.status!=="Created"?"failed":""}`} key={draft.clientId}>
          <div className="draft-card-top">{draft.previewUrl?<button className="printify-preview-button" onClick={()=>window.open(draft.previewUrl,"_blank","noopener,noreferrer")} aria-label="Open larger Printify preview"><img src={draft.previewUrl} alt={`Printify preview for ${draft.title||draft.name}`}/><span>Click to enlarge</span></button>:design?<div className="pending-preview"><img src={design.previewUrl} alt="Design preview" loading="lazy" decoding="async"/><span>Printify preview processing</span></div>:<span className="draft-check">!</span>}<div>{draft.status!=="Created"&&<span className="draft-state">DRAFT FAILED</span>}<h3>{draft.title||draft.name}</h3><small>{draft.status==="Created"?"Unpublished · pricing, tags, and description applied":draft.error}</small>{design?.tags?.length?<div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}</div>:null}{draft.editorUrl&&draft.id?<button className={`edit-draft-button ${openedDrafts.includes(draft.id)?"opened":""}`} onClick={()=>openDraft(draft)}><i/><span>{openedDrafts.includes(draft.id)?"Printify opened":"Open in Printify to resize or reposition"}<small>(Choose the correct shop in your Printify account first.)</small></span></button>:null}</div></div>
          {draft.status==="Created"&&<PrintifyImagePicker images={(draft.printifyImages||[]).filter(Boolean)} indices={selectedImages} reservedPhotos={(preparedMockupCounts[draft.id]||0)+(design?.sizeGuideName||sizeGuideName?1:0)} onApplyOne={values=>{if(draft.id)setPrintifyImageSelections(current=>({...current,[draft.id!]:values}))}} onApplyAll={values=>{setPrintifyImageIndices(values);setPrintifyImageSelections(Object.fromEntries(drafts.filter(item=>item.id).map(item=>{const itemDesign=files.find(file=>file.id===item.clientId),reserved=(preparedMockupCounts[item.id!]||0)+(itemDesign?.sizeGuideName||sizeGuideName?1:0);return[item.id!,values.slice(0,Math.max(0,20-reserved))]})))}} onSaveRecipe={activeRecipe?saveImagePreferences:undefined}/>}
          {draft.status==="Created"&&design&&draft.id&&<details className="draft-mockups"><summary>Create lifestyle mockups from your Mockup Library (optional)</summary><IntegratedMockups design={design.file} productId={draft.id} productName={activeRecipe?.name||templateDetails?.blueprintTitle} defaultTheme={mockupTheme} referenceUrl={draft.previewUrl} onPrepared={count=>setPreparedMockupCounts(current=>({...current,[draft.id!]:count}))}/></details>}
          {draft.status==="Created"&&design&&draft.id&&<IndividualSizeGuide productId={draft.id} name={design.sizeGuideName} onSaved={name=>updateDesign(design.id,{sizeGuideName:name})}/>}
          {draft.status==="Created"&&draft.id&&<DownloadListingPhotos productId={draft.id} name={draft.title||draft.name} indices={selectedImages}/>}
          {draft.status==="Created"&&draft.id&&<ListingPhotoOrder productId={draft.id} printifyImages={(draft.printifyImages||[]).filter(Boolean)} indices={selectedImages} refreshKey={`${preparedMockupCounts[draft.id]||0}:${design?.sizeGuideName||sizeGuideName}`}/>}
          {draft.status!=="Created"&&<><button className="error-help-link" onClick={()=>window.dispatchEvent(new CustomEvent("goldie-retry-listing",{detail:draft.clientId}))}>Retry this listing</button><button className="error-help-link" onClick={()=>window.dispatchEvent(new CustomEvent("goldie-support",{detail:draft.error??"A design failed"}))}>Get help with this error</button></>}
        </article>})}</div>
        {imageStepError&&<p className="image-step-blocker" role="alert">{imageStepError}</p>}
        <button className="workflow-next mockup-next" disabled={progressGateIssues(8).length>0} title={progressGateIssues(8)[0]} onClick={()=>{const missing=createdListingsMissingImages();if(missing.length){setImageStepError(`${missing.length} ${missing.length===1?"listing needs":"listings need"} at least one photo.`);setMissingPhotoDraftIds(missing.map(draft=>draft.clientId));return}setImageStepError("");setMissingPhotoDraftIds([]);setFinishPhase("final");window.scrollTo(0,0)}}>Next step <span>→</span></button>{progressGateIssues(8)[0]&&<p className="etsy-preparing-note gate-reason" role="status">{progressGateIssues(8)[0]}</p>}
      </section>}

      {complete && workflowStep==="finish" && finishPhase==="mockups" && <div className="workflow-footer-actions post-draft-footer"><button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button><span className="autosave-note"><i aria-hidden="true">✓</i> Saved automatically</span></div>}

      {preflightOpen && <div className="preflight-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPreflightOpen(false)}}><section className="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title"><p className="mini-label">CREATE PRINTIFY DRAFTS</p><h2 id="preflight-title">Create {files.length} product {files.length===1?"draft":"drafts"}?</h2><div className="preflight-list"><div><span>Printify product</span><b>✓ {templateDetails?.blueprintTitle}</b></div><div><span>Design files</span><b>✓ {files.length} ready</b></div><div><span>Plan allowance</span><b>{planDraftsRemaining===null?"Checking current usage…":`✓ ${files.length} of ${planDraftsRemaining} remaining listings`}</b></div><div><span>Permanent description</span><b>{description.trim()?"✓ Imported from Printify":"None found. You can add one later"}</b></div><div><span>Variant pricing</span><b>✓ All {pricedVariants.length} enabled variants reviewed and approved</b></div><div><span>Publishing</span><b>Unpublished Printify drafts only</b></div></div><p className="preflight-explainer">After these drafts exist, Goldie will show their real previews and help finish each title, tags, description, Etsy details, and mockups.</p><div className="preflight-actions"><button className="preflight-cancel" onClick={()=>setPreflightOpen(false)}>Go back</button><button className="preflight-confirm" onClick={confirmDrafts}>Create Printify drafts →</button></div></section></div>}

      {publishConfirmOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="publish-confirm-title"><span className="publish-confirm-icon">!</span><p className="mini-label">FINAL PUBLISH CONFIRMATION</p><h2 id="publish-confirm-title">These listings will go live on Etsy.</h2><p>They will not be saved as Etsy drafts. Publishing starts as soon as you click the red button below. Goldie will immediately apply the selected Etsy shipping profile.</p><p className="etsy-listing-fee-note">Etsy will charge its standard $0.20 USD listing fee for each listing created. This Etsy fee is separate from your Goldie subscription.</p>{missingPublishFields().length>0&&<div className="publish-missing"><b>Goldie found blank or unfinished fields:</b><ul>{missingPublishFields().map(field=><li key={field}>{field}</li>)}</ul><span>You can still publish, but review these first if they matter to this batch.</span></div>}<div className="publish-confirm-actions"><button onClick={()=>setPublishConfirmOpen(false)}>Go back and review</button><button className="danger" onClick={()=>void publishAll()}>Yes, publish live on Etsy</button></div></section></div>}

      {draftSaveOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!savingDraftBatch)setDraftSaveOpen(false)}}><section className="publish-confirm save-draft-modal" role="dialog" aria-modal="true" aria-labelledby="save-draft-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>×</button><span className="publish-confirm-icon">✓</span><p className="mini-label">SAVE FOR LATER</p><h2 id="save-draft-title">Keep these listings as Printify drafts?</h2><p>Great—this batch will be waiting for you in Batch History. Nothing will publish to Etsy until you return and choose to publish it.</p><label><span>Name this batch</span><input autoFocus maxLength={160} value={batchDisplayName} onChange={event=>setBatchDisplayName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/><small>Goldie suggested a name from the saved product and first listing topic. Change it to anything you will recognize.</small></label><div className="publish-confirm-actions"><button disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>Cancel</button><button className="save-draft-confirm" aria-busy={savingDraftBatch} disabled={savingDraftBatch||!batchDisplayName.trim()} onClick={()=>void saveDraftBatch()}>{savingDraftBatch?"Saving batch…":"Save to Batch History"}</button></div></section></div>}

      {draftSavedOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm save-draft-success" role="dialog" aria-modal="true" aria-labelledby="draft-saved-title"><span className="publish-confirm-icon">✓</span><p className="mini-label">BATCH SAVED</p><h2 id="draft-saved-title">Great—this batch is waiting for you.</h2><p><b>{batchDisplayName}</b> is saved in Batch History. The products remain unpublished Printify drafts, and every title, Etsy detail, and photo choice will be here when you return.</p><div className="publish-confirm-actions"><button onClick={()=>setDraftSavedOpen(false)}>Keep working here</button><button className="save-draft-confirm" onClick={()=>{window.location.href="/batches"}}>View Batch History</button></div></section></div>}

      {restartBatchOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!restartingBatch)setRestartBatchOpen(false)}}><section className="publish-confirm restart-batch-modal" role="alertdialog" aria-modal="true" aria-labelledby="restart-batch-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>×</button><span className="publish-confirm-icon" aria-hidden="true">↻</span><p className="mini-label">START A NEW BATCH</p><h2 id="restart-batch-title">What should Goldie do with this batch?</h2><p>Your saved products, product defaults, keyword banks, and mockup sets will stay exactly as they are.</p>{(files.length>0||drafts.length>0)&&<label><span>Name this batch before saving</span><input maxLength={160} value={restartBatchName} onChange={event=>setRestartBatchName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/></label>}<div className="restart-batch-actions"><button type="button" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>Cancel</button>{(files.length>0||drafts.length>0)&&<button type="button" className="save-restart" aria-busy={restartingBatch} disabled={restartingBatch||!restartBatchName.trim()} onClick={()=>void saveAndRestart()}>{restartingBatch?"Saving…":"Save to Batch History + start new"}</button>}<button type="button" className="discard-restart" disabled={restartingBatch} onClick={()=>finishRestart(false)}>{files.length||drafts.length?"Discard this batch + start new":"Start new batch"}</button></div><small className="restart-printify-note">Existing Printify drafts are not deleted from Printify.</small></section></div>}

      {blockingModal&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm blocking-modal" role="alertdialog" aria-modal="true" aria-labelledby="blocking-modal-title"><span className="publish-confirm-icon">!</span><p className="mini-label">REQUIRED BEFORE CONTINUING</p><h2 id="blocking-modal-title">{blockingModal.title}</h2>{blockingModal.copy&&<p>{blockingModal.copy}</p>}<div className="publish-missing"><b>Fix these items:</b><ul>{blockingModal.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setBlockingModal(null)}>Got it. I’ll fix this</button></div></section></div>}
      {pendingCategoryChange&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="category-change-title"><span className="publish-confirm-icon">!</span><p className="mini-label">ETSY CATEGORY CHANGE</p><h2 id="category-change-title">Change this listing’s Etsy category?</h2><p>{pendingCategoryChange.clearedCount} completed {pendingCategoryChange.clearedCount===1?"field does":"fields do"} not exist in the new category and will be cleared. Any compatible values will stay filled.</p><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPendingCategoryChange(null)}>Keep current category</button><button className="danger" onClick={()=>{const pending=pendingCategoryChange;setPendingCategoryChange(null);updateDesign(pending.designId,{etsy:pending.details,etsyError:""})}}>Change category and clear {pendingCategoryChange.clearedCount}</button></div></section></div>}
      {missingPhotoDraftIds.length>0&&typeof document!=="undefined"&&createPortal(<div className="publish-confirm-backdrop missing-photo-backdrop" role="presentation"><section className="publish-confirm missing-photo-modal" role="alertdialog" aria-modal="true" aria-labelledby="missing-photo-title"><button className="missing-photo-close" type="button" aria-label="Close" onClick={()=>setMissingPhotoDraftIds([])}>×</button><span className="publish-confirm-icon">!</span><p className="mini-label">PHOTOS REQUIRED</p><h2 id="missing-photo-title">{missingPhotoDraftIds.length} {missingPhotoDraftIds.length===1?"listing needs":"listings need"} a photo</h2><p>Add at least one Printify photo or lifestyle mockup to every listing shown below.</p><div className="missing-photo-list">{missingPhotoDraftIds.map(clientId=>{const draft=drafts.find(item=>item.clientId===clientId),design=files.find(item=>item.id===clientId),preview=draft?.previewUrl||design?.previewUrl;return <article key={clientId}>{preview?<img src={preview} alt="Product and design preview"/>:<div className="missing-photo-placeholder" aria-hidden="true"/>}<b>{design?.name||draft?.name||"Listing"}</b><button type="button" onClick={()=>jumpToMissingPhotoListing(clientId)}>Go to this listing</button></article>})}</div></section></div>,document.body)}
      {pixelWarningOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm pixel-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="pixel-warning-title"><span className="publish-confirm-icon">!</span><p className="mini-label">PRINT RESOLUTION CHECK</p><h2 id="pixel-warning-title">One or more of these designs fall below Printify’s pixel size recommendations for this product.</h2><p>These designs may still print, but they may show a lower resolution inside the Printify editor at the largest enabled size. Review the comparison below before deciding whether to continue.</p><div className="pixel-comparison" role="region" aria-label="Uploaded design pixel comparison"><div className="pixel-comparison-head" aria-hidden="true"><b>Design</b><b>Uploaded size</b><b>Printify recommends</b></div><div className="pixel-comparison-rows">{belowRecommendedPixels.map(file=><div className="pixel-comparison-row" key={file.id}><b title={file.name}>{file.name}</b><span><small>Uploaded size</small>{file.width?.toLocaleString()} × {file.height?.toLocaleString()} px</span><span><small>Printify recommends</small>{recommendedPixelSize.width.toLocaleString()} × {recommendedPixelSize.height.toLocaleString()} px</span></div>)}</div></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPixelWarningOpen(false)}>Go back and review</button><button className="pixel-proceed" onClick={()=>{setPixelWarningOpen(false);goToStep("review")}}>Proceed anyway</button></div></section></div>}

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
