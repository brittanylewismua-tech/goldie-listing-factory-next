Warning: truncated output (original token count: 169476)
Total output lines: 6461

import { openPlan, SWITCH_SETTLE_MS, storeSwitchUrl } from "./printify-links";
"use client";
import { DRAFT_TASK_STAGES, draftStageLabel, draftTaskStage, visibleDraftStage } from "./draft-task-stages";
import {selectedPriceGroup} from "./draft-price-navigation";
import {preparedDaysFromHistory} from "./batch-history-read";
import {createBatchSaveTransport} from "./batch-save-transport";
import WaitProgress from "./wait-progress";
import { shouldOpenEtsyDetails, needsCategoryReview } from "./etsy-details-disclosure";
import { shippingMenuKeyboard } from "./shipping-menu-keyboard";
import { containModalFocus } from "./modal-focus";
import { printifyProductLabel, familyFromVariants } from "./mockup-compatibility";
import { uniqueMockupEntries,correspondingMockupIndices } from "./printify-preview-details";
import { applyProductFacts } from "./etsy-product-facts";
import { draftsInDesignOrder } from "./listing-order";
import { mergeMatchingDrafts, serializedBatchWrites } from "./batch-draft-integrity";
import { requestEtsyOptions } from "./etsy-options-request";
import { recoverDraftEtsyDetails } from "./recover-draft-etsy-details";
import { etsyPreparationCoordinator } from "./etsy-preparation-coordinator";
import { titleResultGuard } from "./title-result-guard";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import SupportChat from "./support-chat";
import { workflowScreen } from "./step-videos";
import FactoryPanel from "./factory-panel";
import { mockupViewGroups } from "./mockup-view-groups";
import { unfinishedDraftTask, draftTaskSummary, focusedDraftTask } from "./draft-workflow-guidance";
import ArtworkGrid from "./artwork-grid";
import { runBounded } from "./bounded-work";
import { bundleMemberDesigns } from "./bundle-member-designs";
import { draftPhotoSelections } from "./draft-photo-selections";
import { draftPriceEdits, updateDraftPriceEdits, finalPriceApproval } from "./draft-price-edits";
import { laterDraftCreationPhase, measuredDraftCreationPercent, nextVisibleDraftCreationPercent, type DraftCreationPhase } from "./draft-creation-progress";
import { productReadiness, recipeCarriesApprovedPricing, type Readiness } from "./product-readiness";
import { KeywordBank, SavedWorkflow, type KeywordList, type Pricing, type ProductBundle, type Recipe } from "./factory-tools";
import UploadedListingPhotos from "./uploaded-listing-photos";
import ListingRows, { type ListingFlag } from "./listing-rows";
import { confirmAction } from "./confirm-dialog";
import ListingPhotoOrder from "./listing-photo-order";
import PageHead from "./page-head";
import FactoryFooter from "./factory-footer";
import PhotoDeliveryHandoff, {type PhotoDeliveryHandle} from "./photo-delivery-handoff";
import RequiredDetailsChecklist from "./required-details-checklist";
import { tagsFromTitle } from "./seo-utils";
import { printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchArtworkAssets, loadBatchFiles, saveBatchArtworkAssets, saveBatchFiles } from "./batch-cache";
import { estimatedProfit, recommendedPrice } from "./pricing";
import { assignSideColor, sideAssignmentFor } from "./artwork-assignment";
import { pricesFromActualCosts } from "./draft-pricing";
import { ActionReceipt, OutcomeReceipt, WorkflowMomentum, type BatchReceipt } from "./goldie-ui";
import { leavingImagesIssues, navigationIssues, type NavigationGateState } from "./workflow-gates";
import { GoldieCommandBar } from "./returning-command-center";
import FinalListingReview from "./final-listing-review";
import ContextHelp from "./context-help";
import SuiteBrand from "./suite-brand";
import { NavIcon } from "./nav-icons";
import { NAV } from "./factory-shell";
import MobileGate from "./mobile-gate";
import { productFamily, productOptionAxis } from "./product-type-utils";
import { printifyMockupDetails, printifyMockupForColor, printifyVariantIdsForColor } from "./printify-color-mockup";
import { orderedPrintSides,primaryPrintSide,printSideLabel,productPrintSideSummary,productNoun } from "./print-sides";
import ProductColorRendering from "./product-color-rendering";
import {completedGeneratedTags,validEtsyTags} from "./listing-title-tags";
import {printifyVariantLimitMessage} from "./printify-variant-limit";
import {normalizeProductDescription} from "./product-description";

const clientRandomId = () => typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/* The product glyph is a last-resort identity image after Printify has answered
   but has not supplied a usable mockup. It must never silently turn an unknown
   product into apparel: loading uses a spinner, known families use their own
   silhouette, and everything else gets a neutral package. */
function ProductGlyph({title,color}:{title?:string;color?:string}){
  const name=String(title||"").toLowerCase();
  const family=productFamily(name);
  const hooded=/hood/.test(name);
  const longSleeve=hooded||/sweat|crew|fleece|long sleeve|longsleeve/.test(name);
  const garment=family==="tee"||family==="hoodie"||family==="crewneck"||family==="tank"||family==="longSleeve";
  const garmentBody=longSleeve
    ?"M8.6 3 L3.6 5.9 5.7 15.6 8.4 14.5 V21 H15.6 V14.5 L18.3 15.6 20.4 5.9 15.4 3 C14.6 4.8 9.4 4.8 8.6 3 Z"
    :"M8.6 3 L4 5.9 6.1 11 8.4 9.7 V21 H15.6 V9.7 L17.9 11 20 5.9 15.4 3 C14.6 4.8 9.4 4.8 8.6 3 Z";
  return (
    <span className={`bundle-product-photo placeholder product-glyph-${family||"other"}`} style={color?{"--product-glyph-color":color} as CSSProperties:undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {garment&&<path d={garmentBody} />}
        {garment&&!hooded&&<path className="glyph-line" d="M9 3.5 C10 5.2 14 5.2 15 3.5 M8.4 9.7 V20.5 M15.6 9.7 V20.5" />}
        {garment&&hooded&&<path className="glyph-line" d="M9.2 3.4 C10.2 6.8 13.8 6.8 14.8 3.4" />}
        {garment&&hooded&&<path className="glyph-line" d="M9.7 16.2 H14.3" />}
        {family==="mug"&&<><path d="M4 5h12v14H4z"/><path className="glyph-line" d="M16 8h1.5a3 3 0 0 1 0 6H16"/></>}
        {family==="tumbler"&&<><path d="M7 4h10l-1 17H8z"/><path className="glyph-line" d="M9 2h6M13 2l3-2"/></>}
        {family==="tote"&&<><path d="M4 7h16v14H4z"/><path className="glyph-line" d="M8 8V6a4 4 0 0 1 8 0v2"/></>}
        {family==="poster"&&<><path d="M4 3h16v18H4z"/><path className="glyph-line" d="m7 17 4-5 2 2 2-3 2 6z"/></>}
        {family==="sticker"&&<path d="M4 3h16v11l-7 7H4zm9 18v-7h7"/>}
        {!garment&&!['mug','tumbler','tote','poster','sticker'].includes(family)&&<><path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4V11zm18 0v10l-9 4V11z"/></>}
      </svg>
    </span>
  );
}

import { publishedDaysThisPeriod, type ListingGoal, type PublishedDay } from "./listing-goal";

/* D202 · "25 selected variants" is Printify's word, not a seller's. A seller
 * picked five colours and five sizes; "variants" is the internal name for the
 * product of those two choices, and the number on its own does not say which
 * choices produced it. Say the choices instead — they multiply to the same
 * figure and need no glossary. Falls back to the count when an axis is missing,
 * which is the one-size and no-colour products. */
function variantSummary(axes:{colorsChosen:boolean;sizesChosen:boolean;colors:number;sizes:number;availableColors:number;availableSizes:number;total:number},blueprintTitle=""){
  const {colorsChosen,sizesChosen,colors,sizes,availableColors,availableSizes,total}=axes;
  const plural=(n:number,word:string)=>`${n} ${word}${n===1?"":"s"}`;
  const hasColors=colorsChosen?colors>0:availableColors>0;
  const hasSizes=sizesChosen?sizes>0:availableSizes>0;
  const optionNoun=productOptionAxis(blueprintTitle).choice==="size"?"size":"product option";
  if(!hasColors&&!hasSizes)return plural(total,"option");
  if(colorsChosen&&sizesChosen&&hasColors&&hasSizes)return `${plural(colors,"color")} × ${plural(sizes,optionNoun)}`;
  const parts:string[]=[];
  if(hasColors)parts.push(colorsChosen?plural(colors,"color"):`${plural(availableColors,"color")} available`);
  if(hasSizes)parts.push(sizesChosen?plural(sizes,optionNoun):`${plural(availableSizes,optionNoun)} available`);
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
type ArtworkVersion = { id:string;name:string;size:number;file:File;previewUrl:string;side:string;colorIds:number[];productIds?:string[];ownerProductId?:string;originalUnavailable?:boolean;width?:number;height?:number;visibleBounds?:VisibleBounds;hasTransparency?:boolean;paddingStatus?:"checking"|"trimmed"|"full" };
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; artworkPreviewUrl?:string; originalUnavailable?:boolean; title: string; tags: string[]; titleWarning?:string;titleError?:string;contentHash?:string; blurb?:string; descriptionOverride?:string; sizeGuideName?:string; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";artworkVersions?:ArtworkVersion[];etsy?:EtsyDetails;etsyError?:string };
type ProductVariant={id:number;title:string;cost:number;templatePrice:number;shipping?:number|null;options?:number[];colorId?:number|null;sizeId?:number|null;templateEnabled?:boolean};
type ProductColor={id:number;ids?:number[];variantIds?:number[];title:string;swatch:string;available:boolean;templateEnabled:boolean};
type ProductSize={id:number;title:string;available:boolean;templateEnabled:boolean};
type InternationalShippingRate={key:string;label:string;primary:number;additional:number};
type EditableInternationalShippingRate={key:string;label:string;primary:string;additional:string};
type EtsyShippingProfile={id:number;title:string;originCountry:string;currency:string;domesticPrimary:number;domesticAdditional:number;international:InternationalShippingRate[]};
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number;previewImage?:string;previewImages?:string[];productRenderings?:Array<{src:string;variantIds:number[];position:string}>;colorOptions?:ProductColor[];sizeOptions?:ProductSize[]; variants:ProductVariant[];printPositions?:string[]; shop: string; standardShipping?:number|null;shippingCurrency?:string;shippingTemplateId:string;shippingProfileNeedsSelection?:boolean;freeShipping:boolean;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null; hasLabelArtwork?: boolean };
type ArtworkSummary=Record<string,Array<{name:string;colors:string[]}>>;
type DraftCostReview={required:boolean;verified:boolean;approved:boolean;variants:Array<{id:number;title?:string;cost:number;price:number;isEnabled:boolean}>};
type DraftResult = { id?: string; batchId?: string; clientId: string; name: string; title?: string; tags?: string[]; description?:string; previewUrl?: string; artworkPreviewUrls?:Record<string,string>; artworkOverridePreviewUrls?:Record<string,string>; printifyImages?: string[]; printifyImageDetails?:Array<{src:string;variantIds:number[];position:string}>; colorPreviewImageDetails?:Array<{src:string;variantIds:number[];position:string}>; selectedVariantIds?:number[]; shopId?: number; printifyShopName?:string; printifyShopCount?:number; editorUrl?: string; status: "Created" | "Failed" | "NeedsRetry"; error?: string; productName?:string; placement?:{x:number;y:number;scale:number;angle:number};placementScale?:number;artworkSummary?:ArtworkSummary;artworkOverrides?:Record<string,{name:string;position:string}>;primaryArtworkImageIds?:Record<string,string>;priceEdits?:Record<string,number>;etsyDetails?:EtsyDetails;costReview?:DraftCostReview };
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
type FinishPhase = "details" | "etsy" | "mockups" | "final";
type PendingCategoryChange={designId:string;details:EtsyDetails;clearedCount:number};

/* D428 - the URL vocabulary did not match what the interface calls the steps.
   The rail says PRODUCT, IMAGES, LISTING, PUBLISH; the URL wants setup, designs
   and finish. A link written with the names on screen - ?step=listing - was
   silently downgraded to whatever the batch had saved, which reads as the app
   losing your place. Accepted as aliases on the way in; emitted links are
   unchanged, so nothing already saved or shared breaks. */
const STEP_ALIASES:Record<string,WorkflowStep>={product:"setup",images:"designs",listing:"finish",titles:"finish",publish:"finish"};
function canonicalStep(requested:string|null):WorkflowStep|null{
  if(!requested)return null;
  const value=requested.trim().toLowerCase();
  const order:WorkflowStep[]=["connect","setup","designs","review","finish"];
  if(order.includes(value as WorkflowStep))return value as WorkflowStep;
  return STEP_ALIASES[value]??null;
}
export function requestedFinishPhase(requested:string|null):FinishPhase|null{
  const value=(requested||"").trim().toLowerCase();
  if(value==="publish")return "final";
  if(value==="listing"||value==="titles")return "details";
  return null;
}
function restoredWorkflowStep(saved:WorkflowStep,requested:string|null,complete:boolean):WorkflowStep{
  const order:WorkflowStep[]=["connect","setup","designs","review","finish"];
  const target=canonicalStep(requested);
  if(!target)return complete?"finish":saved;
  return complete||order.indexOf(target)<=order.indexOf(saved)?target:saved;
}

/* D147 · The same problem D108 solved for steps, but for Finish phases.
 * Restoration replaced the requested phase with the batch's saved one, so
 * reloading or bookmarking any Finish phase bounced the seller elsewhere —
 * asking for phase=etsy landed on phase=details. Phases are views over drafts
 * that already exist, so on a completed batch any phase is legitimate; on an
 * unfinished one, honour the request up to the phase actually reached. */
/* D376 - "mockups" is a phase with no renderer. Choosing the mockup set moved
   onto step 2 in D238 and nothing was ever built to draw this phase, but it
   stayed in the type, in the progress map, and - fatally - in batches saved
   before the move. Resuming one of those landed on a completely blank page:
   header, rail, Back link, and nothing in between.

   Every phase this returns has to be one that actually draws something. */
const RENDERED_FINISH_PHASES:FinishPhase[]=["details","etsy","final"];

export function drawableFinishPhase(phase:FinishPhase,complete:boolean):FinishPhase{
  if(RENDERED_FINISH_PHASES.includes(phase))return phase;
  /* A finished batch has a receipt to show; an unfinished one goes back to the
     listing details it was interrupted in. */
  return complete?"final":"details";
}

function restoredFinishPhase(saved:FinishPhase,requested:string|null,complete:boolean):FinishPhase{
  const order:FinishPhase[]=["details","etsy","mockups","final"];
  const safeSaved=drawableFinishPhase(saved,complete);
  if(!requested||!order.includes(requested as FinishPhase))return complete?"final":safeSaved;
  const target=drawableFinishPhase(requested as FinishPhase,complete);
  return complete||order.indexOf(target)<=order.indexOf(safeSaved)?target:safeSaved;
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

/* D554 - D449 wrote the rule on this build already: "Ordering photos you cannot
   tell apart is not ordering them." The picker breaks it worse than the ordering
   grid did. Her hoodie returns 72 mockups - six colours by twelve views - shown
   as 72 unlabelled 81px tiles, and the white and ash ones read as blank squares
   because a white garment on a white background has nothing to see at that size.
   Printify names every view in the URL it already sent us. Use it. */
function printifyViewName(src:string){
  try{
    const label=new URL(src).searchParams.get("camera_label")||"";
    if(!label)return "";
    return label.replace(/[-_]+/g," ").replace(/\bperson (\d+)\b/i,"model $1").replace(/^\w/,c=>c.toUpperCase());
  }catch{return ""}
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
/* D648 · This cut at 39 characters wherever that landed and the caller then
   appended " shipping profile", so a real profile read "Economy-Standard:
   Printify Choice, Garm… shipping profile" - a word sliced in half with a noun
   stapled after it. Cut on a word boundary, and never repeat the words the
   caller is about to add. */
/* D660 · Two faults in one line on the live review. The caller appended the
   words "shipping profile" to whatever came back, so "Standard shipping"
   rendered as "Standard shipping shipping profile"; and any name over 42
   characters was cut with an ellipsis, so the seller could not read which
   profile was about to be used - "Economy-Standard: Printify Choice… shipping
   profile". A label naming a thing has to name it.

   The full value is always returned now. Shortening, where the layout needs
   it, is CSS - which keeps the whole string in the DOM, in the title
   attribute, and available to a screen reader. */
function friendlyShippingProfileTitle(raw?:string){
  const title=raw?decodeProfileTitle(raw):raw;
  if(!title)return"Shipping profile needed";
  /* D663 · Found by the acceptance run. This collapsed EVERY profile beginning
     with "Standard:" to the same three words. Brittany has seven of them:

       Standard: SwiftPOD, Garments (shirts)
       Standard: SwiftPOD, Garments (shirts + shorts)
       Standard: SwiftPOD, Hoodie, Sweatshirt
       Standard: SwiftPOD, Kids clothes, Long-sleeve, T-Shirt, Tank
       Standard: Printify Choice, ... Mug, 11oz, 13oz
       ...

     All seven rendered as "Standard shipping profile" on the product card and
     on the final review, so the one screen that exists to confirm which profile
     a listing publishes with could not tell them apart - and publishing under
     the wrong profile is exactly what D52 cost her.

     D660 removed the truncation for this reason and left this behind, which was
     worse: a truncation is at least lossy in a visible way, this was seven
     different values printing as one. The prefix is dropped, because the row
     already says Shipping, and everything that distinguishes them is kept. */
  const withoutStandard=title.replace(/^standard:\s*/i,"").trim();
  if(!withoutStandard)return"Standard shipping";
  /* Trailing "shipping profile" is stripped because the row it sits in already
     says so - not to shorten it. */
  return withoutStandard.replace(/\s*shipping\s*profile\s*$/i,"").trim()||title.trim();
}

/* D649 · Every hoodie listing stopped on "Closure still needed". Goldie
   pre-fills every other Etsy field from the Printify product, and left the one
   that blocks publishing to a manual click on a tool whose whole point is bulk.
   Etsy's Closure values are Full zip, Half zip, Quarter zip and Pullover, and
   Printify names the garment plainly enough to settle it: a product called a
   full-zip is a full zip, and a hoodie or crewneck with no zip in its name is a
   pullover. Anything that says "zip" without saying WHICH is left unresolved
   rather than guessed - a wrong attribute goes onto a live listing. */
export function verifiedClosure(blueprintTitle?:string,model?:string,brand?:string){
  const text=`${blueprintTitle||""} ${model||""} ${brand||""}`.toLowerCase();
  if(/\bfull[-\s]?zip\b/.test(text))return "Full zip";
  if(/\b(quarter|1\/4)[-\s]?zip\b/.test(text))return "Quarter zip";
  if(/\b(half|1\/2)[-\s]?zip\b/.test(text))return "Half zip";
  if(/\bzip\b/.test(text))return "";
  if(/\b(pullover|hoodie|hooded|sweatshirt|crewneck|crew neck)\b/.test(text))return "Pullover";
  return "";
}

const APPAREL_PRODUCT_FAMILIES=new Set(["tee","hoodie","crewneck","tank","longSleeve"]);
function shippingProfileGroup(profileTitle:string,blueprintTitle:string){
  const product=productFamily(blueprintTitle),profile=productFamily(decodeProfileTitle(profileTitle));
  if(product&&profile===product)return"recommended";
  if(APPAREL_PRODUCT_FAMILIES.has(product)&&APPAREL_PRODUCT_FAMILIES.has(profile))return"related";
  return"other";
}
function shippingProfileOptionLabel(profile:EtsyShippingProfile){return`${decodeProfileTitle(profile.title)} · $${profile.domesticPrimary.toFixed(2)} first · $${profile.domesticAdditional.toFixed(2)} additional`}

function personalizationProblem(details?:Pick<EtsyDetails,"personalization">){const personalization=details?.personalization;if(!personalization?.enabled)return"";if(!personalization.questions.length)return"Add at least one personalization question.";if(personalization.questions.length>5)return"Etsy allows up to five personalization questions.";for(const [index,question] of personalization.questions.entries()){if(!question.question.trim())return`Personalization question ${index+1} needs a question.`;if(question.type==="dropdown"){const options=question.options.map(option=>option.trim()).filter(Boolean);if(options.length<2)return`Personalization question ${index+1} needs at least two dropdown choices.`;if(options.length>30)return`Personalization question ${index+1} has more than 30 dropdown choices.`;if(options.some(option=>option.length>20))return`Every dropdown choice in personalization question ${index+1} must be 20 characters or fewer.`}}return""}

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
const PROGRESS_STEPS = ["Connect Printify","Choose product","Add designs","Review draft plan","Create Printify drafts","Listing details","Etsy listing details","Listing photos","Final review"];
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
/* D220 · Four stages, each covering the legacy PROGRESS_STEPS indices that now
   live on the same page. Draft creation (3, 4) and mockups (7) moved onto the
   Images page, and Etsy details (6) sits with titles on Listing, so those
   indices no longer get bubbles of their own. The 0-8 indices are untouched, so
   every gate, status and deep link still resolves. */
const RAIL_STAGES: Array<{label:string;title:string;index:number;covers:number[]}> = [
  {label:"Setup",index:1,title:"Choose a product and add designs",covers:[1]},
  {label:"Designs",index:2,title:"Add designs and create drafts",covers:[2,3,4]},
  {label:"Review",index:8,title:"Review and finish listings",covers:[5,6,7,8]},
];
/* D222 · RAIL_TOP, RAIL_PRICING, RAIL_DRAFTS, RAIL_FINISH, RAIL_FINISH_FIRST and
   FINISH_RAIL_LABELS described the old five-bubble rail with its nested Finish
   node. RAIL_STAGES replaced all of them. */
const WORKFLOW_HELP = [
  {title:"Connect Printify and Etsy",intro:"Connect both accounts to prepare complete listings.",sections:[{heading:"Printify connection",copy:"Connect the Printify account that contains your saved product."},{heading:"Etsy connection",copy:"Connect the Etsy shop linked to that saved product."},{heading:"Nothing publishes here",copy:"This step only verifies access. Nothing is published to Etsy."},{heading:"Use matching accounts",copy:"Connect the Printify account that contains the saved product and the Etsy shop where that product was published. Products from a different shop cannot be used."},{heading:"Your publishing safeguard",copy:"The Listing Factory saves finished listings in Etsy Drafts. Only you publish them in Etsy."}]},
  {title:"Prepare your product in Printify",intro:"Before saving a product, publish it from Printify to the connected Etsy shop. A product that is still only a Printify draft will not work.",sections:[{heading:"Choose an existing or dedicated product",copy:"Either option works.",bullets:["Use an existing product that is already published in your Etsy shop.","Create a separate product specifically for Listing Factory."]},{heading:"Set up the product in Printify",copy:"The temporary artwork is only used to save the placement. It will not be used for your Listing Factory batches.",steps:["Choose the product you want to sell.","Choose its print provider.","Add temporary artwork.","Size and position the artwork exactly where you want future designs placed.","Publish the product from Printify to your connected Etsy shop."],after:"You do not need to finish every listing choice in Printify. Inside Listing Factory, you will choose the colors, sizes, prices, shipping profile, listing photos, mockups, titles, tags, description, Etsy details, and personalization."},{heading:"Copy the correct Printify URL",copy:"After the product has been published:",steps:["Open My Products in Printify.","Select the product.","Open its design editor—the screen where you can see and adjust the artwork placement.","Copy the complete URL from your browser’s address bar.","Paste that URL here."]},{heading:"Do not use",copy:"Only copy and paste the complete URL specifically from the Printify design editor. Do not use:",bullets:["The Etsy listing URL","Your Etsy storefront URL","The Printify My Products page URL","A public product URL","Only the Printify product ID"]},{heading:"After you save the product",copy:"Your saved product will keep working if the original Etsy listing sells out, becomes inactive, or is deleted. Just keep the product in Printify."},{heading:"Creating a product bundle?",copy:"Choose a bundle when you want to place every uploaded design on two to four saved products—for example, a T-shirt, sweatshirt, and hoodie. You will upload each design once. A separate listing is created for each product."}]},
  {title:"Add finished artwork",intro:"This batch becomes one listing per uploaded design for the selected product.",sections:[{heading:"Use production-ready files",copy:"Upload PNG or JPG artwork, not mockup photos. Use transparent PNGs when the background should not print."},{heading:"Upload in more than one round",copy:"Choosing another folder or more individual files adds them to the existing batch. It does not replace earlier uploads. Exact duplicate files are skipped."},{heading:"Check resolution",copy:"Original pixel dimensions and DPI are preserved. If artwork falls below Printify’s recommendation for the selected product, review the warning before continuing."},{heading:"Batch limits",copy:"Each batch can contain up to 20 designs, with a maximum of 100 MB per individual design."}]},
  {title:"Review the draft plan",intro:"Check the draft plan before anything is sent to Printify.",sections:[{heading:"Confirm the scope",copy:"Confirm the product, designs, and total drafts to create. A product bundle names every included product separately."},{heading:"Confirm the artwork",copy:"Review the main artwork and each additional print area before continuing. Color-specific artwork is chosen later, beside the finished Printify color previews."},{heading:"Nothing publishes to Etsy",copy:"This action creates private Printify drafts only. Nothing is published to Etsy."},{heading:"Prices come after the drafts",copy:"Approve prices and shipping after Printify calculates the finished production costs."}]},
  {title:"Create the Printify drafts",intro:"This creates one unpublished Printify product draft for every uploaded design.",sections:[{heading:"What is copied",copy:"The saved variants, placement, and uploaded artwork are copied into a private Printify draft."},{heading:"What this does not do",copy:"The products are not published to Etsy at this point. They remain unpublished Printify drafts while you finish colors, prices, titles, Etsy details, and images."},{heading:"Background creation",copy:"Keep this page open while files upload. Once background creation is confirmed, drafts continue even if you close the tab."},{heading:"If one draft fails",copy:"Successful drafts are kept. Retry only the failed designs."}]},
  {title:"Create titles, tags, and descriptions",intro:"Finish the searchable words and buyer-facing description for every listing.",sections:[{heading:"Start with a validated keyword bank",copy:"Only exact phrases from the chosen bank are used."},{heading:"Review AI judgment",copy:"Review every generated title and change anything that does not fit."},{heading:"Edit listings independently",copy:"You can rebuild or manually edit one title and its tags without changing any other listing in the batch."},{heading:"Use the shared description",copy:"The batch description comes from the saved product. Edit it once for every listing, then add an individual override only where a specific design needs different wording."}]},
  {title:"Review Etsy details",intro:"Check the category, attributes, and personalization for every listing.",sections:[{heading:"Verify the category first",copy:"Changing the Etsy category changes the product fields that Etsy requires and offers. Correct the category before editing the fields beneath it."},{heading:"Check every selected attribute",copy:"Review materials, style, occasion, recipient, room, and other product-specific choices. Optional fields should stay blank when there is no clear match."},{heading:"Add personalization only when needed",copy:"Personalization can collect buyer text, a dropdown choice, or files. Make each question specific, set whether it is required, and stay within the limits shown."},{heading:"Complete every listing",copy:"Complete the required Etsy details for every listing."}]},
  {title:"Choose and arrange listing images",intro:"Every listing needs at least one image. This step combines real Printify product images, photos you upload, and an optional size guide.",sections:[{heading:"Review the real Printify placement",copy:"Open a draft in Printify when the artwork needs resizing or repositioning."},{heading:"Choose Printify photos",copy:"Select the flatlays and product views that belong on the listing. Apply the same selection to every listing only when those photos make sense for the entire batch."},{heading:"Upload your own photos",copy:"Add any finished lifestyle mockups or other listing photos you already have. Uploads stay with that exact listing."},{heading:"Set the Etsy order",copy:"Drag images into the order buyers should see. You can arrange this separately for every listing."}]},
  {title:"Finish your Etsy drafts",intro:"This is the last checkpoint before The Listing Factory copies your finished listings into Etsy Drafts.",sections:[{heading:"Open every listing summary",copy:"Review the title, tags, description, Etsy details, prices, shipping, and selected images. Use the edit buttons to return to any unfinished section."},{heading:"Save to Etsy Drafts",copy:"The final action copies the selected listings into Etsy Drafts without making them live."},{heading:"Nothing publishes here",copy:"The Listing Factory does not publish or renew a listing. Etsy charges its listing fee only when you publish the draft in Etsy."},{heading:"Keep the batch",copy:"Your work remains available in Batch History if you want to return before or after creating the Etsy drafts."}]},
];

const MAX_BATCH_FILES = 20;
/* D662 · Measured against the live endpoint before changing, because the last
   time I reasoned about timing without measuring I was reading a frozen tab.
   One call, then two at once, then four at once, timed through the Resource
   Timing API so a throttled background tab could not distort it:

     1 request   3031ms
     2 requests  batch 2977ms  (2974, 2445)
     4 requests  batch 2954ms  (2026, 2339, 2339, 2952)

   Every response 200. No 429, no 5xx, no retry taken, and the endpoint exposes
   no rate-limit headers. Wall time stays flat from one request to four, which
   only happens if the worker is idle waiting on the provider rather than doing
   work of its own - so this is not CPU or memory bound inside Goldie.

   At 1, two designs cost about 6.1s and ten cost about 30s, entirely in
   sequence, for no reason the measurements support. Raised to 2, which is the
   agreed cap. NOT raised further: four showed no throttling either, but nothing
   here measures a ten-design burst against the provider's real ceiling, and a
   number chosen because it happened to work once is the kind of thing this
   comment exists to prevent.

   Draft creation now uses four independent requests. Production diagnostics
   show the slow work is remote upload and Printify creation, not Worker CPU;
   each request owns its own body and Worker invocation. Four keeps a 20-design
   batch moving without sending an unbounded burst to Printify. */
const BACKGROUND_ETSY_CONCURRENCY = 2;
const MAX_CONCURRENT_DESIGNS = 4;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
const PHYSICAL_ETSY_FIELDS=/^(materials?|sleeve length|neckline|clothing style|size|shape|orientation|capacity)$/i;
function productEtsyDefaults(template:TemplateDetails|null,saved?:Record<string,string|number|null>){
  const facts=`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`.toLowerCase(),derived:Record<string,string>={};
  if(/cotton/.test(facts))derived.Materials="Cotton";else if(/polyester/.test(facts))derived.Materials="Polyester";else if(/ceramic/.test(facts))derived.Materials="Ceramic";else if(/canvas/.test(facts))derived.Materials="Canvas";else if(/paper|poster|print/.test(facts))derived.Materials="Paper";
  if(/long.?sleeve|sweatshirt|crewneck|hoodie/.test(facts))derived["Sleeve length"]="Long sleeve";else if(/short.?sleeve|\bt-?shirt\b|\btee\b/.test(facts))derived["Sleeve length"]="Short sleeve";
  if(/\bv.?neck\b/.test(facts))derived.Neckline="V-neck";else if(/crewneck|crew neck|\bt-?shirt\b|\btee\b/.test(facts))derived.Neckline="Crew";
  if(/hoodie|hooded sweatshirt/.test(facts))derived["Clothing style"]="Hoodie";else if(/sweatshirt|crewneck/.test(facts))derived["Clothing style"]="Sweatshirt";else if(/t-?shirt|\btee\b/.test(facts))derived["Clothing style"]="T-shirt";
  if(/\bunisex\b/.test(facts))derived.Size="Unisex";else if(/\byouth\b|\bkids?\b|\bchildren\b/.test(facts))derived.Size="Youth";else if(/\binfant\b|\bbaby\b/.test(facts))derived.Size="Baby";
  /* Product facts are authoritative for physical attributes. AI-prepared or
     restored values may fill fields Goldie cannot prove, but they must never
     overwrite a fact the Printify product settles (the live failure was a
     hoodie restored as "Short sleeve" and then marked ready). */
  return {...Object.fromEntries(Object.entries(saved||{}).filter(([key,value])=>PHYSICAL_ETSY_FIELDS.test(key)&&String(value??"").trim()).map(([key,value])=>[key,String(value)])),...derived};
}
function restoreAuthoritativeProductFacts(design:DesignFile,template:TemplateDetails|null,recipe?:Recipe|null):DesignFile{
  if(!design.etsy)return design;
  const facts=productEtsyDefaults(template,recipe?.etsyDefaults);
  if(!Object.keys(facts).length)return design;
  return {...design,etsy:applyProductFacts(design.etsy,facts)};
}
function isRigidPaperProduct(template:TemplateDetails|null){return /\b(?:posters?|art prints?|canvas|paper|wall art)\b/i.test(`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`)}
/* D512 - the recommended print size was worked out in three separate places and
   the three did not agree. Two used `placementScale || 0`, the bundle check used
   `placementScale || 1`, so a product with no placement scale was silently
   exempt from the resolution warning on its own and flagged inside a bundle -
   the same design, the same product, two answers depending on the route in.
   One function decides it. */
export function printTargetFor(template:TemplateDetails|null){
  const scale=isRigidPaperProduct(template)?Math.min(template?.placementScale||1,1):template?.placementScale||0;
  return {scale,width:Math.round((template?.maxPrintWidth||0)*scale),height:Math.round((template?.maxPrintHeight||0)*scale),printWidth:template?.maxPrintWidth||0};
}
function PrintifyImageTile({src,index,selected,atLimit,onToggle,onExpand,caption}:{src:string;index:number;selected:boolean;atLimit:boolean;onToggle:()=>void;onExpand:()=>void;caption?:string}){
  const [state,setState]=useState<"loading"|"ready"|"failed">("loading"),[attempt,setAttempt]=useState(0);
  useEffect(()=>{setState("loading");setAttempt(0)},[src]);
  useEffect(()=>{
    if(state!=="failed"||attempt>=2)return;
    const timer=window.setTimeout(()=>{setState("loading");setAttempt(value=>value+1)},800*2**attempt);
    return()=>window.clearTimeout(timer);
  },[state,attempt]);
  const retrySrc=attempt?`${src}${src.includes("?")?"&":"?"}goldie_retry=${attempt}`:src;
  const accessibleName=caption||printifyViewName(src)||`Printify photo ${index+1}`;
  return <div className={`printify-image-option ${selected?"selected":""} ${state==="loading"?"is-loading":state==="failed"?"is-failed":"is-ready"}`}><button type="button" className="printify-photo-select" aria-pressed={selected} disabled={state!=="ready"||(!selected&&atLimit)} onClick={onToggle} aria-label={`${selected?"Deselect":"Select"} ${accessibleName}`}><span className="printify-photo-loading" aria-live="polite">{state==="loading"?"Loading photo…":state==="failed"?"Photo unavailable":""}</span><img key={attempt} src={retrySrc} alt={accessibleName} decoding="async" loading="lazy" width={800} height={800} onLoad={()=>setState("ready")} onError={()=>setState("failed")}/><span className="printify-photo-selector" aria-hidden="true">{selected?<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>:null}</span></button><button type="button" className="printify-photo-expand" disabled={state!=="ready"} onClick={onExpand} aria-label={`View ${accessibleName} larger`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4M10.5 8v5M8 10.5h5"/></svg></button>{caption&&<span className="mockup-tile-caption">{caption}</span>}{state==="failed"?<button type="button" className="printify-photo-retry" onClick={()=>{setState("loading");setAttempt(value=>value+1)}}>Retry</button>:null}</div>;
}
function PrintifyImagePicker({ images,indices,reservedPhotos=0,onApplyOne,onApplyAll,onSaveRecipe,onRefresh,bare,showApplyAll=true,colors=[],variants=[],details=[],colorIds }: { colorIds?:number[];colors?:ProductColor[];variants?:ProductVariant[];details?:Array<{src:string;position:string;variantIds:number[]}>;images: string[];indices:number[];reservedPhotos?:number;onApplyOne:(indices:number[])=>void;onApplyAll:(indices:number[])=>(()=>void);bare?:boolean;showApplyAll?:boolean;onSaveRecipe?:(indices:number[])=>void|Promise<void>;onRefresh?:()=>void|Promise<void> }) {
  const [selected,setSelected]=useState<Set<number>>(new Set(indices.slice(0,Math.max(0,20-reservedPhotos)))),[expanded,setExpanded]=useState<string>(""),[showAll,setShowAll]=useState(false),[view,setView]=useState(""),[moreView,setMoreView]=useState(""),[action,setAction]=useState<"clear"|"all"|"future"|"">(""),[feedback,setFeedback]=useState(""),[savingFuture,setSavingFuture]=useState(false);const undoApplyAll=useRef<null|(()=>void)>(null);
  useEffect(()=>{
    const chosen=new Set(indices),valid=uniqueMockupEntries(images,indices).filter(item=>chosen.has(item.index)).map(item=>item.index).sort((a,b)=>a-b).slice(0,Math.max(0,20-reservedPhotos));
    setSelected(new Set(valid));
    if(valid.length!==indices.length)onApplyOne(valid);
  },[indices,images.length,reservedPhotos]);
  useEffect(()=>{void onRefresh?.()},[]);
  useEffect(()=>{if(!expanded)return;const restoreFocus=containModalFocus("Expanded Printify photo");const previous=document.body.style.overflow;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpanded("")};document.body.style.overflow="hidden";window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);restoreFocus()}},[expanded]);
  if(!images.length)return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>;
  const chosen=[...selected].sort((a,b)=>a-b),selectionHint=chosen.length?"":"Select a Printify photo below first.",slotsLeft=Math.max(0,20-reservedPhotos-selected.size),atLimit=slotsLeft===0;
  function toggle(index:number){const next=new Set(selected);if(next.has(index))next.delete(index);else{if(atLimit){setFeedback("Etsy allows 20 listing photos. Remove a selected photo before adding another.");return}next.add(index)}setSelected(next);setAction("");setFeedback("");onApplyOne([...next].sort((a,b)=>a-b))}
  function deselect(){setSelected(new Set());setAction("clear");setFeedback("");onApplyOne([])}
  function applyAll(){if(action==="all"&&undoApplyAll.current){undoApplyAll.current();undoApplyAll.current=null;setAction("");setFeedback("Previous photo choices restored.");return}if(!chosen.length)return;undoApplyAll.current=onApplyAll(chosen);setAction("all");setFeedback("✓ These views are selected for this product’s listings.")}
  async function saveFuture(){if(!onSaveRecipe||savingFuture||!chosen.length)return;setSavingFuture(true);setFeedback("Saving your preference…");try{await onSaveRecipe(chosen);setAction("future");setFeedback("✓ These Printify photos will be preselected for future batches using this product.")}catch(error){setAction("");setFeedback(error instanceof Error?error.message:"These preferences could not be saved.")}finally{setSavingFuture(false)}}
  const lightbox=expanded&&typeof document!=="undefined"?createPortal(<div className="printify-photo-lightbox" role="dialog" aria-modal="true" aria-label="Expanded Printify photo" onMouseDown={event=>{if(event.target===event.currentTarget)setExpanded("")}}><button type="button" onClick={()=>setExpanded("")} aria-label="Close expanded photo">×</button><img src={expanded} alt="Expanded Printify product mockup"/></div>,document.body):null;
  return <>{/* D407 - Was open by default, so arriving on Images dropped you into the
              first listing's Printify photos before you had chosen what to do. Nothing
              on this step expands itself. */}
            {/* D539 - the shell comes off. This picker used to be its own disclosure with
    its own summary and its own close button, because it lived on a page that
    needed it to. Inside a product card the row above it is already the
    disclosure, so the shell made a second accordion inside the first. */}
            {/* D555 - PrintifyImagePicker is called once, always bare, so this component
        carried a second copy of the entire picker that could never render. D554
        labelled the tiles in the copy that is used; the dead one still held the
        old unlabelled grid. That is exactly how the mug bug happened - two copies
        of one rule, one of them fixed. One copy. */}
        <div className="printify-image-picker bare"><div className="mockup-picker-heading"><h4>Printify mockups</h4><span>{selected.size+reservedPhotos} of 20 photos</span></div><p>{colors.length?"Choose a view, then select the colors you want.":"Choose a view, then select the photos you want."} Your uploads and size guide share the 20-photo limit.</p><div className="image-pref-actions"><button type="button" className={`clear ${action==="clear"?"confirmed":""}`} disabled={!chosen.length} onClick={deselect}>{action==="clear"&&<span className="action-check">✓</span>}<b>{action==="clear"?"Selections cleared":"Clear this listing’s selections"}</b><small>{selectionHint||"Remove every selected Printify photo from this listing only."}</small></button>{showApplyAll?<button type="button" className={action==="all"?"confirmed":""} disabled={!chosen.length} onClick={applyAll}>{action==="all"&&<span className="action-check">✓</span>}<b>{action==="all"?"Undo apply to product":"Apply photos to this product’s listings"}</b><small>{action==="all"?"Restore every listing’s previous photo choices.":selectionHint||"Use these views for each design on this product."}</small></button>:null}</div>{feedback&&<p className="image-pref-feedback" role="status">{feedback}</p>}{/* D569 - measured on her hoodie: 96 tiles in one listing's picker, 192 in the
        panel, and only 12 distinct labels - "Front" sixteen times, "Back" sixteen
        times. Every tile is a real, different image (12 camera views across the 8
        colours she enabled), but a flat wall of 96 with a repeated one-word label
        is not something anyone can choose 20 photos from. Grouped by the view,
        which is the one thing the URL tells us for certain. Colour is NOT
        labelled: Printify's image order need not follow her colour order, and a
        Cocoa hoodie labelled "White" is worse than one labelled only "Front". */}
      {(()=>{
        const indexed=uniqueMockupEntries(images,[...selected]);
        const groups=mockupViewGroups(indexed,colors,variants,details,{selectedIndices:[...selected],colorIds}),primary=groups.filter(group=>group.primary),other=groups.filter(group=>!group.primary);
        const current=groups.find(group=>group.key===view)||(primary[0]||groups[0]);
        const extra=other.find(group=>group.key===moreView)||other[0];
        const selectedEntries=groups.flatMap(group=>group.entries).filter(item=>selected.has(item.index));
        const visible=view==="selected"?selectedEntries:showAll?(extra?.entries||[]):(current?.entries||[]);
        return <><div className="mockup-view-tabs" role="group" aria-label="Mockup views">
          {(primary.length?primary:groups.slice(0,1)).map(group=><button type="button" key={group.key} aria-pressed={!showAll&&view!=="selected"&&current?.key===group.key} onClick={()=>{setView(group.key);setShowAll(false)}}>{group.label} <span>{group.entries.length}</span></button>)}
          <button type="button" aria-pressed={view==="selected"&&!showAll} onClick={()=>{setView("selected");setShowAll(false)}}>Selected <span>{selected.size}</span></button>
        </div>
        {other.length>0&&<div className="mockup-other-views"><button type="button" className={`printify-more-toggle${showAll?" is-open":""}`} aria-expanded={showAll} onClick={()=>{setShowAll(value=>!value);if(view==="selected")setView(primary[0]?.key||groups[0]?.key||"")}}><span>More angles &amp; lifestyle · {other.length} views</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button>{showAll&&<div className="mockup-angle-controls"><span>Choose a view</span><label><span className="sr-only">More mockup view</span><select value={extra?.key||""} onChange={event=>setMoreView(event.target.value)}>{other.map(group=><option key={group.key} value={group.key}>{group.label} · {group.entries.length} photos</option>)}</select></label></div>}</div>}
        <div className="printify-image-grid printify-all-images">{visible.map(({src,index,color,label})=><PrintifyImageTile key={`${src}:${index}`} src={src} index={index} caption={color?`${color} · ${label}`:label} selected={selected.has(index)} atLimit={atLimit} onToggle={()=>toggle(index)} onExpand={()=>setExpanded(src)}/>)}</div>
        {!visible.length&&<p className="mockup-empty">No photos selected yet. Choose a view above to get started.</p>}
        </>})()}</div>{lightbox}</>;
}

function UploadedDesignPreview({src,label}:{src:string;label?:string}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(!open)return;const restoreFocus=containModalFocus("Full-size design preview");const previous=document.body.style.overflow;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};document.body.style.overflow="hidden";window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);restoreFocus()}},[open]);
  return <><button type="button" className="uploaded-design-preview" onClick={()=>setOpen(true)} aria-label="View design larger" title={label}><img src={src} alt="" decoding="async"/></button>{open&&typeof document!=="undefined"?createPortal(<div className="printify-photo-lightbox" role="dialog" aria-modal="true" aria-label="Full-size design preview" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><button type="button" onClick={()=>setOpen(false)} aria-label="Close design preview">×</button><img src={src} alt="Full-size design preview"/></div>,document.body):null}</>;
}

/* D422 - Same defect the profit goal had, in the personalization fields: bound
   straight to a number, so clearing the box made Number("")||1 into 1, React
   wrote the 1 back, and everything typed after it landed behind - clear it, type
   25, get "125". PriceField already solved this for money; this is the whole-
   number version of the same idea. */
function IntegerField({value,min,max,label,onCommit}:{value:number;min:number;max:number;label:string;onCommit:(next:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  return <input type="number" min={min} max={max} aria-label={label} value={draft??String(value)}
    onChange={event=>{const raw=event.target.value;setDraft(raw);const parsed=Number(raw);
      if(raw!==""&&Number.isFinite(parsed))onCommit(Math.max(min,Math.min(max,Math.round(parsed))))}}
    onBlur={()=>setDraft(null)}/>;
}

function PriceField({value,minimum,label,onCommit}:{value:number;minimum:number;label:string;onCommit:(cents:number)=>void}){const [draft,setDraft]=useState((value/100).toFixed(2)),[confirmed,setConfirmed]=useState(false);useLayoutEffect(()=>setDraft((value/100).toFixed(2)),[value]);function live(raw:string){setDraft(raw);const amount=Number(raw);if(raw!==""&&Number.isFinite(amount))onCommit(Math.round(Math.max(minimum,amount)*100))}function commit(){const amount=Number(draft);if(!Number.isFinite(amount)){setDraft((value/100).toFixed(2));return}const cents=Math.round(Math.max(minimum,amount)*100);onCommit(cents);setDraft((cents/100).toFixed(2));setConfirmed(true);window.setTimeout(()=>setConfirmed(false),520)}return <label className={confirmed?"price-confirmed":""} aria-label={label}>$<input type="text" inputMode="decimal" value={draft} onChange={event=>live(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.currentTarget.blur()}if(event.key==="Escape"){setDraft((value/100).toFixed(2));event.currentTarget.blur()}}}/></label>}

/* D236 · A panel opened from a product-card row must not re-announce itself. The
   row above it already reads "Colors · Pick colors · 39 available"; the panel was
   then repeating "Colors" as a 22px card title plus a second count badge. inCard
   drops the panel's own head and keeps one line of helper text. */
function ProductColorSelector({product,selected,onChange,onRemember,remembering,remembered,inCard}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean;inCard?:boolean}){
  const colors=product.colorOptions||[],available=colors.filter(color=>color.available),selectedSet=new Set(selected),[expanded,setExpanded]=useState(inCard?true:!remembered);
  if(!colors.length)return <section className="product-color-selector no-colors"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>This product has no separate color choices.</h3><span>The saved Printify variants will be used.</span></div></section>;
  const idsFor=(color:ProductColor)=>[...new Set([color.id,...(color.ids||[])])];
  const isSelected=(color:ProductColor)=>idsFor(color).some(id=>selectedSet.has(id));
  function toggle(color:ProductColor){const next=new Set(selectedSet),ids=idsFor(color),choosing=!isSelected(color);for(const id of ids)next.delete(id);if(choosing)next.add(color.id);onChange([...next])}
  const selectedColors=colors.filter(isSelected);
  /* First-run framing now lives above the product controls and is persisted by
     setupComplete. Keep this reusable selector free of parent-only state. */
  const productFirstRun=false;
  return <section className="product-color-selector" aria-label={`Choose colors for ${product.blueprintTitle}`}>{inCard?<p className="panel-help">Every change saves to this product automatically.</p>:<div className="color-selector-head"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>Colors</h3><span>{productFirstRun?"Choose the colors you want to offer, then save them as this product's default.":remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selectedColors.length} selected</b></div>}{!expanded&&selectedColors.length>0&&<div className="remembered-color-row">{selectedColors.map(color=><span key={color.id}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/>{color.title}</span>)}<button type="button" onClick={()=>setExpanded(true)}>Change colors</button></div>}{expanded&&<><div className="color-choice-grid">{colors.map(color=><button type="button" key={color.id} disabled={!color.available} aria-pressed={isSelected(color)} onClick={()=>toggle(color)} className={isSelected(color)?"selected":""}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/><span>{color.title}</span>{isSelected(color)&&<em>✓</em>}{!color.available&&<small>Unavailable</small>}</button>)}</div><div className="color-selector-actions"><button type="button" onClick={()=>onChange(available.map(color=>color.id))}>Select all available</button><button type="button" onClick={()=>{const templateColors=(product.colorOptions||[]).filter(color=>color.available&&color.templateEnabled).map(color=>color.id);/* D315 · Sizes had "Match Printify template" and colours did not, though both
                   carry templateEnabled and the row shortcut offers it for both. Same
                   capability, one panel had the control and the other did not. Follows
                   D213: if the template enables nothing, match nothing rather than
                   quietly selecting the whole blueprint. */onChange(templateColors)}}>Match Printify template</button><button type="button" onClick={()=>onChange([])}>Clear all</button>{/* D318 · "Done choosing colors" existed on colours and not on sizes, and it
                  collapsed the panel back to a summary — which the row's own Close
                  button already does, for both. One job, two controls, and only on
                  one of the two pickers. */}{inCard?<span className={`default-saved-state${remembered?" saved":""}`}>{/* D311 · In the card these choices are already written to the product the
                  moment they change — that is what establish() does, and it is the
                  behaviour Brittany prefers. Leaving a "Save these as this product's
                  default colors" button next to it asked for a click that was never
                  required, and then read "✓ Saved for this product" without one,
                  which is why it looked like it was lying. A status, not a button. */}{remembered?"✓ Saved as this product’s default":"Saving…"}</span>:<button type="button" className={remembered?"remembered":""} disabled={!selected.length||remembering||remembered} onClick={onRemember}>{remembering?"Saving…":remembered?"✓ Saved for this product":"Save these as this product’s default colors"}</button>}</div></>}{!selected.length&&<p className="color-required" role="alert">Choose at least one available color before continuing.</p>}</section>
}

function DraftColorSelector({product,drafts,selected,selectedByDraft,saving,artworkByDraft,onChange,onArtworkChange,onPreviewRequest}:{product:TemplateDetails;drafts:DraftResult[];selected:number[];selectedByDraft?:Record<string,number[]>;saving:boolean;artworkByDraft:Record<string,string>;onChange:(draft:DraftResult,ids:number[])=>void;onArtworkChange:(draft:DraftResult,color:ProductColor,list:FileList|null,reset?:boolean)=>void;onPreviewRequest:(productId:string)=>Promise<void>}){
  const colors=[...(product.colorOptions||[]).filter(color=>color.available).reduce((groups,color)=>{
    const key=color.title.trim().toLowerCase(),existing=groups.get(key);
    if(existing)existing.ids=[...new Set([existing.id,...(existing.ids||[]),color.id,...(color.ids||[])])];
    else groups.set(key,{...color,ids:[...new Set([color.id,...(color.ids||[])])]});
    return groups;
  },new Map<string,ProductColor>()).values()];
  const [activeDraft,setActiveDraft]=useState("");
  const [activeColor,setActiveColor]=useState<number|null>(selected[0]??colors[0]?.id??null);
  const [showRealPreview,setShowRealPreview]=useState(false);
  const [previewLoading,setPreviewLoading]=useState(false);
  const [previewError,setPreviewError]=useState("");
  const previewRequestRevision=useRef(0);
  const selectorRef=useRef<HTMLElement|null>(null);
  /* Lock the color at the moment the artwork chooser opens. The mouse can land
     over another swatch while the native file dialog is closing; that hover is
     a preview affordance, not permission to retarget the upload. */
  const artworkUploadColor=useRef<ProductColor|null>(null);
  const explicitlyChosenColor=useRef<ProductColor|null>(null);
  const artworkPickerRef=useRef<HTMLInputElement|null>(null);
  useEffect(()=>{
    const input=artworkPickerRef.current;
    const cancel=()=>{artworkUploadColor.current=null};
    input?.addEventListener("cancel",cancel);
    return()=>input?.removeEventListener("cancel",cancel);
  });
  const draft=drafts.find(item=>item.id===activeDraft)||drafts.find(item=>item.status==="Created");
  useEffect(()=>{if(draft?.id&&!activeDraft)setActiveDraft(draft.id)},[draft?.id,activeDraft]);
  useEffect(()=>{setShowRealPreview(false)},[draft?.id,JSON.stringify(draft?.artworkOverrides)]);
  if(!colors.length||!draft)return null;
  const selectedSet=new Set(draft.id&&selectedByDraft?.[draft.id]||selected);
  const idsFor=(color:ProductColor)=>[...new Set([color.id,...(color.ids||[])])];
  const variantIdsFor=(color:ProductColor)=>color.variantIds?.length?new Set(color.variantIds):printifyVariantIdsForColor(product.variants,idsFor(color));
  const imageFor=(color:ProductColor)=>{
    const variants=variantIdsFor(color);
    return printifyMockupForColor(draft.colorPreviewImageDetails?.length?draft.colorPreviewImageDetails:draft.printifyImageDetails?.length?draft.printifyImageDetails:printifyMockupDetails(draft.printifyImages),variants)
      ||"";
  };
  /* Render from state only. The ref exists solely to remember the exact color
     whose native file picker is open; reading it here made rendering depend on
     a mutation that does not schedule a render. */
  const focused=colors.find(color=>color.id===activeColor)||colors[0];
  const realPreview=imageFor(focused);
  const focusedVariants=variantIdsFor(focused);
  const renderingSide=primaryPrintSide(orderedPrintSides(product.printPositions))||"other";
  const sidePattern=renderingSide==="other"?/.*/:new RegExp(renderingSide==="wrap"?"wrap|around":renderingSide,"i");
  const productRendering=(product.productRenderings||[]).find(view=>sidePattern.test(view.position)&&view.variantIds.some(id=>focusedVariants.has(id)))?.src||(product.productRenderings||[]).find(view=>view.variantIds.some(id=>focusedVariants.has(id)))?.src||(product.productRenderings||[])[0]?.src||"";
  const override=draft.artworkOverrides?.[String(focused.id)];
  const mainArtwork=(override&&draft.artworkOverridePreviewUrls?.[String(focused.id)])||artworkByDraft[draft.clientId]||"";
  const createdDrafts=drafts.filter(item=>item.id);
  const includedColors=colors.filter(color=>idsFor(color).some(id=>selectedSet.has(id)));
  const availableToAdd=colors.filter(color=>!idsFor(color).some(id=>selectedSet.has(id)));
  const activeDraftIndex=Math.max(0,createdDrafts.findIndex(item=>item.id===draft.id));
  function showDraft(id:string){previewRequestRevision.current++;setPreviewLoading(false);setShowRealPreview(false);setActiveDraft(id);window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>selectorRef.current?.scrollIntoView({block:"start"})))}
  function focusColor(id:number){if(artworkUploadColor.current||id===activeColor)return;previewRequestRevision.current++;setPreviewLoading(false);setPreviewError("");setActiveColor(id);setShowRealPreview(false)}
  function toggle(color:ProductColor){artworkUploadColor.current=null;explicitlyChosenColor.current=color;const next=new Set(selectedSet);if(idsFor(color).some(id=>next.has(id))){for(const id of idsFor(color))next.delete(id)}else next.add(color.id);focusColor(color.id);onChange(draft!,[...next])}
  const selectAll=()=>onChange(draft!,colors.map(color=>color.id));
  const matchTemplate=()=>onChange(draft!,colors.filter(color=>color.templateEnabled).map(color=>color.id));
  async function openPreview(){
    if(showRealPreview){setShowRealPreview(false);return}
    if(!draft?.id)return;
    const revision=++previewRequestRevision.current;
    setPreviewError("");setPreviewLoading(true);
    try{await onPreviewRequest(draft.id);if(revision===previewRequestRevision.current)setShowRealPreview(true)}
    catch{if(revision===previewRequestRevision.current){setShowRealPreview(false);setPreviewError("Printify preview could not be refreshed. Try Preview again.")}}
    finally{if(revision===previewRequestRevision.current)setPreviewLoading(false)}
  }
  return <section ref={selectorRef} className="draft-color-selector" aria-label="Preview and choose product colors" onClickCapture={event=>{if((event.target as HTMLElement).closest(".draft-color-artwork-action"))artworkUploadColor.current=focused}}>
    <div className="draft-color-heading"><div><h3>Choose product colors</h3><p>{createdDrafts.length>1?`Listing ${activeDraftIndex+1} of ${createdDrafts.length}. `:""}Choose colors instantly. Open Preview only when you want to see the finished Printify mockup.</p></div></div>
    <div className="draft-color-bulk-actions" role="group" aria-label="Color selection actions"><button type="button" onClick={selectAll}>Select all available</button><button type="button" onClick={matchTemplate}>Match Printify template</button><button type="button" onClick={()=>onChange(draft!,[])}>Clear all</button>{saving?<span role="status">Saving choices…</span>:null}</div>
    <div className="draft-color-workspace"><div className="draft-color-main">{showRealPreview&&realPreview?<img src={realPreview} alt={`${focused.title} finished Printify preview`}/>:<ProductColorRendering color={focused.swatch} artworkUrl={mainArtwork} productRenderingUrl={productRendering} placement={draft.placement} side={renderingSide} printWidth={product.maxPrintWidth} printHeight={product.maxPrintHeight}/>}<b>{focused.title}</b><span>{override?"Using alternate artwork":"Using the main design"}</span><button type="button" className="draft-color-preview" aria-busy={previewLoading} disabled={previewLoading} onClick={()=>void openPreview()}>{showRealPreview?"Back to edit view":previewLoading?"Loading preview…":"Preview"}</button>{previewError?<p className="field-error" role="alert">{previewError}</p>:null}<div className="draft-color-artwork-action"><label role="button" tabIndex={0} aria-disabled={saving} onKeyDown={event=>{if(saving)return;if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.querySelector("input")?.click()}}}>{override?`Change artwork for ${focused.title}`:`Use different artwork for ${focused.title}`}<input className="hidden-picker" ref={artworkPickerRef} type="file" accept=".png,.jpg,.jpeg" disabled={saving} onChange={event=>{const locked=artworkUploadColor.current||focused;onArtworkChange(draft,locked,event.target.files);artworkUploadColor.current=null;event.target.value=""}}/></label>{override?<button type="button" disabled={saving} onClick={()=>{onArtworkChange(draft,focused,null,true);artworkUploadColor.current=null}}>Use main design</button>:null}</div></div><div className="draft-color-choices"><div className="draft-color-selected"><b>Selected colors</b><span>{includedColors.length}</span></div><div className="draft-color-grid">{includedColors.map(color=><button type="button" key={color.id} aria-pressed="true" className="selected" onMouseMove={event=>{if(event.movementX||event.movementY)focusColor(color.id)}} onFocus={()=>focusColor(color.id)} onClick={()=>toggle(color)}><i className="draft-color-swatch" style={{background:color.swatch||"#ddd"}} aria-hidden="true"/><span>{color.title}</span><em>✓ Included</em></button>)}</div><details className="draft-color-more" open={!includedColors.length}><summary>Add more colors <span>{availableToAdd.length}</span></summary><div className="draft-color-grid">{availableToAdd.map(color=><button type="button" key={color.id} aria-pressed="false" onMouseMove={event=>{if(event.movementX||event.movementY)focusColor(color.id)}} onFocus={()=>focusColor(color.id)} onClick={()=>toggle(color)}><i className="draft-color-swatch" style={{background:color.swatch||"#ddd"}} aria-hidden="true"/><span>{color.title}</span><em>Add</em></button>)}</div></details></div></div>
    {override&&draft.editorUrl?<div className="draft-color-adjust"><a href={draft.editorUrl} target="_blank" rel="noreferrer">Adjust this artwork in Printify ↗</a><span>Resize or reposition this color’s artwork if needed.</span></div>:null}
    {createdDrafts.length>1?<nav className="factory-listing-next draft-color-next" aria-label="Move between product-color listings"><button type="button" disabled={activeDraftIndex===0} onClick={()=>showDraft(createdDrafts[activeDraftIndex-1].id!)}>← Previous listing</button><span>Listing {activeDraftIndex+1} of {createdDrafts.length}</span><button type="button" disabled={activeDraftIndex===createdDrafts.length-1} onClick={()=>showDraft(createdDrafts[activeDraftIndex+1].id!)}>Next listing →</button></nav>:null}
  </section>;
}

function ProductSizeSelector({product,selected,onChange,onRemember,remembering,remembered,inCard,scope="product"}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean;inCard?:boolean;scope?:"product"|"listing"}){
  const sizes=product.sizeOptions||[],available=sizes.filter(size=>size.available),selectedSet=new Set(selected),axis=productOptionAxis(product.blueprintTitle);
  const selectedOptions=sizes.filter(size=>selectedSet.has(size.id)),availableToAdd=sizes.filter(size=>!selectedSet.has(size.id));
  /* A blueprint with no size axis (a mug, a sticker) renders nothing at all
     rather than an empty card. */
  if(!sizes.length)return null;
  function toggle(id:number){const next=new Set(selectedSet);if(next.has(id))next.delete(id);else next.add(id);onChange([...next])}
  return <section className="product-size-selector" aria-label={axis.aria}>
    {inCard?<p className="panel-help">{scope==="listing"?"Changes apply only to this listing.":"Every change saves to this product automatically."}</p>:<div className="size-selector-head"><div><p className="mini-label">{axis.label.toUpperCase()} FOR THIS BATCH</p><h3>{axis.label}</h3><span>{remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selected.length} selected</b></div>}
    {selectedOptions.length?<><div className="size-choice-selected"><b>Selected {axis.label.toLowerCase()}</b><span>{selectedOptions.length}</span></div><div className="size-choice-grid">{selectedOptions.map(size=><button type="button" key={size.id} aria-pressed="true" onClick={()=>toggle(size.id)} className="selected"><span>{size.title}</span><em>✓</em></button>)}</div></>:null}
    {availableToAdd.length?<details className="size-choice-more" open={!selectedOptions.length}><summary>Add more {axis.label.toLowerCase()} <span>{availableToAdd.filter(size=>size.available).length}</span></summary><div className="size-choice-grid">{availableToAdd.map(size=><button type="button" key={size.id} disabled={!size.available} aria-pressed="false" onClick={()=>toggle(size.id)}><span>{size.title}</span>{!size.available&&<small>Unavailable</small>}</button>)}</div></details>:null}
    <div className="size-selector-actions"><button type="button" onClick={()=>onChange(available.map(size=>size.id))}>Select all available</button><button type="button" onClick={()=>{const templateSizes=(product.sizeOptions||[]).filter(size=>size.available&&size.templateEnabled).map(size=>size.id);
                /* D213 · This used to fall back to every available size when the
                   template had none enabled, so a button reading "Match Printify
                   template" quietly selected the whole blueprint. If there is
                   nothing to match, match nothing and let the seller choose. */
                onChange(templateSizes)}}>Match Printify template</button><button type="button" onClick={()=>onChange([])}>Clear all</button>{/* D318 · Colours had Clear all and sizes did not. Both pickers now offer the
                  same three actions in the same order: Select all available,
                  Match Printify template, Clear all. */}{inCard?<span className={`default-saved-state${((scope==="listing"&&!remembering)||(scope==="product"&&remembered))?" saved":""}`}>{scope==="listing"?(remembering?"Saving listing…":"✓ Saved to this listing"):(remembered?"✓ Saved as this product’s default":"Saving…")}</span>:<button type="button" className={remembered?"remembered":""} disabled={!selected.length||remembering||remembered} onClick={onRemember}>{remembering?"Saving…":remembered?"✓ Saved for this product":`Save these as this product’s default ${axis.choice}s`}</button>}</div>
    {!selected.length&&<p className="size-required" role="alert">Choose at least one {axis.choice} before continuing.</p>}
  </section>
}

function normalizePricesByCost(variants:ProductVariant[],next:Record<string,number>){
  const safestByCost=new Map<number,number>();
  for(const variant of variants)safestByCost.set(variant.cost,Math.max(safestByCost.get(variant.cost)||0,next[String(variant.id)]??variant.templatePrice));
  return Object.fromEntries(variants.map(variant=>[String(variant.id),safestByCost.get(variant.cost)??next[String(variant.id)]??variant.templatePrice]));
}

async function designPreviewDataUrl(design:DesignFile){
  if(!design.originalUnavailable)return safeImagePreviewDataUrl(design.file,1200,false);
  if(!design.previewUrl)throw new Error("The original upload is not available in this browser. You can still write this listing manually.");
  try{const response=await fetch(design.previewUrl);if(!response.ok)throw new Error();return safeImagePreviewDataUrl(await response.blob(),1200,false)}catch{throw new Error("The saved Printify preview could not be read. You can still write this listing manually.")}
}
function fallbackTagsFromKeywords(keywords:string[]){return validEtsyTags(keywords)}
async function autoTitleForDesign(design:DesignFile,keywords:string[],useCommas:boolean,template:TemplateDetails|null){const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"title",image:await designPreviewDataUrl(design),product:{blueprintTitle:template?.blueprintTitle,brand:template?.brand,model:template?.model},keywords,useCommas})}),payload=await response.json() as {title?:string;keywords?:string[];tags?:string[];titleWarning?:string;error?:string};if(!response.ok||!payload.title)throw new Error(payload.error||"This title could not be created.");return {title:payload.title,keywords:payload.keywords||[],tags:completedGeneratedTags(payload.tags||[],payload.keywords||[],keywords),titleWarning:payload.titleWarning||""}}

function IndividualAutoTitle({design,template,useCommas,initialBankId,paused,onApply}:{design:DesignFile;template:TemplateDetails|null;useCommas:boolean;initialBankId?:string;paused?:boolean;onApply:(title:string,tags:string[],titleWarning?:string)=>void}){const [bank,setBank]=useState<KeywordList|null>(null),[building,setBuilding]=useState(false),[message,setMessage]=useState(""),[openMode,setOpenMode]=useState<"ai"|"manual"|null>(null);const resultGuard=useRef(titleResultGuard()),buildingRef=useRef(false);
  resultGuard.current.update(JSON.stringify([design.id,template?.id,bank?.id,bank?.keywords,useCommas,paused]),[design]);
  useEffect(()=>()=>resultGuard.current.clear(),[]);
  async function build(){
    if(!bank||buildingRef.current||paused)return;
    const ticket=resultGuard.current.begin(design.id);buildingRef.current=true;setBuilding(true);setMessage("");
    try{
      const result=await autoTitleForDesign(design,bank.keywords,useCommas,template);
      if(!resultGuard.current.current(ticket)){setMessage("Your newer edits were kept. The earlier AI result was not applied.");return;}
      onApply(result.title,result.tags,result.titleWarning);
      setMessage(result.titleWarning||"✓ New title and separately ranked Etsy tags applied to this listing only.");
    }catch(error){if(resultGuard.current.current(ticket))setMessage(error instanceof Error?error.message:"This title could not be created.");}
    finally{buildingRef.current=false;setBuilding(false);}
  }return <>{design.titleWarning&&<p className="title-match-warning" role="status">{design.titleWarning}</p>}{design.titleError&&<p className="field-error" role="alert">{design.titleError}</p>}<details className="individual-title-builder" open={openMode==="ai"} onToggle={event=>{const opened=event.currentTarget.open;setOpenMode(current=>opened?"ai":current==="ai"?null:current)}} onClick={event=>event.stopPropagation()}><summary>Create a different title with AI</summary><KeywordBank compact selectionOnly initialId={initialBankId||""} title="Keyword bank" copy="Only exact validated phrases from this bank are used." onSelect={setBank}/><button className="ai-title-button" title={paused?"This batch is open in another tab, so nothing built here would be kept.":!bank?"Choose a keyword bank first.":undefined} disabled={!bank||building||Boolean(paused)} onClick={()=>void build()}>{building?"Creating this title…":"Create title for this design"}</button>{message&&<p className="title-build-message" role="status">{message}</p>}<button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close title builder</button></details><IndividualManualTitle open={openMode==="manual"} onOpenChange={opened=>setOpenMode(current=>opened?"manual":current==="manual"?null:current)} useCommas={useCommas} initialBankId={initialBankId} onApply={(title,tags)=>onApply(title,tags,"")}/></>}

function IndividualManualTitle({open,onOpenChange,useCommas,initialBankId,onApply}:{open:boolean;onOpenChange:(open:boolean)=>void;useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[])=>void}){const [bankId,setBankId]=useState(initialBankId||""),[keywords,setKeywords]=useState<string[]>([]),[message,setMessage]=useState("");const title=keywords.join(useCommas?", ":" ");function add(keyword:string){setKeywords(current=>current.includes(keyword)?current:[...current,keyword]);setMessage("")}function apply(){if(!title)return;onApply(title,tagsFromTitle(keywords.join(", ")));setMessage("✓ Your title and matching tags were applied to this listing only.")}return <details className="individual-title-builder individual-manual-title" open={open} onToggle={event=>onOpenChange(event.currentTarget.open)} onClick={event=>event.stopPropagation()}><summary>Build this title yourself from a keyword bank</summary><KeywordBank compact initialId={bankId} title="Choose a keyword bank" copy="Click keywords in the order you want them for this listing." onSelect={list=>{setBankId(list?.id||"");setKeywords([]);setMessage("")}} onAdd={add}/><div className="individual-keyword-selection"><div><b>Selected keywords</b>{keywords.length>0&&<button type="button" onClick={()=>setKeywords([])}>Clear all</button>}</div>{keywords.length?<><div className="selected-keyword-chips">{keywords.map(keyword=><button type="button" key={keyword} onClick={()=>setKeywords(current=>current.filter(item=>item!==keyword))}>{keyword}<span>×</span></button>)}</div><div className="individual-title-preview"><small>Title preview</small><span>{title}</span></div><button type="button" className="apply-manual-title" onClick={apply}>Apply to this listing</button></>:<p>Choose a bank, then click the keywords you want to use.</p>}{message&&<p className="title-build-message" role="status">{message}</p>}</div></details>}

function PersonalizationEditor({value,onChange}:{value?:EtsyPersonalization;onChange:(value:EtsyPersonalization)=>void}){
  const enabled=Boolean(value?.enabled),questions=value?.questions||[],problem=personalizationProblem({personalization:value});
  function blank(type:PersonalizationQuestion["type"]="text_input"):PersonalizationQuestion{return{id:crypto.randomUUID(),type,question:type==="text_input"?"Personalization":"",instructions:"",required:false,maxCharacters:256,maxFiles:1,options:type==="dropdown"?["Option 1","Option 2"]:[]}}
  function update(id:string,patch:Partial<PersonalizationQuestion>){onChange({enabled:true,questions:questions.map(question=>question.id===id?{...question,...patch}:question)})}
  function toggle(next:boolean){onChange({enabled:next,questions:next?(questions.length?questions:[blank()]):questions})}
  return <section className="personalization-editor"><div className="personalization-heading"><div><b>Personalization</b><small>Saved questions are added to your Etsy draft during finishing.</small></div><label className="personalization-switch"><input type="checkbox" role="switch" aria-label="Personalization" aria-checked={enabled} checked={enabled} onChange={event=>toggle(event.target.checked)}/><span>{enabled?"On":"Off"}</span></label></div>{problem&&<p className="field-error" role="alert">{problem}</p>}{enabled&&<><div className="personalization-questions">{questions.map((question,index)=><article key={question.id}><div className="personalization-question-head"><b>Question {index+1}</b><button type="button" onClick={()=>onChange({enabled:true,questions:questions.filter(item=>item.id!==question.id)})}>Remove</button></div><label>Answer type<select value={question.type} onChange={event=>{const type=event.target.value as PersonalizationQuestion["type"];update(question.id,{type,options:type==="dropdown"&&question.options.length<2?["Option 1","Option 2"]:question.options})}}><option value="text_input">Text answer</option><option value="dropdown">Dropdown choices</option><option value="unlabeled_upload">File upload</option></select></label><label>Question<input maxLength={120} value={question.question} placeholder="Example: What name should appear on the shirt?" onChange={event=>update(question.id,{question:event.target.value})}/></label>{question.type!=="dropdown"&&<label>Instructions <span>{question.instructions.length}/120</span><textarea rows={2} maxLength={120} value={question.instructions} placeholder="Tell the buyer exactly what to provide." onChange={event=>update(question.id,{instructions:event.target.value})}/></label>}{question.type==="text_input"&&<label>Maximum characters<IntegerField value={question.maxCharacters} min={1} max={1024} label="Maximum characters" onCommit={next=>update(question.id,{maxCharacters:next})}/></label>}{question.type==="unlabeled_upload"&&<label>Maximum files<IntegerField value={question.maxFiles} min={1} max={10} label="Maximum files" onCommit={next=>update(question.id,{maxFiles:next})}/></label>}{question.type==="dropdown"&&<label>Dropdown choices<textarea rows={3} value={question.options.join("\n")} placeholder={"Small\nMedium\nLarge"} onChange={event=>update(question.id,{options:event.target.value.split(/\r?\n/).slice(0,30)})}/><small>Enter one choice per line. Etsy allows up to 30 choices, with 20 characters per choice.</small></label>}<label className="personalization-required"><input type="checkbox" checked={question.required} onChange={event=>update(question.id,{required:event.target.checked})}/>Buyer must answer this question</label></article>)}</div>{questions.length<5&&<button type="button" className="add-personalization-question" onClick={()=>onChange({enabled:true,questions:[...questions,blank()]})}>Add another question</button>}<small className="personalization-note">Etsy allows up to five questions. Review every question before publishing.</small></>}</section>
}

function etsyDetailsSummary(details:EtsyDetails,properties:EtsyPropertySelection[]){
  const required=properties.filter(property=>property.required),requiredDone=required.filter(property=>property.value.trim()),completed=properties.filter(property=>property.value.trim());
  const propertyStatus=required.length?`${requiredDone.length} of ${required.length} required set`:completed.length?`${completed.length} optional ${completed.length===1?"detail":"details"} added`:"Optional details blank";
  return `${details.category?.trim()||"Choose an Etsy category"} · ${propertyStatus}`;
}

/* D793 · `checklist` off when the screen already shows one. Step 3 is the
   preview's two-column grid now, and the checklist beside the listing is the
   outer one. This editor drawing its own put every Etsy property on the
   screen twice - two checklists, 17 rows, inside two nested grids. */
function LegacyEtsyDetailsEditor({design,categories,onChange,onCategory,checklist=true}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>;checklist?:boolean}){
  const details=design.etsy!,[loading,setLoading]=useState(false);
  const properties=details.properties||[],completed=properties.filter(property=>property.value.trim()),physical=completed.filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)),preview=physical.slice(0,3).map(property=>property.value).join(", ");
  async function choose(id:number){setLoading(true);try{await onCategory(id)}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:(details.properties||[]).map(item=>item.propertyId===property.propertyId?next:item)})}
  return <details aria-busy={loading} aria-label="Loading Etsy category options" className="etsy-details-editor"><summary><span><b>Etsy details</b><small>{etsyDetailsSummary(details,properties)}{preview?` · ${preview}`:""}</small></span><em>Edit</em></summary><div className="factory-listing-grid">{/* D730 - prototype .goldie-listing-grid: the fields on the left, and
      beside them the list of what Etsy still needs. The summary line already
      counted them ("2 of 5 required set"); the checklist names them. Every
      field, handler and validation below is unchanged. */}<div className="etsy-details-editor-fields factory-form-card"><label>Etsy category<select value={details.taxonomyId||""} disabled={loading} onChange={event=>void choose(Number(event.target.value))}>{!details.taxonomyId&&<option value="">Choose an Etsy category</option>}{Boolean(details.taxonomyId)&&!categories.some(category=>category.id===details.taxonomyId)&&<option value={details.taxonomyId}>{details.category||"Category already chosen for this listing"}</option>}{categories.map(category=><option key={category.id} value={category.id}>{category.path}</option>)}</select></label>{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-grid">{properties.map(property=><label key={property.propertyId}>{property.label}{property.required&&<em>Required</em>}{property.possibleValues.length?<select aria-label={property.label} value={property.valueId||""} onChange={event=>setProperty(property,event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input aria-label={property.label} value={property.value} onChange={event=>setProperty(property,event.target.value)}/>}</label>)}</div><small className="optional-note">These are Etsy’s actual fields for the selected category. Optional fields can stay blank.</small><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></div>{checklist?<RequiredDetailsChecklist items={[{key:"category",label:"Etsy category",value:details.category||"",required:true},...properties.filter(property=>property.required||property.value.trim()).map(property=>({key:String(property.propertyId),label:property.label,value:property.value,required:property.required}))]}/>:null}</div><button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close Etsy details</button></details>
}

function LazyEtsyProperty({property,onValue}:{property:EtsyPropertySelection;onValue:(value:string)=>void}){
  const [open,setOpen]=useState(false);
  return <details className="etsy-lazy-property" open={open} onToggle={event=>setOpen((event.currentTarget as HTMLDetailsElement).open)}><summary><span>{property.label}{property.required&&<em>Required</em>}</span><b>{property.value||"Not set"}</b></summary>{open?<label>{property.possibleValues.length?<select aria-label={property.label} value={property.valueId||""} onChange={event=>onValue(event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input aria-label={property.label} value={property.value} onChange={event=>onValue(event.target.value)}/>}</label>:null}</details>;
}

/* D793 · `checklist` off when the screen already shows one. Step 3 is the
   preview's two-column grid now, and the checklist beside the listing is the
   outer one. This editor drawing its own put every Etsy property on the
   screen twice - two checklists, 17 rows, inside two nested grids. */
function EtsyDetailsEditor({design,categories,onChange,onCategory,checklist=true}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>;checklist?:boolean}){
  const details=design.etsy!,properties=details.properties||[],completed=properties.filter(property=>property.value.trim()),physical=completed.filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)),preview=physical.slice(0,3).map(property=>property.value).join(", ");
  const [loading,setLoading]=useState(false),[query,setQuery]=useState(""),[detailsOpen,setDetailsOpen]=useState(()=>shouldOpenEtsyDetails(details));
  useEffect(()=>{setDetailsOpen(shouldOpenEtsyDetails(details));setQuery("")},[design.id]);
  const matches=query.trim().length<2?[]:categories.filter(category=>category.path.toLowerCase().includes(query.trim().toLowerCase())).slice(0,30);
  async function choose(id:number){setLoading(true);try{await onCategory(id);setQuery("")}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:properties.map(item=>item.propertyId===property.propertyId?next:item)})}
  return <><details className="etsy-details-editor" open={detailsOpen} onToggle={event=>setDetailsOpen(event.currentTarget.open)}><summary><span><b>Etsy details</b><small>{etsyDetailsSummary(details,properties)}{preview?` · ${preview}`:""}</small></span><span className="etsy-details-chevron" aria-hidden="true">⌄</span></summary><div className="factory-listing-grid">{/* D730 - prototype .goldie-listing-grid: the fields on the left, and
      beside them the list of what Etsy still needs. The summary line already
      counted them ("2 of 5 required set"); the checklist names them. Every
      field, handler and validation below is unchanged. */}<div className="etsy-details-editor-fields factory-form-card">{needsCategoryReview(details)&&<p className="etsy-category-guess" role="status">{/* D1660 · This product type is not one the factory can map to an
        Etsy category, so the category below is a guess from the product's
        NAME and no attributes were filled in. Saying so is the difference
        between a placeholder and a decision. */}<b>Check this category before you publish.</b>{" "}This product type is not one the factory recognises, so the category below is a starting guess from the product name and none of its attributes have been filled in. Search for the right category and choose its attributes.</p>}<label>Etsy category<small>Current: {details.category||"None chosen"}</small><input type="search" value={query} placeholder="Search Etsy categories" onChange={event=>setQuery(event.target.value)} disabled={loading}/></label>{matches.length?<div className="etsy-category-results" role="listbox" aria-label="Matching Etsy categories">{matches.map(category=><button type="button" key={category.id} onClick={()=>void choose(category.id)}>{category.path}</button>)}</div>:query.trim().length>=2?<small>No matching Etsy categories.</small>:null}{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-list">{properties.map(property=><LazyEtsyProperty key={property.propertyId} property={property} onValue={value=>setProperty(property,value)}/>)}</div><small className="optional-note">This category and these attributes are added to your Etsy draft when you finish. Optional fields can stay blank.</small></div>{checklist?<RequiredDetailsChecklist items={[{key:"category",label:"Etsy category",value:details.category||"",required:true},...properties.filter(property=>property.required||property.value.trim()).map(property=>({key:String(property.propertyId),label:property.label,value:property.value,required:property.required}))]}/>:null}</div></details><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></>;
}

function DownloadListingPhotos({productId,name,indices}:{productId:string;name:string;indices:number[]}){const [downloading,setDownloading]=useState(false),[message,setMessage]=useState("");async function download(){if(downloading)return;setDownloading(true);setMessage("");try{const response=await fetch("/api/listing-photos/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,printifyImageIndices:indices})});if(!response.ok){const payload=await response.json() as {error?:string};throw new Error(payload.error||"These listing photos could not be downloaded.")}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`${name.replace(/[^a-z0-9._-]+/gi,"-").slice(0,90)||"listing"}-listing-photos.zip`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage("✓ Download ready.")}catch(error){setMessage(error instanceof Error?error.message:"These listing photos could not be downloaded.")}finally{setDownloading(false)}}return <div className="listing-photo-download"><div><b>Download photos to computer <em>Optional</em></b><small>Save a copy for social media or your own use.</small></div><button type="button" aria-busy={downloading} disabled={downloading} onClick={()=>void download()}>{downloading?"Preparing photos…":"Download photos to computer"}</button>{message&&<p role="status">{message}</p>}</div>}

function PricingReview({section="all",variants,pricing,prices,productName,profiles,selectedProfileId,templateShippingProfileId,profilesLoading,profilesError,onReloadProfiles,approved,preserveEdits=false,wholeNumber=false,onWholeNumber,onPricing,onPrices,onSelectProfile,onCreateProfile,onApprovalChange}:{variants:ProductVariant[];pricing:Pricing;prices:Record<string,number>;productName:string;section?:"all"|"prices"|"shipping";profiles:EtsyShippingProfile[];selectedProfileId:number;templateShippingProfileId:number;profilesLoading:boolean;profilesError:string;onReloadProfiles?:()=>void;approved:boolean;preserveEdits?:boolean;wholeNumber?:boolean;onWholeNumber?:(value:boolean)=>void;onPricing:(value:Pricing)=>void;onPrices:(value:Record<string,number>)=>void;onSelectProfile:(id:number)=>void;onCreateProfile:(baseId:number,charge:number,additional:number,title:string,international:InternationalShippingRate[])=>Promise<void>;onApprovalChange:(ready:boolean)=>void}){
  const selectedProfile=profiles.find(profile=>profile.id===selectedProfileId);
  const printifyShipping=Math.max(0,...variants.map(variant=>Number(variant.shipping)||0));
  const shippingShortfall=selectedProfile?printifyShipping-selectedProfile.domesticPrimary:0;
  const [customCharge,setCustomCharge]=useState(""),[customAdditional,setCustomAdditional]=useState(""),[customInternational,setCustomInternational]=useState<EditableInternationalShippingRate[]>([]),[customProfileName,setCustomProfileName]=useState(""),[savingProfile,setSavingProfile]=useState(false),[profileMessage,setProfileMessage]=useState(""),[recommendationMessage,setRecommendationMessage]=useState(""),[wholeNumberPricing,setWholeNumberPricing]=useState(false),[profileSearch,setProfileSearch]=useState("");
  const apparelPricing=["tee","hoodie","crewneck","tank","longSleeve"].includes(productFamily(productName));
  const optionNoun=apparelPricing?"color and size combination":"product option";
  const optionNouns=apparelPricing?"color and size combinations":"product options";
  const optionNounsLabel=`${optionNouns[0].toUpperCase()}${optionNouns.slice(1)}`;
  const [attachedProfileId,setAttachedProfileId]=useState(0),attachedProductName=useRef(productName);
  useEffect(()=>{if(attachedProductName.current!==productName){attachedProductName.current=productName;setAttachedProfileId(selectedProfileId||0);return}if(!attachedProfileId&&selected…119476 tokens truncated…t your accounts", and the rail lit up Product. Connecting
                is a one-time gate before the four steps, not the first of them. */}<b>{workflowStep==="connect"?"Connect Printify and Etsy":`Step ${railTopNumber} of ${RAIL_STAGES.length} · ${currentStage.label}`}</b></div>{(template||files.length>0||drafts.length>0)&&<button className="start-new-batch" disabled={running} onClick={startOver}>Clear batch + start over</button>}</div>
          {localPreview&&<p className="preview-mode-note">Preview mode · every step is unlocked <a href="/design-lab">Open design lab →</a></p>}
          {RAIL_STAGES.map((stage,position)=>{
            const active=stage.covers.includes(progressIndex);
            /* D226 · Completion is stage ORDER, not raw index. Images covers the
               legacy indices 2, 3, 4 and 7, and 7 is higher than Listing's 5 — so
               comparing indices meant Images could never read as done while the
               seller stood on Listing. It showed "02" with a tick beside it on
               Product and nothing on the stage they had just finished. */
            /* D557 - "done" meant "you have walked past it", so going back to
               step 1 stripped the ticks off Images and Listing on a batch whose
               images and listing details were finished. Measured on her bundle:
               the same batch read PRODUCT✓ IMAGES✓ LISTING on step 3 and PRODUCT
               IMAGES LISTING on step 1. A stage is done when its own work is
               done. */
            /* D617 - Listing read as done while the seller was still on Images.
               Its "started" test was `complete`, which means the Printify drafts
               exist - and drafts are created ON the Images step. So the moment a
               batch finished creating drafts, the rail ticked a stage whose own
               work had not been touched.

               D557 already settled the rule: a stage is done when its OWN work is
               done. Listing's work is titles and Etsy details, not draft
               creation. */
            const stageStarted=stage.index===1?Boolean(activeRecipe||activeBundle)
              :stage.index===2?files.length>0
              :stage.index===5?files.length>0&&files.every(file=>Boolean(file.title?.trim()))
              :Number(batchReceipt?.publishedCount||0)>0;
            /* D620 - a stage AHEAD of the one she is standing on never shows a
               tick, whatever its own work says.

               D557 made "done" mean "its own work is finished", so that walking
               back did not strip ticks off finished work. That was right about
               going back and wrong about going forward: on Images, with titles
               already written, Listing sat there ticked as though step 3 were
               behind her. A progress rail that says a step you have not reached
               is complete is not reporting progress.

               Behind her: ticked when its work is done. Where she is: its number.
               Ahead of her: never ticked. */
            const reached=stagePosition<0||position<=stagePosition;
            const stageStillExists=stage.label!=="Drafts"||!complete||createdDraftCount>0;
            const done=stageStillExists&&reached&&(stage.index===8?stageStarted:(stageStarted&&progressGateIssues(stage.index).length===0)||(stagePosition>=0&&position<stagePosition));
            const issues=progressGateIssues(stage.index);
            const draftLine=stage.label==="Images"&&complete?` · ${createdDraftCount} ${createdDraftCount===1?"draft":"drafts"} created`:"";
            /* D227 · Never disable the stage the seller is currently on. When drafts failed,
               the rail greyed out Listing while the seller was standing on Listing —
               a control refusing the page it was already showing. */
            /* D853 - the rail promised "you can return to an earlier step without
               starting over" and then refused to. Standing on Publish, the
               Listing button was disabled: its gate still had something to say,
               and the gate was being applied in both directions. So a finished
               step behind her was unclickable AND drawn grey, because the
               disabled dimming took the tick down with it - a completed step
               rendered as though it were not done, on the one screen where she
               is deciding whether to publish.

               D620 already drew the line: behind her, where she is, ahead of
               her. A gate is a statement about work not yet done, which is only
               ever true of a step ahead. Going back is how you fix what the gate
               is complaining about. */
            const ahead=stagePosition>=0&&position>stagePosition;
            return <button key={stage.label} className={`${active?"active":""} ${done?"done":""}`} disabled={!active&&ahead&&Boolean(issues.length)} aria-current={active?"step":undefined} title={active||ahead?issues[0]||undefined:undefined} onClick={()=>openProgressStep(stage.index)}><em className="progress-bubble-label">{stage.label}</em>{/* D352 · Zero-padding four steps ("01 of 04") is a template tic — it implies
                a longer sequence than exists and adds a character that carries no
                information. */}
                {/* D619 - the step you are STANDING on shows its number, never a
                    tick. It rendered a tick identical to the finished stages, so
                    Product, Images and Listing all read "done" at once and the
                    only thing marking your position was a pale box behind the
                    label. Remove the box and nothing said where you were.

                    You cannot have finished the step you are still on. */}
                <span>{!active&&done?"✓":String(position+1)}</span><span><b>{stage.title}</b><small>{issues[0]||`${progressStatus(stage.index,active,done,Boolean(issues.length))}${draftLine}`}</small></span></button>})}
          <p className="workflow-help">Completed work is saved automatically.</p>
        </nav>
        <div className="workflow-stage">
        {/* D550 - opening a saved batch renders the heading, then nothing at all
            for several seconds, then the whole step. Captured on step 3: title,
            an empty page, and "Back / Saved automatically" floating in the middle
            of it. Every other slow thing in Goldie says it is working; this one
            looked broken. */}
        {restoringBatch&&<div className="batch-opening" role="status"><span className="batch-opening-spinner" aria-hidden="true"/><div><b>Opening your batch…</b><small>Loading designs, drafts, and listing details.</small></div></div>}
        {progressIndex>0&&<WorkflowMomentum
          current={railTopNumber}
          total={RAIL_STAGES.length}
          label={progressIndex===PROGRESS_STEPS.length-1?"Final review":`Next: ${PROGRESS_STEPS[Math.min(progressIndex+1,PROGRESS_STEPS.length-1)]}`}
        />}
        {/* D355 · The bundle banner is gone. It sat above the page announcing what
          had just been selected — but selecting it is what put you here, and the
          product cards below each carry their own name. It was a label for
          something the page was already showing, taking the first screenful. */}
        {progressIndex===3&&files.length>0&&<ActionReceipt items={[{value:`${files.length} ${files.length===1?"design":"designs"} checked`,label:"Original artwork resolution preserved"},{value:`${requestedListingCount} ${requestedListingCount===1?"draft":"drafts"} to create`,label:"Prices reviewed after finished costs are known"}]}/>}
        {progressIndex===5&&titleCount>0&&<ActionReceipt items={[{value:`${titleCount} titles ready`,label:"Validated keyword phrases only"},{value:`${files.reduce((sum,file)=>sum+file.tags.length,0)} matching tags`,label:"Zero invented keywords"}]}/>}
        <div className={`steps-column ${workflowStep}-column`} data-restoring={restoringBatch?"true":undefined} inert={restoringBatch}>
          {workflowStep==="finish"&&finishPhase==="etsy"&&false&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Titles, tags, and descriptions complete</b><small>{files.length} {files.length===1?"listing is":"listings are"} ready for Etsy details.</small></div></div>}
          
          <article className={`step-card connect-step workflow-panel ${connected ? "done" : ""} ${workflowStep==="connect"?"active-panel":"hidden-panel"}`}>
            
            <div className="step-content">
              {(checkingConnections||!connected||!etsyConnected)&&<p className="connect-status">{connectStatus}</p>}
              {/* D284 · The page title already reads "Connect your accounts"; this card repeated it word for word directly beneath. */}
              {(checkingConnections||!connected||!etsyConnected)&&<p className="step-copy">{checkingConnections?"Verifying the accounts you already connected…":"Connect the Printify account that creates your products and the Etsy shop that receives them."}</p>}
              {!checkingConnections&&(!connected||!etsyConnected)&&<p className="connect-timing">◷ First-time connection usually takes about 2 minutes.</p>}
              {checkingConnections ? (
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Secure connection check…</b><small>This takes just a moment</small></div></div>
              ) : !connected ? (
                <div className="connection-stack connection-setup">
                  <section className="printify-service-group">
                  <div className="connection-row service-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify</b><small>Create and update your product drafts.</small></div><button onClick={()=>setShowTokenForm(value=>!value)}>{showTokenForm?"Close":"Connect Printify"}</button></div>
                  {showTokenForm&&<div className="inline-field approved-token-form"><label>Paste the token you copied from Printify</label><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token here" aria-label="Printify token" /><button aria-busy={connecting} onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect securely"}</button></div>}
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                  <details className="token-help approved-token-help">
                    <summary>How to get your Printify token <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></summary>
                    <div className="approved-token-instructions"><b>Get your Printify token step by step</b><div className="token-shop-warning"><b>First, make sure you are in the right Printify account</b><span>Sign in to the account that contains the Etsy shop and saved products you want to use. A token connects the whole Printify account. In Step 2, your saved product tells the exact shop to use.</span></div>
                    <ol>
                      <li>Open Printify and click your profile icon.</li>
                      <li>Choose <b>My Profile</b>, then open <b>Connections</b>.</li>
                      <li>If Printify asks for a developer contact email, enter an email address you check and save it.</li>
                      <li>Find <b>Personal Access Tokens</b> and click <b>Generate</b>.</li>
                      <li>Name the token <b>Listing Factory</b>.</li>
                      <li>Turn on these permissions: <b>shops.read, catalog.read, products.read, products.write, uploads.read, uploads.write, and print_providers.read</b>. Order permissions are not needed.</li>
                      <li>Click <b>Generate token</b>, then copy it immediately. Printify only shows the full token once.</li>
                      <li>Come back to this page, paste the token below, and click <b>Connect Printify</b>. The account will be verified before you continue.</li>
                    </ol>
                    <a href="https://help.printify.com/hc/en-us/articles/4483626447249-How-can-I-generate-an-API-token" target="_blank" rel="noreferrer">Open Printify’s official token instructions ↗</a></div>
                  </details>
                  </section>
                  {etsyConnectionRow(true)}
                  <small className="secure-copy">♢ Encrypted and saved securely.</small>
                </div>
              ) : (
                <div className="connection-stack connection-setup connected-connection-stack">
                  <div className="connection-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button className="disconnect-link" onClick={async () => { if(!await confirmAction({title:"Disconnect Printify?",body:"Printify drafts cannot be created until you reconnect with a new API token. Your Printify products are not affected.",confirmLabel:"Disconnect Printify",cancelLabel:"Keep connected"}))return; await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>
                  {etsyConnectionRow(false)}
                </div>
              )}
              {connected&&connectionError&&<p className="field-warning" role="status">{connectionError}</p>}
              {etsyError&&<p className="field-error" role="alert">{etsyError}</p>}
              {(connectionError||etsyError)&&<button type="button" className="secondary-action" disabled={checkingConnection||checkingEtsyConnection} onClick={()=>{void checkPrintifyConnection();void checkEtsyConnection()}}>{checkingConnection||checkingEtsyConnection?"Checking connections…":"Check connections again"}</button>}
              {/* D615 - a forward control belongs to the step that is open, and to
                  no other. This one rendered whenever Printify and Etsy were
                  connected, so it sat inside the collapsed Connect panel for the
                  whole rest of the batch, still enabled, still pointing back at
                  Product. The panel is display:none so a seller could not reach
                  it - but an enabled control that navigates backward has no
                  business existing at all, and one CSS regression is the
                  difference between hidden and live. */}
              {workflowStep==="connect"&&(localPreview||(connected&&etsyConnected))&&<FactoryFooter status={connected&&etsyConnected?"Printify and Etsy are connected":"Preview mode · every step is unlocked"}><button className="workflow-next" onClick={()=>goToStep("setup",false,localPreview)}>Next step <span>→</span></button></FactoryFooter>}
            </div>
          </article>

          <div inert={running||Boolean(bundleRun)} className={`product-step workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}>{/* D763 · Panel 01. The facets below number from 02, and until now
            there was no 01 - the picker sat in the old card while the settings
            under it had already become panels. */}<FactoryPanel index={1} title={bundleCreationMode?"Create a product bundle":productFormMode?"Add a saved product":showProductLibrary||(!productSelected&&!bundleSelected)?"Saved products and bundles":bundleSelected?"Products for this batch":productSelected?"Product for this batch":"Choose a product or bundle"} description={bundleCreationMode?"Name it, then choose 2 to 4 products":productFormMode?"Connect one completed Printify product":showProductLibrary||(!productSelected&&!bundleSelected)?undefined:"Selected for this batch"} state={failedBundleNames().length?"Needs a look":undefined} headerActions={bundleCreationMode||productFormMode?undefined:showProductLibrary||(!productSelected&&!bundleSelected)?<>{showProductLibrary&&(productSelected||bundleSelected)&&<button type="button" className="panel-create-action" onClick={()=>setShowProductLibrary(false)}>Back to this batch</button>}<button type="button" className="panel-create-action" onClick={()=>setAddProductRequest(value=>value+1)}>＋ Add a new product</button>{bundleCreationAvailable&&<button type="button" className="panel-create-action" onClick={()=>setCreateBundleRequest(value=>value+1)}>＋ Create a new bundle</button>}</>:bundleSelected?<button type="button" className="panel-create-action" onClick={()=>setShowProductLibrary(true)}>Choose a different bundle</button>:<button type="button" className="panel-create-action" onClick={()=>setShowProductLibrary(true)}>Choose a different product</button>} tone={failedBundleNames().length?"attention":productSelected||bundleSelected?"done":undefined} open><SavedWorkflow bundleChosen={Boolean(activeBundle&&bundleRecipes.length>1)} savedRevision={savedRevision} connected={connected||localPreview} templateUrl={template} templateVerified={templateLoaded} loadingTemplate={loadingTemplateVersion===templateLoadVersion.current&&loadingTemplateVersion>0} suggestedProductName={templateDetails?[templateDetails.brand,templateDetails.model].filter(Boolean).join(" ").trim()||templateDetails.blueprintTitle||"":""} selectedProductId={activeBundle?`bundle:${activeBundle.id}`:activeRecipe?.id||""} showLibrary={showProductLibrary} onShowLibraryChange={setShowProductLibrary} addProductRequest={addProductRequest} createBundleRequest={createBundleRequest} onBundleAvailabilityChange={setBundleCreationAvailable} onBundleModeChange={setBundleCreationMode} onProductModeChange={setProductFormMode} selectedSummary={templateDetails?<div className="template-proof recipe-proof selected-product-header">{/* D834 · This drew the words "YOUR ART" in a box. The product's own
                   Printify flatlay is available here - pickProductPhoto scores the
                   previews and returns the best one - and showing it is what the
                   panel is for: she is confirming which garment this batch prints
                   on. The lettered box remains only when Printify has no usable
                   photo. */}
                {(()=>{const photo=activeRecipe?.previewImage||(templateDetails?pickProductPhoto(templateDetails):"")||"";
                  return photo
                    ? <img className="product-thumb bundle-product-photo" src={photo} alt={templateDetails?.blueprintTitle||"Product"} decoding="async"/>
                    : <div className="product-thumb product-photo-loading" aria-label="Loading product photo"><span className="goldie-spinner" aria-hidden="true"/></div>})()}<div className="template-info">{bundleSelected?<><b>{activeBundle?.name}</b><span>{bundleRecipes.length} products · {bundleRecipes.map(item=>item.name).join(" · ")}</span><span>✓ Each product keeps its own product choices, photos, and keywords</span></>:<><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {variantSummary(summaryAxes(templateDetails,activeRecipe),templateDetails.blueprintTitle)}</span><span>✓ Product, placement, {productOptionAxis(templateDetails.blueprintTitle).label.toLowerCase()}, and shipping profile imported</span></>}</div></div>:null} verifiedShippingProfileId={Number(templateDetails?.shippingTemplateId)||0} onTemplateUrl={(value) => { templateLoadVersion.current+=1;setLoadingTemplateVersion(0);setTemplate(value);setTemplateDetails(null);setTemplateError(""); }} onUseRecipe={chooseRecipe} onUseBundle={useBundle} onStartNewProduct={startNewProduct} onChangeProduct={changeProduct} onVerifyTemplate={loadTemplateUrl} /></FactoryPanel>
          {localPreview&&!templateDetails&&<button className="preview-demo-button" onClick={()=>void loadPreviewDemo()}>Load a complete poster demo to review every step</button>}
          {workflowStep==="setup"&&files.length===0&&!bundleCreationMode&&!productFormMode&&<FactoryFooter status={`${missingRequirement} to continue`}><button className="workflow-next" type="button" disabled>{missingRequirement}</button></FactoryFooter>}
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          <BatchPreferencesPortal>
          {/* D457 - the "set up this product" framing is gone; a product saves its own defaults as they are chosen. */}
          
          {workflowStep==="designs"&&files.length>0&&templateDetails&&productSelected&&activeBundle&&bundleRecipes.length>1&&<div className="saved-product-batch-page"><section className="batch-products" aria-label="Products in this bundle">{(()=>{
            /* D385 - One card with one spinner while the bundle loads, then every
               product revealed together. Not a line of prose per product, and not
               a skeleton per product either - one card. */
            const list=activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[]);
            const waiting=list.some((recipe,index)=>!((!activeBundle||bundleRecipes.length<2||index===bundleIndex)?templateDetails:bundleColorProducts[recipe.id])&&!bundleLoadErrors[recipe.id]);
            const failed=list.filter(recipe=>bundleLoadErrors[recipe.id]);
            if(!waiting&&!failed.length)return null;
            if(!waiting)return <article className="batch-product-card bundle-loading-card bundle-load-failed" role="alert">
              <b>{failed.length} of {list.length} products in this bundle could not be opened.</b>
              {failed.map(recipe=><p key={recipe.id}><b>{recipe.name}</b> — {bundleLoadErrors[recipe.id]}</p>)}
              <button type="button" onClick={()=>setBundleLoadErrors({})}>Try these again</button>
            </article>;
            return <article className="batch-product-card bundle-loading-card" role="status" aria-label={`Loading ${list.length} ${list.length===1?"product":"products"}`}>
              <span className="bundle-loading-spinner" aria-hidden="true"/>
              <p>Loading {list.length} {list.length===1?"product":"products"}…</p>
            </article>;
          })()}{(activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[])).map((recipe,index)=>{const isActive=!activeBundle||bundleRecipes.length<2||index===bundleIndex;const product=isActive?templateDetails:bundleColorProducts[recipe.id];const anyPending=(activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[])).some((item,position)=>!((!activeBundle||bundleRecipes.length<2||position===bundleIndex)?templateDetails:bundleColorProducts[item.id]));if(!product||anyPending)return null;const ready=readinessFor(product,recipe,isActive?pricingApproved:Boolean(bundleApproved[recipe.id]));/* D232 · Colours and sizes are open from the start. They are the two things a
             seller comes to this page to check, and a collapsed row is easy to walk
             past — "the colors and the sizes should probably just be expanded so
             people don't accidentally miss them". Both can be open at once, so this
             holds a list rather than a single name. */
          /* D329 · Every product used to open colours AND sizes at once, so a three
                 product bundle put three full colour grids on screen together. Only
                 the first product starts open; the others are one click away. */
              /* D356 · The render and the toggle each carried their OWN default for
                 which panels are open, and they disagreed: the render opened
                 ["colors"], the toggle fell back to ["colors","sizes"]. So the first
                 click on any row started from a list that did not match the screen —
                 clicking Shipping produced ["colors","sizes","shipping"] and Sizes
                 sprang open alongside it. One default, used by both. */
              /* D361 · Nothing opens by default. Opening Colours for the first product
                 chose the seller's starting point for them, and buried the other three
                 categories under a 39-swatch grid before they had seen the card. All
                 four rows visible, they pick where to begin. */
              const defaultOpenFacets:string[]=[];
              const openList=openFacet[recipe.id]??defaultOpenFacets;
          const isOpen=(name:string)=>openList.includes(name);
          /* D564 - step 1 was the only step that stacked. Measured on her bundle:
             the card is 313px shut, and opening Colors, Sizes, Pricing and
             Shipping in turn took it to 934, 1263, 2289 and 2791px, because every
             row toggled independently and nothing ever closed. Steps 2, 3 and 4
             have shown one panel at a time since D539, and this is the first
             screen she touches. One at a time here too. */
          const toggle=(name:string)=>setOpenFacet(current=>{const list=current[recipe.id]??defaultOpenFacets;return {...current,[recipe.id]:list.includes(name)?[]:[name]}});
          /* D218 · Every picker used to render after the whole row list, so clicking
             Change on Colours opened the palette below Etsy details and the seller had
             to scroll past six rows to reach the thing they just asked for. The panel
             JSX is unchanged; it is emitted inside the row map now, directly beneath
             the row that opened it. The parameter shadows `open` so the existing
             guards read correctly without rewriting them. */
          const pricingPanelFor=(which:"prices"|"shipping")=>{
            const details=isActive?templateDetails:bundleColorProducts[recipe.id];
            if(!details)return null;
            const colorIds=(isActive?selectedColorIds:bundleColorChoices[recipe.id])||recipe.defaultColorIds||[];
            const sizeIds=(isActive?selectedSizeIds:bundleSizeChoices[recipe.id])||recipe.defaultSizeIds||[];
            const recipePricing=isActive?pricing:(bundlePricing[recipe.id]||{...pricing,targetProfit:Number(recipe.defaultProfitTarget)||DEFAULT_PRICING.targetProfit});
            return <PricingReview
              section={which}
              variants={variantsFor(details,colorIds,sizeIds)}
              pricing={recipePricing}
              prices={isActive?variantPrices:(bundlePrices[recipe.id]||recipe.variantPrices||{})}
              productName={recipe.name}
              profiles={etsyShippingProfiles}
              selectedProfileId={isActive?etsyShippingProfileId:(bundleShipping[recipe.id]||Number(recipe.etsyShippingProfileId)||0)}
              templateShippingProfileId={Number(details.shippingTemplateId)||0}
              profilesLoading={shippingProfilesLoading}
              profilesError={shippingProfilesError} onReloadProfiles={()=>void loadEtsyShippingProfiles()}
              approved={isActive?pricingApproved:Boolean(bundleApproved[recipe.id])}
              onPricing={value=>{
                if(isActive){setPricing(value);setPricingApproved(false)}
                else{setBundlePricing(current=>({...current,[recipe.id]:value}));setBundleApproved(current=>({...current,[recipe.id]:false}))}
                if(value.targetProfit!==Number(recipe.defaultProfitTarget))void establish(recipe,{defaultProfitTarget:value.targetProfit})}}
              onPrices={value=>{
                if(isActive){setVariantPrices(value);setPricingApproved(false)}
                else{setBundlePrices(current=>({...current,[recipe.id]:value}));setBundleApproved(current=>({...current,[recipe.id]:false}))}
                persistProductPricing(recipe,{variantPrices:value})}}
              wholeNumber={Boolean(wholeNumberByRecipe[recipe.id]??recipe.wholeNumberPricing)}
              onWholeNumber={value=>{
                setWholeNumberByRecipe(current=>({...current,[recipe.id]:value}));
                persistProductPricing(recipe,{wholeNumberPricing:value})}}
              onSelectProfile={value=>{
                /* D461 - picking a shipping profile used to un-approve the pricing,
                   and the button to approve it again lives inside the collapsed
                   Shipping section. So choosing a profile disabled Next step with
                   no visible reason and no visible way out - the wall she hit on
                   the mug. A product that already carries a profit target and a
                   profile is approved; prices recalculate on their own, and she is
                   told what they are. Only a product with nothing saved still has
                   to approve once. */
                const carries=recipeCarriesApprovedPricing({defaultProfitTarget:recipe.defaultProfitTarget,etsyShippingProfileId:value});
                if(isActive){setEtsyShippingProfileId(value);setPricingApproved(carries)}
                else{setBundleShipping(current=>({...current,[recipe.id]:value}));setBundleApproved(current=>({...current,[recipe.id]:carries}))}
                if(value&&value!==Number(recipe.etsyShippingProfileId))void establish(recipe,{etsyShippingProfileId:value})}}
              onCreateProfile={createCustomShippingProfile}
              onApprovalChange={value=>{if(isActive)setPricingApproved(value);else setBundleApproved(current=>({...current,[recipe.id]:value}))}}
            />;
          };
          const panelFor=(open:string)=><>{open==="profit"&&pricingPanelFor("prices")}{open==="shipping"&&pricingPanelFor("shipping")}{open==="colors"&&<ProductColorSelector product={product} selected={shownColors} onChange={ids=>{if(isActive){setSelectedColorIds(ids);setPricingApproved(false)}else setBundleColorChoices(current=>({...current,[recipe.id]:ids}));if(ids.length)void establish(recipe,{defaultColorIds:ids})}} onRemember={()=>void saveProductDefaults({defaultColorIds:shownColors},`colors:${recipe.id}`)} remembering={savingProductDefault===`colors:${recipe.id}`} remembered={sameIdSet(shownColors,recipe.defaultColorIds)} inCard/>}{open==="sizes"&&<ProductSizeSelector product={product} selected={shownSizes} onChange={ids=>{if(isActive){setSelectedSizeIds(ids);setPricingApproved(false)}else setBundleSizeChoices(current=>({...current,[recipe.id]:ids}));if(ids.length)void establish(recipe,{defaultSizeIds:ids})}} onRemember={()=>void saveProductDefaults({defaultSizeIds:shownSizes},`sizes:${recipe.id}`)} remembering={savingProductDefault===`sizes:${recipe.id}`} remembered={sameIdSet(shownSizes,recipe.defaultSizeIds)} inCard/>}</>;const colorFacet=ready.facets.find(facet=>facet.name==="colors");const sizeFacet=ready.facets.find(facet=>facet.name==="sizes");const shownColors=(isActive?selectedColorIds:bundleColorChoices[recipe.id])||recipe.defaultColorIds||colorFacet?.suggested?.colorIds||[];const shownSizes=(isActive?selectedSizeIds:bundleSizeChoices[recipe.id])||recipe.defaultSizeIds||sizeFacet?.suggested?.sizeIds||[];return <article className={`batch-product-card ${ready.established?"is-ready":"needs-setup"} ${bundleSelected?"in-batch":""}`} key={recipe.id}><header>{pickProductPhoto(product)?<img className="bundle-product-photo" src={pickProductPhoto(product)} alt="" decoding="async"/>:<ProductGlyph title={product.blueprintTitle}/>}<span className="bundle-product-id">{bundleSelected&&<em className="batch-product-position">Product {index+1} of {bundleRecipes.length}</em>}<b>{recipe.name}</b><small>{product.blueprintTitle}</small></span>{/* D347 · This read "1 to set", which names a count without naming what it
            counts. The card already marks the exact rows that need attention; the
            header only has to say that something in here does. */}
            <span className={`batch-product-state ${ready.established?"":"attention"}`} title={ready.established?"Ready":`${ready.questions.length} ${ready.questions.length===1?"setting needs":"settings need"} your attention`} aria-label={ready.established?"Ready":`${ready.questions.length} ${ready.questions.length===1?"setting needs":"settings need"} your attention`}>{ready.established?"Ready":<em aria-hidden="true">!</em>}</span></header><div className="batch-product-rows">{/* D338 · These rows used to be sorted so anything unset floated to the top,
                 so a product with no shipping profile showed Shipping first and Colors
                 third — the categories moved depending on what happened to be
                 missing. Position is how you find things; it cannot depend on state.
                 Fixed order, always: Colors, Sizes, Shipping. Final pricing waits
                 for the finished Printify drafts, when every print cost is known. An unset row
                 still marks itself, which is what "needed" already does. */
                ready.facets.filter(()=>false).map((facet,facetIndex)=>{const label=({colors:"Colors",sizes:"Sizes",mockups:"Listing photos",keywords:"Keywords",shipping:"Shipping",profit:"Pricing",etsy:"Etsy details"} as Record<string,string>)[facet.name];const action=({colors:"Pick colors",sizes:"Pick sizes",mockups:"Upload listing photos",keywords:"Pick a keyword bank",shipping:"Pick a shipping profile",profit:"Set a profit goal",etsy:"Add Etsy details"} as Record<string,string>)[facet.name];const needed=facet.state==="ask";const inCard=["colors","sizes","shipping"].includes(facet.name);const suggestion=(facet.suggested?.colorIds||facet.suggested?.sizeIds||[]).length;const openThis=()=>{if(inCard){toggle(facet.name);return}const dest=FACET_DESTINATION[facet.name];if(!dest)return;if(dest.step!==workflowStep)goToStep(dest.step);window.setTimeout(()=>{const block=document.querySelector<HTMLElement>(dest.selector);if(!block)return;block.scrollIntoView({block:"start"});block.classList.add("just-opened");window.setTimeout(()=>block.classList.remove("just-opened"),1600)},dest.step!==workflowStep?260:0)};/* D762 · These rows are the prototype's panels wearing row markup. Same
                   data, same handlers, same open/close: the facet's name is the
                   panel title, its value is the description, its state is the chip,
                   and what used to open below the row is the panel body. */
                return <FactoryPanel
                  key={facet.name}
                  index={facetIndex+2}
                  title={label}
                  description={needed?action:facet.label}
                  state={needed?"Needed":"Complete"}
                  tone={needed?"attention":"done"}
                  open={isOpen(facet.name)}
                  onToggle={inCard?openThis:undefined}
                  toggleLabel={isOpen(facet.name)?"Close":needed?"Choose":"Change"}
                >{isOpen(facet.name)?panelFor(facet.name):null}</FactoryPanel>;})}</div></article>})}</section>{/* D232 · The "<product> — description and Etsy details" block is gone. It held
              Keyword bank, Product description, Etsy details and Listing photos — every
              one of which now lives on the Listing or Images page. It was a fifth,
              uncarded copy of four settings, sitting on the PRODUCT page where none of
              them belong, and it survived three rounds of "find everything". */}</div>}
          
          {templateDetails&&!productSelected&&<p className="field-warning recipe-error" role="status">Name and save this product before continuing, or select one of your saved products above.</p>}
          
          
          
          
          {/* D217 · Pricing moves onto the Product page. Colours and sizes decide which
              variants exist, and the price is set per variant, so pricing could never
              be answered before them — it was a whole separate step for a panel that
              belongs directly underneath the thing it prices. This is the existing
              PricingReview component moved intact: grouped per-size prices, the
              matching-cost grouping, whole-number pricing and the shipping profile all
              come with it. Nothing here is rebuilt. */}
          {/* D353 · The standalone pricing card is gone. D334 put pricing and
              shipping on the product card as panels, and every selection renders a
              card — a single product is just a bundle of one. D337 narrowed this to
              single products, which fixed the duplicate under a bundle and left the
              same duplicate under an individual product. */}
          {/* D334 · The separate bundle pricing cards this replaced lived below
              the product cards, so a product's colours were in one place and its
              prices in another. Pricing and shipping are panels inside the product
              card now, beside the colours and sizes they belong to. */}
          {/* D728 - prototype .goldie-footer: the step's forward action and the
              reason it is blocked share one bar at the bottom of the step. The
              button keeps its own gate check, title and handler. */}
          </BatchPreferencesPortal>
          </div>

          <article inert={running||Boolean(bundleRun)} className={`step-card designs-step workflow-panel ${workflowStep==="setup"?"batch-design-drop":""} ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${(workflowStep==="designs"&&!complete)||(workflowStep==="setup"&&Boolean(templateDetails)&&productSelected&&!failedBundleNames().length&&!bundleCreationMode)?"active-panel":"hidden-panel"}`}>{/* D238 · Choosing the mockup SET lived on Product while the mockups it controls are generated here on Images. Same setting, two pages — the exact split that caused the keyword-bank and shipping duplication. */}
            <div className="step-number" aria-hidden="true"/>
            <div className="step-content">
              {workflowStep==="finish"&&<div className="step-heading"><div>{/* D278 · On
                Listing this eyebrow read "TITLES, TAGS + DESCRIPTIONS" — the page
                title D256 retired — directly under the page eyebrow "STEP 3 OF 4 ·
                LISTING". Removing the card title in D248 left it as the only text
                in the header, still naming the step a third way. */}<div className="heading-with-help">{/* D248 · on Listing this
                read "Finish titles, tags, and descriptions" directly under the page
                title "Titles, tags + descriptions" — the same words, two serial-comma
                styles, 200px apart. The page title already names the step. */}</div></div>{files.length > 0 && <span className="done-mark">✓ {files.length} listings</span>}</div>}
              {workflowStep==="finish"&&<p className="step-copy">Create titles and matching tags, review each listing, and confirm the description shared across the batch.</p>}
              {/* D247 · A three-step sub-rail inside step 3 of a four-step rail, numbering
              the work differently from the numbered sections directly beneath it:
              the rail called 2 "Review each listing" while the card called 2
              "Edit description". Two numbering systems, same page, disagreeing.
              The card's sections are the real structure and are on screen. */}
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => void chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => void chooseFiles(event.target.files)} />
              {!files.length&&<><p className="upload-primary-note">{activeBundle&&bundleRecipes.length>1?`Upload each ${uploadPrimaryLabel} design once for every product in this bundle.`:`Upload one ${uploadPrimaryLabel} design per listing.`}{uploadSecondaryLabel?` Add optional ${uploadSecondaryLabel} artwork afterward.`:""}</p>
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? designsFinished?"Add another folder":`Preparing ${designsReady} of ${files.length}` : "Add a folder"}</b><small>{files.length ? `${files.length} design${files.length===1?"":"s"} selected` : "Upload several images at once"}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Add individual images</b><small>Choose one or several files</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
              <p className="upload-guidance batch-limits file-reminder"><span className="batch-limits-quota"><b>PNG or JPG · up to {batchDesignLimit} designs · 100 MB each</b></span></p></>}
              {fileError && <p className="file-limit-error" role="alert"><b>That batch can’t be added.</b><span>{fileError}</span></p>}
              {fileNotice&&(workflowStep==="setup"||workflowStep==="designs")&&<p className="file-add-notice" role="status"><b>Upload updated</b><span>{fileNotice}</span></p>}
              {files.length>0&&!designsFinished&&<section className="design-preparation-status working" role="status" aria-live="polite"><span className="design-status-icon" aria-hidden="true"/><div><b>{`Preparing designs: ${designsReady} of ${files.length} ready`}</b><small>Keep this page open while the files are checked.</small><div className="design-status-track"><i style={{width:`${files.length?designsReady/files.length*100:0}%`}}/></div></div><strong>{designsReady}/{files.length}</strong></section>}
              {!complete&&bundleQualityGroups.length>0&&<section className="bundle-quality-review" aria-label="Product-specific print quality warnings"><div><b>{bundleQualityGroups.length} of {files.length} {files.length===1?"design needs":"designs need"} a print decision</b><span>{productsInBatch.length>1?"The same artwork can be sharp on one product and too small for another. ":""}Anything below 215 DPI is flagged as very low resolution.</span>{bundleProductsUnchecked.length?<span className="inline-note" role="status">Reopen the unchecked {bundleProductsUnchecked.length===1?"product":"products"} to finish this review.</span>:null}<div className="bundle-quality-bulk"><button type="button" onClick={()=>decideAllQuality("include")}>Proceed with all {bundleQualityGroups.length}</button><button type="button" onClick={()=>decideAllQuality("exclude")}>Exclude all {bundleQualityGroups.length}</button></div></div>{bundleQualityGroups.map((group,index)=>{const decision=qualityGroupDecision(group.keys);const productList=[...new Set(group.products)];return <article className={group.critical?"critical-dpi":""} key={group.fileId}><div><b>Design {index+1}</b><span>{group.critical?<strong>VERY LOW RESOLUTION · {group.worstDpi} DPI · </strong>:null}{group.actualWidth} × {group.actualHeight}px is below the recommended size{productsInBatch.length>1?<> for <strong>{productList.join(", ")}</strong>{productList.length>1?` — ${productList.length} products in this bundle`:""}</>:<> for <strong>{productList[0]||"this product"}</strong></>}.</span></div><div><button className={decision==="include"?"selected":""} onClick={()=>decideQualityGroup(group.keys,"include")}>{group.critical?"I understand — proceed":"Proceed anyway"}</button><button className={decision==="exclude"?"selected exclude":""} onClick={()=>decideQualityGroup(group.keys,"exclude")}>{productList.length>1?"Exclude these listings":"Exclude this listing"}</button></div></article>})}</section>}
              {workflowStep==="designs"&&files.length>0&&<div id="batch-preferences-after-designs" className="batch-preferences-after-designs"/>}
              {files.length>0&&(workflowStep==="setup"||workflowStep==="designs")&&<div inert={running||Boolean(bundleRun)} className="design-upload-review" aria-label="Review uploaded designs">{files.map(file=>{const colors=(templateDetails?.colorOptions||[]).filter(color=>selectedColorIds.includes(color.id)),sides=orderedPrintSides(templateDetails?.printPositions),primarySide=primaryPrintSide(sides),secondarySides=sides.filter(side=>side!==primarySide),itemNoun=productNoun(templateDetails?.blueprintTitle,templateDetails?.brand,templateDetails?.model),secondaryVersions=(file.artworkVersions||[]).filter(artwork=>artwork.side!==primarySide);return <article className="design-artwork-card" key={file.id}>
                <div className="design-artwork-primary"><UploadedDesignPreview src={file.previewUrl}/><div><em>{itemNoun==="garment"&&primarySide?`Main design · ${printSideLabel(primarySide)}`:primarySide&&/wrap|around/i.test(primarySide)?"Main design · Wrap":"Main design"}</em><small>{file.width&&file.height?`${file.width} × ${file.height}px`:"Checking dimensions…"}</small></div><button type="button" className="artwork-remove-action" onClick={()=>removeDesign(file.id)} aria-label="Remove design">Remove</button></div>
                {secondarySides.length>0&&<div className="artwork-version-tools"><b>Optional artwork for this listing</b><small>Add artwork only for another print area already prepared in this Printify product.</small><div>{secondarySides.map(side=><label className="secondary-action" role="button" tabIndex={0} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.querySelector("input")?.click()}}} key={side}>＋ Add {printSideLabel(side).toLocaleLowerCase()} artwork to this design<input className="hidden-picker" type="file" accept=".png,.jpg,.jpeg" onChange={event=>{void addArtworkVersion(file.id,side,event.target.files);event.target.value=""}}/></label>)}</div></div>}
{secondaryVersions.map(artwork=>{const compatibleProducts=productsInBatch.filter(recipe=>orderedPrintSides(bundleProductDetails[recipe.id]?.printPositions).some(side=>side.toLocaleLowerCase()===artwork.side.toLocaleLowerCase())),assignedProducts=artwork.productIds?.length?artwork.productIds:(artwork.ownerProductId?[artwork.ownerProductId]:activeRecipe?.id?[activeRecipe.id]:[]);return <section className="artwork-version" key={artwork.id}><img src={artwork.previewUrl} alt=""/><div><b>{printSideLabel(artwork.side)} artwork for this listing design</b>{!artwork.colorIds.length&&<em className="artwork-color-required">Choose at least one {itemNoun} color for this {printSideLabel(artwork.side).toLocaleLowerCase()} print.</em>}{colors.length?<fieldset><legend>Use it on these {activeRecipe?.name||itemNoun} colors</legend>{colors.map(color=><button type="button" key={color.id} className={artwork.colorIds.includes(color.id)?"selected":""} aria-pressed={artwork.colorIds.includes(color.id)} onClick={()=>toggleArtworkColor(file.id,artwork.id,color.id)}><i style={{background:color.swatch||"#ddd"}}/>{color.title}</button>)}</fieldset>:null}{activeBundle&&bundleRecipes.length>1?<fieldset className="bundle-print-products"><legend>Which products get this {printSideLabel(artwork.side).toLocaleLowerCase()} artwork?</legend><small>Only products that support this print area are included. Every other product keeps its primary artwork only.</small>{compatibleProducts.map(recipe=><button type="button" key={recipe.id} className={assignedProducts.includes(recipe.id)?"selected":""} aria-pressed={assignedProducts.includes(recipe.id)} onClick={()=>toggleArtworkProduct(file.id,artwork.id,recipe.id)}><span aria-hidden="true">{assignedProducts.includes(recipe.id)?"✓":""}</span>{recipe.name}</button>)}</fieldset>:null}</div><button type="button" onClick={()=>removeArtworkVersion(file.id,artwork.id)} aria-label={`Remove ${printSideLabel(artwork.side).toLocaleLowerCase()} artwork`}>Remove</button></section>})}
              </article>})}<button type="button" className="add-another-design" onClick={()=>imagePicker.current?.click()}><span aria-hidden="true">＋</span> Add another design</button></div>}
              {files.length>0&&!complete&&(workflowStep==="setup"||workflowStep==="designs")&&<>{designsFinished&&belowRecommendedPixels.length>0&&bundleQualityGroups.length>0&&<div className={`pixel-warning-inline ${criticalDpiFiles.length?"critical-dpi":""}`} role="status"><span>!</span><div><b>{criticalDpiFiles.length?`${criticalDpiFiles.length} ${criticalDpiFiles.length===1?"design is":"designs are"} below 215 DPI — very low resolution.`:belowRecommendedPixels.length===1?"One design is below Printify’s recommended pixel size.":"Some designs are below Printify’s recommended pixel size."}</b><small>{criticalDpiFiles.length?"Each affected design must be replaced or approved.":"You can still continue after confirming."}</small></div></div>}{/* D399 - Step 2 showed "Next step" here AND "Continue to create drafts" in the
                product card below. Creating the drafts is the step; this button only
                scrolled down to it. One forward control per step: the action while the
                drafts do not exist, the forward once they do. */}
              {/* D728 - prototype .goldie-footer: the designs step's forward
                  action and its status share one bar. Same gate, same handler. */}
              {workflowStep==="setup"&&<FactoryFooter status={setupForwardReady?`${files.length} ${files.length===1?"listing":"listings"} in this batch`:templateError||missingRequirement||failedBundleNames()[0]||`Preparing ${designsPreparing} ${designsPreparing===1?"design":"designs"}…`}><button className="workflow-next" disabled={!setupForwardReady} onClick={()=>goToStep("designs")}>{setupForwardReady?"Review draft plan":templateError||missingRequirement||"Finish the product above"} {setupForwardReady&&<span>→</span>}</button></FactoryFooter>}</>}
              {workflowStep==="setup"&&files.length>0&&complete&&<FactoryFooter status="Your Printify drafts are ready"><button className="workflow-next" onClick={()=>goToStep("designs")}>Continue to drafts <span>→</span></button></FactoryFooter>}
            </div>
          </article>
          {/* D221 · Etsy details joins titles, tags and descriptions on one Listing page. They
           are the same job — the words and metadata of the listing — and they were two
           screens apart. */}
          {workflowStep==="finish"&&(finishPhase==="details"||finishPhase==="etsy")&&stepProductCards(bundleCardStatus("listing"),/* D541 - step 3 held one block: a title builder, a description editor and a
              table of every listing, with two rows that were bookmarks into spots
              inside it. Clicking Description showed titles and tags too, because
              they were never in a section of their own. The rows own panels now,
              exactly as step 2 does, and the card passes no body. */
            /* D787 - the body is the preview's listing grid now, not null; the
               rows that used to stand in for it are gone from this phase. */
            listingGridScreen(),false,
            <>
            {/* D521 - the forward button belongs to the step, not to whichever
                product happens to be open. On a three-product bundle it was
                inside the hoodie card, so leaving the step meant finding the
                open product first. */}
            {/* D544 - this asked finishPhase==="details", and D221 had already decided the
                 Etsy details render on the Listing page with no phase of their own:
                 continueToEtsyDetails() calls setFinishPhase("details") and then writes
                 phase=etsy into the URL anyway. So the state never left "details", the
                 footer never swapped, and step 3 offered "Prepare Etsy details" forever
                 with no way to reach step 4. Measured on her batch: details prepared,
                 rows reading "Needs review", and no Next step button on the page.
                 Ask the real question instead - have the Etsy details been built yet. */}
              {/* D1303 · Focused editors used to repeat the same blocker and
                  correction button in the work area and the persistent footer.
                  Keep one reason and one next action in the predictable footer. */}
              {!reviewEditing&&(!etsyDetailsPrepared?<FactoryFooter status={preparingEtsy?"Preparing Etsy details automatically…":progressGateIssues(6)[0]||"Etsy details are preparing automatically."}/>:(()=>{const issues=progressGateIssues(7),priceTarget=costReviewDrafts().find(draft=>draft.status==="Created"&&!draft.costReview?.approved),canOpenPricing=Boolean(priceTarget)||(!gateState().pricingApproved&&costReviewGroups().length>0);const openPricing=()=>{if(priceTarget)editReviewedListing("pricing",priceTarget);else{setActiveTask("draft-pricing");goToStep("designs",false,true)}};return <FactoryFooter status={savingEtsyDetails?"Saving your latest listing changes before review…":issues[0]||"Every listing is ready for review"}><button className="workflow-next" aria-busy={savingEtsyDetails} disabled={savingEtsyDetails||Boolean(issues.length&&!canOpenPricing)} title={issues[0]} onClick={canOpenPricing?openPricing:()=>void saveAllEtsyDetails()}>{savingEtsyDetails?"Opening final review…":canOpenPricing?"Review item prices":"Review batch"} <span>→</span></button></FactoryFooter>})())}
            </>)}
          {workflowStep==="finish"&&finishPhase==="final"&&((bundleProductsStillReading().length||!draftAvailabilitySettled)?<section className="listing-review-gate is-saving bundle-final-loading" role="status" aria-live="polite"><b>{bundleProductsStillReading().length?"Loading every product in this batch…":draftAvailability.status==="error"?"The Printify drafts could not be confirmed.":"Checking every Printify draft…"}</b><p>{bundleProductsStillReading().length?"Checking the saved listings, prices, photos, and Etsy details before showing the final review.":draftAvailability.status==="error"?(draftAvailability.error||"Try the check again before saving to Etsy."):"Making sure the drafts still exist before showing the final review."}</p>{draftAvailability.status==="error"?<button type="button" className="secondary-action" onClick={()=>setDraftAvailabilityRevision(value=>value+1)}>Try again</button>:null}</section>:stepProductCards(bundleCardStatus("publish"),null,false,<>{/* D497 - publish covered one product until D495, so these cards kept their
    own open controls. Now one press publishes the whole bundle, and a card
    offering to go and open Gildan Tee separately contradicts the button
    underneath it - the same thing that was wrong on step 2. The action is a
    footer here too, so the cards report their products and the controls go. */}{/* D387 - This banner floated above the product card. It reports on this
              product's listings, so it belongs inside the card with them. */}
              {/* D548 - "Every listing has at least one photo" was measured from the drafts
              of the product that happens to be open, and said "every". On a bundle
              that is a claim about products it never looked at. It says whose
              listings it checked. */}
            {/* D625 · A green "Listing photos complete" banner sat directly under
                the product card, one row below that same card's own "Listing
                photos · 6 photos ✓". It restated a tick that was already on
                screen, and pushed the Publish panel further down for it. The card
                reports photo readiness; nothing else needs to. The banner style
                is still used by step 2, so only this instance goes. */}
              <article className="step-card final-review active-panel"><div className="step-content">{batchReceipt?<OutcomeReceipt goalLine={listingGoal&&goalDaysLoaded?`That is ${goalDone} of your ${listingGoal.target} listings this ${listingGoal.period}.`:undefined} receipt={batchReceipt} productName={templateDetails?.blueprintTitle||""} shippingProfile={etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||""} imageCount={printifyImageIndices.length} sizeGuideName={sizeGuideName} tagCount={files.reduce((sum,file)=>sum+file.tags.length,0)} variantCount={pricedVariants.length*files.length} minutesSaved={Math.max(12,Math.round(files.length*11.1))} nextBundleProduct={nextUnfinishedBundleProduct()?.name} bundleComplete={Boolean(activeBundle&&bundleRecipes.length>0&&bundleRecipes.every(bundleProductFullyPublished))} onNextBundleProduct={()=>{const pending=nextUnfinishedBundleProduct();if(pending)void openBundleProduct(bundleRecipes.findIndex(recipe=>recipe.id===pending.id))}} onNewBatch={()=>{clearCurrentBatch(true);goToStep("setup")}}/>:<>{/* D546 - her words, looking at it: "this whole section doesn't need to be on
              the final step because above it, you list every product and everything
              that's in every product." It repeated the cards line for line - prices,
              description, Etsy details, photos - and the two things it alone
              reported moved into the rows that own them. */}
{/* D559 - her question: "why if this is a hoodie t shirt and crew neck batch
                would it be showing me two hoodies only?" Because it was handed the
                open batch's drafts, while the button published all three products.
                It gets every product's listings now, so the checkboxes govern the
                six listings the press will actually create. */}
            {/* D731 - prototype .goldie-review: the listings on the left, the press
                and everything it warns about in a box beside them that stays in
                place while the list scrolls. Every gate, warning, confirmation
                and failure path below is the same code in the same order. */}
            <div className="factory-review"><div className="factory-review-list">
            <FinalListingReview handoffOnly productName={activeBundle&&bundleRecipes.length>1?"":activeRecipe?.name||templateDetails?.blueprintTitle||""} printSides={activeBundle&&bundleRecipes.length>1?[]:templateDetails?.printPositions} drafts={bundlePublishDrafts()} files={bundlePublishFiles()} selections={bundlePublishSelections()} defaultIndices={printifyImageIndices} preparedMockupCounts={bundlePublishMockupCounts()} batchSizeGuide={sizeGuideName} onRetry={clientId=>{const design=files.find(file=>file.id===clientId);if(design)void runDrafts([design],true)}} onEdit={editReviewedListing} onEditProduct={editReviewedProduct} pricingAndShippingReady={reviewedPricingAndShippingReady} etsyDetailsIssue={draft=>{const design=bundlePublishFiles().find(file=>file.id===draft.clientId)||bundlePublishFiles().find(file=>file.name===draft.name);if(!etsyRequiredComplete(design?.etsy))return "Choose a category or required details";return personalizationProblem(design?.etsy)}} onSelectionChange={setSelectedPublishIds} onSelectionTouched={()=>{sellerChosePublish.current=true}}/>{/* D548 - read as someone about to spend money, this said two untrue things.
              "Only the listings selected above" - the selection covers the product
              that is open, and on a bundle the button publishes every product, so
              the sentence promised a smaller press than the one it sat under. And
              it named the fee per listing without ever multiplying it, on the one
              screen where the total is the thing worth knowing. */}
            </div><div className="factory-publish-box">{/* D785 - the prototype's box opens by
              naming the connected destination shop without implying Goldie publishes
              in 20px. Production had the shop only inside the press, at 10px,
              under a three-line sentence - the one fact that says whether you
              are about to publish to the right place was the smallest thing in
              the box. */}
              {etsyShop?<><small className="publish-box-eyebrow">Etsy shop</small><h3>{etsyShop}</h3></>:null}
              {/* D787 - the five reporting lines that used to stand as a panel
                  stack in front of this screen. They open nothing and do no
                  work; they say where the batch stands, and the preview puts
                  that kind of detail in this box, under the shop it is going to.
                  Listings ready, titles and tags, listing photos, pricing and
                  shipping, published - every one of them, with the same value
                  and the same wording productRows gave them. */}
              <div className={`publish-box-ready ${handoffBlockers().length?"needs-work":"is-ready"}`}><b>{etsyDraftTransferState==="complete"?`${bundlePublishDrafts().length} Etsy ${bundlePublishDrafts().length===1?"draft":"drafts"} verified`:etsyDraftTransferState==="working"?`Creating ${bundlePublishDrafts().length} Etsy ${bundlePublishDrafts().length===1?"draft":"drafts"}`:handoffBlockers().length?`${handoffReadyCount()} of ${handoffExpectedCount()} listings complete`:`${bundlePublishDrafts().length} ${bundlePublishDrafts().length===1?"listing":"listings"} ready`}</b><span>{etsyDraftTransferState==="complete"?"Ready to open in Etsy. Nothing is live.":etsyDraftTransferState==="working"?"Saving and checking each draft now.":handoffBlockerSummary()}</span></div>
              <PhotoDeliveryHandoff ref={photoDeliveryRef} onStatusReady={setPhotoDeliveryStatusReady} onTransferState={setEtsyDraftTransferState} onReview={(id,photos)=>{const draft=bundlePublishDrafts().find(item=>item.id===id);if(draft)editReviewedListing(photos?"mockups":"details",draft)}} targets={bundlePublishDrafts().filter(draft=>draft.id&&draft.status==="Created").map((draft,index)=>{const design=bundlePublishFiles().find(file=>file.id===draft.clientId)||bundlePublishFiles().find(file=>file.name===draft.name);return{id:draft.id!,title:design?.title||`Listing ${index+1}`,indices:bundlePublishSelections()[draft.id!]??printifyImageIndices,shippingProfileId:drafts.some(own=>own.id===draft.id)?etsyShippingProfileId:Number(Object.values(bundleMembers).find(member=>member.drafts.some(own=>own.id===draft.id))?.shippingProfileId)||0}})} beforePrepare={async()=>{await persistBatchNow();await persistRunNow()}}/>
              {(()=>{const recipe=nextBundleProductToFinish();if(!recipe)return null;const index=bundleRecipes.findIndex(item=>item.id===recipe.id);return <button type="button" className="review-bundle-recovery-button" disabled={switchingProduct===recipe.id||index<0} onClick={()=>openBundleProduct(index,true)}>{switchingProduct===recipe.id?`Opening ${recipe.name}…`:`Finish ${recipe.name} →`}</button>})()}
              {/* D1313 · The delivery status read intentionally holds this action
                  until it knows whether an Etsy draft already exists. The button
                  previously kept saying “Save to Etsy Drafts” while disabled, so
                  the final screen looked broken during that check. Put the wait
                  on the control the seller is trying to use. */}
              {etsyDraftTransferState!=='complete'&&<button type="button" className="review-etsy-draft-button" data-inline-progress="true" aria-busy={creatingEtsyDrafts||etsyDraftTransferState==='working'} disabled={creatingEtsyDrafts||etsyDraftTransferState==='working'||!photoDeliveryStatusReady||Boolean(handoffBlockers().length)} onClick={async()=>{setCreatingEtsyDrafts(true);try{await photoDeliveryRef.current?.prepare()}finally{setCreatingEtsyDrafts(false)}}}>{creatingEtsyDrafts?"Saving your draft request…":etsyDraftTransferState==='working'?"Creating Etsy drafts…":etsyDraftTransferState==='attention'?"Check saved progress above":!photoDeliveryStatusReady?"Checking saved Etsy drafts…":"Save to Etsy Drafts"}</button>}
              {bundlePublishDrafts().some(draft=>draft.status==="Created")&&<><a className="review-printify-link" href="https://printify.com/app/store/products" target="_blank" rel="noopener noreferrer">Open drafts in Printify ↗</a></>}
              {false&&<><div className="publish-live-warning">{(()=>{
              /* D560 - the count follows her ticks now that they govern every listing. */
              const total=publishTargets().length||bundleListingsToPublish();
              /* D636 - "all 3 products in this batch" counted the bundle, not the
                 ticks, so it sat directly above "2 listings" and contradicted it.
                 D634 fixed the confirmation; these two labels were still counting
                 the bundle. Labels only - the payload is unchanged. */
              const chosenProducts=new Set(publishTargets().map(item=>item.productName).filter(Boolean)).size||bundleRecipes.length;
              const many=Boolean(activeBundle&&bundleRecipes.length>1);
              return <><b>{many
                ?`Publishing sends ${chosenProducts} selected ${chosenProducts===1?"product":"products"} — ${total} ${total===1?"listing":"listings"} — live on Etsy.`
                :`Only the listings selected above will be published live on Etsy.`}</b>
              <span>{many?"Untick any listing above to leave it out. Everything ticked publishes in one press.":"Anything still needing a look is listed above."}</span>
              <small>Etsy charges its standard $0.20 USD listing fee for each listing created{total?`, so this press costs about $${(total*0.2).toFixed(2)} USD`:""}. This fee is charged by Etsy and is separate from your subscription.</small></>;
            })()}</div><button className="publish-all-button" aria-busy={publishing} disabled={publishing||publishBlockers().length>0} title={publishBlockers()[0]?`Before publishing: ${publishBlockers()[0]}`:undefined} onClick={openPublishConfirmation}><span className="publish-all-label">{/* D495 - one press publishes the whole bundle, so the button says so and
    reports which product it is on rather than naming a listing count that
    only covers the product currently open. */}
{publishRun&&!publishing?"Queuing every listing in this batch…":publishing?(activeBundle&&bundleRecipes.length>1?(()=>{
                /* D637 - the busy label was the last surface still counting the
                   bundle rather than the press. It read "Publishing 6 listings
                   across 3 products…" over a progress line that correctly said
                   "0 of 2 listings are live". */
                const sending=publishTargets().length||bundleListingsToPublish();
                const across=new Set(publishTargets().map(target=>target.productName).filter(Boolean)).size||bundleRecipes.length;
                return `Publishing ${sending} ${sending===1?"listing":"listings"} across ${across} ${across===1?"product":"products"}…`;
              })():"Publishing…"):activeBundle&&bundleRecipes.length>1?(()=>{
              /* D546 - "Publish all 3 products" counted products while every
                 number above it counted the open product's listings, so nothing
                 on the page said how many Etsy listings would be created, or
                 what they would cost. It says the number now. */
              if(bundleProductsStillReading().length)return "Checking the other products…";
              const waiting=bundleProductsNotStarted();
              /* D628 - "Gildan Hoodie still has no listings" was what this said
                 about a product whose batch had been deleted. It may well have
                 had listings; the batch is gone. Two different problems, and
                 only one of them is fixed by going back and adding designs. */
              const missingBatch=waiting.filter(recipe=>bundleBatchSummary[recipe.id]?.unreadable);
              if(missingBatch.length)return missingBatch.length===1?`${missingBatch[0].name}'s batch was not found`:`${missingBatch.length} products' batches were not found`;
              if(waiting.length)return `${waiting.length===1?waiting[0].name:`${waiting.length} products`} still ${waiting.length===1?"has":"have"} no listings`;
              const total=publishTargets().length||bundleListingsToPublish();
              /* D636 - the number of listings followed her ticks; the number of
                 products beside it did not, so the button read "2 listings ... 3
                 products". Both come from the same array now. */
              const products=new Set(publishTargets().map(item=>item.productName).filter(Boolean)).size||bundleRecipes.length;
              return `Publish ${total} ${total===1?"listing":"listings"} live on Etsy · ${products} ${products===1?"product":"products"}`;
            })():`Publish ${selectedPublishDrafts().length} selected ${selectedPublishDrafts().length===1?"listing":"listings"} live on Etsy`}</span>{/* D698 · The shop this press sends to, named on the button
              itself. Her words: "if they are working with multiple shops, it's
              just, like, another fail safe to make sure it's going to the right
              place." The connection panel already names it; the moment that
              matters is the press, and that is where it was missing. */}{/* D785 - the shop stays in the press. D697/D698 put it here on purpose:
                 at the moment of pressing, the control itself has to say which
                 shop it is publishing to. The eyebrow above repeats it larger;
                 it does not replace it. */}
              {etsyShop?<small className="publish-all-shop">to {etsyShop}</small>:null}</button>
              {(publishing||Boolean(publishRun))&&<p className="working-note" role="status">Publishing to Etsy can take a few minutes. Keep this page open — Each listing will appear here as it goes live.</p>}<button className="keep-drafts-button" type="button" disabled={publishing} onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());saveDialogOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDraftSaveOpen(true)}}>Keep as Printify drafts for now</button>{!publishing&&<small className="keep-drafts-note">Nothing will publish to Etsy. Return to this exact batch from Batch History.</small>}</>}{/* D474 - this describes the Keep as drafts button, but sat there while the
     button above it said Publishing, so the page said both that it was
     publishing and that nothing would publish. It belongs to a choice that is
     no longer available once publishing has started. */}{publishMessage&&<p className="publish-message" role="status">{publishMessage}</p>}{publishFailures.length>0&&<section className="publish-failure-panel" role="alert"><p className="mini-label">NOTHING WAS PUBLISHED</p><h3>{publishFailures.length===1?"1 listing could not be published":`${publishFailures.length} listings could not be published`}</h3><p className="publish-failure-lede">Etsy did not create {publishFailures.length===1?"this listing":"these listings"}, so you have not been charged a listing fee for {publishFailures.length===1?"it":"them"}. Here is exactly what Etsy said:</p><ul className="publish-failure-list">{publishFailures.map(failure=>{const draft=drafts.find(item=>item.id===failure.productId);return <li key={failure.productId}><strong>{draft?.title?.slice(0,60)||draft?.name||"Listing"}</strong><span>{failure.error}</span></li>})}</ul><p className="publish-failure-lede">The error was emailed to you and recorded. You can press publish again once it is fixed.</p></section>}</div></div></>}</div></article></>,false,null))}
        </div>

        {/* D220 · Draft creation moves onto the Images page. Every photo in this app is
            attached to a Printify draft — IntegratedMockups takes productId={draft.id} and
            PrintifyImagePicker reads the draft's own images — so photos cannot be chosen before
            drafts exist. It was its own screen for a button. It is now the action on the
            Images page that unlocks the photo section below it, which keeps upload and mockups
            on one screen as intended. It stays an explicit button rather than something
            Continue does silently, because creating drafts spends listing quota. */}
        {/* D378 - The drafts panel is the per-product half of the Images step: the
            designs are shared across the bundle, the Printify drafts are not. It
            stays mounted across steps, so the rail takes the hidden state rather
            than the tree changing shape and remounting a panel mid-run. */}
        {stepProductCards(bundleCardStatus("images"),null,!(workflowStep==="designs")||complete,<aside className={`launch-panel workflow-panel ${workflowStep==="designs"&&!complete?"active-panel":"hidden-panel"}`}>
          <div className={`step-number launch-step-icon create-drafts-icon`} aria-hidden="true"/>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            {(running||workflowStep!=="review")&&<h2>{running ? processed===runTotal&&runTotal>0?"Saving your finished batch":`Creating drafts · ${processed} of ${runTotal} finished` : complete ? "Drafts created" : "Create your Printify drafts"}</h2>}
            <p>{running ? processed===runTotal&&runTotal>0?"All drafts are created. Saving the finished batch to Batch History.":draftsAdmitted?"Printify is creating the drafts. You can leave this page.":"Uploading designs and safely starting each draft." : workflowStep==="review" ? "One unpublished Printify draft is created for every design in this batch." : complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : ""}</p>
          </div>

          

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            {!(activeBundle&&bundleRecipes.length>1)&&<div><span>Saved product</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button type="button" aria-label="Change saved product" disabled={running||Boolean(bundleRun)} onClick={()=>goToStep("setup")}>Change product</button></div>}
            {!(activeBundle&&bundleRecipes.length>1)&&<div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>}
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            
          </div>

          {running && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="progress-ring" aria-hidden="true"/>
              <div className="progress-copy"><b>{processed===runTotal&&runTotal>0?"Saving your finished batch":"Creating your Printify drafts"}</b><span>{creationActivityText}</span><small className="progress-activity"><i aria-hidden="true"/>Working</small></div>
              <div className="progress-track" role="progressbar" aria-label="Printify draft creation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={creationProgressPercent} aria-valuetext={creationProgressText}>
                <span style={{ width: `${creationProgressPercent}%` }} />
                <b>{creationProgressPercent}%</b>
              </div>
            </div>
          )}

          {!complete ? (
            <>
            {workflowStep==="designs"&&<FactoryFooter status={running||preparingEtsy||Boolean(bundleRun)?preparationMessage||"Creating private Printify drafts…":bundleQualityGroups.length?`Review ${bundleQualityGroups.length} resolution ${bundleQualityGroups.length===1?"warning":"warnings"} above`:!ready?missingRequirement:activeBundle?`${files.length} design${files.length===1?"":"s"} · ${bundleRecoveryOnly?files.length:requestedListingCount} drafts to create`:`${files.length} ${files.length===1?"listing":"listings"} will be created`}><button className="launch-button" aria-busy={running||preparingEtsy||Boolean(bundleRun)} disabled={!ready || bundleQualityGroups.length>0 || running||preparingEtsy||Boolean(bundleRun)} onClick={createDrafts}>
              {/* D485 - one press covers the whole bundle, so the button says so
                  rather than naming a single product, and reports which product
                  The Listing Factory is on while it works through them. */}
              <span className="button-glint" />{bundleRun&&!running?`Moving to ${bundleRecipes[bundleIndex+1]?.name||"the next product"}…`:preparingEtsy?"Completing Etsy details…":running ? processed===runTotal&&runTotal>0?"Saving finished batch…":(bundleRun&&activeBundle&&bundleRecipes.length>1?`${activeRecipe?.name||"Product"} ${bundleIndex+1} of ${bundleRecipes.length}: creating drafts · ${processed} of ${runTotal} finished…`:`Creating drafts · ${processed} of ${runTotal} finished…`) : bundleQualityGroups.length?"Review resolution warnings above":!ready ? missingRequirement : activeBundle&&bundleRecipes.length>1&&!bundleRecoveryOnly?`Create drafts for all ${bundleRecipes.length} products`:`Create ${files.length} ${files.length===1?"Printify draft":"Printify drafts"}`}<span>→</span>
            </button></FactoryFooter>}
              {/* D708 · The label already changes while Goldie works, but a changing
                  label does not tell you HOW LONG. Draft creation and Etsy publishing
                  are the two steps that can sit for minutes, and a screen that looks
                  frozen is when a seller closes the tab or presses again. Her words:
                  "so they know that nothing is wrong." */}
              {preparingEtsy&&<p className="working-note" role="status">Preparing listing details in the background. You can keep reviewing this page.</p>}
            </>
          ) : null}
          {!complete&&<p className="launch-note">Creates unpublished Printify drafts.</p>}
        </aside>,false)}
{/* D496 - a held tab has to say so where she is working, not silently stop
    saving. */}
        {batchAuthenticationRequired&&<div className="batch-tab-conflict" role="alert"><b>Sign in again to save your changes.</b><span>Your changes are still here. Sign in, then return to this tab. Saving will retry automatically.</span><a href="/account/sign-in?return_to=%2Flisting-factory" target="_blank" rel="noopener noreferrer">Sign in to The Listing Factory ↗</a><button type="button" onClick={retryAuthenticatedSave}>Retry now</button></div>}
        {batchSaveConflict&&<div className="notice error" role="alert"><strong>Saving paused</strong><p>{batchSaveConflict}</p><button type="button" onClick={()=>void reloadConflictedBatch()}>Reload saved batch</button></div>}
            {batchHeldByAnotherTab&&<div className="batch-tab-conflict" role="status"><b>This batch is open in another tab.</b><span>Saving is paused here so the other tab is not overwritten. Continue in the other tab, or reload the latest saved version here to take over.</span><button type="button" onClick={takeOverBatchHere}>Reload saved batch here</button></div>}
        {!(complete&&workflowStep==="designs")&&<div className="workflow-footer-actions">{reviewEditing?null:progressIndex>0&&<button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button>}<span className="autosave-note"><i aria-hidden="true">{batchAuthenticationRequired||batchSaveConflict||batchHeldByAnotherTab?"!":"✓"}</i> {batchAuthenticationRequired?"Sign in to save":batchSaveConflict?"Saving paused":batchHeldByAnotherTab?"Saving paused in this tab":"Saved automatically"}</span>{/* D776 - the step's own footer (status + forward) lands here, so the bar the seller can see is the bar with the way forward in it. */}<span className="factory-footer-slot"/>{reviewEditing?<button className="workflow-back review-return" type="button" onClick={()=>openFinishedReview(false)}><span aria-hidden="true">←</span> Back to Review</button>:<>{/* D386 - Saving a draft was only reachable from the Publish step, so
                stopping halfway meant trusting the autosave and remembering the
                batch later. Name it and park it from wherever you are. */}{workflowStep!=="connect"&&!(workflowStep==="finish"&&finishPhase==="final")&&(files.length>0||drafts.length>0||Boolean(templateDetails))&&<button className="save-draft-link" type="button" onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());saveDialogOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDraftSaveOpen(true)}}>Save to Batch History</button>}</>}</div>}
        </div>
      </section>}


            {/* D540 - the size guide applies to every listing in the batch and the
          "review all listings in Printify" link opens all of them, so neither
          belongs inside one product's card. They sit above the cards with the
          rest of the shared batch work, where she can reach the size guide while
          she is arranging any product's photos. A product card now holds only
          its rows and the one task panel she opened. */}
{complete && workflowStep==="designs" && stepProductCards(bundleCardStatus("images"),
        /* D517 - the mockups are per product: a hoodie scene is not a tee scene.
           D507 took the product cards off this step because the design upload is
           shared, and took the mockups with them - so she opened step 2 on a
           three-product bundle and saw only hoodies, with no way to reach the
           other two. The upload and its one button stay shared, above; once the
           drafts exist, each product gets the same collapsible card it gets on
           every other step, with its own mockups inside it. */
      null
        ,false,
        <>
        {/* D521 - the single-product flow is the specification and a bundle just
            applies it, so each block sits where its own words say it belongs.
            This size guide is labelled "apply to the whole batch" and was inside
            one product's card. The forward button belongs to the step, not to
            whichever product happens to be open, and so does the note saying why
            it is disabled. */}
        
        {imageStepError&&<p className="image-step-blocker" role="alert">{imageStepError}</p>}
        {/* D728 - prototype .goldie-footer. The reason you cannot continue moves
            from a paragraph under the button to the left of the bar the button
            sits in, so the step states its own gate in one place. The button
            below is unchanged: same gate check, same handler. */}
        {!reviewEditing&&<FactoryFooter status={imagesStepIssues().length?(()=>{const next=unfinishedDraftGuidance();return <span className="draft-next-guidance"><span>{imagesStepIssues()[0]}</span>{next&&!savingDraftVariants&&!switchingProduct&&!restoringBatch&&<button type="button" className="draft-fix-link" onClick={()=>openGuidedDraftTask(next.task,next.index)}>Open {next.label.toLowerCase()}{activeBundle&&bundleRecipes.length>1?` · ${next.name}`:""} <span aria-hidden="true">↑</span></button>}</span>})():"Product choices, pricing, shipping, and photos are ready"}>
        <button className="workflow-next" type="button" disabled={imagesStepIssues().length>0} title={imagesStepIssues()[0]} onClick={()=>{const missing=createdListingsMissingImages();if(missing.length){setImageStepError(`${missing.length} ${missing.length===1?"listing needs":"listings need"} at least one photo.`);setMissingPhotoDraftIds(missing.map(draft=>draft.clientId));return}setImageStepError("");setMissingPhotoDraftIds([]);/* D427 - one Next step on this page, and it is the one that checks every listing has a photo. The second copy in the card list bypassed that check entirely. Goes to Listing, not Publish. */setFinishPhase("details");void enterListingDetails()}}>Continue to listing details <span aria-hidden="true">→</span></button>
        </FactoryFooter>}
        </>
        ,true,
        /* D683 - the batch-wide "open every listing in Printify" link. It renders
           as the first child of the cards section so it shares the cards' grid
           row instead of owning a row the sticky rail sizes. */
        <>
        <div className="post-draft-heading">{drafts.filter(draft=>draft.status==="Created").length>1&&<button className="open-all-button" onClick={openAllDrafts}>Review all listings in Printify ↗</button>}</div>
        {openAllMessage&&<p className="open-all-message" role="status">{openAllMessage}</p>}
        </>
      )}

      {complete && workflowStep==="designs" && <div className="workflow-footer-actions post-draft-footer">{reviewEditing?null:<button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button>}<span className="autosave-note"><i aria-hidden="true">{batchAuthenticationRequired||batchSaveConflict||batchHeldByAnotherTab?"!":"✓"}</i> {batchAuthenticationRequired?"Sign in to save":batchSaveConflict?"Saving paused":batchHeldByAnotherTab?"Saving paused in this tab":"Saved automatically"}</span>{/* D778 - this bar replaces the normal one once the drafts exist, and it had no slot, so on step 2 the step's own footer portalled into the hidden bar and the visible one showed no way forward at all. */}<span className="factory-footer-slot"/>{reviewEditing?<button className="workflow-back review-return" type="button" onClick={()=>openFinishedReview(false)}><span aria-hidden="true">←</span> Back to Review</button>:<button className="save-draft-link" type="button" onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());saveDialogOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDraftSaveOpen(true)}}>Save to Batch History</button>}</div>}

      {false&&publishConfirmOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="publish-confirm-title"><span className="publish-confirm-icon">!</span><p className="mini-label">FINAL PUBLISH CONFIRMATION</p>{/* D495 - one press now publishes every product in the bundle, so the last
    screen before real money is spent has to say how many listings that is
    across how many products, not describe only the one that is open. */}
<h2 id="publish-confirm-title">{activeBundle&&bundleRecipes.length>1?`${publishTargets().length} ${publishTargets().length===1?"listing":"listings"} across ${new Set(publishTargets().map(item=>item.productName)).size} ${new Set(publishTargets().map(item=>item.productName)).size===1?"product":"products"} will go live on Etsy.`:"These listings will go live on Etsy."}</h2>{activeBundle&&bundleRecipes.length>1&&<p className="publish-confirm-bundle">These products publish one after another. If a product is not ready it stops there and tells you what is missing — nothing after it is published.</p>}<p>They will not be saved as Etsy drafts. Publishing starts as soon as you confirm below. The selected Etsy shipping profile is applied immediately.</p><p className="etsy-listing-fee-note">Etsy will charge its standard $0.20 USD listing fee for each listing created{activeBundle&&bundleRecipes.length>1?` \u2014 about $${(publishTargets().length*0.2).toFixed(2)} for ${publishTargets().length} ${publishTargets().length===1?"listing":"listings"}`:""}. This Etsy fee is separate from your subscription.</p>{missingPublishFields().length>0&&<div className="publish-missing"><b>Blank or unfinished fields:</b><ul>{missingPublishFields().map(field=><li key={field}>{field}</li>)}</ul><span>You can still publish, but review these first if they matter to this batch.</span></div>}<div className="publish-confirm-actions"><button onClick={()=>setPublishConfirmOpen(false)}>Go back and review</button><button className="danger" disabled={publishing} aria-busy={publishing} onClick={()=>{if(activeBundle&&bundleRecipes.length>1)setPublishRun({total:bundleRecipes.length});void publishAll()}}>Yes, publish live on Etsy</button></div></section></div>}

      {draftSaveOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!savingDraftBatch)setDraftSaveOpen(false)}}><section className="publish-confirm save-draft-modal" role="dialog" aria-modal="true" aria-labelledby="save-draft-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>×</button><span className="publish-confirm-icon">✓</span><p className="mini-label">SAVE FOR LATER</p><h2 id="save-draft-title">Save this batch for later?</h2><p>Return to your saved work from Batch History.</p><label><span>Name this batch</span><input autoFocus maxLength={160} value={batchDisplayName} onChange={event=>setBatchDisplayName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/></label><div className="publish-confirm-actions"><button disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>Cancel</button><button className="save-draft-confirm" aria-busy={savingDraftBatch} disabled={savingDraftBatch||!batchDisplayName.trim()} onClick={()=>void saveDraftBatch()}>{savingDraftBatch?"Saving batch…":"Save to Batch History"}</button></div></section></div>}

      {draftSavedOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm save-draft-success" role="dialog" aria-modal="true" aria-labelledby="draft-saved-title"><span className="publish-confirm-icon">✓</span><p className="mini-label">BATCH SAVED</p><h2 id="draft-saved-title">Your batch is saved.</h2><p><b>{batchDisplayName}</b> is in Batch History.</p><div className="publish-confirm-actions"><button onClick={()=>setDraftSavedOpen(false)}>Keep working here</button><button className="save-draft-confirm" onClick={()=>{window.location.href="/batches"}}>View Batch History</button></div></section></div>}

      {connectAnotherOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!etsyConnecting){setConnectAnotherOpen(false);window.setTimeout(()=>connectAnotherOpener.current?.focus(),0)}}}><section className="publish-confirm connect-etsy-shop-modal" role="dialog" aria-modal="true" aria-labelledby="connect-etsy-shop-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={etsyConnecting} onClick={()=>{setConnectAnotherOpen(false);window.setTimeout(()=>connectAnotherOpener.current?.focus(),0)}}>×</button><span className="publish-confirm-icon" aria-hidden="true">E</span><p className="mini-label">CONNECT ANOTHER SHOP</p><h2 id="connect-etsy-shop-title">Sign into the Etsy account for the other shop</h2><p>Every Etsy shop has its own Etsy login. Etsy will otherwise reconnect <b>{etsyShop||"the shop already connected"}</b> automatically.</p><ol className="connect-etsy-steps"><li><a href="https://www.etsy.com" target="_blank" rel="noopener noreferrer">Open Etsy account ↗</a>, sign out, then sign into the account that owns the shop you want. You can close that Etsy tab afterward.</li><li>Return here and choose <b>Connect that shop</b>.</li></ol><p className="connect-etsy-safe">Your currently connected shops stay saved.</p><div className="publish-confirm-actions"><button disabled={etsyConnecting} onClick={()=>{setConnectAnotherOpen(false);window.setTimeout(()=>connectAnotherOpener.current?.focus(),0)}}>Cancel</button><button autoFocus className="save-draft-confirm" aria-busy={etsyConnecting} disabled={etsyConnecting} onClick={()=>void connectEtsy(true)}>{etsyConnecting?"Opening Etsy…":"Connect that shop"}</button></div></section></div>}

      {restartBatchOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!restartingBatch)setRestartBatchOpen(false)}}><section className="publish-confirm restart-batch-modal" role="alertdialog" aria-modal="true" aria-labelledby="restart-batch-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>×</button><header className="restart-batch-head"><span className="publish-confirm-icon" aria-hidden="true">↻</span><p className="mini-label">START A NEW BATCH</p><h2 id="restart-batch-title">Start a new batch?</h2><p>{files.length||drafts.length?"Save this batch for later, or discard it and start fresh.":"This batch is empty, so you can start fresh now."}</p></header>{(files.length>0||drafts.length>0)&&<label><span>Name this batch</span><input maxLength={160} value={restartBatchName} onChange={event=>setRestartBatchName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/></label>}<div className="restart-batch-actions">{(files.length>0||drafts.length>0)&&<button type="button" className="save-restart" aria-busy={restartingBatch} disabled={restartingBatch||!restartBatchName.trim()} onClick={()=>void saveAndRestart()}>{restartingBatch?"Saving…":"Save batch + start new"}</button>}<button type="button" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>Cancel</button><button type="button" className="discard-restart" disabled={restartingBatch} onClick={()=>finishRestart(false)}>{files.length||drafts.length?"Discard this batch + start new":"Start new batch"}</button></div><small className="restart-printify-note">Your saved products and settings stay unchanged. Existing Printify drafts are not deleted.</small></section></div>}

      {blockingModal&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm blocking-modal" role="alertdialog" aria-modal="true" aria-labelledby="blocking-modal-title"><span className="publish-confirm-icon">!</span><p className="mini-label">REQUIRED BEFORE CONTINUING</p><h2 id="blocking-modal-title">{blockingModal.title}</h2>{blockingModal.copy&&<p>{blockingModal.copy}</p>}<div className="publish-missing"><b>Fix these items:</b><ul>{blockingModal.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setBlockingModal(null)}>Got it. I’ll fix this</button></div></section></div>}
      {pendingCategoryChange&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="category-change-title"><span className="publish-confirm-icon">!</span><p className="mini-label">ETSY CATEGORY CHANGE</p><h2 id="category-change-title">Change this listing’s Etsy category?</h2><p>{pendingCategoryChange.clearedCount} completed {pendingCategoryChange.clearedCount===1?"field does":"fields do"} not exist in the new category and will be cleared. Any compatible values will stay filled.</p><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPendingCategoryChange(null)}>Keep current category</button><button className="danger" onClick={()=>{const pending=pendingCategoryChange;setPendingCategoryChange(null);updateDesign(pending.designId,{etsy:pending.details,etsyError:""})}}>Change category and clear {pendingCategoryChange.clearedCount}</button></div></section></div>}
      {missingPhotoDraftIds.length>0&&typeof document!=="undefined"&&createPortal(<div className="publish-confirm-backdrop missing-photo-backdrop" role="presentation"><section className="publish-confirm missing-photo-modal" role="alertdialog" aria-modal="true" aria-labelledby="missing-photo-title"><button className="missing-photo-close" type="button" aria-label="Close" onClick={()=>setMissingPhotoDraftIds([])}>×</button><span className="publish-confirm-icon">!</span><p className="mini-label">PHOTOS REQUIRED</p><h2 id="missing-photo-title">{missingPhotoDraftIds.length} {missingPhotoDraftIds.length===1?"listing needs":"listings need"} a photo</h2><p>Add at least one Printify photo or lifestyle mockup to every listing shown below.</p><div className="missing-photo-list">{missingPhotoDraftIds.map(clientId=>{const draft=drafts.find(item=>item.clientId===clientId),design=files.find(item=>item.id===clientId),preview=draft?.previewUrl||design?.previewUrl;return <article key={clientId}>{preview?<img src={preview} alt="Product and design preview"/>:<div className="missing-photo-placeholder" aria-hidden="true"/>}<b>Listing {files.findIndex(file=>file.id===clientId)+1}</b><button type="button" onClick={()=>jumpToMissingPhotoListing(clientId)}>Go to this listing</button></article>})}</div></section></div>,document.body)}
      {pixelWarningOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm pixel-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="pixel-warning-title"><span className="publish-confirm-icon">!</span><p className="mini-label">PRINT RESOLUTION CHECK</p><h2 id="pixel-warning-title">One or more of these designs fall below Printify’s pixel size recommendations for this product.</h2><p>These designs may still print, but they may show a lower resolution inside the Printify editor at the largest enabled size. Review the comparison below before deciding whether to continue.</p><div className="pixel-comparison" role="region" aria-label="Uploaded design pixel comparison"><div className="pixel-comparison-head" aria-hidden="true"><b>Design</b><b>Uploaded size</b><b>Printify recommends</b></div><div className="pixel-comparison-rows">{(activeBundle&&bundleQualityIssues.length
              ?bundleQualityIssues.map(issue=>({id:issue.key,name:`Design ${files.findIndex(file=>file.id===issue.fileId)+1} · ${issue.productName}`,width:issue.actualWidth,height:issue.actualHeight,needWidth:issue.requiredWidth,needHeight:issue.requiredHeight}))
              :belowRecommendedPixels.map(file=>({id:file.id,name:`Design ${files.findIndex(item=>item.id===file.id)+1}`,width:file.width||0,height:file.height||0,needWidth:recommendedPixelSize.width,needHeight:recommendedPixelSize.height})))
              .map(row=><div className="pixel-comparison-row" key={row.id}><b title={row.name}>{row.name}</b><span><small>Uploaded size</small>{row.width.toLocaleString()} × {row.height.toLocaleString()} px</span><span><small>Printify recommends</small>{row.needWidth.toLocaleString()} × {row.needHeight.toLocaleString()} px</span></div>)}</div></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPixelWarningOpen(false)}>Go back and review</button><button className="pixel-proceed" onClick={()=>{setPixelWarningOpen(false);
              /* D509 - pressing this on a bundle is the decision the old dialog
                 demanded, so record it and carry on rather than sending her back
                 to make it again on the page behind. */
              const undecided=bundleQualityGroups.filter(group=>group.keys.some(key=>!bundleQualityDecisions[key]));
              if(undecided.length){decideAllQuality("include");beginDraftCreation();return}
              if(complete){void goToStep("finish",false,true)}else{document.querySelector(".launch-panel")?.scrollIntoView({block:"start"})}}}>Proceed anyway</button></div></section></div>}

      <footer><span>LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat screen={workflowScreen(workflowStep,finishPhase,complete)} />
            </div>
      </div>
</main>
  );
}
