"use client";
import { printifyProductLabel, familyFromVariants } from "./mockup-compatibility";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import SupportChat from "./support-chat";
import { workflowScreen } from "./step-videos";
import FactoryPanel from "./factory-panel";
import { runBounded } from "./bounded-work";
import { productReadiness, recipeCarriesApprovedPricing, type Readiness } from "./product-readiness";
import { KeywordBank, SavedWorkflow, type KeywordList, type Pricing, type ProductBundle, type Recipe } from "./factory-tools";
import UploadedListingPhotos from "./uploaded-listing-photos";
import ListingRows, { type ListingFlag } from "./listing-rows";
import { confirmAction } from "./confirm-dialog";
import ListingPhotoOrder from "./listing-photo-order";
import { tagsFromTitle } from "./seo-utils";
import { printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchFiles, saveBatchFiles } from "./batch-cache";
import { estimatedProfit, recommendedPrice } from "./pricing";
import { ActionReceipt, GoldieInsight, OutcomeReceipt, WorkflowMomentum, type BatchReceipt } from "./goldie-ui";
import { leavingImagesIssues, navigationIssues, type NavigationGateState } from "./workflow-gates";
import { GoldieCommandBar } from "./returning-command-center";
import FinalListingReview from "./final-listing-review";
import ContextHelp from "./context-help";
import GoldieWordmark from "./goldie-wordmark";
import { productFamily } from "./product-type-utils";
import { photoStats, preferredPhotoIndex, PHOTO_SAMPLE_SIZE } from "./product-photo";

/* D370 · The garment glyph a card falls back to when no catalog photo reads as
   the product. Shape follows the blueprint title so a hoodie does not draw as a
   tee — the point of the tile is to say which garment this row is. */
function ProductGlyph({title}:{title?:string}){
  const name=String(title||"").toLowerCase();
  const hooded=/hood/.test(name);
  const longSleeve=hooded||/sweat|crew|fleece|long sleeve|longsleeve/.test(name);
  const body=longSleeve
    ?"M8.6 3 L3.6 5.9 5.7 15.6 8.4 14.5 V21 H15.6 V14.5 L18.3 15.6 20.4 5.9 15.4 3 C14.6 4.8 9.4 4.8 8.6 3 Z"
    :"M8.6 3 L4 5.9 6.1 11 8.4 9.7 V21 H15.6 V9.7 L17.9 11 20 5.9 15.4 3 C14.6 4.8 9.4 4.8 8.6 3 Z";
  return (
    <span className="bundle-product-photo placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={body} />
        {hooded && <path className="glyph-line" d="M9.2 3.4 C10.2 6.8 13.8 6.8 14.8 3.4" />}
        {hooded && <path className="glyph-line" d="M9.7 16.2 H14.3" />}
      </svg>
    </span>
  );
}
import { NavIcon } from "./nav-icons";
import { publishedDaysThisPeriod, type ListingGoal, type PublishedDay } from "./listing-goal";

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
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; originalUnavailable?:boolean; title: string; tags: string[]; titleWarning?:string;titleError?:string;contentHash?:string; blurb?:string; descriptionOverride?:string; sizeGuideName?:string; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";etsy?:EtsyDetails;etsyError?:string };
type ProductVariant={id:number;title:string;cost:number;templatePrice:number;shipping?:number|null;options?:number[];colorId?:number|null;sizeId?:number|null;templateEnabled?:boolean};
type ProductColor={id:number;title:string;swatch:string;available:boolean;templateEnabled:boolean};
type ProductSize={id:number;title:string;available:boolean;templateEnabled:boolean};
type InternationalShippingRate={key:string;label:string;primary:number;additional:number};
type EditableInternationalShippingRate={key:string;label:string;primary:string;additional:string};
type EtsyShippingProfile={id:number;title:string;originCountry:string;currency:string;domesticPrimary:number;domesticAdditional:number;international:InternationalShippingRate[]};
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number;previewImage?:string;previewImages?:string[];colorOptions?:ProductColor[];sizeOptions?:ProductSize[]; variants:ProductVariant[]; shop: string; standardShipping?:number|null;shippingCurrency?:string;shippingTemplateId:string;shippingProfileNeedsSelection?:boolean;freeShipping:boolean;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null; hasLabelArtwork?: boolean };
type DraftResult = { id?: string; batchId?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed" | "NeedsRetry"; error?: string; productName?:string; placement?:{x:number;y:number;scale:number;angle:number};placementScale?:number };
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
  if(!target)return saved;
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
  if(!requested||!order.includes(requested as FinishPhase))return safeSaved;
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
const PROGRESS_STEPS = ["Connect Printify","Choose product","Add designs","Create Printify drafts","Create drafts","Listing details","Etsy listing details","Listing photos","Publish"];
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
  {label:"Product",index:1,title:"Choose product",covers:[1]},
  {label:"Images",index:2,title:"Designs + images",covers:[2,3,4,7]},
  {label:"Listing",index:5,title:"Titles + Etsy details",covers:[5,6]},
  {label:"Publish",index:8,title:"Review + publish",covers:[8]},
];
/* D222 · RAIL_TOP, RAIL_PRICING, RAIL_DRAFTS, RAIL_FINISH, RAIL_FINISH_FIRST and
   FINISH_RAIL_LABELS described the old five-bubble rail with its nested Finish
   node. RAIL_STAGES replaced all of them. */
const WORKFLOW_HELP = [
  {title:"Connect Printify and Etsy",intro:"Both accounts must be connected before Goldie can build a complete listing.",sections:[{heading:"Printify connection",copy:"Connect the Printify account that contains your saved product. Goldie uses it to read product costs and variants, upload artwork, and create unpublished product drafts."},{heading:"Etsy connection",copy:"Connect the Etsy shop linked to that saved product. Goldie uses Etsy’s real categories, attributes, shipping profiles, and publishing connection."},{heading:"Nothing publishes here",copy:"This step only verifies access. Goldie cannot publish a listing until you reach the final review and confirm publishing a second time."},{heading:"Use matching accounts",copy:"Connect the Printify account that contains the saved product and the Etsy shop where that product was published. If the product belongs to a different shop, Goldie will stop and explain the mismatch."},{heading:"Your publishing safeguard",copy:"Connecting does not publish anything. Goldie first creates unpublished Printify drafts. Listings go live on Etsy only after the final review and a second explicit confirmation."}]},
  {title:"Prepare your product in Printify",intro:"Before Goldie can save a product, it must be published from Printify to the same Etsy shop you connected to Goldie. A product that is still only a Printify draft will not work.",sections:[{heading:"Choose an existing or dedicated product",copy:"Either option works.",bullets:["Use an existing product that is already published in your Etsy shop.","Create a separate product specifically for Listing Factory."]},{heading:"Set up the product in Printify",copy:"The temporary artwork is only used to save the placement. It will not be used for your Listing Factory batches.",steps:["Choose the product you want to sell.","Choose its print provider.","Add temporary artwork.","Size and position the artwork exactly where you want future designs placed.","Publish the product from Printify to your connected Etsy shop."],after:"You do not need to finish every listing choice in Printify. Inside Listing Factory, you will choose the colors, sizes, prices, shipping profile, listing photos, mockups, titles, tags, description, Etsy details, and personalization."},{heading:"Copy the correct Printify URL",copy:"After the product has been published:",steps:["Open My Products in Printify.","Select the product.","Open its design editor—the screen where you can see and adjust the artwork placement.","Copy the complete URL from your browser’s address bar.","Paste that URL into Goldie."]},{heading:"Do not use",copy:"Only copy and paste the complete URL specifically from the Printify design editor. Do not use:",bullets:["The Etsy listing URL","Your Etsy storefront URL","The Printify My Products page URL","A public product URL","Only the Printify product ID"]},{heading:"After you save the product",copy:"Your saved product will keep working if the original Etsy listing sells out, becomes inactive, or is deleted. Just keep the product in Printify."},{heading:"Creating a product bundle?",copy:"Choose a bundle when you want to place every uploaded design on two to four saved products—for example, a T-shirt, sweatshirt, and hoodie. You will upload each design once. Goldie will create a separate listing for each product and guide you through its settings separately."}]},
  {title:"Add finished artwork",intro:"This batch becomes one listing per uploaded design for the selected product.",sections:[{heading:"Use production-ready files",copy:"Upload PNG or JPG artwork, not mockup photos. Use transparent PNGs when the background should not print."},{heading:"Upload in more than one round",copy:"Choosing another folder or more individual files adds them to the existing batch. It does not replace earlier uploads. Exact duplicate files are skipped."},{heading:"Check resolution",copy:"Goldie reads the original pixel dimensions without reducing DPI. If artwork falls below Printify’s recommendation for the selected product, review the warning before continuing."},{heading:"Batch limits",copy:"Each batch can contain up to 20 designs, with a maximum of 100 MB per individual design."}]},
  {title:"Review prices and shipping",intro:"Set the buyer-facing item prices and confirm the Etsy shipping profile before any Printify drafts are created.",sections:[{heading:"Use the profit goal",copy:"Goldie calculates a recommended price for every exact Printify product cost using the Etsy fee settings shown in the calculation details. Buyer-paid shipping stays separate from item profit."},{heading:"Edit matching-cost groups",copy:"Variants with the exact same Printify cost share one price field. More expensive colors, sizes, materials, finishes, or other options remain separate automatically."},{heading:"Choose shipping",copy:"Keep the shipping profile imported from the saved product, or create a named copy with different domestic, additional-item, or international charges."},{heading:"Approve the result",copy:"Review the lowest estimated profit in every group. Buyer-paid shipping, Offsite Ads, and sales tax are excluded from item profit because they are separate or vary by order."}]},
  {title:"Create the Printify drafts",intro:"This creates one unpublished Printify product draft for every uploaded design.",sections:[{heading:"What Goldie copies",copy:"Goldie copies the selected product, enabled variants, artwork placement, approved prices, and uploaded design into each new draft."},{heading:"What this does not do",copy:"The products are not published to Etsy at this point. They remain unpublished Printify drafts while you finish titles, Etsy details, and images."},{heading:"Keep the page open",copy:"Large artwork and large batches can take time. Goldie processes the batch safely and shows progress as each draft is completed."},{heading:"If one draft fails",copy:"Goldie keeps successful drafts and identifies the failed design so it can be retried without duplicating the completed products."}]},
  {title:"Create titles, tags, and descriptions",intro:"Finish the searchable words and buyer-facing description for every listing.",sections:[{heading:"Start with a validated keyword bank",copy:"Goldie only uses exact phrases from the bank you choose. It does not invent or add keywords."},{heading:"Review AI judgment",copy:"Goldie chooses the phrases it believes fit each design, but it cannot rescue a mismatched keyword bank. Review every title and change anything that does not fit."},{heading:"Edit listings independently",copy:"You can rebuild or manually edit one title and its tags without changing any other listing in the batch."},{heading:"Use the shared description",copy:"The batch description comes from the saved product. Edit it once for every listing, then add an individual override only where a specific design needs different wording."}]},
  {title:"Review Etsy details",intro:"Goldie pre-fills the fields it can confidently match. You remain responsible for confirming that every choice is accurate.",sections:[{heading:"Verify the category first",copy:"Changing the Etsy category changes the product fields that Etsy requires and offers. Correct the category before editing the fields beneath it."},{heading:"Check every selected attribute",copy:"Review materials, style, occasion, recipient, room, and other product-specific choices. Optional fields should stay blank when there is no clear match."},{heading:"Add personalization only when needed",copy:"Personalization can collect buyer text, a dropdown choice, or files. Make each question specific, set whether it is required, and stay within the limits shown."},{heading:"Save all listings",copy:"Goldie will not continue until the required Etsy details are complete for every listing in the batch."}]},
  {title:"Choose and arrange listing images",intro:"Every listing needs at least one image. This step combines real Printify product images, photos you upload, and an optional size guide.",sections:[{heading:"Review the real Printify placement",copy:"Open a draft in Printify when the artwork needs resizing or repositioning."},{heading:"Choose Printify photos",copy:"Select the flatlays and product views that belong on the listing. Apply the same selection to every listing only when those photos make sense for the entire batch."},{heading:"Upload your own photos",copy:"Add any finished lifestyle mockups or other listing photos you already have. Uploads stay with that exact listing."},{heading:"Set the Etsy order",copy:"Drag images into the order buyers should see. You can arrange this separately for every listing."}]},
  {title:"Complete the final review",intro:"This is the last checkpoint before the listings are published live on Etsy.",sections:[{heading:"Open every listing summary",copy:"Review the title, tags, description, Etsy details, prices, shipping, and selected images. Use the edit buttons to return to any unfinished section."},{heading:"Understand the publish action",copy:"The final action publishes live Etsy listings. It does not create Etsy drafts. Goldie shows a second confirmation before publishing begins."},{heading:"Do not close the page",copy:"Publishing may be queued briefly to protect Etsy’s shared API limits. Keep the page open until Goldie confirms the result or tells you the batch is safely queued."},{heading:"Review the receipt",copy:"After publishing, Goldie shows how many listings went live and what was completed. Use the Etsy links to inspect the live listings."}]},
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

   Draft creation stays at MAX_CONCURRENT_DESIGNS - it uploads full-resolution
   artwork, so it is bounded by memory rather than by provider latency, and it
   has not been measured. */
const BACKGROUND_ETSY_CONCURRENCY = 2;
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
  /* Product facts are authoritative for physical attributes. AI-prepared or
     restored values may fill fields Goldie cannot prove, but they must never
     overwrite a fact the Printify product settles (the live failure was a
     hoodie restored as "Short sleeve" and then marked ready). */
  return {...Object.fromEntries(Object.entries(saved||{}).filter(([key,value])=>PHYSICAL_ETSY_FIELDS.test(key)&&String(value??"").trim()).map(([key,value])=>[key,String(value)])),...derived};
}
function isRigidPaperProduct(template:TemplateDetails|null){return /poster|print|canvas|paper/i.test(`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`)}
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
function PrintifyImageTile({src,index,selected,atLimit,onToggle,onExpand}:{src:string;index:number;selected:boolean;atLimit:boolean;onToggle:()=>void;onExpand:()=>void}){
  const [state,setState]=useState<"loading"|"ready"|"failed">("loading"),[attempt,setAttempt]=useState(0);
  const retrySrc=attempt?`${src}${src.includes("?")?"&":"?"}goldie_retry=${attempt}`:src;
  return <div className={`printify-image-option ${selected?"selected":""} ${state==="loading"?"is-loading":state==="failed"?"is-failed":"is-ready"}`}><label className="printify-photo-selector"><input type="checkbox" checked={selected} disabled={state!=="ready"||(!selected&&atLimit)} onChange={onToggle}/><span aria-hidden="true">{selected?"✓":""}</span><span className="sr-only">Select Printify photo {index+1}</span></label><button type="button" className="printify-photo-expand" disabled={state!=="ready"} onClick={onExpand} aria-label={`View ${printifyViewName(src)||`Printify photo ${index+1}`} larger`}><span className="printify-photo-loading" aria-live="polite">{state==="loading"?"Loading photo…":state==="failed"?"Photo unavailable":""}</span><img key={attempt} src={retrySrc} alt={printifyViewName(src)||`Printify product mockup ${index+1}`} loading="lazy" decoding="async" onLoad={()=>setState("ready")} onError={()=>setState("failed")}/></button>{state==="failed"?<button type="button" className="printify-photo-retry" onClick={()=>{setState("loading");setAttempt(value=>value+1)}}>Retry</button>:null}</div>;
}
function PrintifyImagePicker({ images,indices,reservedPhotos=0,onApplyOne,onApplyAll,onSaveRecipe,bare }: { images: string[];indices:number[];reservedPhotos?:number;onApplyOne:(indices:number[])=>void;onApplyAll:(indices:number[])=>void;bare?:boolean;onSaveRecipe?:(indices:number[])=>void|Promise<void> }) {
  const [selected,setSelected]=useState<Set<number>>(new Set(indices.slice(0,Math.max(0,20-reservedPhotos)))),[expanded,setExpanded]=useState<string>(""),[showAll,setShowAll]=useState(false),[action,setAction]=useState<"clear"|"all"|"future"|"">(""),[feedback,setFeedback]=useState(""),[savingFuture,setSavingFuture]=useState(false);
  useEffect(()=>setSelected(new Set(indices.slice(0,Math.max(0,20-reservedPhotos)))),[indices,images.length,reservedPhotos]);
  if(!images.length)return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>;
  const chosen=[...selected].sort((a,b)=>a-b),selectionHint=chosen.length?"":"Select a Printify photo below first.",slotsLeft=Math.max(0,20-reservedPhotos-selected.size),atLimit=slotsLeft===0;
  function toggle(index:number){const next=new Set(selected);if(next.has(index))next.delete(index);else{if(atLimit){setFeedback("Etsy allows 20 listing photos. Remove a selected photo before adding another.");return}next.add(index)}setSelected(next);setAction("");setFeedback("");onApplyOne([...next].sort((a,b)=>a-b))}
  function deselect(){setSelected(new Set());setAction("clear");setFeedback("");onApplyOne([])}
  function applyAll(){if(!chosen.length)return;onApplyAll(chosen);setAction("all");setFeedback("✓ These Printify photos are now selected on every listing in this batch.")}
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
        <div className="printify-image-picker bare"><p>Etsy allows 20 listing photos total. Photos you upload and a size guide already chosen for this listing count toward that limit. Use the visible checkbox to select a photo.</p><div className="image-pref-actions"><button type="button" className={`clear ${action==="clear"?"confirmed":""}`} disabled={!chosen.length} onClick={deselect}>{action==="clear"&&<span className="action-check">✓</span>}<b>{action==="clear"?"Selections cleared":"Clear this listing’s selections"}</b><small>{selectionHint||"Remove every selected Printify photo from this listing only."}</small></button><button type="button" className={action==="all"?"confirmed":""} disabled={!chosen.length} onClick={applyAll}>{action==="all"&&<span className="action-check">✓</span>}<b>{action==="all"?"Applied to every listing":"Apply these photos to every listing"}</b><small>{selectionHint||"Choose the same Printify photos across the entire batch."}</small></button></div>{feedback&&<p className="image-pref-feedback" role="status">{feedback}</p>}{/* D569 - measured on her hoodie: 96 tiles in one listing's picker, 192 in the
        panel, and only 12 distinct labels - "Front" sixteen times, "Back" sixteen
        times. Every tile is a real, different image (12 camera views across the 8
        colours she enabled), but a flat wall of 96 with a repeated one-word label
        is not something anyone can choose 20 photos from. Grouped by the view,
        which is the one thing the URL tells us for certain. Colour is NOT
        labelled: Printify's image order need not follow her colour order, and a
        Cocoa hoodie labelled "White" is worse than one labelled only "Front". */}
      {(()=>{
        const groups:Array<[string,Array<[string,number]>]>=[];
        images.forEach((src,index)=>{
          const view=printifyViewName(src)||"Other photos";
          const found=groups.find(entry=>entry[0]===view);
          if(found)found[1].push([src,index]);else groups.push([view,[[src,index]]]);
        });
        /* D688 · This tested for the WORD front or back anywhere in the view name,
           so "Model 1 front", "Model 1 back", "Model 2 front" and "Model 2 back"
           all matched it. The collapsed default has been showing six camera
           groups - eighteen photos - since D682, while its own button correctly
           said "Show 9 more". Her instruction was "just show the basic front and
           back flat lays. And then underneath that, link the rest of all the
           options of printify photos." Anchored, so the view has to BE front or
           back, not merely contain the word. A group holding a photo she has
           already chosen stays visible either way - that clause is untouched. */
        const defaults=groups.filter(([view,items])=>/^(front|back)$/i.test(view.trim())||items.some(([,index])=>selected.has(index)));
        const visible=showAll?groups:(defaults.length?defaults:groups.slice(0,2));
        const hiddenCount=groups.filter(group=>!visible.includes(group)).reduce((total,[,items])=>total+items.length,0);
        return <><div className="printify-view-groups">{visible.map(([view,items])=><div className="printify-view-group" key={view}>
          <p className="printify-view-heading">{view}<span>{items.length} {items.length===1?"colour":"colours"}</span></p>
          <div className="printify-image-grid">{items.map(([src,index])=><PrintifyImageTile key={src} src={src} index={index} selected={selected.has(index)} atLimit={atLimit} onToggle={()=>toggle(index)} onExpand={()=>setExpanded(src)}/>)}</div></div>)}</div>{hiddenCount>0||showAll?<button type="button" className={`printify-more-toggle${showAll?" is-open":""}`} onClick={()=>setShowAll(value=>!value)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg><span>{showAll?"Show fewer Printify photos":`Show ${hiddenCount} more Printify photos`}</span></button>:null}</>})()}</div>{lightbox}</>;
}

function UploadedDesignPreview({src,name}:{src:string;name:string}){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="uploaded-design-preview" onClick={()=>setOpen(true)} aria-label={`View ${name} larger`}><img src={src} alt="" loading="lazy" decoding="async"/></button>{open&&typeof document!=="undefined"?createPortal(<div className="printify-photo-lightbox" role="dialog" aria-modal="true" aria-label={`Full-size preview of ${name}`} onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><button type="button" onClick={()=>setOpen(false)} aria-label="Close design preview">×</button><img src={src} alt={`Full-size preview of ${name}`}/></div>,document.body):null}</>;
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

function PriceField({value,minimum,label,onCommit}:{value:number;minimum:number;label:string;onCommit:(cents:number)=>void}){const [draft,setDraft]=useState((value/100).toFixed(2)),[confirmed,setConfirmed]=useState(false);useEffect(()=>setDraft((value/100).toFixed(2)),[value]);function commit(){const amount=Number(draft);if(!Number.isFinite(amount)){setDraft((value/100).toFixed(2));return}const cents=Math.round(Math.max(minimum,amount)*100);onCommit(cents);setDraft((cents/100).toFixed(2));setConfirmed(true);window.setTimeout(()=>setConfirmed(false),520)}return <label className={confirmed?"price-confirmed":""} aria-label={label}>$<input type="text" inputMode="decimal" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.currentTarget.blur()}if(event.key==="Escape"){setDraft((value/100).toFixed(2));event.currentTarget.blur()}}}/></label>}

/* D236 · A panel opened from a product-card row must not re-announce itself. The
   row above it already reads "Colors · Pick colors · 39 available"; the panel was
   then repeating "Colors" as a 22px card title plus a second count badge. inCard
   drops the panel's own head and keeps one line of helper text. */
function ProductColorSelector({product,selected,onChange,onRemember,remembering,remembered,inCard}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean;inCard?:boolean}){
  const colors=product.colorOptions||[],available=colors.filter(color=>color.available),selectedSet=new Set(selected),[expanded,setExpanded]=useState(inCard?true:!remembered);
  if(!colors.length)return <section className="product-color-selector no-colors"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>This product has no separate color choices.</h3><span>Goldie will keep the valid variants from the saved Printify product.</span></div></section>;
  function toggle(id:number){const next=new Set(selectedSet);if(next.has(id))next.delete(id);else next.add(id);onChange([...next])}
  const selectedColors=colors.filter(color=>selectedSet.has(color.id));
  /* First-run framing now lives above the product controls and is persisted by
     setupComplete. Keep this reusable selector free of parent-only state. */
  const productFirstRun=false;
  return <section className="product-color-selector" aria-label={`Choose colors for ${product.blueprintTitle}`}>{inCard?<p className="panel-help">Every change saves to this product automatically.</p>:<div className="color-selector-head"><div><p className="mini-label">COLORS FOR THIS BATCH</p><h3>Colors</h3><span>{productFirstRun?"Choose the colors you want to offer, then save them as this product's default.":remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selected.length} selected</b></div>}{!expanded&&selectedColors.length>0&&<div className="remembered-color-row">{selectedColors.map(color=><span key={color.id}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/>{color.title}</span>)}<button type="button" onClick={()=>setExpanded(true)}>Change colors</button></div>}{expanded&&<><div className="color-choice-grid">{colors.map(color=><button type="button" key={color.id} disabled={!color.available} aria-pressed={selectedSet.has(color.id)} onClick={()=>toggle(color.id)} className={selectedSet.has(color.id)?"selected":""}><i style={{background:color.swatch||"linear-gradient(135deg,#f8e7ef,#caa4d8)"}}/><span>{color.title}</span>{selectedSet.has(color.id)&&<em>✓</em>}{!color.available&&<small>Unavailable</small>}</button>)}</div><div className="color-selector-actions"><button type="button" onClick={()=>onChange(available.map(color=>color.id))}>Select all available</button><button type="button" onClick={()=>{const templateColors=(product.colorOptions||[]).filter(color=>color.available&&color.templateEnabled).map(color=>color.id);/* D315 · Sizes had "Match Printify template" and colours did not, though both
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

function ProductSizeSelector({product,selected,onChange,onRemember,remembering,remembered,inCard}:{product:TemplateDetails;selected:number[];onChange:(ids:number[])=>void;onRemember:()=>void;remembering:boolean;remembered:boolean;inCard?:boolean}){
  const sizes=product.sizeOptions||[],available=sizes.filter(size=>size.available),selectedSet=new Set(selected);
  /* A blueprint with no size axis (a mug, a sticker) renders nothing at all
     rather than an empty card. */
  if(!sizes.length)return null;
  function toggle(id:number){const next=new Set(selectedSet);if(next.has(id))next.delete(id);else next.add(id);onChange([...next])}
  return <section className="product-size-selector" aria-label={`Choose sizes for ${product.blueprintTitle}`}>
    {inCard?<p className="panel-help">Every change saves to this product automatically.</p>:<div className="size-selector-head"><div><p className="mini-label">SIZES FOR THIS BATCH</p><h3>Sizes</h3><span>{remembered?"From your last batch — change any.":"These changes apply to this batch unless you save them as the product default."}</span></div><b>{selected.length} selected</b></div>}
    <div className="size-choice-grid">{sizes.map(size=><button type="button" key={size.id} disabled={!size.available} aria-pressed={selectedSet.has(size.id)} onClick={()=>toggle(size.id)} className={selectedSet.has(size.id)?"selected":""}><span>{size.title}</span>{selectedSet.has(size.id)&&<em>✓</em>}{!size.available&&<small>Unavailable</small>}</button>)}</div>
    <div className="size-selector-actions"><button type="button" onClick={()=>onChange(available.map(size=>size.id))}>Select all available</button><button type="button" onClick={()=>{const templateSizes=(product.sizeOptions||[]).filter(size=>size.available&&size.templateEnabled).map(size=>size.id);
                /* D213 · This used to fall back to every available size when the
                   template had none enabled, so a button reading "Match Printify
                   template" quietly selected the whole blueprint. If there is
                   nothing to match, match nothing and let the seller choose. */
                onChange(templateSizes)}}>Match Printify template</button><button type="button" onClick={()=>onChange([])}>Clear all</button>{/* D318 · Colours had Clear all and sizes did not. Both pickers now offer the
                  same three actions in the same order: Select all available,
                  Match Printify template, Clear all. */}{inCard?<span className={`default-saved-state${remembered?" saved":""}`}>{remembered?"✓ Saved as this product’s default":"Saving…"}</span>:<button type="button" className={remembered?"remembered":""} disabled={!selected.length||remembering||remembered} onClick={onRemember}>{remembering?"Saving…":remembered?"✓ Saved for this product":"Save these as this product’s default sizes"}</button>}</div>
    {!selected.length&&<p className="size-required" role="alert">Choose at least one size before continuing.</p>}
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
  try{const response=await fetch(design.previewUrl);if(!response.ok)throw new Error();return safeImagePreviewDataUrl(await response.blob(),1200,false)}catch{throw new Error("Goldie could not read the saved Printify preview. You can still write this listing manually.")}
}
async function autoTitleForDesign(design:DesignFile,keywords:string[],useCommas:boolean,template:TemplateDetails|null){const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"title",image:await designPreviewDataUrl(design),product:{blueprintTitle:template?.blueprintTitle,brand:template?.brand,model:template?.model},keywords,useCommas})}),payload=await response.json() as {title?:string;keywords?:string[];tags?:string[];titleWarning?:string;error?:string};if(!response.ok||!payload.title)throw new Error(payload.error||"Goldie could not create this title.");return {title:payload.title,keywords:payload.keywords||[],tags:payload.tags||[],titleWarning:payload.titleWarning||""}}

function IndividualAutoTitle({design,template,useCommas,initialBankId,paused,onApply}:{design:DesignFile;template:TemplateDetails|null;useCommas:boolean;initialBankId?:string;paused?:boolean;onApply:(title:string,tags:string[],titleWarning?:string)=>void}){const [bank,setBank]=useState<KeywordList|null>(null),[building,setBuilding]=useState(false),[message,setMessage]=useState("");async function build(){if(!bank)return;setBuilding(true);setMessage("");try{const result=await autoTitleForDesign(design,bank.keywords,useCommas,template);onApply(result.title,result.tags,result.titleWarning);setMessage(result.titleWarning||"✓ New title and separately ranked Etsy tags applied to this listing only.")}catch(error){setMessage(error instanceof Error?error.message:"Goldie could not create this title.")}finally{setBuilding(false)}}return <>{design.titleWarning&&<p className="title-match-warning" role="status">{design.titleWarning}</p>}{design.titleError&&<p className="field-error" role="alert">{design.titleError}</p>}<details className="individual-title-builder" onClick={event=>event.stopPropagation()}><summary>Create a different title with AI</summary><KeywordBank compact selectionOnly initialId={initialBankId||""} title="Keyword bank" copy="Goldie selects exact validated phrases from this bank. It never adds keywords." onSelect={setBank}/><button className="ai-title-button" title={paused?"This batch is open in another Goldie tab, so nothing built here would be kept.":!bank?"Choose a keyword bank first.":undefined} disabled={!bank||building||Boolean(paused)} onClick={()=>void build()}>{building?"Creating this title…":"Create title for this design"}</button>{message&&<p className="title-build-message" role="status">{message}</p>}<button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close title builder</button></details><IndividualManualTitle useCommas={useCommas} initialBankId={initialBankId} onApply={(title,tags)=>onApply(title,tags,"")}/></>}

function IndividualManualTitle({useCommas,initialBankId,onApply}:{useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[])=>void}){const [bankId,setBankId]=useState(initialBankId||""),[keywords,setKeywords]=useState<string[]>([]),[message,setMessage]=useState("");const title=keywords.join(useCommas?", ":" ");function add(keyword:string){setKeywords(current=>current.includes(keyword)?current:[...current,keyword]);setMessage("")}function apply(){if(!title)return;onApply(title,tagsFromTitle(keywords.join(", ")));setMessage("✓ Your title and matching tags were applied to this listing only.")}return <details className="individual-title-builder individual-manual-title" onClick={event=>event.stopPropagation()}><summary>Build this title yourself from a keyword bank</summary><KeywordBank compact initialId={bankId} title="Choose a keyword bank" copy="Click keywords in the order you want them for this listing." onSelect={list=>{setBankId(list?.id||"");setKeywords([]);setMessage("")}} onAdd={add}/><div className="individual-keyword-selection"><div><b>Selected keywords</b>{keywords.length>0&&<button type="button" onClick={()=>setKeywords([])}>Clear all</button>}</div>{keywords.length?<><div className="selected-keyword-chips">{keywords.map(keyword=><button type="button" key={keyword} onClick={()=>setKeywords(current=>current.filter(item=>item!==keyword))}>{keyword}<span>×</span></button>)}</div><div className="individual-title-preview"><small>Title preview</small><span>{title}</span></div><button type="button" className="apply-manual-title" onClick={apply}>Apply to this listing</button></>:<p>Choose a bank, then click the keywords you want to use.</p>}{message&&<p className="title-build-message" role="status">{message}</p>}</div></details>}

function PersonalizationEditor({value,onChange}:{value?:EtsyPersonalization;onChange:(value:EtsyPersonalization)=>void}){
  const enabled=Boolean(value?.enabled),questions=value?.questions||[];
  function blank(type:PersonalizationQuestion["type"]="text_input"):PersonalizationQuestion{return{id:crypto.randomUUID(),type,question:type==="text_input"?"Personalization":"",instructions:"",required:false,maxCharacters:256,maxFiles:1,options:type==="dropdown"?["Option 1","Option 2"]:[]}}
  function update(id:string,patch:Partial<PersonalizationQuestion>){onChange({enabled:true,questions:questions.map(question=>question.id===id?{...question,...patch}:question)})}
  function toggle(next:boolean){onChange({enabled:next,questions:next?(questions.length?questions:[blank()]):questions})}
  return <section className="personalization-editor"><div className="personalization-heading"><div><b>Personalization</b><small>Let buyers answer questions or upload files for this listing.</small></div><label className="personalization-switch"><input type="checkbox" role="switch" aria-label="Personalization" aria-checked={enabled} checked={enabled} onChange={event=>toggle(event.target.checked)}/><span>{enabled?"On":"Off"}</span></label></div>{enabled&&<><div className="personalization-questions">{questions.map((question,index)=><article key={question.id}><div className="personalization-question-head"><b>Question {index+1}</b><button type="button" onClick={()=>onChange({enabled:true,questions:questions.filter(item=>item.id!==question.id)})}>Remove</button></div><label>Answer type<select value={question.type} onChange={event=>{const type=event.target.value as PersonalizationQuestion["type"];update(question.id,{type,options:type==="dropdown"&&question.options.length<2?["Option 1","Option 2"]:question.options})}}><option value="text_input">Text answer</option><option value="dropdown">Dropdown choices</option><option value="unlabeled_upload">File upload</option></select></label><label>Question<input maxLength={120} value={question.question} placeholder="Example: What name should appear on the shirt?" onChange={event=>update(question.id,{question:event.target.value})}/></label>{question.type!=="dropdown"&&<label>Instructions <span>{question.instructions.length}/120</span><textarea rows={2} maxLength={120} value={question.instructions} placeholder="Tell the buyer exactly what to provide." onChange={event=>update(question.id,{instructions:event.target.value})}/></label>}{question.type==="text_input"&&<label>Maximum characters<IntegerField value={question.maxCharacters} min={1} max={1024} label="Maximum characters" onCommit={next=>update(question.id,{maxCharacters:next})}/></label>}{question.type==="unlabeled_upload"&&<label>Maximum files<IntegerField value={question.maxFiles} min={1} max={10} label="Maximum files" onCommit={next=>update(question.id,{maxFiles:next})}/></label>}{question.type==="dropdown"&&<label>Dropdown choices<textarea rows={3} value={question.options.join("\n")} placeholder={"Small\nMedium\nLarge"} onChange={event=>update(question.id,{options:event.target.value.split(/\r?\n/).slice(0,30)})}/><small>Enter one choice per line. Etsy allows up to 30 choices, with 20 characters per choice.</small></label>}<label className="personalization-required"><input type="checkbox" checked={question.required} onChange={event=>update(question.id,{required:event.target.checked})}/>Buyer must answer this question</label></article>)}</div>{questions.length<5&&<button type="button" className="add-personalization-question" onClick={()=>onChange({enabled:true,questions:[...questions,blank()]})}>Add another question</button>}<small className="personalization-note">Etsy allows up to five questions. Review every question before publishing.</small></>}</section>
}

function LegacyEtsyDetailsEditor({design,categories,onChange,onCategory}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>}){
  const details=design.etsy!,[loading,setLoading]=useState(false);
  const properties=details.properties||[],completed=properties.filter(property=>property.value.trim()),physical=completed.filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)),preview=physical.slice(0,3).map(property=>property.value).join(", ");
  async function choose(id:number){setLoading(true);try{await onCategory(id)}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:(details.properties||[]).map(item=>item.propertyId===property.propertyId?next:item)})}
  return <details className="etsy-details-editor"><summary><span><b>Etsy details</b><small>{(()=>{const required=properties.filter(property=>property.required),requiredDone=required.filter(property=>property.value.trim());return required.length?`${requiredDone.length} of ${required.length} required set`:`${completed.length} added · all optional`})()}{preview?` · ${preview}`:""}</small></span><em>Edit</em></summary><div className="etsy-details-editor-fields"><label>Etsy category<select value={details.taxonomyId||""} disabled={loading} onChange={event=>void choose(Number(event.target.value))}>{!details.taxonomyId&&<option value="">Choose an Etsy category</option>}{Boolean(details.taxonomyId)&&!categories.some(category=>category.id===details.taxonomyId)&&<option value={details.taxonomyId}>{details.category||"Category already chosen for this listing"}</option>}{categories.map(category=><option key={category.id} value={category.id}>{category.path}</option>)}</select></label>{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-grid">{properties.map(property=><label key={property.propertyId}>{property.label}{property.required&&<em>Required</em>}{property.possibleValues.length?<select value={property.valueId||""} onChange={event=>setProperty(property,event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input value={property.value} onChange={event=>setProperty(property,event.target.value)}/>}</label>)}</div><small className="optional-note">These are Etsy’s actual fields for the selected category. Optional fields can stay blank.</small><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></div><button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close Etsy details</button></details>
}

function LazyEtsyProperty({property,onValue}:{property:EtsyPropertySelection;onValue:(value:string)=>void}){
  const [open,setOpen]=useState(false);
  return <details className="etsy-lazy-property" open={open} onToggle={event=>setOpen((event.currentTarget as HTMLDetailsElement).open)}><summary><span>{property.label}{property.required&&<em>Required</em>}</span><b>{property.value||"Not set"}</b></summary>{open?<label>{property.possibleValues.length?<select value={property.valueId||""} onChange={event=>onValue(event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input value={property.value} onChange={event=>onValue(event.target.value)}/>}</label>:null}</details>;
}

function EtsyDetailsEditor({design,categories,onChange,onCategory}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>}){
  const details=design.etsy!,properties=details.properties||[],completed=properties.filter(property=>property.value.trim()),physical=completed.filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)),preview=physical.slice(0,3).map(property=>property.value).join(", ");
  const [loading,setLoading]=useState(false),[query,setQuery]=useState("");
  const matches=query.trim().length<2?[]:categories.filter(category=>category.path.toLowerCase().includes(query.trim().toLowerCase())).slice(0,30);
  async function choose(id:number){setLoading(true);try{await onCategory(id);setQuery("")}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:properties.map(item=>item.propertyId===property.propertyId?next:item)})}
  const required=properties.filter(property=>property.required),requiredDone=required.filter(property=>property.value.trim());
  return <details className="etsy-details-editor"><summary><span><b>Etsy details</b><small>{required.length?`${requiredDone.length} of ${required.length} required set`:`${completed.length} added · all optional`}{preview?` · ${preview}`:""}</small></span><em>Edit</em></summary><div className="etsy-details-editor-fields"><label>Etsy category<small>Current: {details.category||"None chosen"}</small><input type="search" value={query} placeholder="Search Etsy categories" onChange={event=>setQuery(event.target.value)} disabled={loading}/></label>{matches.length?<div className="etsy-category-results" role="listbox" aria-label="Matching Etsy categories">{matches.map(category=><button type="button" key={category.id} onClick={()=>void choose(category.id)}>{category.path}</button>)}</div>:query.trim().length>=2?<small>No matching Etsy categories.</small>:null}{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-list">{properties.map(property=><LazyEtsyProperty key={property.propertyId} property={property} onValue={value=>setProperty(property,value)}/>)}</div><small className="optional-note">Open only the Etsy fields you want to review. Optional fields can stay blank.</small><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></div><button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close Etsy details</button></details>;
}

function IndividualSizeGuide({productId,name,onSaved}:{productId:string;name?:string;onSaved:(name:string)=>void}){const picker=useRef<HTMLInputElement>(null),[status,setStatus]=useState(""),[saving,setSaving]=useState(false);async function save(file:File){if(saving)return;setSaving(true);setStatus(`Saving ${file.name}…`);try{const form=new FormData();form.set("productId",productId);form.set("kind","size-guide");form.set("file",file);const response=await fetch("/api/etsy/images",{method:"POST",body:form}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"This size guide could not be saved.");onSaved(file.name);setStatus(`✓ ${file.name} will be used for this listing.`)}catch(error){setStatus(error instanceof Error?error.message:"This size guide could not be saved.")}finally{setSaving(false)}}return <div className="individual-size-guide"><div><b>Size guide for this listing</b><small>{name||"Using the batch size guide"}</small></div><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void save(file)}}/><button type="button" aria-busy={saving} disabled={saving} onClick={()=>picker.current?.click()}>{saving?"Saving size guide…":name?"Replace custom size guide":"Use a different size guide"}</button>{status&&<p role="status">{status}</p>}</div>}

function DownloadListingPhotos({productId,name,indices}:{productId:string;name:string;indices:number[]}){const [downloading,setDownloading]=useState(false),[message,setMessage]=useState("");async function download(){if(downloading)return;setDownloading(true);setMessage("");try{const response=await fetch("/api/listing-photos/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,printifyImageIndices:indices})});if(!response.ok){const payload=await response.json() as {error?:string};throw new Error(payload.error||"These listing photos could not be downloaded.")}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`${name.replace(/[^a-z0-9._-]+/gi,"-").slice(0,90)||"listing"}-listing-photos.zip`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage("✓ Download ready.")}catch(error){setMessage(error instanceof Error?error.message:"These listing photos could not be downloaded.")}finally{setDownloading(false)}}return <div className="listing-photo-download"><div><b>Keep a local copy</b><small>Selected Printify photos and your uploaded photos in one ZIP.</small></div><button type="button" aria-busy={downloading} disabled={downloading} onClick={()=>void download()}>{downloading?"Preparing photos…":"Download this listing’s photos"}</button>{message&&<p role="status">{message}</p>}</div>}

function PricingReview({section="all",variants,pricing,prices,productName,profiles,selectedProfileId,templateShippingProfileId,profilesLoading,profilesError,approved,wholeNumber=false,onWholeNumber,onPricing,onPrices,onSelectProfile,onCreateProfile,onApprovalChange}:{variants:ProductVariant[];pricing:Pricing;prices:Record<string,number>;productName:string;section?:"all"|"prices"|"shipping";profiles:EtsyShippingProfile[];selectedProfileId:number;templateShippingProfileId:number;profilesLoading:boolean;profilesError:string;approved:boolean;wholeNumber?:boolean;onWholeNumber?:(value:boolean)=>void;onPricing:(value:Pricing)=>void;onPrices:(value:Record<string,number>)=>void;onSelectProfile:(id:number)=>void;onCreateProfile:(baseId:number,charge:number,additional:number,title:string,international:InternationalShippingRate[])=>Promise<void>;onApprovalChange:(ready:boolean)=>void}){
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
  useEffect(()=>{if(!selectedProfile||!variants.length)return;const stillUsingTemplatePrices=variants.every(variant=>(prices[String(variant.id)]??variant.templatePrice)===variant.templatePrice);if(!stillUsingTemplatePrices)return;const calculated=Object.fromEntries(variants.map(variant=>[String(variant.id),recommendedPrice(variant.cost,pricing)]));onPrices(normalizePricesByCost(variants,calculated));setRecommendationMessage("✓ Goldie calculated every price from your profit goal, product costs, and Etsy fees.")},[selectedProfile?.id,initialPriceSignature]);
  /* D320 · Prices shown on arrival were never calculated. The price map starts
     empty and every read falls through to `variant.templatePrice` — the retail
     price already on the Printify template — while the banner claimed Goldie had
     calculated them from the profit goal.

     D324 · The first fix never ran AT ALL. It was guarded on "only calculate if
     no price is set yet", but loading a product does this:

         setVariantPrices(... variant.templatePrice ...)

     so the map is full of Printify's own prices before the effect ever looks at
     it. That is where $55.84 against a $31.59 cost came from — it is not a
     calculation, it is what Printify has on the variant. Never assume an empty
     map means "nothing has decided this yet".

     The seed also ran once per variant set, which was wrong for a second
     reason: selectRecipe sets the target from the recipe, the seed ran at
     THAT number, and a later reset to the default 10 changed the goal without
     recalculating. The result was prices computed at $18.50 sitting under a goal
     reading $10 — two different costs both showing exactly $18.50 profit, which
     is the giveaway that they were calculated, just from the wrong number.

     Until pricing is approved or the seller edits a price by hand, the prices
     ARE the goal's output, so they follow it. After either, they are the
     seller's and nothing recomputes them. */
  /* D404 - Seed from the saved product so the toggle survives a refresh and a
     remount. Value-compared, so this cannot fight the seller's own click. */
  useEffect(()=>{setWholeNumberPricing(wholeNumber)},[wholeNumber]);
  /* D420 - The field was bound straight to the number, so clearing it made
     Number("") = 0, Math.max(0,0) = 0, and React wrote "0" back into the box.
     Everything typed after that landed behind the zero: clear the field, type 12,
     get "012". While the field has focus it holds exactly what was typed; the
     number is committed only when it parses, and the draft is dropped on blur so
     the box goes back to showing the real value. */
  const [profitDraft,setProfitDraft]=useState<string|null>(null);
  const manualPriceEdit=useRef(false);
  /* D350 · These deps were the objects themselves. That was fine while
     PricingReview rendered once with memoised props, but D334 renders it per
     bundle product and builds `variants` and `pricing` INLINE in the map — a new
     array and a new object on every render. New identity fired the effect, the
     effect set state, the state caused a render, and the render made new
     identities: an infinite loop that hung the page before it finished loading.
     Depend on the VALUES, so the effect runs when a price actually should
     change and not when React happens to re-render. */
  const variantKey=variants.map(variant=>`${variant.id}:${variant.cost}`).join(",");
  const pricingKey=`${pricing.targetProfit}|${pricing.etsyFeePercent}|${pricing.fixedFee}|${pricing.listingFee}`;
  const pricesKey=Object.keys(prices).sort().map(id=>`${id}:${prices[id]}`).join(",");
  useEffect(()=>{
    if(!variants.length||approved||manualPriceEdit.current)return;
    const wanted=Object.fromEntries(variants.map(variant=>[String(variant.id),wholePrice(recommendedPrice(variant.cost,pricing))]));
    const settled=normalizePricesByCost(variants,wanted);
    const drifted=variants.some(variant=>settled[String(variant.id)]!==prices[String(variant.id)]);
    if(drifted)onPrices(settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[variantKey,pricingKey,pricesKey,approved]);

  function changeProfit(value:number){const nextPricing={...pricing,targetProfit:Math.max(0,value)};onPricing(nextPricing);recalculate(nextPricing);}
  function changeCostGroupPrice(cost:number,cents:number){manualPriceEdit.current=true;const matching=variants.filter(item=>item.cost===cost),safeCents=Math.max(wholePrice(cents),cost),next={...prices};for(const item of matching)next[String(item.id)]=safeCents;onPrices(next);setRecommendationMessage(`✓ $${(safeCents/100).toFixed(2)} applied to all ${matching.length} ${matching.length===1?"variant":"variants"} with a $${(cost/100).toFixed(2)} Printify cost.`)}
  function changeIndividualPrice(variant:ProductVariant,cents:number){manualPriceEdit.current=true;/* D404 - This never set the flag, so the recalculate effect could snap a hand-typed variant price back to the goal. */onPrices({...prices,[String(variant.id)]:Math.max(wholePrice(cents),variant.cost)});setRecommendationMessage(`✓ ${variant.title} now has its own price. The rest of its cost group was not changed.`)}
  function toggleWholeNumberPricing(checked:boolean){setWholeNumberPricing(checked);onWholeNumber?.(checked);if(!checked)return;const rounded=Object.fromEntries(variants.map(variant=>{const current=prices[String(variant.id)]??variant.templatePrice;return[String(variant.id),Math.max(Math.ceil(current/100)*100,variant.cost)]}));onPrices(normalizePricesByCost(variants,rounded));setRecommendationMessage("✓ Every item price is now a whole number without dropping below the displayed profit goal.")}
  function chooseProfile(id:number){const profile=profiles.find(item=>item.id===id);onSelectProfile(id);resetProfileEditor(profile);if(profile)recalculate(pricing)}
  function changeInternational(index:number,field:"primary"|"additional",value:string){setCustomInternational(current=>current.map((rate,i)=>i===index?{...rate,[field]:value}:rate));markShippingEdit()}
  async function createProfile(){if(!selectedProfile)return;const charge=Number(customCharge),additional=Number(customAdditional),title=customProfileName.trim(),international=customInternational.map(rate=>({...rate,primary:Number(rate.primary),additional:Number(rate.additional)})),ratesValid=international.every(rate=>rate.primary>=0&&Number.isFinite(rate.primary)&&rate.additional>=0&&Number.isFinite(rate.additional));if(customCharge===""||customAdditional===""||!Number.isFinite(charge)||charge<0||!Number.isFinite(additional)||additional<0||!ratesValid||!title)return setProfileMessage("Name the profile and enter valid first-item and additional-item charges for every destination.");setSavingProfile(true);setProfileMessage("");try{await onCreateProfile(selectedProfile.id,charge,additional,title,international);setProfileMessage("✓ New Etsy shipping profile saved and selected.")}catch(error){setProfileMessage(error instanceof Error?error.message:"The shipping profile could not be saved.")}finally{setSavingProfile(false)}}
  const normalizedProfileSearch=profileSearch.trim().toLocaleLowerCase();
  /* D348 · Matches were left in shop order, so searching "hoodie" put the
     profile literally named "Hoodies" third behind two longer names that also
     contain the word. When someone types a word, the closest match to that word
     goes first: exact name, then names that start with it, then the rest. */
  const searchedProfiles=(()=>{
    const matches=profiles.filter(profile=>!normalizedProfileSearch||decodeProfileTitle(profile.title).toLocaleLowerCase().includes(normalizedProfileSearch));
    if(!normalizedProfileSearch)return matches;
    const rank=(profile:EtsyShippingProfile)=>{
      const title=decodeProfileTitle(profile.title).toLocaleLowerCase();
      if(title===normalizedProfileSearch)return 0;
      if(title.startsWith(normalizedProfileSearch))return 1;
      /* a whole-word hit beats the same letters buried inside another word */
      if(new RegExp(`\\b${normalizedProfileSearch.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(title))return 2;
      return 3;
    };
    return [...matches].sort((a,b)=>rank(a)-rank(b)||decodeProfileTitle(a.title).length-decodeProfileTitle(b.title).length);
  })();
  const attachedProfile=profiles.find(profile=>profile.id===attachedProfileId);
  const withoutAttached=searchedProfiles.filter(profile=>profile.id!==attachedProfile?.id);
  const recommendedProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="recommended");
  const relatedProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="related");
  const otherProfiles=withoutAttached.filter(profile=>shippingProfileGroup(profile.title,productName)==="other");
  const selectedProfileGroup=selectedProfile?shippingProfileGroup(selectedProfile.title,productName):"other";
  const selectedProfileNeedsReview=Boolean(selectedProfile&&selectedProfile.id!==attachedProfile?.id&&selectedProfileGroup!=="recommended");
  const selectedOutsideSearch=selectedProfile&&!searchedProfiles.some(profile=>profile.id===selectedProfile.id)?selectedProfile:null;
  /* D327 · The default is the shipping profile the PRINTIFY TEMPLATE uses for
     this product. Until the seller saves a choice of their own, that is what
     should already be selected — they change it only if they want to.

     D325 tried to do this from `attachedProfile`, which was a no-op: that value
     is derived from selectedProfileId, so when nothing was selected there was
     nothing to fall back to. The template's id is the real source, and it is
     validated against the seller's actual Etsy profiles first — an id that
     matches none of them must not be selected, which is the D231 deadlock. */
  useEffect(()=>{
    if(profilesLoading||selectedProfileId||!profiles.length)return;
    const fromTemplate=profiles.find(profile=>profile.id===Number(templateShippingProfileId||0));
    if(fromTemplate)onSelectProfile(fromTemplate.id);
  },[profilesLoading,selectedProfileId,profiles,templateShippingProfileId]);
  const templateProfile=profiles.find(profile=>profile.id===Number(templateShippingProfileId||0));
  const [comboOpen,setComboOpen]=useState(false);
  const comboRef=useRef<HTMLDivElement|null>(null);
  /* D319 · Clicking away closes the list, the way every other picker behaves. */
  useEffect(()=>{
    if(!comboOpen)return;
    const away=(event:MouseEvent)=>{if(comboRef.current&&!comboRef.current.contains(event.target as Node)){setComboOpen(false);setProfileSearch("")}};
    document.addEventListener("mousedown",away);
    return()=>document.removeEventListener("mousedown",away);
  },[comboOpen]);
  /* The same grouping the <optgroup>s used, so the ordering sellers already know
     survives the change of control. */
  const comboGroups=[
    {label:"Current selection",items:selectedOutsideSearch?[selectedOutsideSearch]:[]},
    {label:"Currently attached to this product",items:attachedProfile&&(!normalizedProfileSearch||searchedProfiles.some(profile=>profile.id===attachedProfile.id))?[attachedProfile]:[]},
    {label:`Recommended for ${productName}`,items:recommendedProfiles},
    {label:"Other apparel profiles",items:relatedProfiles},
    {label:"All other shipping profiles",items:otherProfiles},
  ];
  const renderProfileOptions=(items:EtsyShippingProfile[])=>items.map(profile=><option key={profile.id} value={profile.id}>{shippingProfileOptionLabel(profile)}</option>);
  return (
    <section className={"variant-pricing "+(approved?"approved":"")}>
      <div className="variant-pricing-head">
        <div>{/* D233 · Card titles name the thing, in the same voice as "Colors" and
            "Sizes". "Item prices + buyer-paid shipping" was a summary of its own
            two subsections, which are already titled below it. */}
        {section==="all"&&<h3>Pricing</h3>}</div>
        {section==="all"&&approved&&<span>✓ Approved</span>}
      </div>
      {(section==="all"||section==="prices")&&<section className="item-pricing-section"><div className="item-pricing-heading pricing-section-heading"><div><div className="heading-with-help"><h4>{section==="all"?"1. ":""}Item prices{section==="all"&&<span> · {productName}</span>}</h4><ContextHelp label="Explain item pricing" title="How grouped pricing works" intro="Goldie groups variants only when Printify charges the exact same product cost. This saves repetitive typing without taking away your control." sections={[{heading:"Set your profit goal",copy:"Enter the item profit you want left after the Printify product cost and Etsy fees. Buyer-paid shipping is configured and shown separately below."},{heading:"Change one matching-cost group",copy:"Editing the price on a group updates every variant with that exact Printify cost. A higher-cost color, size, material, finish, capacity, or model stays in a separate group automatically."},{heading:"Override one variant only",copy:"Open “View included variants” when one specific option needs a different retail price. That individual edit does not change the rest of its group."},{heading:"Review before continuing",copy:"The item profit shown includes product cost and the saved Etsy fee profile. It does not include buyer-paid shipping, Offsite Ads, or sales tax."}]}/></div><p>Variants with the exact same Printify product cost share one price. Item profit includes the Printify product cost and Etsy fees.</p></div><div className="pricing-heading-actions"><label className="whole-pricing-toggle"><input type="checkbox" checked={wholeNumberPricing} onChange={event=>toggleWholeNumberPricing(event.target.checked)}/><span aria-hidden="true"/><b>Create whole-number pricing</b></label><div className="profit-goal-control"><label>Profit goal<span className="money-input">$<input aria-label="Profit goal" type="number" min="0" step="0.01" value={profitDraft??String(pricing.targetProfit)} onChange={event=>{const raw=event.target.value;setProfitDraft(raw);const parsed=Number(raw);if(raw!==""&&Number.isFinite(parsed))changeProfit(parsed)}} onBlur={()=>setProfitDraft(null)}/></span><small>Prices update automatically.</small></label></div></div></div>{recommendationMessage&&<p className="recommendation-result" role="status">{recommendationMessage}</p>}
      <div className="price-group-list">{priceGroups.map(group=>{const groupPrices=group.items.map(variant=>prices[String(variant.id)]??variant.templatePrice),groupPrice=Math.max(...groupPrices),profits=group.items.map(variant=>estimatedProfit(groupPrice,variant.cost,pricing)),lowestProfit=Math.min(...profits),examples=group.items.map(item=>item.title).filter(Boolean);return <article className="price-group" key={group.cost}>
        <div className="price-group-row"><div className="price-group-variants"><b>{group.items.length} {group.items.length===1?"variant":"variants"}</b><small>{examples.slice(0,2).join(" · ")}{examples.length>2?` · +${examples.length-2} more`:""}</small></div><div><small>Printify product cost</small><b>${(group.cost/100).toFixed(2)}</b></div><div><small>Your item price</small><PriceField value={groupPrice} minimum={group.cost/100} label={`Price for all variants costing $${(group.cost/100).toFixed(2)}`} onCommit={cents=>changeCostGroupPrice(group.cost,cents)}/></div><div className={lowestProfit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}><small>Lowest estimated item profit</small><b>${lowestProfit.toFixed(2)}</b><small className="profit-fee-note">Shipping not included</small></div></div>
        <details className="price-group-details"><summary>View included variants or edit one separately</summary><div className="individual-variant-list">{group.items.map(variant=>{const itemCents=prices[String(variant.id)]??variant.templatePrice,profit=estimatedProfit(itemCents,variant.cost,pricing);return <div key={variant.id}><span><b>{variant.title}</b><small>Printify cost ${(variant.cost/100).toFixed(2)}</small></span><PriceField value={itemCents} minimum={variant.cost/100} label={`Individual price for ${variant.title}`} onCommit={cents=>changeIndividualPrice(variant,cents)}/><span className={profit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}><b>${profit.toFixed(2)} item profit</b><small>Shipping not included</small></span></div>})}</div><button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close variants</button></details>
      </article>})}</div>
      {/* D303 · The ✓ line at the top of this card already says Goldie calculated
            every price from the profit goal, product costs and Etsy fees. This
            expander then explained the same thing again at length. The prose is
            gone; the fee figures and the link to change them stay, because those
            are a control, not an explanation. */}
            <div className="fee-profile-summary"><span>{pricing.etsyFeePercent.toFixed(1)}% Etsy percentage fees</span><span>${pricing.fixedFee.toFixed(2)} payment fee</span><span>${pricing.listingFee.toFixed(2)} listing fee</span><a href="/usage" target="_blank" rel="noopener noreferrer">Change fee settings ↗</a></div>
      </section>}
      {(section==="all"||section==="shipping")&&<section className="shipping-pricing-section">
      <div className="pricing-section-heading shipping-section-heading"><div><div className="heading-with-help"><h4>{section==="all"?"2. ":""}Etsy shipping profile{section==="all"&&<span> · {productName}</span>}</h4><ContextHelp label="Explain shipping profiles" title="Choose the shipping buyers will see on Etsy" intro="Goldie starts with the Etsy shipping profile attached to your saved product. You can keep it or create a new reusable copy for this batch." sections={[{heading:"Keep the saved profile",copy:"If the first-item, additional-item, and international rates are already correct, leave the selected profile unchanged."},{heading:"Create a custom profile",copy:"Open the optional custom-profile section, name the new profile, and edit any domestic or international charge. Goldie creates a copy. Your original Etsy profile is not changed."},{heading:"Understand first and additional item",copy:"First item is what a buyer pays for one product. Additional item is the extra shipping charge when the same order contains another eligible product."},{heading:"Separate from item profit",copy:"Shipping is configured here and charged to the buyer separately. It does not change the item-profit figures in the pricing section above."}]}/></div><p>{selectedProfileId?"Goldie starts with the shipping profile already used for this product. Change it only if needed.":"This product has no Etsy shipping profile yet. Pick the one buyers should see."}</p></div></div>
      <div className="pricing-controls">
        <div className="shipping-profile-picker">
          {/* D319 · This was a native <select> with a separate search box above it.
              Typing filtered the <option> list — which you cannot see, because the
              dropdown is closed while you type. The only feedback was a line
              counting the matches, so the search appeared to do nothing and
              connect to nothing. A native select cannot be filtered while open;
              the control has to own its own list. */}
          <div className="shipping-combobox" ref={comboRef}>
            <span className="shipping-combobox-label" id="shipping-combobox-label">Etsy shipping profile</span>
            <button type="button" className="shipping-combobox-trigger" disabled={profilesLoading}
              aria-haspopup="listbox" aria-expanded={comboOpen} aria-labelledby="shipping-combobox-label"
              onClick={()=>setComboOpen(open=>!open)}>
              <span>{profilesLoading?"Loading your shipping profiles…":selectedProfile?shippingProfileOptionLabel(selectedProfile):templateProfile?shippingProfileOptionLabel(templateProfile):"Choose your Etsy shipping profile"}</span>
              <em aria-hidden="true">⌄</em>
            </button>
            {comboOpen&&<div className="shipping-combobox-panel">
              <input className="shipping-combobox-search" type="search" autoFocus value={profileSearch}
                placeholder={`Search ${profiles.length} shipping profiles`} aria-label="Search shipping profiles"
                onChange={event=>setProfileSearch(event.target.value)}
                onKeyDown={event=>{if(event.key==="Escape"){setComboOpen(false);setProfileSearch("")}}}/>
              <div className="shipping-combobox-list" role="listbox" aria-labelledby="shipping-combobox-label">
                {comboGroups.map(group=>group.items.length>0&&<Fragment key={group.label}>
                  <p className="shipping-combobox-group">{group.label}</p>
                  {group.items.map(profile=><button type="button" role="option" key={profile.id}
                    aria-selected={profile.id===selectedProfileId}
                    className={`shipping-combobox-option${profile.id===selectedProfileId?" selected":""}`}
                    onClick={()=>{chooseProfile(profile.id);setComboOpen(false);setProfileSearch("")}}>
                    {shippingProfileOptionLabel(profile)}
                  </button>)}
                </Fragment>)}
                {!searchedProfiles.length&&<p className="shipping-combobox-empty" role="status">
                  No shipping profiles match “{profileSearch.trim()}”.
                </p>}
              </div>
              {normalizedProfileSearch&&searchedProfiles.length>0&&<p className="shipping-combobox-count">
                {searchedProfiles.length} of {profiles.length} profiles
              </p>}
            </div>}
          </div>
        </div>
      </div>
      {profilesError&&<div className="shipping-api-note error"><b>Shipping profiles could not be loaded.</b><span>{profilesError}</span></div>}
      {selectedProfile&&<>{selectedProfileNeedsReview&&<div className="shipping-profile-family-warning" role="status"><b>Double-check this profile for {productName}.</b><span>Its name does not clearly match this product type. Goldie has not changed it; confirm the buyer charges below before approving.</span></div>}{/* D232 · Three chips — "Etsy buyer charge", "Printify shipping cost — what you
           pay", "International buyer charges" — restated numbers the dropdown option
           already shows ("· $4.75 first · $2.40 additional"). The one figure that is
           NOT visible elsewhere is the shortfall against Printify's cost, and that
           has its own warning below and stays. */}{shippingShortfall>.004?<div className="shipping-rate-warning" role="alert"><b>Your Etsy buyer charge is ${shippingShortfall.toFixed(2)} below Printify’s current shipping cost.</b><span>Printify may charge up to ${printifyShipping.toFixed(2)} while the buyer pays ${selectedProfile.domesticPrimary.toFixed(2)}. You would cover the difference.</span></div>:<div className="shipping-rate-confirmation"><b>✓ The Etsy buyer charge covers Printify’s current shipping cost.</b>{/* D358 · "Shipping remains separate from the item-profit calculation above"
                     appeared on both branches of this notice, and the pricing card says
                     the same thing twice more. Nobody assumes item profit includes
                     shipping; the app kept insisting on it. */}</div>}</>}
      {selectedProfile&&<details className="custom-shipping-builder"><summary>{customDirty?"⚠ Unsaved shipping changes":"Create a custom shipping profile (optional)"}</summary><div className="custom-shipping-body"><div className="shipping-builder-intro"><b>Create a copy. Your original profile will not change.</b><span>Name it, adjust any rates you want, then save it. Goldie will select the new profile for this batch.</span></div><label><span>1. Name your new shipping profile<small>This name will appear in Etsy and in Goldie next time.</small></span><b className="shipping-profile-name-label">Profile name</b><input aria-label="New shipping profile name" placeholder={`Example: ${selectedProfile.title}, $4 US shipping`} value={customProfileName} maxLength={60} onChange={event=>{setCustomProfileName(event.target.value);markShippingEdit()}}/></label><h5>2. Edit {selectedProfile.originCountry} shipping</h5><div className="shipping-rate-row"><b>Domestic</b><label>First item<span className="money-input">$<input inputMode="decimal" value={customCharge} onChange={event=>{setCustomCharge(event.target.value);markShippingEdit()}}/></span></label><label>Additional<span className="money-input">$<input inputMode="decimal" value={customAdditional} onChange={event=>{setCustomAdditional(event.target.value);markShippingEdit()}}/></span></label></div><details className="international-shipping-editor"><summary>3. Edit international rates (optional) · {customInternational.length} destinations</summary>{customInternational.length?<div className="international-rate-list">{customInternational.map((rate,index)=><div className="shipping-rate-row" key={rate.key}><b>{rate.label}</b><label>First item<span className="money-input">$<input aria-label={`${rate.label} first item`} inputMode="decimal" value={rate.primary} onChange={event=>changeInternational(index,"primary",event.target.value)}/></span></label><label>Additional<span className="money-input">$<input aria-label={`${rate.label} additional item`} inputMode="decimal" value={rate.additional} onChange={event=>changeInternational(index,"additional",event.target.value)}/></span></label></div>)}</div>:<p className="no-international-rates">No international destinations.</p>}<button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close international rates</button></details>{customDirty?<div className="custom-shipping-actions"><button aria-busy={savingProfile} disabled={savingProfile} onClick={()=>void createProfile()}>{savingProfile?"Saving shipping profile…":"Save new shipping profile"}</button><button type="button" disabled={savingProfile} onClick={()=>resetProfileEditor()}>Discard changes</button></div>:<div className="shipping-saved-state">No changes made.</div>}{profileMessage&&<small role="status">{profileMessage}</small>}</div><button type="button" className="panel-collapse-foot" onClick={event=>{const box=(event.currentTarget as HTMLElement).closest("details");if(box){(box as HTMLDetailsElement).open=false;box.scrollIntoView({block:"nearest"})}}}>Close custom profile</button></details>}
      {/* D229 · This button gates the entire batch and used to read "Approve prices and shipping" while greyed out, whatever the reason. Measured live: a saved shipping profile that no longer exists on the shop left nothing selected, the button dead, and no message anywhere — the Images page pointed here and this page refused, with the seller stuck between them. */}
      {!selectedProfile&&selectedProfileId>0&&!profilesLoading&&<p className="shipping-profile-missing" role="status">{/* D458 - this claimed a saved profile had been deleted from her shop and told her to choose another "below", while sitting below the picker itself. On a product she had just created there was no saved profile to lose: the id came from Printify and simply does not match anything on the Etsy shop. Say that, and point the right way. */}Goldie could not match this product’s Printify shipping to a profile on your Etsy shop. Pick one above and it will be remembered.</p>}
      {/* D363 · Once approved there is nothing left to approve, so the button became
        a control that could not do anything — it sat there disabled-in-spirit,
        asking for an action already taken. Approved is a STATE, so it reads as
        one. Any change to prices, the goal or the profile clears approval, which
        brings the button back on its own. */}
      {approved
        ?<p className="pricing-approved-state" role="status"><span aria-hidden="true">✓</span> Prices and shipping approved</p>
        :<button type="button" className="pricing-approval-button" disabled={!selectedProfile||customDirty} onClick={()=>onApprovalChange(true)}>{customDirty?"Save or discard your custom profile to continue":!selectedProfile?"Choose a shipping profile to continue":"Approve prices and shipping"}</button>}
      </section>}
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

/* D237 · Every product-card row except Colours and Sizes was a dead button. The
   handler opened `.everything-else`, the block D232 deleted; querySelector
   returned null, the `if (block)` guard swallowed it, and the click did nothing
   — five dead controls on every card, on every build since D232. Nothing caught
   it because the tests assert markup strings, not that a click target exists.
   These destinations are data so the suite can check each one is rendered. */
/* D294 · "3/3 ready" sat above three rows each reading "0 of 1 required set".
   Both were correct about different things: the pill counted listings that HAVE
   an Etsy object, the rows counted required properties actually filled. One
   word, two meanings, on the screen that gates publishing. Ready now means what
   the rows already meant. */
/* D306 · "✓ Saved for this product" used to be a 2.6-second timer, so the
   confirmation vanished while the seller was still looking at it and the button
   went back to offering a save that had already happened. The honest signal is
   not "did a save just finish" but "does what is on screen match what is
   stored" — which stays true until a colour or size is actually changed, and
   flips back by itself the moment one is. */
export function sameIdSet(a:number[]|undefined,b:number[]|undefined):boolean{
  const left=[...new Set(a||[])].sort((x,y)=>x-y),right=[...new Set(b||[])].sort((x,y)=>x-y);
  return left.length>0&&left.length===right.length&&left.every((value,index)=>value===right[index]);
}

/* D544 - "Needs review" was all a listing said, and the one thing standing
   between her and step 4 was a single required Etsy field with no value. She had
   to open the row, then the details editor, then read down a list of properties
   to find which one. A row should say what is actually left. */
export function etsyMissingRequired(etsy:{properties?:Array<{required?:boolean;value?:string;label?:string}>}|null|undefined):string[]{
  if(!etsy)return[];
  return (etsy.properties||[]).filter(property=>property.required&&!(property.value||"").trim()).map(property=>property.label||"a required field");
}

export function etsyRequiredComplete(etsy:{properties?:Array<{required?:boolean;value?:string}>}|null|undefined):boolean{
  if(!etsy)return false;
  const required=(etsy.properties||[]).filter(property=>property.required);
  return required.every(property=>Boolean((property.value||"").trim()));
}

export const FACET_DESTINATION:Record<string,{step:WorkflowStep;selector:string}>={
  mockups:{step:"designs",selector:".mockup-default-block"},
  keywords:{step:"finish",selector:".keyword-bank"},
  etsy:{step:"finish",selector:".etsy-details-step"},
  shipping:{step:"setup",selector:".shipping-section-heading"},
  profit:{step:"setup",selector:".item-pricing-heading"},
};

export default function ListingFactoryApp() {
  const folderPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const sizeGuidePicker = useRef<HTMLInputElement>(null);
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
  /* D611 - what Goldie classifies the product by. Printify's own blueprint
     title, brand and model, never activeRecipe.name: that is the seller's
     nickname for her saved product and naming it "Bestie Drop" used to make the
     product unrecognisable, silently loosening the print-area bounds, the
     rendering mode and which scenes are offered.

     When the variant options identify the product outright - S/M/L, ounces,
     inches, phone models - that wins over any string at all. */
  const classifyingProductName = useMemo(() => {
    const label = printifyProductLabel(templateDetails);
    const family = familyFromVariants(templateDetails || {});
    /* The label still travels, for prompts and messages that read better with a
       real product name in them. The family is appended so every downstream
       reader agrees with the structured evidence rather than re-guessing. */
    const hint = family === "apparel" ? "apparel" : family === "curved" ? "mug" : family === "flat" ? "print" : "";
    return [label, hint].filter(Boolean).join(" ") || label;
  }, [templateDetails]);
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
  /* D653 · loadTemplateUrl records which Printify store a product came from, but
     it read `activeRecipe` from its closure - and chooseRecipe calls it in the
     same tick as setActiveRecipe, so the value it saw was the PREVIOUS recipe or
     null. Nothing was ever written: four saved products, four Printify stores,
     and every card still blank. A ref set during render always holds the current
     one, whatever a closure captured. */
  const activeRecipeRef=useRef<Recipe|null>(null);
  activeRecipeRef.current=activeRecipe;
  const [activeBundle,setActiveBundle]=useState<ProductBundle|null>(null);
  const [bundleRecipes,setBundleRecipes]=useState<Recipe[]>([]);
  const [bundleIndex,setBundleIndex]=useState(0);
  const [bundleColorProducts,setBundleColorProducts]=useState<Record<string,TemplateDetails>>({});
  /* D378 - Each bundle member is its own batch, created one after another by
     continueBundle. That was invisible while only one product showed at a time,
     but steps 2-4 now list every product as a card, and a card you cannot open
     is not a card. Remember which batch belongs to which product so any of them
     can be opened, not just the next one. */
  const [bundleBatchIds,setBundleBatchIds]=useState<Record<string,string>>({});
  /* D379 - Which card is being opened, so the one you clicked can say so and the
     rest cannot be clicked underneath a load already in flight. */
  const [switchingProduct,setSwitchingProduct]=useState("");
  const [wholeNumberByRecipe,setWholeNumberByRecipe]=useState<Record<string,boolean>>({});
  /* D378 - A closed card has to say where that product stands, and the honest
     source is the batch list Batch History already reads: status, draft count,
     published count. One fetch, refreshed when the bundle or its batches change. */
  /* D504 - bundleBatchSummaries is gone; one map answers for each product. */
  const [bundleColorChoices,setBundleColorChoices]=useState<Record<string,number[]>>({}),[bundleSizeChoices,setBundleSizeChoices]=useState<Record<string,number[]>>({}),[bundleMockupChoices,setBundleMockupChoices]=useState<Record<string,{theme:string;ids:string[]}>>({}),[bundleKeywordChoices,setBundleKeywordChoices]=useState<Record<string,string>>({});
  /* D328 · Pricing state was a single set of globals, so a bundle could only ever
     price the active product. These hold the other products' pricing. The active
     product keeps using the original state, so the single-product path — the one
     that is finally working — is untouched. */
  const [openPricing,setOpenPricing]=useState<string[]>([]);
  const [bundlePrices,setBundlePrices]=useState<Record<string,Record<string,number>>>({});
  const [bundlePricing,setBundlePricing]=useState<Record<string,Pricing>>({});
  const [bundleShipping,setBundleShipping]=useState<Record<string,number>>({});
  const [bundleApproved,setBundleApproved]=useState<Record<string,boolean>>({});
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
  const [openFacet,setOpenFacet]=useState<Record<string,string[]>>({});
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
    /* Once scored the answer is final, including the deliberate "" that means
       "no usable photo, draw the glyph". Check presence, not truthiness. */
    if(key in bestPhoto)return bestPhoto[key];
    if(!photoProbe.current.has(key)){
      photoProbe.current.add(key);
      void (async()=>{
        /* D200 · Score every candidate on subject isolation, not on how much of
           the frame it fills. See app/product-photo.ts for the measurements —
           the old "most ink wins" rule selected a macro shot of a folded corner
           and ranked the only usable flat lay last. All six are sampled now,
           not four: the winning tee shot was candidate #2 but the hoodie's was
           #4, so a slice(0,4) would have missed it. */
        /* D705 · The hoodie kept showing a model shot, and D370 recorded the
           reason as "all six blueprint candidates are model shots - the source
           has nothing better". That measurement was taken on a list the API had
           already cut down: /api/printify returned blueprint.images.slice(0,6),
           so "all six" was all six it was SHOWN, not all Printify has. The
           scorer was never given the chance to find a flat lay sitting at index
           six or later. Both ends now carry twelve. Scoring is cached per
           product id, so this costs one pass the first time a product is
           opened and nothing afterwards. */
        const shortlist=candidates.slice(0,12);
        const measurements:Array<ReturnType<typeof photoStats>|null>=[];
        for(const src of shortlist){
          const measured=await new Promise<ReturnType<typeof photoStats>|null>(resolve=>{
            const image=document.createElement("img"); image.crossOrigin="anonymous";
            image.onload=()=>{try{
              const size=PHOTO_SAMPLE_SIZE;
              const canvas=document.createElement("canvas"); canvas.width=size; canvas.height=size;
              const ctx=canvas.getContext("2d",{willReadFrequently:true});
              if(!ctx)return resolve(null);
              ctx.drawImage(image,0,0,size,size);
              resolve(photoStats(ctx.getImageData(0,0,size,size).data,size));
            }catch{resolve(null)}};
            image.onerror=()=>resolve(null);
            image.src=src;
          });
          measurements.push(measured);
        }
        /* D380 · Prefer a flat lay; fall back to the best photo there is, even a
           model shot, because a hoodie on a person still shows the hoodie. The
           glyph is only for products with no usable photo at all. */
        const choice=preferredPhotoIndex(measurements);
        setBestPhoto(current=>({...current,[key]:choice>=0?shortlist[choice]:""}));
      })();
    }
    /* Nothing until the score lands: a glyph that becomes a photo is calmer
       than a model shot that vanishes. */
    return "";
  }
  const [keywordBanks,setKeywordBanks]=useState<Array<{id:string;name:string}>>([]);
  useEffect(()=>{void fetch("/api/keyword-lists").then(r=>r.json()).then((payload:{lists?:Array<{id?:string;name?:string}>})=>setKeywordBanks((payload.lists||[]).map(list=>({id:String(list.id||""),name:String(list.name||"Bank")})).filter(list=>list.id))).catch(()=>undefined);},[]);
  /* Readiness is computed per product, never read from setupComplete. */
  function readinessFor(product:TemplateDetails,recipe:Recipe|null,approved?:boolean):Readiness{
    const compatible:string[]=[];
    return productReadiness({colorOptions:product.colorOptions||[],sizeOptions:product.sizeOptions||[],compatibleMockupThemes:compatible,keywordBanks,
      shippingProfiles:etsyShippingProfiles.map(profile=>({id:profile.id,title:friendlyShippingProfileTitle(profile.title)||String(profile.id)})),
      templateShippingProfileId:Number(product.shippingTemplateId)||0,
      etsyFieldsRequired:11,
      pricingApproved:approved,
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
    /* D463 - merge into the current recipe rather than the one this closure
       captured, for the same reason as saveProductDefaults. */
    setActiveRecipe(current=>current&&current.id===recipe.id?{...current,...change}:current);
    setBundleRecipes(current=>current.map(item=>item.id===recipe.id?{...item,...change}:item));
    /* D406 - This used to POST the whole merged recipe, so every call resent
       every field from whatever copy the closure had captured. Any write that
       fired after a newer one - a debounced price save, a slow request landing
       late - put its stale copy back over the newer value. Measured: setting the
       profit goal to 12 left the product reading $1, because the debounced price
       write carried an older targetProfit and landed last.

       The API preserves any key that is absent, so send only what changed. Same
       rule as D392, which fixed this from the saved-product form; establish had
       it too and it was the more dangerous of the two because it fires on nearly
       every edit. */
    await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:recipe.id,name:recipe.name,templateUrl:recipe.templateUrl,...change})}).catch(()=>undefined);
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
  /* The saved snapshot is not the authority on publication. A browser can miss
     its final autosave, and older snapshots predate per-listing receipts. Read
     completed publish items whenever a batch opens so Batch History and the
     opened batch cannot disagree about what is live. */
  useEffect(()=>{
    if(restoringBatch||!batchIdRef.current)return;
    let alive=true;
    void fetch(`/api/batches?id=${encodeURIComponent(batchIdRef.current)}`)
      .then(response=>response.ok?response.json():null)
      .then((payload:{authoritativeReceipt?:BatchReceipt|null}|null)=>{
        if(alive&&payload?.authoritativeReceipt?.publishedCount)setBatchReceipt(payload.authoritativeReceipt);
      }).catch(()=>undefined);
    return()=>{alive=false};
  },[restoringBatch]);
  /* D475 - when a publish failed, the only sign was a sentence at the very bottom
     of a long page saying how many listings "need your attention", with no reason
     and nothing to click. From the top of the page a failed publish and a
     successful one looked identical. */
  const [publishFailures,setPublishFailures]=useState<Array<{productId:string;error:string}>>([]);
  const [titleBuilding,setTitleBuilding]=useState(false);
  const [titleBuildMessage,setTitleBuildMessage]=useState("");
  const [batchKeywords,setBatchKeywords]=useState<string[]>([]);
  const [titleBuilderMode,setTitleBuilderMode]=useState<"ai"|"manual">("ai");
  const [autoTitleBank,setAutoTitleBank]=useState<KeywordList|null>(null);
  const [autoTitleBankId,setAutoTitleBankId]=useState("");
  const [manualKeywordBankId,setManualKeywordBankId]=useState("");
  const [blockingModal,setBlockingModal]=useState<{title:string;issues:string[];copy?:string}|null>(null);
  /* D519 - the guard below runs before either run state is declared, so the fact
     that a run is in progress lives in a ref both of them set. */
  const runInProgress=useRef(false);
  const [pixelWarningOpen,setPixelWarningOpen]=useState(false);
  const [etsyConnected,setEtsyConnected]=useState(false);
  const [etsyShop,setEtsyShop]=useState("");
  const [etsyConnecting,setEtsyConnecting]=useState(false);
  const [etsyError,setEtsyError]=useState("");
  const [etsyCategories,setEtsyCategories]=useState<EtsyCategoryOption[]>([]);
  /* D658 · A ref, not the state, and set only once a response has actually
     carried the list. Reading etsyCategories.length here would be the same
     stale closure that broke D640, D644 and D653: several designs resolve
     inside one tick, all of them see the empty array they were created with,
     and every one asks for 262KB again. A failed request never sets it, so the
     picker cannot end up permanently empty. */
  const haveEtsyCategories=useRef(false);
  const [pendingCategoryChange,setPendingCategoryChange]=useState<PendingCategoryChange|null>(null);
  const [sizeGuideName,setSizeGuideName]=useState("");
  const [sizeGuideStatus,setSizeGuideStatus]=useState("");
  const commandCenterData=null;
  const [sidebarUsage,setSidebarUsage]=useState<{used:number;limit:number}|null>(null);
  /* D342 · The goal is off unless the seller turned it on. Both places it can
     appear — here and the publish receipt — read this one value, so it is never
     half-shown. */
  const [listingGoal,setListingGoal]=useState<ListingGoal|null>(null);
  /* D708 · Was PublishedBatch[] summed from /api/batches, which is LIMIT 20, so
     starting unrelated batches pushed published ones off the list and the bar
     fell on its own. Counted from the publish records now. */
  const [goalDays,setGoalDays]=useState<PublishedDay[]>([]);
  /* D721 · Account menu in the top bar. Sign out moves inside it; the link
     itself is unchanged so the sign-out route and return_to are preserved. */
  const [accountMenuOpen,setAccountMenuOpen]=useState(false);
  useEffect(()=>{if(signedIn!==true)return;
    void fetch("/api/seller-preferences").then(response=>response.json()).then((result:{listingGoal?:ListingGoal})=>{
      if(result.listingGoal?.enabled)setListingGoal(result.listingGoal)}).catch(()=>undefined);
  },[signedIn]);
  useEffect(()=>{if(!listingGoal)return;
    void fetch("/api/batches").then(response=>response.json()).then((result:{batches?:PublishedBatch[]})=>{
      setGoalDays(result.published||[])}).catch(()=>undefined);
  },[listingGoal,batchReceipt]);
  const goalDone=listingGoal?publishedDaysThisPeriod(goalDays,listingGoal):0;
  const [preparedMockupCounts,setPreparedMockupCounts]=useState<Record<string,number>>({});
  const [imageStepError,setImageStepError]=useState("");
  const [missingPhotoDraftIds,setMissingPhotoDraftIds]=useState<string[]>([]);
  const [titlePulseIds,setTitlePulseIds]=useState<Set<string>>(new Set());

  useEffect(()=>{if(imageStepError&&allCreatedListingsHaveImages())setImageStepError("")},[imageStepError,printifyImageIndices,printifyImageSelections,preparedMockupCounts,drafts]);
  /* D544 - this waited for finishPhase==="etsy", a phase the app never enters:
     continueToEtsyDetails() sets it to "details" and only the URL said otherwise.
     So reopening a saved batch left the Etsy category dropdown with no options to
     choose from, because the effect that loads them never ran. It waits for the
     thing it actually needs instead - a listing with Etsy details on it. */
  useEffect(()=>{if(etsyCategories.length)return;const restored=files.find(file=>file.etsy)?.etsy;if(!restored)return;void resolveEtsyOptions(restored,restored.taxonomyId).catch(()=>undefined)},[etsyCategories.length,files]);
  useEffect(()=>{if(finishPhase!=="mockups"||printifyImageIndices.length||Object.keys(printifyImageSelections).length)return;const guide=productPhotoGuide(templateDetails?.blueprintTitle||"",drafts.find(draft=>draft.printifyImages?.length)?.printifyImages?.length||0),defaults=Object.fromEntries(drafts.filter(draft=>draft.id&&draft.status==="Created"&&draft.printifyImages?.length).map(draft=>[draft.id!,Array.from({length:Math.min(guide.count,draft.printifyImages!.length)},(_,index)=>index)]));if(Object.keys(defaults).length)setPrintifyImageSelections(defaults)},[finishPhase,printifyImageIndices.length,printifyImageSelections,drafts,templateDetails?.blueprintTitle]);
  useEffect(()=>{const touched=()=>{sellerChosePublish.current=true};window.addEventListener("goldie-publish-selection-touched",touched);return()=>window.removeEventListener("goldie-publish-selection-touched",touched)},[]);
  useEffect(()=>{const select=(event:Event)=>setSelectedPublishIds((event as CustomEvent<string[]>).detail||[]),retry=(event:Event)=>{const clientId=(event as CustomEvent<string>).detail;const design=files.find(file=>file.id===clientId);if(design)void runDrafts([design],true)};window.addEventListener("goldie-publish-selection",select);window.addEventListener("goldie-retry-listing",retry);return()=>{window.removeEventListener("goldie-publish-selection",select);window.removeEventListener("goldie-retry-listing",retry)}},[files,drafts]);

  const templateLoaded = templateDetails !== null;
  const productSelected = Boolean(activeRecipe);
  const ready = connected && productSelected && templateLoaded && files.length > 0;
  const designsReady=useMemo(()=>files.filter(file=>Boolean(file.width&&file.height&&file.paddingStatus!=="checking")).length,[files]);
  const designsPreparing=Math.max(0,files.length-designsReady);
  const designsFinished=files.length>0&&designsPreparing===0;
  /* D491 - designs still being measured were not one of the reasons this button
     could name, so it stayed enabled and a click threw a blocking modal reading
     "Wait until every design finishes loading and checking". The button is the
     thing she is looking at; it should say so itself. */
  const missingRequirement = !connected ? "Connect Printify first" : !productSelected ? "Choose or add a saved product" : !templateLoaded ? "Connect its Printify template" : files.length === 0 ? "Add at least one design" : !designsFinished ? `Checking ${designsPreparing} ${designsPreparing===1?"design":"designs"}\u2026` : "";
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const progressIndex = workflowStep==="finish" ? finishPhase==="details"?5:finishPhase==="etsy"?6:finishPhase==="mockups"?7:8 : workflowStep==="connect"?0:workflowStep==="setup"?1:workflowStep==="designs"?2:(preflightOpen||running)?4:3;
  // The guided factory always opens on the real connection step. The returning
  // dashboard remains available as a component, but must never replace step 1
  // or appear when a seller uses Back from the product step.
  const returningHome=false;
  /* D226 · The sidebar quota was fetched once on mount and never again, so after
     creating drafts it kept showing the old number for the rest of the session —
     it read "16 / 10000" immediately after spending two listings. Bumped when
     drafts are created so the figure matches what was just spent. */
  const [usageRevision,setUsageRevision]=useState(0);
  useEffect(()=>{fetch("/api/usage").then(async response=>{if(!response.ok)return null;return response.json() as Promise<{usage?:{drafts?:number};plan?:{drafts?:number}}>}).then(result=>{if(result?.usage&&result.plan)setSidebarUsage({used:Number(result.usage.drafts||0),limit:Number(result.plan.drafts||100)})}).catch(()=>undefined)},[usageRevision]);
  const bundleProductCount=activeBundle?Math.max(1,bundleRecipes.length):1;
  const planDraftsRemaining=sidebarUsage?Math.max(0,sidebarUsage.limit-sidebarUsage.used):null;
  const batchDesignLimit=Math.min(MAX_BATCH_FILES,planDraftsRemaining===null?MAX_BATCH_FILES:Math.floor(planDraftsRemaining/bundleProductCount));
  const requestedListingCount=Math.max(0,files.length*bundleProductCount-Object.values(bundleQualityDecisions).filter(value=>value==="exclude").length);
  const additionalDesignsAvailable=Math.max(0,batchDesignLimit-files.length);
  /* D328 · This filter used to be inlined for the active product only, which is
     why a bundle priced one product and ignored the rest. Every product in a
     bundle has its own template, colours and sizes, so the rule has to be
     callable per product rather than closed over the active one. Behaviour is
     unchanged — the guards below are the originals. */
  function variantsFor(details:TemplateDetails|null|undefined,colorIds:number[],sizeIds:number[]){
    const variants=details?.variants||[];
    const byColor=!details?.colorOptions?.length?variants:(()=>{const selected=new Set(colorIds);return variants.filter(variant=>variant.colorId==null||selected.has(variant.colorId))})();
    /* Batches saved before sizes were selectable restore a templateDetails with no
       sizeOptions, and their variants carry no sizeId — so they fall straight
       through here and behave exactly as they did before. */
    if(!details?.sizeOptions?.length)return byColor;
    const chosen=new Set(sizeIds);
    /* Never let the size axis empty the variant set. An empty selection would
       price nothing and enable nothing on the Printify draft, which is the one
       failure here that costs money rather than looks wrong. */
    if(!chosen.size)return byColor;
    const bySize=byColor.filter(variant=>variant.sizeId==null||chosen.has(variant.sizeId));
    return bySize.length?bySize:byColor;
  }
  const pricedVariants=useMemo(()=>variantsFor(templateDetails,selectedColorIds,selectedSizeIds),[templateDetails,selectedColorIds,selectedSizeIds]);
  useEffect(()=>{if(!templateDetails?.id||!selectedColorIds.length)return;window.localStorage.setItem(`goldie-colors-${templateDetails.id}`,JSON.stringify(selectedColorIds))},[templateDetails?.id,selectedColorIds]);
  useEffect(()=>{if(!templateDetails?.id||!selectedSizeIds.length)return;window.localStorage.setItem(`goldie-sizes-${templateDetails.id}`,JSON.stringify(selectedSizeIds))},[templateDetails?.id,selectedSizeIds]);
  const createdDraftCount=drafts.filter(draft=>draft.status==="Created").length,titleCount=files.filter(file=>file.title.trim()).length,etsyReadyCount=files.filter(file=>etsyRequiredComplete(file.etsy)).length;
  const lowDpiCount=files.filter(file=>{
    const details=templateDetails,fileWidth=Number(file.width||0);
    if(!details||!fileWidth)return false;
    /* D512 - a fourth copy of the scale rule. */
    const {scale,printWidth}=printTargetFor(details);
    if(!printWidth||!scale)return false;
    const quality=printifyDpi(fileWidth,printWidth,scale);
    return Boolean(quality&&quality.dpi<300);
  }).length;
  const recommendedPixelSize=useMemo(()=>printTargetFor(templateDetails),[templateDetails]);
  const belowRecommendedPixels=useMemo(()=>{if(!recommendedPixelSize.width||!recommendedPixelSize.height)return [];return files.filter(file=>Boolean(file.width&&file.height&&(file.width<recommendedPixelSize.width||file.height<recommendedPixelSize.height)))},[files,recommendedPixelSize]);
  const criticalDpiFiles=useMemo(()=>{const {scale,printWidth}=printTargetFor(templateDetails);if(!scale||!printWidth)return [];return files.map(file=>({file,dpi:file.width?printifyDpi(file.width,printWidth,scale)?.dpi||0:0})).filter(item=>item.dpi>0&&item.dpi<215)},[files,templateDetails]);
  /* D659 · bundleColorProducts deliberately holds only the OTHER products, so
     reading it alone skipped whichever product was open - and the sibling fetch
     that fills it gave up silently after nine seconds, which a product load
     measured at 2.5-3.5s can exceed. Either way a product vanished from the DPI
     check with nothing said: the walkthrough flagged a design as "below the
     recommended size for Gildan Hoodie" in a two-product bundle and never
     mentioned the crewneck at all. One map, every product in the bundle. */
  /* D664 · Found by acceptance Run 1. The low-resolution banner told her
     "Goldie will identify every affected design so you can replace it or
     continue anyway" - and then identified nothing, because the whole DPI
     review was gated on activeBundle. Two dachshund designs at 1254x1254 on a
     hoodie raised the banner and offered no panel, no per-design naming and no
     Proceed or Exclude control.

     That is the D648 fault exactly - a banner promising a confirmation step
     that never comes - still present on the single-product path after being
     fixed for bundles. A batch has products whether or not it is a bundle, so
     the check follows the batch rather than the bundle. */
  const productsInBatch=useMemo(()=>(activeBundle&&bundleRecipes.length?bundleRecipes:activeRecipe?[activeRecipe]:[]),[activeBundle,bundleRecipes,activeRecipe]);
  const bundleProductDetails=useMemo(()=>{
    const map:Record<string,TemplateDetails>={...bundleColorProducts};
    if(activeRecipe?.id&&templateDetails)map[activeRecipe.id]=templateDetails;
    return map;
  },[bundleColorProducts,activeRecipe,templateDetails]);
  /* Named so the seller learns a product could not be checked, instead of it
     quietly not appearing. */
  const bundleProductsUnchecked=useMemo(()=>productsInBatch.filter(recipe=>!bundleProductDetails[recipe.id]).map(recipe=>recipe.name),[productsInBatch,bundleProductDetails]);
  /* D659 · "All 44 enabled variants reviewed" was the OPEN product's count, on a
     modal that had just offered to create drafts across two products. The
     crewneck's 18 were never counted and never shown. Totalled across the
     bundle, with the per-product split named beside it so the number can be
     checked rather than trusted. */
  /* D659 · The row read "None yet — optional" with the panel directly beneath it
     saying "Saved for this product" over two chosen scenes. Both were true of
     different things - the row counted mockups RENDERED, the panel showed scenes
     CHOSEN - and nothing on screen said so, so the summary simply looked wrong.
     One helper answers with both facts, and it can no longer say "none" while
     scenes are saved. */
  function scenesChosenFor(recipe:Recipe,isActive:boolean){
    if(isActive)return (sharedMockups?.theme===mockupTheme?sharedMockups.ids:[])?.length||(activeRecipe?.mockupIds||[]).length||0;
    return (bundleMockupChoices[recipe.id]?.ids||recipe.mockupIds||[]).length;
  }
  function mockupRowValue(created:number,scenes:number){
    if(created&&scenes)return `${created} ${created===1?"mockup":"mockups"} from ${scenes} ${scenes===1?"scene":"scenes"}`;
    if(created)return `${created} ${created===1?"mockup":"mockups"}`;
    if(scenes)return `${scenes} ${scenes===1?"scene":"scenes"} chosen — not created yet`;
    return "None yet — optional";
  }
  const [applyingBankToBundle,setApplyingBankToBundle]=useState(false);
  async function applyBankToBundle(){
    if(!autoTitleBankId||!bundleRecipes.length)return;
    setApplyingBankToBundle(true);
    try{
      const targets=bundleRecipes.filter(recipe=>recipe.keywordListId!==autoTitleBankId);
      await Promise.all(targets.map(recipe=>fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:recipe.id,name:recipe.name,templateUrl:recipe.templateUrl,keywordListId:autoTitleBankId})}).catch(()=>undefined)));
      setBundleRecipes(current=>current.map(recipe=>({...recipe,keywordListId:autoTitleBankId})));
      setActiveRecipe(current=>current?{...current,keywordListId:autoTitleBankId}:current);
      setTitleBuildMessage(`This keyword bank now applies to all ${bundleRecipes.length} products in this bundle.`);
    }finally{setApplyingBankToBundle(false)}
  }
  const bundleVariantCounts=useMemo(()=>{
    const perProduct=(activeBundle&&bundleRecipes.length>1?bundleRecipes:activeRecipe?[activeRecipe]:[]).map(recipe=>{
      const details=bundleProductDetails[recipe.id];
      const count=details?(details.variants||[]).filter(variant=>variant.templateEnabled!==false).length:0;
      return {name:recipe.name,count,known:Boolean(details)};
    });
    const known=perProduct.filter(entry=>entry.known);
    const total=known.length?known.reduce((sum,entry)=>sum+entry.count,0):pricedVariants.length;
    return {total,perProduct,detail:known.map(entry=>`${entry.name}: ${entry.count}`).join(" · ")};
  },[activeBundle,bundleRecipes,activeRecipe,bundleProductDetails,pricedVariants]);
  const bundleQualityIssues=useMemo(()=>productsInBatch.length?files.flatMap(file=>productsInBatch.flatMap(recipe=>{const details=bundleProductDetails[recipe.id];if(!details||!file.width||!file.height)return [];const {scale,width:requiredWidth,height:requiredHeight,printWidth}=printTargetFor(details),dpi=printifyDpi(file.width,printWidth,scale)?.dpi||0;if(!requiredWidth||!requiredHeight||file.width>=requiredWidth&&file.height>=requiredHeight)return [];return [{key:`${recipe.id}:${file.id}`,fileId:file.id,fileName:file.name,recipeId:recipe.id,productName:recipe.name,requiredWidth,requiredHeight,actualWidth:file.width,actualHeight:file.height,dpi,critical:dpi>0&&dpi<215}] })):[],[productsInBatch,files,bundleProductDetails]);

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
  /* D626 · These maps belong to the open product. Asked about a bundle member's
     draft, printifyImageSelections[id] was undefined and the check fell through
     to the OPEN product's printifyImageIndices - so a member with no photos of
     its own looked ready because a different product had some. Each draft is
     asked about its own product now. */
  function productDefaultIndices(draftId:string){
    if(drafts.some(draft=>draft.id===draftId))return printifyImageIndices;
    const member=Object.values(bundleMembers).find(entry=>entry.drafts.some(draft=>draft.id===draftId));
    return member?member.indices:printifyImageIndices;
  }
  function createdListingsMissingImages(source=drafts){const selections=bundlePublishSelections(),mockups=bundlePublishMockupCounts();return source.filter(draft=>draft.status==="Created"&&draft.id&&!(selections[draft.id]??productDefaultIndices(draft.id)).length&&!(mockups[draft.id]||0))}
  function allCreatedListingsHaveImages(source=drafts){const created=source.filter(draft=>draft.status==="Created"&&draft.id);return created.length>0&&createdListingsMissingImages(source).length===0}
  /* D626 · publishTargets() sends the bundle; this read one product. So the
     count on the button, the readiness gate and the confirmation all described
     a smaller batch than the one being published. Same list on both sides. */
  function selectedPublishDrafts(){const selected=new Set(selectedPublishIds);return bundlePublishDrafts().filter(draft=>draft.status==="Created"&&draft.id&&selected.has(draft.id))}
  /* D635 · The button and the click that follows it disagreed. The button was
     disabled by publishing / photos on the selection / an empty selection /
     missingPublishFields; the click guard additionally checked the Etsy
     connection, requiredForStep("finish") and - with no argument, so the OPEN
     product rather than the selection - createdListingsMissingImages. So the
     button could read "Publish 2 listings live on Etsy" and the click answer
     "Finish all sections first: choose a keyword bank, add at least one
     finished design". Measured live on the 3-product bundle.
     requiredForStep("finish") is the wrong question here: it asks whether this
     product could BUILD a batch - a keyword bank, at least one design in hand -
     which has nothing to do with whether already-created listings can publish.
     Requiring it of whichever product happened to be open is what stopped a
     bundle whose other members were complete.
     One list now, scoped to the listings actually selected, read by both. */
  function publishBlockers(){
    const issues:string[]=[];
    if(!localPreview&&!etsyConnected)issues.push("Connect the Etsy shop that will receive these listings.");
    if(batchHeldByAnotherTab)issues.push("This batch is open in another Goldie tab. Take over there or here before publishing, so the receipt is saved.");
    const chosen=selectedPublishDrafts();
    issues.push(...missingPublishFields());
    issues.push(...createdListingsMissingImages(chosen).map(draft=>`${draft.name} needs at least one listing photo.`));
    /* The publish route rejects a job with no Etsy shipping profile, so a
       listing whose product never resolved one fails after the press rather
       than before it. */
    /* D643 · A saved batch keeps the Etsy shipping profile it was built with. Change
       the connected Etsy shop and that id belongs to a shop Goldie can no longer
       see, but nothing revalidated it - so the batch published happily and Etsy
       rejected every listing mid-flight: "Could not find shipping_profile_id=
       '59955810985' associated with shop '21777478'". D231 already treats an
       unusable id as unset in the step-1 picker; it never looked at what a batch
       had stored, and never at a bundle member's own profile. Checked against
       the profiles this Etsy shop actually has, before the press. */
    const shopProfiles=new Set(etsyShippingProfiles.map(profile=>Number(profile.id)));
    for(const item of publishTargets()){
      const profile=Number(item.shippingProfileId);
      if(!profile){issues.push(`${item.productName||"This product"} has no Etsy shipping profile selected.`);continue}
      if(shopProfiles.size&&!shopProfiles.has(profile))issues.push(`Choose a shipping profile for this Etsy shop — ${item.productName||"this product"} still uses one from a different shop.`);
    }
    return [...new Set(issues)];
  }
  function suggestedBatchName(){const product=activeRecipe?.name||templateDetails?.blueprintTitle||"Listing batch",niche=files[0]?.tags?.[0]||files[0]?.title?.split(",")[0]?.trim()||"New designs",date=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(new Date());return `${product} · ${niche} · ${date}`.slice(0,160)}
  /* D378 - Keep the product -> batch map current. continueBundle mints a new
     batch per member, and a batch can also be created lazily on the first save,
     so bind the id at snapshot time rather than trusting one code path. */
  function rememberBundleBatch(recipeId:string|undefined,batchId:string){
    if(!recipeId||!batchId)return;
    setBundleBatchIds(current=>current[recipeId]===batchId?current:{...current,[recipeId]:batchId});
  }
  /* D547 - her three-product bundle ran perfectly: batches minted 15 and 10
     seconds apart, two drafts each, all three complete. Then step 4 told her two
     of the three products were blank, because this map is per batch
     and is written at the moment that batch is saved. Product 1's batch was
     written before products 2 and 3 existed, so it holds one entry and never
     learns about the rest - the batch she opens from is the one that can see the
     least. Verified on her data: hoodie's batch mapped 1 of 3, the tee's mapped
     2, the crewneck's mapped all 3.

     Rather than trust a map written at the wrong moment, find the siblings. Each
     batch's own state records the bundle and the product it belongs to, so a gap
     can be filled by looking, and batches saved before this heal themselves when
     she opens them. */
  const bundleSiblingsScanned=useRef("");
  useEffect(()=>{
    if(restoringBatch||!activeBundle||bundleRecipes.length<2)return;
    const missing=bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id&&!bundleBatchIds[recipe.id]);
    if(!missing.length)return;
    const key=`${activeBundle.id}:${bundleRecipes.map(recipe=>recipe.id).join(",")}`;
    if(bundleSiblingsScanned.current===key)return;
    bundleSiblingsScanned.current=key;
    void (async()=>{
      try{
        const list=await fetch("/api/batches").then(response=>response.ok?response.json():null) as {batches?:Array<{id:string}>}|null;
        /* Newest first, so a product run more than once resolves to its latest
           batch - the same one the run itself would have carried forward. */
        const candidates=(list?.batches||[]).map(batch=>batch.id).filter(id=>id&&id!==batchIdRef.current).slice(0,24);
        const found:Record<string,string>={};
        for(const id of candidates){
          if(Object.keys(found).length>=missing.length)break;
          const payload=await fetch(`/api/batches?id=${encodeURIComponent(id)}`).then(response=>response.ok?response.json():null) as {batch?:{state?:{activeBundle?:{id?:string};activeRecipe?:{id?:string};drafts?:unknown[]}}}|null;
          const state=payload?.batch?.state;
          if(state?.activeBundle?.id!==activeBundle.id)continue;
          const recipeId=state?.activeRecipe?.id;
          if(!recipeId||found[recipeId]||bundleBatchIds[recipeId])continue;
          if(!missing.some(recipe=>recipe.id===recipeId))continue;
          if(!(state?.drafts||[]).length)continue;
          found[recipeId]=id;
        }
        if(Object.keys(found).length)setBundleBatchIds(current=>({...found,...current}));
      }catch{/* the cards already say blank; a failed look changes nothing */}
    })();
  },[restoringBatch,activeBundle,bundleRecipes,activeRecipe,bundleBatchIds]);

  /* D404 - Per-variant prices and the whole-number toggle lived only in React
     state and the batch snapshot, and that snapshot is not written until a batch
     has designs or drafts - so on the product step they were saved nowhere. Set
     a price, tick whole-number pricing, refresh, and both were gone. They belong
     to the saved product. Debounced: a price field fires on every keystroke. */
  const pricePersist=useRef<number|undefined>(undefined);
  function persistProductPricing(recipe:Recipe|null,change:Partial<Recipe>){
    if(!recipe)return;
    window.clearTimeout(pricePersist.current);
    pricePersist.current=window.setTimeout(()=>{void establish(recipe,change)},700);
  }
  function batchStateSnapshot(){const designs=files.map(({file:ignoredFile,previewUrl:ignoredPreview,...design})=>design);return {template,templateDetails,description,pricing,selectedColorIds,selectedSizeIds,variantPrices,etsyShippingProfileId,pricingApproved,mockupTheme,activeRecipe,activeBundle,bundleRecipes,bundleIndex,bundleBatchIds,designs,drafts,complete,finishPhase,bulkTitles,batchKeywords,titleJoiner,titleBuilderMode,autoTitleBankId,manualKeywordBankId,sharedMockups,preparedMockupCounts,printifyImageIndices,printifyImageSelections,sizeGuideName,keptAsDrafts,batchReceipt,batchDisplayName}}
  async function saveDraftBatch(){const name=batchDisplayName.trim();if(!name)return;setSavingDraftBatch(true);try{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);await saveBatchFiles(id,files.map(file=>file.file));if(!localPreview){const response=await fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:"draft",step:workflowStep,setupName:name,productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{...batchStateSnapshot(),keptAsDrafts:complete}})});if(!response.ok)throw new Error("Goldie could not save this batch.")}setKeptAsDrafts(true);setDraftSaveOpen(false);setDraftSavedOpen(true)}catch(error){stopWith("This batch was not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setSavingDraftBatch(false)}}
  function jumpToMissingPhotoListing(clientId:string){setMissingPhotoDraftIds([]);window.setTimeout(()=>{
    /* D532 - a listing collapses now, and you cannot scroll to something inside a
       closed <details>. This is the jump that answers "which listing has no
       photo", so it has to open the one it is sending her to. */
    const node=document.getElementById(`listing-images-${clientId}`);
    if(node instanceof HTMLDetailsElement)node.open=true;
    node?.scrollIntoView({block:"start"});
  },0)}
  function continueFromDesigns(){
    if(belowRecommendedPixels.length){setPixelWarningOpen(true);return}
    /* D220 · Draft creation is on this page now. If the drafts already exist the
       photos are below, so this moves on to the listing text; if they do not, the
       Create-drafts panel is what comes next and it is right here. */
    if(complete)return goToStep("finish",false,true);
    document.querySelector(".launch-panel")?.scrollIntoView({block:"start"});
  }
  /* D220 · Which of the four stages the current legacy index belongs to. The
     "Finish · Images + mockups (3 of 4)" phrasing went with the subrail; there
     are only stages now. */
  const stagePosition=RAIL_STAGES.findIndex(stage=>stage.covers.includes(progressIndex));
  const currentStage=RAIL_STAGES[stagePosition]||RAIL_STAGES[0];
  const railTopNumber=Math.max(1,stagePosition+1);
  const railInFinish=currentStage.label==="Publish";
  function bundleProductsReady(){
    /* D455 - the same readiness the bundle cards display, asked of every product
       rather than the one that happens to be open. If a card shows a warning
       badge, the batch does not move on. */
    if(!activeBundle)return true;
    if(!bundleRecipes.length)return false;
    return bundleRecipes.every((recipe,index)=>{
      const isActive=bundleRecipes.length<2||index===bundleIndex;
      const product=isActive?templateDetails:bundleColorProducts[recipe.id];
      if(!product)return false;
      return readinessFor(product,recipe,isActive?pricingApproved:Boolean(bundleApproved[recipe.id])).established;
    });
  }
  /* D506 - the product card said Ready and the page still refused to continue,
     because the card's readiness and the approval that gates Next were two
     different things. A saved product carries an approved profit target and an
     Etsy shipping profile; reopening a batch restored pricingApproved as false
     and nothing ever put it back, so she was asked to approve pricing she had
     not touched, on a card already telling her it was ready.

     Approval is only meaningful once something has changed. If the product still
     carries its saved approval and the batch is still using that exact shipping
     profile, it is approved. This runs for the open product and seeds every other
     product in the bundle the same way, so a restored bundle does not ask again.

     Verified against her live batch: recipe carries target and profile, batch
     shipping id equals the recipe's, pricingApproved was false. */
  /* D530 - "why does it make me reset the shipping profile every time I open the
     batch?" Because the product remembers it and the batch does not, and the open
     product reads the batch. Her four saved products all hold a valid Etsy
     profile id - crewneck 78465722585, hoodie 79732596586, both present among the
     93 profiles on her shop - but a batch saved before she picked one carries
     zero, and restoring that batch put zero back over a product that knew the
     answer. The product's saved profile fills an empty batch, once the real list
     has loaded so an id that no longer exists is still caught. */
  useEffect(()=>{
    if(restoringBatch||!activeRecipe||etsyShippingProfileId||!etsyShippingProfiles.length)return;
    const saved=Number(activeRecipe.etsyShippingProfileId)||0;
    if(saved&&etsyShippingProfiles.some(profile=>profile.id===saved))setEtsyShippingProfileId(saved);
  },[restoringBatch,activeRecipe,etsyShippingProfileId,etsyShippingProfiles]);

  useEffect(()=>{
    if(restoringBatch||!activeRecipe)return;
    const carries=recipeCarriesApprovedPricing({defaultProfitTarget:activeRecipe.defaultProfitTarget,etsyShippingProfileId:activeRecipe.etsyShippingProfileId});
    if(carries&&!pricingApproved&&Number(etsyShippingProfileId)===Number(activeRecipe.etsyShippingProfileId))setPricingApproved(true);
  },[restoringBatch,activeRecipe,pricingApproved,etsyShippingProfileId]);
  useEffect(()=>{
    if(restoringBatch||!activeBundle||bundleRecipes.length<2)return;
    const seed:Record<string,boolean>={};
    for(const recipe of bundleRecipes){
      if(recipe.id===activeRecipe?.id||bundleApproved[recipe.id])continue;
      if(recipeCarriesApprovedPricing({defaultProfitTarget:recipe.defaultProfitTarget,etsyShippingProfileId:recipe.etsyShippingProfileId}))seed[recipe.id]=true;
    }
    if(Object.keys(seed).length)setBundleApproved(current=>({...current,...seed}));
  },[restoringBatch,activeBundle,bundleRecipes,activeRecipe,bundleApproved]);

  function gateState():NavigationGateState{return {bundleProductsReady:bundleProductsReady(),connected,etsyConnected,productSelected,templateReady:templateLoaded,shippingReady:Boolean(templateDetails?.shippingTemplateId||templateDetails?.shippingProfileNeedsSelection),variantsReady:Boolean(templateDetails?.enabledVariants),colorsReady:!templateDetails?.colorOptions?.length||selectedColorIds.length>0,pricesReady:pricedVariants.length>0,designCount:files.length,designsReady:files.every(file=>Boolean(file.width&&file.height&&file.paddingStatus!=="checking")),/* D451 - a bundle has one shipping profile and one pricing approval PER product, and this gate read only the active one. Two of three products in her ZZ TEST BUNDLE showed "Pick a shipping profile" while Next step stayed enabled, which would have created Printify drafts for products with no valid Etsy shipping profile. Every product in the bundle has to be ready, not whichever one happens to be open. */etsyShippingProfileReady:activeBundle?bundleRecipes.length>0&&bundleRecipes.every(recipe=>Number(recipe.etsyShippingProfileId)>0):Boolean(etsyShippingProfileId),pricingApproved:activeBundle?bundleRecipes.length>0&&bundleRecipes.every(recipe=>bundleApproved[recipe.id]??recipeCarriesApprovedPricing({defaultProfitTarget:recipe.defaultProfitTarget,etsyShippingProfileId:recipe.etsyShippingProfileId})):pricingApproved,draftsComplete:complete,createdDraftCount,titlesReady:files.length>0&&files.every(file=>Boolean(file.title.trim())&&!file.titleError),tagsReady:files.length>0&&files.every(file=>file.tags.length>0&&!file.titleError),descriptionReady:Boolean(description.trim()),etsyDetailsReady:files.length>0&&files.every(file=>etsyRequiredComplete(file.etsy)),personalizationReady:files.every(file=>!personalizationProblem(file.etsy)),imagesReady:allCreatedListingsHaveImages()}}
  function progressGateIssues(index:number){return localPreview?[]:navigationIssues(index,gateState())}
  /* D444 - leaving Images needs photos, not titles. See leavingImagesIssues. */
  function imagesStepIssues(){return localPreview?[]:leavingImagesIssues(gateState())}
  function progressStatus(index:number,active:boolean,done:boolean,blocked:boolean){const live=active||!blocked;if(index===0)return connected?"Printify connected":live?"Connect your account":"Not connected";if(index===1)return templateDetails?templateDetails.blueprintTitle:live?"Choose a saved product":"Complete the prior step";if(index===2)return files.length?`${files.length} designs ready`:live?"Add finished designs":"Complete the prior step";if(index===3)return pricingApproved?(pricedVariants.length?`${pricedVariants.length} variants approved`:"Pricing approved"):live?"Review every variant":"Complete the prior step";if(index===4)return complete?`${createdDraftCount} drafts created`:live&&running?`${processed} of ${runTotal} created`:ready?"Ready to create":"Complete the prior step";if(index===5)return titleCount===files.length&&files.length?`${titleCount} titles complete`:live?`${titleCount} of ${files.length} titles complete`:done?"Titles complete":"Complete the prior step";if(index===6)return etsyReadyCount===files.length&&files.length?`${etsyReadyCount} listings ready`:live?`${etsyReadyCount} of ${files.length} ready`:done?"Etsy details complete":"Complete the prior step";if(index===7)return done?"Listing images reviewed":live?`${createdDraftCount} previews ready`:"Complete the prior step";return batchReceipt?`${batchReceipt.publishedCount} listings published`:live?"Ready to publish":"Complete the prior step"}
  function currentInsight(){if(progressIndex===1)return activeRecipe?`You used ${activeRecipe.name} recently. Its product facts and saved Etsy shipping profile will carry into this batch.`:"Choose a saved product once and Goldie will reuse its placement, variants, costs, and description.";if(progressIndex===2)return files.length?lowDpiCount?`${lowDpiCount} ${lowDpiCount===1?"design is":"designs are"} below 300 DPI at the largest enabled size. Review the DPI label before creating drafts.`:`All ${files.length} designs are loaded. Goldie will preserve their original artwork resolution.`:"Add finished artwork and Goldie will check each design against the real Printify print size.";if(progressIndex===3)return pricingApproved?`All ${pricedVariants.length} enabled variants are approved. Goldie will keep those cost-grouped prices across every listing.`:"Goldie is calculating each enabled variant from its own product cost, Etsy fees, and your target profit. Buyer-paid shipping is handled separately.";if(progressIndex===4)return running?`${processed} of ${runTotal} Printify drafts are complete. Successful drafts will not be duplicated if a retry is needed.`:"Goldie is ready to create one unpublished Printify draft for every design.";if(progressIndex===5)return `Goldie selects only exact phrases from your validated eRank keyword bank and creates matching Etsy tags. It never invents keywords.`;if(progressIndex===6)return `${etsyReadyCount} of ${files.length} listings have product-specific Etsy categories and attributes ready for review.`;if(progressIndex===7)return `The Printify preview is the placement reference. Apply one flatlay selection to the batch when the listings use the same product setup.`;return batchReceipt?`The batch is complete and every Etsy link is recorded below.`:"Every required section is ready. Publishing will send these listings live, not to Etsy drafts."}
  async function loadPreviewDemo(){
    const imageResponse=await fetch('/mockups/pink-dorm-01-leaning-frame.png'),blob=await imageResponse.blob(),file=new File([blob],'western-poster.png',{type:blob.type||'image/png'}),secondFile=new File([blob],'cowgirl-poster.png',{type:blob.type||'image/png'});
    const details:TemplateDetails={id:'preview-poster',batchId:'preview-batch',title:'Matte vertical poster',description:'Museum-quality poster printed on premium matte paper.\n\nMade to order and carefully packaged for shipping.',blueprintId:1,blueprintTitle:'Matte Vertical Poster',brand:'Generic brand',model:'Matte Vertical Poster',provider:'Sensaria',enabledVariants:6,variants:[{id:101,title:'Black / 8×10',cost:650,templatePrice:1600,shipping:6.22},{id:104,title:'White / 8×10',cost:650,templatePrice:1600,shipping:6.22},{id:106,title:'Natural / 8×10',cost:675,templatePrice:1650,shipping:6.22},{id:102,title:'Black / 12×18',cost:1025,templatePrice:2400,shipping:6.22},{id:105,title:'White / 12×18',cost:1025,templatePrice:2400,shipping:6.22},{id:103,title:'24×36',cost:1850,templatePrice:3800,shipping:6.22}],shop:'Preview shop',standardShipping:6.22,shippingCurrency:'USD',shippingTemplateId:'9001',freeShipping:false,maxPrintWidth:7200,maxPrintHeight:10800,placementScale:1};
    const previewCategory:EtsyCategoryOption={id:1,path:'Home & Living · Wall Decor · Prints'};
    const etsy:EtsyDetails={category:previewCategory.path,taxonomyId:previewCategory.id,properties:[],attributes:{},optional:{},blurb:'',confidence:'high'};
    const previewFiles:DesignFile[]=[{name:file.name,size:file.size,id:'preview-design-1',file,previewUrl:URL.createObjectURL(file),title:'western wall art, cowgirl poster, pink western decor',tags:['western wall art','cowgirl poster','pink western decor'],width:6000,height:9000,paddingStatus:'full',etsy},{name:secondFile.name,size:secondFile.size,id:'preview-design-2',file:secondFile,previewUrl:URL.createObjectURL(secondFile),title:'retro cowgirl print, western poster, dorm wall art',tags:['retro cowgirl print','western poster','dorm wall art'],width:6000,height:9000,paddingStatus:'full',etsy}];
    const profile:EtsyShippingProfile={id:9001,title:'Poster shipping · $4 US',originCountry:'United States',currency:'USD',domesticPrimary:4,domesticAdditional:2.5,international:[{key:'CA',label:'Canada',primary:13.92,additional:8.5},{key:'EU',label:'European Union',primary:17.42,additional:10.25}]};
    setTemplate('https://printify.com/app/products/preview');setTemplateDetails(details);setDescription(details.description);setFiles(previewFiles);setDrafts(previewFiles.map((design,index)=>({id:`preview-draft-${index+1}`,clientId:design.id,name:design.name,title:design.title,tags:design.tags,previewUrl:'/mockups/pink-dorm-01-leaning-frame.png',printifyImages:['/mockups/pink-dorm-01-leaning-frame.png','/mockups/pink-dorm-02-hanging-poster.png','/mockups/pink-dorm-03-maximalist-bed.png'],editorUrl:'https://printify.com/app/products',status:'Created'})));setEtsyCategories([previewCategory]);setEtsyShippingProfiles([profile]);setEtsyShippingProfileId(profile.id);setVariantPrices({'101':1600,'104':1600,'102':2400,'105':2400,'103':3800});setPricingApproved(false);setComplete(true);setFinishPhase('details');setWorkflowStep('designs');const url=new URL(window.location.href);url.searchParams.set('step','review');window.history.replaceState({},'',url);window.scrollTo({top:0,behavior:'smooth'});
  }

  async function confirmUploadInterruption(){return !running||await confirmAction({title:"Leave this step while uploads are running?",body:"Design uploads still in progress may stop before their Printify drafts are finished.",confirmLabel:"Leave anyway",cancelLabel:"Stay here",destructive:true})}
  function stopWith(title:string,issues:string[],copy?:string){setBlockingModal({title,issues,copy});return false}
  function requiredForProgress(index:number){return progressGateIssues(index)}
  const bundleKeywordGaps=useMemo(()=>{
    if(!activeBundle||bundleRecipes.length<2)return [] as string[];
    return bundleRecipes.filter((recipe,index)=>{
      const chosen=index===bundleIndex?(autoTitleBankId||activeRecipe?.keywordListId||""):(bundleKeywordChoices[recipe.id]??recipe.keywordListId??"");
      return !chosen;
    }).map(recipe=>recipe.name);
  },[activeBundle,bundleRecipes,bundleIndex,bundleKeywordChoices,autoTitleBankId,activeRecipe]);
  /* D462 - the wall on the mug. This button required a colour selection, and a
     ceramic mug has no colours to select - so it could never enable, whatever
     she picked. It also carried no reason, so a permanently disabled Next
     step simply sat there while she looked for the thing she had missed.

     Colours are required only when the product offers them, which is the rule
     readiness and every other gate already use. And a disabled Next step now
     always says what it is waiting for. */
  function productStepBlocker(){
    if(templateDetails?.colorOptions?.length&&!selectedColorIds.length)return "Choose at least one colour for this product.";
    if(templateDetails?.sizeOptions?.length&&!selectedSizeIds.length)return "Choose at least one size for this product.";
    return "";
  }
  function requiredForStep(step:WorkflowStep){if(localPreview)return [];const issues:string[]=[];if(step!=="connect"&&!connected)issues.push("Connect your Printify account.");if(step!=="connect"&&!etsyConnected)issues.push("Connect the Etsy shop that will receive these listings.");if(["designs","review","finish"].includes(step)){if(!productSelected)issues.push("Save or select a product or product bundle.");if(!templateDetails?.shippingTemplateId&&!templateDetails?.shippingProfileNeedsSelection)issues.push("Choose a valid Printify product with an imported shipping profile.");if(!templateDetails?.enabledVariants)issues.push("The product needs at least one enabled size or color.");const missingColors=Boolean(templateDetails?.colorOptions?.length&&!selectedColorIds.length);const missingSizes=Boolean(templateDetails?.sizeOptions?.length&&!selectedSizeIds.length);if(missingColors)issues.push("Choose at least one product color for this batch.");else if(missingSizes)issues.push("Choose at least one product size for this batch.");else if(!pricedVariants.length)issues.push(`No color and size combination you picked is available for ${templateDetails?.blueprintTitle||"this product"}. Open its Colors or Sizes and choose a pairing Printify offers.`);if(!templateDetails?.batchId)issues.push("Reload the Printify product so Goldie can prepare this batch.");}/* D221 · Every bundle member still needs its own keyword bank before titles can
     be generated — the D181 rule is unchanged. It moved off the Product page,
     which was blocking Continue on a choice made two pages later, and onto the
     Listing page where the bank is chosen and used. */
  if(step==="finish"&&bundleKeywordGaps.length)issues.push(`Choose a keyword bank for ${bundleKeywordGaps.join(", ")}.`);
  if(["review","finish"].includes(step)){if(!files.length)issues.push("Add at least one finished design.");if(files.some(file=>!file.width||!file.height||file.paddingStatus==="checking"))issues.push("Wait until every design finishes loading and checking.");}/* D298 · Prices and the shipping profile are both set on the PRODUCT page, but
     these two gates only fired on Listing — two steps later. So "Approve prices
     and shipping" could be ignored entirely and Continue to images still worked,
     which makes the button look decorative. A gate belongs on the step that
     owns the decision. */
  if(["designs","review","finish"].includes(step)){if(!etsyShippingProfileId)issues.push("Choose the Etsy shipping profile for this batch.");if(!pricingApproved)issues.push("Approve the item prices and shipping on the product step.");}
  if(step==="finish"){if(!complete)issues.push("Finish the Printify draft run first.");if(!drafts.some(draft=>draft.status==="Created"))issues.push("At least one listing must be created successfully before publishing.");}return issues}
  async function openProgressStep(rawIndex:number){if(!await confirmUploadInterruption())return;
    /* D220 · Draft creation (3, 4) and mockups (7) live on the Images page now, so
       any legacy index pointing at them resolves there. Deep links and saved batch
       state still use the 0-8 numbering. */
    const index=rawIndex===3||rawIndex===4||rawIndex===7?2:rawIndex;if(localPreview){if(index===0)return goToStep("connect",false,true);if(index===1)return goToStep("setup",false,true);if(index===2)return goToStep("designs",false,true);if(index>=3&&!templateDetails)await loadPreviewDemo();if(index===3){setPreflightOpen(false);return goToStep("review",false,true)}if(index===4){goToStep("review",false,true);setPreflightOpen(true);return}setPreflightOpen(false);setFinishPhase(index===8?"final":"details");return goToStep("finish",false,true)}const issues=requiredForProgress(index);if(issues.length)return stopWith("Finish all sections first.",issues);if(index===0)return goToStep("connect");if(index===1)return goToStep("setup");if(index===2)return goToStep("designs");if(index===3)return goToStep("review");if(index===4){goToStep("review");return createDrafts()}setFinishPhase(index===8?"final":"details");goToStep("finish",false,true)}

  async function goBackOneStep(){
    if(!await confirmUploadInterruption())return;
    if(progressIndex===0){window.history.back();return}
    if(progressIndex===1)return goToStep("connect",false,true);
    if(progressIndex===2)return goToStep("setup",false,true);
    if(progressIndex===3||progressIndex===4)return goToStep(progressIndex===3?"designs":"review",false,true);
    if(progressIndex===5)return goToStep("review",false,true);
    setFinishPhase(progressIndex===6?"details":progressIndex===7?"etsy":"mockups");
    goToStep("finish",false,true);
  }

  function canOpenStep(step:WorkflowStep){if(localPreview)return true;if(step==="connect")return true;if(step==="setup")return connected&&etsyConnected;if(step==="designs")return connected&&etsyConnected&&productSelected&&templateLoaded;if(step==="review")return etsyConnected&&ready;return etsyConnected&&productSelected&&complete}
  /* D224 · "review" no longer has a page. Draft creation moved onto the Images
   page, so the review step renders nothing — and a batch saved before this
   change stores step:"review", which meant resuming it produced a heading, a
   rail and an empty screen. Every entry point normalises through here: saved
   batch state, the URL, and any call left in the code. */
  function normalizeStep(step:WorkflowStep):WorkflowStep{
    /* D623 · Also the last gate before setWorkflowStep. Anything that is not one
       of the five would render a hero of undefined, so an unknown value settles
       on the first step rather than taking the page down. */
    const known=canonicalStep(step)??"connect";
    return known==="review"?"designs":known;
  }
  /* D487 - opening a saved batch at ?step=setup landed on "Connect your
     accounts", with both accounts shown as connected and verified, and stayed
     there. The guard below falls back to "connect" while the connection check
     and the batch restore are still in flight, and that fallback rewrites the
     URL to step=connect. The auto-skip then refuses to move, because it reads
     the URL to decide whether she asked for the connect screen - and by then the
     URL says she did. Falling back is not the same as asking, so the step she
     actually arrived on is remembered and restored the moment it opens. */
  const requestedStep=useRef<WorkflowStep|null>(null);
  /* D640 · Shipped a Connections link without clicking it, and it did not work:
     ?step=connect landed on step 1. The auto-skip below asks
     requestedStep.current==="connect" to decide whether the seller ASKED for the
     connect screen - but the effect underneath clears that ref the moment the
     step it names is already the current one, which on a fresh load of
     ?step=connect is immediately. So the fact was destroyed before the only
     reader consulted it. Arriving is a fact about this page load, so it is
     recorded once and never cleared. */
  const askedForConnect=useRef(false);
  const requestedStepRead=useRef(false);
  if(typeof window!=="undefined"&&!requestedStepRead.current){
    requestedStepRead.current=true;
    /* D623 · This read took the raw ?step= value. D428 introduced aliases -
       product, images, listing, titles, publish - and canonicalised them in the
       popstate reader and in batch restore, but not here. So the alias survived
       into this ref, the effect below called goToStep("listing", replace, force)
       with force skipping every guard, and setWorkflowStep stored a value that
       is not one of the five. workflowHero[workflowStep] was then undefined and
       reading .eyebrow crashed the whole app into the error boundary. Every URL
       D428 was written to support was the one that broke it. */
    requestedStep.current=canonicalStep(new URL(window.location.href).searchParams.get("step"));
    askedForConnect.current=requestedStep.current==="connect";
  }
  useEffect(()=>{
    const wanted=requestedStep.current;
    if(!wanted||localPreview||checkingConnection||restoringBatch)return;
    if(workflowStep===wanted){requestedStep.current=null;return}
    if(!canOpenStep(wanted))return;
    requestedStep.current=null;
    goToStep(wanted,true,true);
  },[localPreview,checkingConnection,restoringBatch,connected,etsyConnected,templateLoaded,files.length,complete,workflowStep]);

  function goToStep(rawStep:WorkflowStep,replace=false,force=false){
    const step=normalizeStep(rawStep);if(!force){const issues=requiredForStep(step);if(issues.length)return stopWith("Finish all sections first.",issues);if(!canOpenStep(step))return;}setWorkflowStep(normalizeStep(step));const url=new URL(window.location.href);url.searchParams.set("step",step);window.history[replace?"replaceState":"pushState"]({},"",url);window.scrollTo(0,0)}

  useEffect(()=>{const read=()=>{const url=new URL(window.location.href),value=url.searchParams.get("step") as WorkflowStep|null,phase=url.searchParams.get("phase") as FinishPhase|null;const canonical=canonicalStep(value);if(canonical)setWorkflowStep(normalizeStep(canonical));if(phase&&["details","etsy","mockups","final"].includes(phase))setFinishPhase(phase)};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read)},[]);
  useEffect(()=>{if(workflowStep!=="finish")return;const url=new URL(window.location.href);url.searchParams.set("phase",finishPhase);window.history.replaceState({},"",url)},[workflowStep,finishPhase]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"auto"})},[workflowStep,finishPhase]);
  useEffect(()=>{if(connectionAutoSkip.current||localPreview||checkingConnection||restoringBatch||workflowStep!=="connect"||!connected||!etsyConnected)return;if(askedForConnect.current)return;connectionAutoSkip.current=true;goToStep("setup",true,true)},[localPreview,checkingConnection,restoringBatch,workflowStep,connected,etsyConnected]);
  /* D519 - while a bundle run is advancing, the app is mid-switch: the next
     product's template has not loaded yet, so this fell back to step 1 and she
     watched a run she started on step 2 dump her on Choose product. Verified on
     her account that the drafts themselves were fine - three batches, two drafts
     each - so this was navigation, not loss. A run in progress is not a broken
     state to recover from. */
  useEffect(()=>{if(localPreview||checkingConnection||restoringBatch||runInProgress.current||canOpenStep(workflowStep))return;const fallback=!connected||!etsyConnected?"connect":!templateLoaded?"setup":!files.length?"designs":!complete?"review":"finish";goToStep(fallback,true,true);
  },[localPreview,checkingConnection,restoringBatch,connected,etsyConnected,templateLoaded,files.length,complete,workflowStep]);

  useEffect(()=>{if(restoringBatch)return;const url=new URL(window.location.href);if(url.searchParams.get("open")!=="results")return;const hasCreatedDrafts=complete&&drafts.some(draft=>draft.status==="Created");url.searchParams.delete("open");if(!hasCreatedDrafts){window.history.replaceState({},"",url);return}if(!pricingApproved)setPricingApproved(true);url.searchParams.set("step","finish");url.searchParams.set("phase",finishPhase||"details");setWorkflowStep("finish");window.history.replaceState({},"",url);window.scrollTo({top:0,behavior:"auto"})},[restoringBatch,complete,drafts,pricingApproved,finishPhase]);

  /* D379 - Loading a batch happened in exactly one place: a mount effect reading
     ?batch= from the URL. That was fine while arriving at the page was the only
     way to open one. Steps 2-4 now show a card per product and each bundle
     member is its own batch, so opening a card means loading a batch - which
     through the old path meant window.location.assign and a full page reload:
     blank screen, everything refetched, scroll thrown back to the top. Step 1
     opens a card instantly; these have to as well.

     Same body, called two ways: on mount from the URL, and in place when a card
     is opened. */
  /* D427 - a ?batch= that no longer exists used to drop you on step 1 with no
     explanation, looking exactly like your work had been lost. Say so, and clear
     the dead id so a refresh does not repeat it. */
  const [restoreNotice,setRestoreNotice]=useState("");
  async function restoreBatchById(id:string,requestedStep:string|null,requestedPhase:string|null,push=false):Promise<boolean>{
    try{const url=new URL(window.location.href);if(!id)return false;const response=await fetch(`/api/batches?id=${encodeURIComponent(id)}`);if(!response.ok)return false;const payload=await response.json() as {batch?:{id:string;step:WorkflowStep;status:string;setup_name?:string;state?:Record<string,unknown>}};if(!payload.batch?.state)return false;const state=payload.batch.state as {template?:string;templateDetails?:TemplateDetails;description?:string;pricing?:Pricing;mockupTheme?:string;activeRecipe?:Recipe;activeBundle?:ProductBundle;bundleRecipes?:Recipe[];bundleIndex?:number;bundleBatchIds?:Record<string,string>;designs?:Array<Omit<DesignFile,"file"|"previewUrl">>;drafts?:DraftResult[];complete?:boolean;finishPhase?:FinishPhase;bulkTitles?:string;printifyImageIndices?:number[];printifyImageSelections?:Record<string,number[]>;selectedColorIds?:number[];selectedSizeIds?:number[];variantPrices?:Record<string,number>;etsyShippingProfileId?:number;pricingApproved?:boolean;sizeGuideName?:string;batchKeywords?:string[];titleJoiner?:string;titleBuilderMode?:"ai"|"manual";autoTitleBankId?:string;manualKeywordBankId?:string;sharedMockups?:{theme:string;ids:string[]};preparedMockupCounts?:Record<string,number>;keptAsDrafts?:boolean;batchDisplayName?:string;batchReceipt?:BatchReceipt|null};
    const cached=await loadBatchFiles(id).catch(()=>[]);
    const savedDrafts=state.drafts||[];
    const designs=(state.designs||[]).map((design,index)=>{
      const cachedFile=cached[index],file=cachedFile?.size?cachedFile:undefined,draft=savedDrafts.find(item=>item.clientId===design.id);
      const previewUrl=file?URL.createObjectURL(file):draft?.previewUrl||draft?.printifyImages?.[0]||"";
      return {...design,file:file||new File([],design.name,{type:"application/octet-stream"}),previewUrl,originalUnavailable:!file};
    }) as DesignFile[];
    /* D632 - IndexedDB belongs to one browser profile, not one computer. Losing
       that cache must never delete the server-saved design records: existing
       Printify drafts can still be titled, completed and published. */
    const unavailable=designs.filter(design=>design.originalUnavailable).length;
    if(unavailable)setRestoreNotice(`${unavailable===designs.length?"The original uploads are":"Some original uploads are"} not available in this browser. Your ${unavailable===1?"listing is":"listings are"} restored and can still be completed and published. Upload the original ${unavailable===1?"file":"files"} again only if you need to recreate a Printify draft.`);
    const savedProductColors=state.templateDetails?.id?JSON.parse(window.localStorage.getItem(`goldie-colors-${state.templateDetails.id}`)||"[]") as number[]:[];const savedProductSizes=state.templateDetails?.id?JSON.parse(window.localStorage.getItem(`goldie-sizes-${state.templateDetails.id}`)||"[]") as number[]:[];batchIdRef.current=id;setBatchDisplayName(state.batchDisplayName||"");/* D693 - restoring this from setup_name is how the stale recipe name kept coming back. D686 stopped Batch History READING setup_name as a seller-chosen name, but restore still seeded the seller-name field from it, autosave then wrote that into the snapshot, and the reader trusted it - the stale name laundered itself into the field meant to hold only what she typed. Measured on batch b8ce58cb after D686 deployed: state.batchDisplayName "Gildan Hoodie", activeRecipe "Comfort Colors 1566 crewneck", product_title "Unisex Garment-Dyed Sweatshirt". A batch she never named restores blank, and Batch History falls through to the design or the product, which is the truth. */setKeptAsDrafts(Boolean(state.keptAsDrafts));/* D703 - the snapshot SAVES batchReceipt and the restore never read it back, so
    opening a batch that had published left the receipt at its initial null, the
    next autosave wrote that null over the record, and the proof of what went live
    was destroyed by looking at it. Measured on 0b79a9b6: receipt present at
    02:53:56 with four Etsy URLs, null by 02:59:23 after I opened the batch to
    verify it. Batch History then reported it as a DRAFT with a Resume button while
    its four listings were live on Etsy. */setBatchReceipt(state.batchReceipt||null);setTemplate(state.template||"");setTemplateDetails(state.templateDetails||null);setDescription(state.description||"");if(state.pricing)setPricing(state.pricing);setVariantPrices(state.variantPrices||{});setSelectedColorIds(state.selectedColorIds?.length?state.selectedColorIds:state.activeRecipe?.defaultColorIds?.length?state.activeRecipe.defaultColorIds:savedProductColors);setSelectedSizeIds(state.selectedSizeIds?.length?state.selectedSizeIds:state.activeRecipe?.defaultSizeIds?.length?state.activeRecipe.defaultSizeIds:savedProductSizes);setEtsyShippingProfileId(Number(state.etsyShippingProfileId)||0);setPricingApproved(Boolean(state.pricingApproved)||Boolean(state.complete&&(state.drafts||[]).some(draft=>draft.status==="Created")));setMockupTheme(state.mockupTheme||"");setActiveRecipe(state.activeRecipe||null);setActiveBundle(state.activeBundle||null);setBundleRecipes(state.bundleRecipes||[]);setBundleIndex(Math.max(0,Number(state.bundleIndex)||0));setBundleBatchIds(state.bundleBatchIds||{});setFiles(designs);setDrafts(state.drafts||[]);setComplete(Boolean(state.complete));setFinishPhase(restoredFinishPhase(state.finishPhase||"details",requestedPhase??requestedFinishPhase(requestedStep),Boolean(state.complete)));setBulkTitles(state.bulkTitles||"");setBatchKeywords(state.batchKeywords||[]);setTitleJoiner(state.titleJoiner||", ");setTitleBuilderMode(state.titleBuilderMode||"ai");setAutoTitleBankId(state.autoTitleBankId||"");setManualKeywordBankId(state.manualKeywordBankId||"");setSharedMockups(state.sharedMockups);setPreparedMockupCounts(state.preparedMockupCounts||{});setPrintifyImageIndices(state.printifyImageIndices||[]);setPrintifyImageSelections(state.printifyImageSelections||{});setSizeGuideName(state.sizeGuideName||"");setResumeProcessing(payload.batch.status==="processing"&&designs.length>0);const step=restoredWorkflowStep(payload.batch.step||"connect",requestedStep,Boolean(state.complete));setWorkflowStep(normalizeStep(step));url.searchParams.set("batch",id);url.searchParams.set("step",step);url.searchParams.delete("phase");if(push)window.history.pushState({},"",url);else window.history.replaceState({},"",url);if(payload.batch.status==="processing"&&state.template)void loadTemplateUrl(state.template);return true}finally{snapshotReady.current=true;setRestoringBatch(false)}
  }
  /* D659 · A workflow URL with no ?batch= dropped straight to step 1. Measured
     live: opening ?step=designs after four Printify drafts existed silently
     landed on "Choose product", looking exactly like the batch had been thrown
     away - the same fault D427 fixed for a DEAD id, still present for a missing
     one. A step URL is a request to resume, so resume it: when exactly one
     resumable batch is open, take it; when several are, ask which rather than
     choosing for her; when none is, step 1 is the honest answer. */
  const [resumeChoices,setResumeChoices]=useState<Array<{id:string;name:string;step:string;drafts:number}>>([]);
  useEffect(()=>{const url=new URL(window.location.href);const id=url.searchParams.get("batch")||"";
    if(!id){
      const wanted=canonicalStep(url.searchParams.get("step"));
      if(!wanted||wanted==="connect"||wanted==="setup"||signedIn!==true){snapshotReady.current=true;setRestoringBatch(false);return}
      void (async()=>{
        try{
          const payload=await fetch("/api/batches").then(response=>response.ok?response.json():null) as {batches?:Array<{id:string;name?:string;step?:string;status?:string;draftCount?:number}>}|null;
          const open=(payload?.batches||[]).filter(batch=>batch.status!=="published"&&batch.status!=="archived");
          if(open.length===1){await restoreBatchById(open[0].id,url.searchParams.get("step"),url.searchParams.get("phase"));return}
          if(open.length>1)setResumeChoices(open.slice(0,6).map(batch=>({id:batch.id,name:batch.name||"Untitled batch",step:String(batch.step||""),drafts:Number(batch.draftCount||0)})));
        }catch{/* fall through to step 1, which is what happened before */}
        finally{snapshotReady.current=true;setRestoringBatch(false)}
      })();
      return;
    }void restoreBatchById(id,url.searchParams.get("step"),url.searchParams.get("phase")).then(restored=>{if(restored)return;setRestoreNotice("That batch could not be opened - it may have been deleted. Nothing else was lost; you can pick up from Batch History or start a new batch.");const clean=new URL(window.location.href);clean.searchParams.delete("batch");clean.searchParams.delete("step");clean.searchParams.delete("phase");window.history.replaceState({},"",clean.toString());})},[]);
  /* D301 · Restore the remembered product on load. The recipe list lives in
     factory-tools, not here, so this asks the API rather than referencing a
     `recipes` variable that does not exist in this component. Guarded so it can
     never fight the two things that legitimately own the selection: a ?batch=
     resume, and a product already chosen in this session. */
  const productRestoreAttempted=useRef(false);
  /* D659 · Set only while a REMEMBERED product is being restored, so the very
     same failure still opens a modal when she chose the product herself. */
  const restoringRememberedProduct=useRef(false);
  /* D659 · The store was recorded on the server the moment a product loaded,
     but the card that shows it lives in factory-tools and only re-reads the
     recipe list on its own schedule - so the label appeared on the NEXT page
     load, which is exactly when a seller has stopped wondering which store a
     product belongs to. Tell the list directly. */
  function announceShop(recipeId:string,title:string,shopId:number){
    window.dispatchEvent(new CustomEvent("goldie-recipe-shop",{detail:{recipeId,title,shopId}}));
  }
  const [restoredProductNotice,setRestoredProductNotice]=useState("");
  useEffect(()=>{
    if(productRestoreAttempted.current||restoringBatch||activeRecipe||activeBundle||signedIn!==true)return;
    if(new URL(window.location.href).searchParams.get("batch"))return;
    let remembered="";let rememberedBundle="";
    try{
      remembered=window.localStorage.getItem("goldie-active-recipe")||"";
      rememberedBundle=window.localStorage.getItem("goldie-active-bundle")||"";
    }catch{/* private mode */}
    if(!remembered&&!rememberedBundle)return;
    productRestoreAttempted.current=true;
    void(async()=>{
      try{
        /* D345 · A remembered bundle wins: it is the larger selection, and
           choosing one clears the single-product key, so both being present
           means the bundle was chosen more recently. */
        if(rememberedBundle){
          const saved=JSON.parse(rememberedBundle) as {id?:string;recipeIds?:string[]};
          const bundles=await fetch("/api/product-bundles").then(r=>r.ok?r.json():null).catch(()=>null) as {bundles?:ProductBundle[]}|null;
          const bundle=(bundles?.bundles||[]).find(item=>item.id===saved.id);
          if(bundle&&(saved.recipeIds||[]).length){await useBundle(bundle,saved.recipeIds||[]);return}
          window.localStorage.removeItem("goldie-active-bundle");
        }
        if(!remembered)return;
        const response=await fetch("/api/product-recipes");
        if(!response.ok)return;
        const payload=await response.json() as {recipes?:Recipe[]};
        const match=(payload.recipes||[]).find(recipe=>recipe.id===remembered);
        /* D659 · A remembered product that Goldie can no longer use greeted her
           with "REQUIRED BEFORE CONTINUING" on EVERY page load - measured live
           with "Generic brand", a product never published to Etsy. She had not
           asked for it; the page simply restored it and then refused it. A
           modal is for something the seller just did. Restoring is something
           Goldie did, so a failure there deselects quietly and explains itself
           on the page. */
        if(match){restoringRememberedProduct.current=true;try{await selectRecipe(match)}finally{restoringRememberedProduct.current=false}}
        else window.localStorage.removeItem("goldie-active-recipe");
      }catch{/* a failed restore must never block the page */}
    })();
  },[restoringBatch,activeRecipe,activeBundle,signedIn]);

  useEffect(()=>{setLocalPreview(["localhost","127.0.0.1"].includes(window.location.hostname));fetch("/api/account").then(response=>response.json()).then((result:{signedIn?:boolean})=>setSignedIn(Boolean(result.signedIn))).catch(()=>setSignedIn(null))},[]);
  useEffect(()=>{if(signedIn!==true||publishing)return;const jobId=window.localStorage.getItem("goldie-active-publish-job");if(jobId)void monitorPublishJob(jobId,true);
  },[signedIn]);

  useEffect(()=>{if(!resumeProcessing||resumeAttempted.current||!connected||!templateLoaded||!files.length)return;resumeAttempted.current=true;setResumeProcessing(false);const succeeded=new Set(drafts.filter(draft=>draft.status==="Created").map(draft=>draft.clientId));const remaining=files.filter(file=>!succeeded.has(file.id));if(remaining.length)void runDrafts(remaining,true)},[resumeProcessing,connected,templateLoaded,files,drafts]);

  /* D379 - The debounced autosave and an in-place product switch have to write
     the same snapshot to the same place; the switch just cannot wait 700ms for
     it. One save, two callers. */
  /* D496 - two Goldie tabs fought over the same batch. Both autosave the whole
     batch snapshot every 700ms, so whichever tab wrote last replaced the other
     tab's work wholesale - and neither said anything. I reproduced a batch
     failing to restore with a second tab open on the app.

     A batch is claimed by one tab. A second tab opening the same batch is told,
     and holds its autosave rather than silently overwriting - the first tab has
     the work. She can take over here, which hands the claim across and puts the
     other tab into the same held state. */
  const tabId=useRef<string>("");
  if(typeof window!=="undefined"&&!tabId.current)tabId.current=crypto.randomUUID();
  const [batchHeldByAnotherTab,setBatchHeldByAnotherTab]=useState(false);
  const batchChannel=useRef<BroadcastChannel|null>(null);
  useEffect(()=>{
    if(typeof BroadcastChannel==="undefined")return;
    const channel=new BroadcastChannel("goldie-batch-claim");
    batchChannel.current=channel;
    channel.onmessage=(event:MessageEvent)=>{
      const message=event.data as {type:string;batchId?:string;tabId?:string};
      if(!message?.batchId||message.tabId===tabId.current)return;
      if(message.batchId!==batchIdRef.current)return;
      if(message.type==="claim"){
        /* Another tab has just taken this batch. Stop writing over it. */
        setBatchHeldByAnotherTab(true);
      }
      if(message.type==="ping"){
        /* A tab is asking who holds this batch. Only answer if we still do. */
        if(!batchHeldByAnotherTab)channel.postMessage({type:"claim",batchId:batchIdRef.current,tabId:tabId.current});
      }
    };
    return()=>{channel.close();batchChannel.current=null};
  },[batchHeldByAnotherTab]);
  /* D501 - this ran on every autosave, so it asked the other tabs who owns this
     batch once per 700ms while she typed, and cleared the held flag each time -
     a held tab could have un-held itself off the back of a save it did not make.
     Whether another tab owns this batch can only change when the batch does. */
  const pingedBatch=useRef("");
  useEffect(()=>{
    const id=batchIdRef.current;
    if(!id||!batchChannel.current)return;
    if(pingedBatch.current===id)return;
    pingedBatch.current=id;
    setBatchHeldByAnotherTab(false);
    batchChannel.current.postMessage({type:"ping",batchId:id,tabId:tabId.current});
  },[savedRevision,restoringBatch]);
  function takeOverBatchHere(){
    setBatchHeldByAnotherTab(false);
    batchChannel.current?.postMessage({type:"claim",batchId:batchIdRef.current,tabId:tabId.current});
  }

  async function persistBatchNow(existingId?:string){
    const id=existingId||batchIdRef.current||crypto.randomUUID();
    batchIdRef.current=id;
    rememberBundleBatch(activeRecipe?.id,id);
    window.localStorage.setItem("goldie-active-batch",id);
    await fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:running?"processing":keptAsDrafts?"draft":complete?drafts.some(draft=>draft.status!=="Created")?"needs_attention":"complete":"draft",step:workflowStep,setupName:batchDisplayName||activeBundle?.name||activeRecipe?.name||"",productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:batchStateSnapshot()})}).catch(()=>undefined);
  }
  useEffect(()=>{if(!snapshotReady.current||restoringBatch||batchHeldByAnotherTab||(!files.length&&!drafts.length))return;const timer=window.setTimeout(()=>{void persistBatchNow();},700);return()=>window.clearTimeout(timer);
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
  /* D231 · A saved shipping profile that is not on the shop is worse than none.
     Measured live: Gildan Hoodie and gildan crewneck both held 259760087290 as
     their etsyShippingProfileId, which is the PRINTIFY shippingTemplateId for
     that product - a Printify id sitting in a field meant for an Etsy profile
     id. It matches none of the 94 profiles on the shop, so the picker showed
     nothing selected, "Approve prices and shipping" was disabled, and the batch
     could not move. Treat an unusable id as unset so the picker asks for a real
     one and the D229 notice explains why. */
  useEffect(()=>{if(!etsyShippingProfiles.length)return;setEtsyShippingProfileId(current=>current&&!etsyShippingProfiles.some(profile=>profile.id===current)?0:current)},[etsyShippingProfiles]);

  useEffect(() => {
    if (!running) return;
    const protectBatch = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectBatch);
    return () => window.removeEventListener("beforeunload", protectBatch);
  }, [running]);

  /* D644 · The click guard is a document listener registered by an effect, so it
     closes over whatever state existed when that effect last ran - and
     selectedPublishIds was never in its dependency list. Harmless while the
     blockers did not depend on the selection; D643 made them per-target, and the
     guard began refusing the press by naming products that had been unticked:
     "Gildan Tee still uses one from a different shop" while the button correctly
     read "Publish 2 listings live on Etsy · 1 product".
     A ref refreshed on every render always holds the current answer, so the
     listener cannot read a stale one no matter what its deps say. */
  const publishBlockersRef=useRef<()=>string[]>(()=>[]);
  publishBlockersRef.current=publishBlockers;
  useEffect(()=>{
    const guardFinalActions=(event:MouseEvent)=>{
      const element=event.target instanceof Element?event.target.closest("button"):null;
      if(!element)return;
      let issues:string[]=[];
      if(element.classList.contains("publish-all-button")){
        issues=publishBlockersRef.current();
      }
      if(!issues.length)return;
      event.preventDefault();event.stopImmediatePropagation();stopWith("Finish all sections first.",[...new Set(issues)]);
    };
    document.addEventListener("click",guardFinalActions,true);
    return()=>document.removeEventListener("click",guardFinalActions,true);
  },[files,description,printifyImageIndices,printifyImageSelections,preparedMockupCounts,pricingApproved,complete,drafts,connected,templateDetails,etsyConnected,localPreview]);

  useEffect(()=>{if(localPreview||!complete)return;const pending=files.filter(file=>!file.etsy&&file.title.trim());if(!pending.length)return;const timer=window.setTimeout(()=>{setPreparingEtsy(true);void prepareEtsyBatch(pending).finally(()=>setPreparingEtsy(false))},900);return()=>window.clearTimeout(timer);
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
    for(const design of files){const hash=design.contentHash||(!design.originalUnavailable?await fileContentHash(design.file):"");if(hash)existingHashes.add(hash)}
    const replacements=new Map<string,{file:File;previewUrl:string;contentHash:string}>();
    const unique:DesignFile[]=[];let duplicateCount=0;
    for(const file of selected){
      const contentHash=await fileContentHash(file);
      const missing=files.find(design=>design.originalUnavailable&&!replacements.has(design.id)&&((design.contentHash&&design.contentHash===contentHash)||(!design.contentHash&&design.name===file.name&&design.size===file.size)));
      if(missing){replacements.set(missing.id,{file,previewUrl:URL.createObjectURL(file),contentHash});existingHashes.add(contentHash);continue}
      if(existingHashes.has(contentHash)){duplicateCount+=1;continue}
      existingHashes.add(contentHash);unique.push({name:file.name,size:file.size,id:crypto.randomUUID(),file,previewUrl:URL.createObjectURL(file),title:"",tags:[],contentHash,paddingStatus:"checking"})
    }
    const available=Math.max(0,Math.min(MAX_BATCH_FILES-files.length,batchDesignLimit-files.length));
    if(unique.length>available){unique.forEach(image=>URL.revokeObjectURL(image.previewUrl));setFileNotice(duplicateCount?`${duplicateCount} exact ${duplicateCount===1?"duplicate was":"duplicates were"} skipped.`:"");setFileError(available?`This selection contains ${unique.length} new designs, but this batch has room for ${available}. Choose ${available} or fewer so nothing is partially added.`:"This batch has no listing allowance left. No designs were added and no batch was created.");if(folderPicker.current)folderPicker.current.value="";if(imagePicker.current)imagePicker.current.value="";return}
    const images=unique;
    if(!images.length&&!replacements.size){if(duplicateCount){setFileError("");setFileNotice(`${duplicateCount===1?"That design is":"Those designs are"} already in this batch. No duplicate was added.`)}else{setFileNotice("");setFileError(`This batch already has ${MAX_BATCH_FILES} designs.`)}if(folderPicker.current)folderPicker.current.value="";if(imagePicker.current)imagePicker.current.value="";return}
    const combined=[...files.map(design=>{const restored=replacements.get(design.id);return restored?{...design,...restored,originalUnavailable:false}:design}),...images];
    setFileError("");setFileNotice(replacements.size?`${replacements.size} original ${replacements.size===1?"file is":"files are"} available in this browser again.`:duplicateCount?`${duplicateCount} exact ${duplicateCount===1?"duplicate was":"duplicates were"} skipped.`:"");
    setFiles(combined);
    const durableBatchId=batchIdRef.current||crypto.randomUUID();batchIdRef.current=durableBatchId;window.localStorage.setItem("goldie-active-batch",durableBatchId);const batchUrl=new URL(window.location.href);batchUrl.searchParams.set("batch",durableBatchId);window.history.replaceState({},"",batchUrl);void saveBatchFiles(durableBatchId,combined.map(image=>image.file)).catch(()=>undefined);
    if(images.length){setComplete(false);setDrafts([]);setProcessed(0)}
    const restoredAndNew=[...combined.filter(design=>replacements.has(design.id)),...images];
    restoredAndNew.forEach((design) => { const probe = document.createElement("img"); probe.onload = () => { setFiles((current) => current.map((item) => item.id === design.id ? { ...item, width: probe.naturalWidth, height: probe.naturalHeight } : item)); URL.revokeObjectURL(probe.src); }; probe.src = URL.createObjectURL(design.file); });
    void analyzePadding(restoredAndNew);
    if(folderPicker.current)folderPicker.current.value="";
    if(imagePicker.current)imagePicker.current.value="";
  }

  /* D491 - a batch could be reopened and never become usable again. The design
     measurements are written into the batch snapshot, and a snapshot taken while
     they were still running persists paddingStatus:"checking" - which is exactly
     what autosave does moments after a restore. designsReady counts only designs
     that are measured and not still checking, so the page sat on "preparing 0 of
     2 · Checking dimensions" forever, with no way forward. Verified on her live
     bundle: stuck indefinitely, and it had already been saved that way.

     Measuring happens on upload and nowhere else, so a restored design that
     arrives unmeasured is measured now. The files are in this browser already;
     it costs nothing but a decode. */
  const remeasured=useRef(new Set<string>());
  useEffect(()=>{
    const unmeasured=files.filter(design=>design.file&&!remeasured.current.has(design.id)&&(!design.width||!design.height||design.paddingStatus==="checking"));
    if(!unmeasured.length)return;
    unmeasured.forEach(design=>remeasured.current.add(design.id));
    unmeasured.forEach(design=>{
      const probe=document.createElement("img");
      const url=URL.createObjectURL(design.file);
      probe.onload=()=>{setFiles(current=>current.map(item=>item.id===design.id?{...item,width:probe.naturalWidth,height:probe.naturalHeight}:item));URL.revokeObjectURL(url)};
      probe.onerror=()=>URL.revokeObjectURL(url);
      probe.src=url;
    });
    void analyzePadding(unmeasured);
  },[files]);

  async function analyzePadding(images:DesignFile[]) { for(const design of images){ if(!/\.png$/i.test(design.name)){updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:false,paddingStatus:"full"});continue} try{const bitmap=await createImageBitmap(design.file,{resizeWidth:512,resizeHeight:512,resizeQuality:"low"});const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext("2d",{willReadFrequently:true})!;context.drawImage(bitmap,0,0);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1,hasTransparency=false;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const alpha=pixels[(y*canvas.width+x)*4+3];if(alpha<250)hasTransparency=true;if(alpha>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}const bounds=right<0?{left:0,top:0,right:1,bottom:1}:{left:left/canvas.width,top:top/canvas.height,right:(right+1)/canvas.width,bottom:(bottom+1)/canvas.height};const trimmed=bounds.left>.015||bounds.top>.015||bounds.right<.985||bounds.bottom<.985;updateDesign(design.id,{visibleBounds:bounds,hasTransparency,paddingStatus:trimmed?"trimmed":"full"})}catch{updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:true,paddingStatus:"full"})} } }

  async function removeDesign(id:string){const removed=files.find(file=>file.id===id);if(!removed)return;if(drafts.length&&!await confirmAction({title:`Remove ${removed.name}?`,body:"Its existing Printify draft stays in Printify. This listing is removed from this Goldie batch.",confirmLabel:"Remove listing",destructive:true}))return;const next=files.filter(file=>file.id!==id);URL.revokeObjectURL(removed.previewUrl);setFiles(next);setFileError("");setFileNotice(`${removed.name} was removed.`);setComplete(false);setDrafts([]);setProcessed(0);const batchId=batchIdRef.current;if(batchId){if(next.length)void saveBatchFiles(batchId,next.map(file=>file.file)).catch(()=>undefined);else void clearBatchFiles(batchId)}}

  function updateDesign(id: string, change: Partial<DesignFile>) { const clearedChange=change.title!==undefined&&change.titleError===undefined?{...change,titleError:"",titleWarning:""}:change;const nextChange=clearedChange.title!==undefined&&titleCaps?{...clearedChange,title:clearedChange.title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase())}:clearedChange;setFiles((current) => current.map((file) => file.id === id ? { ...file, ...nextChange } : file)); if(nextChange.title!==undefined)setDrafts(current=>current.map(draft=>draft.clientId===id?{...draft,title:nextChange.title}:draft)); }
  function pulseTitle(id:string){setTitlePulseIds(current=>new Set(current).add(id));window.setTimeout(()=>setTitlePulseIds(current=>{const next=new Set(current);next.delete(id);return next}),520)}
  /* D488 - DATA LOSS. Opening a saved batch by URL deleted it. Verified live:
     her published batch 93db4b27, the one holding her two live Etsy listings,
     was at the top of Batch History and was gone from the database seconds after
     I opened it at step 3.

     This function deletes the prior batch server-side, and defaulted to doing
     so. Its three callers - starting a bundle, adding a product, changing
     product - only ask permission when files, drafts or a completed run are
     already in memory. During a restore none of those are populated yet, so the
     confirmation is skipped and the DELETE fires against the very batch being
     opened.

     Deleting now has to be asked for. Leaving a stale batch in history is a
     tidiness problem; deleting a published one cannot be undone. */
  function clearCurrentBatch(clearProduct=true,preserveSavedBatch=true){
    etsyProductBaseline.current=null;
    /* D301 · Starting over must also forget the remembered product, or the next
       refresh would restore the one that was just cleared. */
    if(clearProduct){try{window.localStorage.removeItem("goldie-active-recipe");window.localStorage.removeItem("goldie-active-bundle")}catch{/* private mode */}}
    const priorBatch=batchIdRef.current;
    /* D488 - and a second, independent guard: a batch that published listings is
       the only record she has that they exist. Even the discard path she chose
       by name does not get to delete that. */
    const publishedThisBatch=Number(batchReceipt?.publishedCount)||0;
    if(priorBatch&&!preserveSavedBatch&&!publishedThisBatch){void clearBatchFiles(priorBatch);void fetch(`/api/batches?id=${encodeURIComponent(priorBatch)}`,{method:"DELETE"})}
    if(!preserveSavedBatch&&!publishedThisBatch)drafts.forEach(draft=>{if(draft.id)void fetch(`/api/etsy/images?productId=${encodeURIComponent(draft.id)}`,{method:"DELETE"})});
    batchIdRef.current="";window.localStorage.removeItem("goldie-active-batch");
    const freshUrl=new URL(window.location.href);freshUrl.searchParams.delete("batch");window.history.replaceState({},"",freshUrl);
    files.forEach(file=>URL.revokeObjectURL(file.previewUrl));
    templateLoadVersion.current+=1;setLoadingTemplate(false);setFiles([]);setFileError("");setDrafts([]);setProcessed(0);setRunTotal(0);setComplete(false);setOpenedDrafts([]);setOpenAllMessage("");setBulkTitles("");setBatchKeywords([]);setTitleJoiner(", ");setTitleBuilderMode("ai");setAutoTitleBank(null);setAutoTitleBankId("");setManualKeywordBankId("");setActiveDesign("");setPreflightOpen(false);setUploadNoticeOpen(false);setPrintifyImageIndices([]);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setSelectedColorIds([]);setColorsRemembered(false);setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");syncedListingSignatures.current.clear();
    if(clearProduct){setTemplate("");setTemplateDetails(null);setTemplateError("");setDescription("");setMockupTheme("");setActiveRecipe(null);setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);setBundleColorProducts({});setBundleBatchIds({});setBundleColorChoices({});setBundleQualityDecisions({});setPricing(current=>({...current,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0}))}
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
  }
  async function selectRecipe(recipe:Recipe):Promise<TemplateDetails|null>{etsyProductBaseline.current=null;/* D301 · Colours and sizes were persisted per template, but the product
     SELECTION itself was not — so a refresh kept every choice and lost the
     thing they were choices about, landing you on a blank product step. Only
     a saved ?batch= restored it, and that id does not exist until a batch has
     been saved server-side. */
    /* D354 · selectRecipe loads a product; it does not decide what the seller
       SELECTED. useBundle calls it for the first product of a bundle, so clearing
       the bundle key here erased the bundle's own memory a moment after
       useBundle wrote it — and left a single-product breadcrumb pointing at the
       first member, which is what the next refresh restored. The two callers own
       that decision now: chooseRecipe clears the bundle, useBundle writes it. */
    try{window.localStorage.setItem("goldie-active-recipe",recipe.id)}catch{/* private mode */}
    setActiveRecipe(recipe);setPrintifyImageIndices(recipe.printifyImageIndices||[]);setEtsyShippingProfileId(Number(recipe.etsyShippingProfileId)||0);/* D394 - A saved product already carries the seller's profit target and their
       chosen shipping profile. Asking them to approve it again on every batch is a
       question already answered, and it is what left a card of ticks sitting behind
       a gate that would not open. */
    setPricingApproved(recipeCarriesApprovedPricing({defaultProfitTarget:recipe.defaultProfitTarget,etsyShippingProfileId:recipe.etsyShippingProfileId}));/* D404 - Restore the prices and the whole-number toggle the seller saved on this
       product, so the product step survives a refresh. */
    setVariantPrices(recipe.variantPrices&&Object.keys(recipe.variantPrices).length?{...recipe.variantPrices}:{});
    setWholeNumberByRecipe(current=>({...current,[recipe.id]:recipe.wholeNumberPricing===true}));setTemplate(recipe.templateUrl);const savedTheme=recipe.defaultMockupTheme||"",savedMockups=savedTheme?{theme:savedTheme,ids:recipe.mockupIds||[]}:undefined;setMockupTheme(savedTheme);setSharedMockups(savedMockups);window.sessionStorage.setItem("goldie-batch-mockups",JSON.stringify(savedMockups||null));setAutoTitleBankId(recipe.keywordListId||"");const nextPricing={...pricing,targetProfit:Number(recipe.defaultProfitTarget)||DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);const details=await loadTemplateUrl(recipe.templateUrl,nextPricing,Number(recipe.etsyShippingProfileId)||0,recipe.defaultColorIds||[],recipe.defaultSizeIds||[]);if(!details)return null;const savedDescription=recipe.description?.trim(),importedDescription=details.description?.trim();if(savedDescription)setDescription(recipe.description);else if(importedDescription){const updated={...recipe,description:details.description};setDescription(details.description);setActiveRecipe(updated);void fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:recipe.id,name:recipe.name,templateUrl:recipe.templateUrl,description:details.description})}).catch(()=>undefined)}return details}
  async function saveProductDefaults(change:Partial<Recipe>,key:string){if(!activeRecipe)return;const recipeId=activeRecipe.id;setSavingProductDefault(key);try{const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,...change})});if(!response.ok)throw new Error("Goldie could not save this product default.");/* D463 - this used to merge into a copy of the recipe captured before the
   request and write that back afterwards, so a write that landed late put its
   stale base over a newer value. That is why picking a shipping profile left
   the Shipping row red saying "Pick a shipping profile" while the server had
   the profile saved, and a reload fixed it. Merging into whatever the recipe
   is NOW cannot go backwards. */
setActiveRecipe(current=>current&&current.id===recipeId?{...current,...change}:current);setBundleRecipes(current=>current.map(item=>item.id===recipeId?{...item,...change}:item));}catch(error){stopWith("This default was not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setSavingProductDefault("")}}
  async function rememberBatchDefaultsAfterPublish(){if(!activeRecipe)return;const updated={...activeRecipe,defaultColorIds:selectedColorIds,defaultSizeIds:selectedSizeIds,defaultMockupTheme:mockupTheme,mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,defaultColorIds:selectedColorIds,defaultSizeIds:selectedSizeIds,defaultMockupTheme:mockupTheme,mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]})});if(response.ok){setActiveRecipe(updated);setColorsRemembered(true);setSizesRemembered(true)}}
  /* D457 - a product saves its own defaults.
   *
   * Setting a product up used to end with a "Save these as X's defaults" button,
   * and until it was pressed the recipe held nothing. Readiness reads the saved
   * recipe, not the live selection, so choosing a shipping profile on a new
   * product left the card still saying "Pick a shipping profile" and the batch
   * refused to move on - the exact wall she hit on the mug.
   *
   * The button was also asking a question with one sensible answer. The first
   * time a product is set up, those choices ARE its defaults; every later change
   * to that product is the new default. So they save themselves, debounced, and
   * the product is set up as soon as it has the colours it needs. */
  const defaultsSignature=JSON.stringify({
    id:activeRecipe?.id||"",
    colors:selectedColorIds,sizes:selectedSizeIds,theme:mockupTheme,
    mockups:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[],
    shipping:etsyShippingProfileId,
  });
  const savedDefaultsRef=useRef("");
  useEffect(()=>{
    /* D460 - a mug has no colours to choose. Gating this on a colour selection
       meant a product with no colour options could never finish setting itself
       up, which is the same wall in a new place. The rule matches the gate:
       colours are only required when the product actually offers them. */
    if(!activeRecipe||!templateDetails)return;
    const coloursSettled=!templateDetails.colorOptions?.length||selectedColorIds.length>0;
    if(!coloursSettled)return;
    if(savedDefaultsRef.current===defaultsSignature)return;
    savedDefaultsRef.current=defaultsSignature;
    const timer=window.setTimeout(()=>{
      void saveProductDefaults({
        setupComplete:true,
        defaultColorIds:selectedColorIds,
        defaultSizeIds:selectedSizeIds,
        defaultMockupTheme:mockupTheme,
        mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[],
        ...(etsyShippingProfileId?{etsyShippingProfileId}:{}),
      },"auto-defaults");
    },600);
    return ()=>window.clearTimeout(timer);
  },[defaultsSignature,activeRecipe,templateDetails]);

  async function completeProductSetup(){if(!activeRecipe)return;await saveProductDefaults({setupComplete:true,defaultColorIds:selectedColorIds,defaultSizeIds:selectedSizeIds,defaultMockupTheme:mockupTheme,mockupIds:sharedMockups?.theme===mockupTheme?sharedMockups.ids:[]},"initial-setup")}
  async function chooseRecipe(recipe: Recipe) { const changingProduct=Boolean((activeRecipe?.id&&activeRecipe.id!==recipe.id)||(template&&template!==recipe.templateUrl));if(changingProduct&&(files.length>0||drafts.length>0||complete)){const count=files.length;if(!await confirmAction({title:`Switch to “${recipe.name}” and start a new batch?`,body:`This removes ${count} ${count===1?"design":"designs"} and all work from the current batch. Your saved products and keyword banks are untouched.`,confirmLabel:"Switch product",destructive:true}))return false;clearCurrentBatch(false)}try{window.localStorage.removeItem("goldie-active-bundle")}catch{/* private mode */}setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);return Boolean(await selectRecipe(recipe)); }
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
    if((files.length>0||drafts.length>0||complete)&&!await confirmAction({title:`Start “${bundle.name}” and clear this batch?`,body:"Your current designs and unfinished work will be removed. Your saved products and keyword banks are untouched.",confirmLabel:"Start this bundle",destructive:true}))return false;
    clearCurrentBatch(true);
    setActiveBundle(bundle);setBundleRecipes(recipes);setBundleIndex(0);const first=await selectRecipe(recipes[0]);if(!first)return false;/* D354 · Written AFTER selectRecipe, because selectRecipe writes the
       single-product key and used to clear this one. Refresh must land on the
       bundle, not on its first member. */
    try{window.localStorage.setItem("goldie-active-bundle",JSON.stringify({id:bundle.id,recipeIds:recipes.map(item=>item.id)}))}catch{/* private mode */}
    /* D373 - The other bundle members were fetched one after another, each with a
       90 second deadline, and nothing was written to state until the whole loop
       finished. On a three-product bundle that left "Loading Gildan Tee..." and
       "Loading gildan crewneck..." on screen for minutes, and one slow product
       held up every product behind it. Fetch them together and show each the
       moment it lands. */
    const loaded:Record<string,TemplateDetails>={[recipes[0].id]:first},choices:Record<string,number[]>={};
    const adopt=(recipe:Recipe,details:TemplateDetails)=>{
      loaded[recipe.id]=details;
      const available=new Set((details.colorOptions||[]).filter(color=>color.available).map(color=>color.id));
      /* D213 - A bundle member with no saved colours has not been set up. Leave it
         empty so its card asks, instead of adopting Printify's template. */
      const ids=(recipe.defaultColorIds||[]).filter(id=>available.has(id));
      choices[recipe.id]=ids;
      if(recipeCarriesApprovedPricing({defaultProfitTarget:recipe.defaultProfitTarget,etsyShippingProfileId:recipe.etsyShippingProfileId}))setBundleApproved(current=>({...current,[recipe.id]:true}));
      /* D385 - Nothing is written to state here. D373 revealed each product the
         moment it landed, which meant cards appearing one at a time and the page
         reflowing under her. Fetch them all at once, show them all at once. */
    };
    adopt(recipes[0],first);
    await Promise.all(recipes.filter(recipe=>recipe.id!==recipes[0].id).map(async recipe=>{
      const details=await fetchWithDeadline("/api/printify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productUrl:recipe.templateUrl,savedShippingProfileId:Number(recipe.etsyShippingProfileId)||0})},90000)
        .then(async response=>response.ok?(await response.json() as {product?:TemplateDetails}).product:undefined)
        .catch(()=>undefined);
      if(details)adopt(recipe,details);
    }));
    setBundleColorProducts(current=>({...current,...loaded}));setBundleColorChoices(current=>({...current,...choices}));return true;
  }
  /* D504 - its only reader now shares the per-product loader below. */

  /* D378 - What a card says about a product on each of the three steps. Every
     label is read from something real: the designs in hand, the batch's own
     draft and published counts, or the absence of a batch at all. */
  function bundleCardStatus(step:"images"|"listing"|"publish"){
    return (recipe:Recipe,index:number):{label:string;tone:"ready"|"attention"|"advice"|"waiting"}=>{
      if(index===bundleIndex){
        if(step==="images")return complete?{label:`${drafts.length} ${drafts.length===1?"draft":"drafts"}`,tone:"ready"}:{label:`${files.length} ${files.length===1?"design":"designs"}`,tone:"attention"};
        if(step==="listing"){
          /* D624 · This card said "Titles ready" in green while the row directly
             beneath it said "2 of 2 titles · 0 of 2 with all 13 tags" in crimson
             with a warning mark. Both were true - the titles were written, the
             tags were not - but the badge summarises the rows, so a card that
             reads ready and not-ready at the same time is just confusing. The
             badge now agrees with the row it sits above: it counts tags too. */
          const titled=files.filter(file=>file.title.trim()).length;
          const tagged=files.filter(file=>file.tags.length>=13).length;
          if(!files.length)return {label:"0 titled",tone:"attention"};
          if(titled<files.length)return {label:`${titled} of ${files.length} titled`,tone:"attention"};
          /* D660 · D624 made this badge count tags so it would stop disagreeing
             with the row beneath it. The row has now been corrected in the other
             direction - a short tag count is an optimisation Etsy never demands,
             not a fault - so the badge follows it there rather than falling back
             into disagreeing again. Reported, in the softer tone, never as
             "attention". */
          /* D648 - the badge said "Titles and tags ready" in green directly above
             a crimson "0 of 1 ready - Closure still needed". D624 taught it to
             count tags; it still ignored the Etsy details on the same card, so
             the card could call itself ready while a row under it could not
             publish. It summarises every row it sits above or it summarises
             nothing. */
          const etsyReady=files.filter(file=>etsyRequiredComplete(file.etsy)).length;
          if(etsyReady<files.length)return {label:`${etsyReady} of ${files.length} Etsy details ready`,tone:"attention"};
          /* D660 · Reported after every real blocker, and in the softer tone.
             A blocker still outranks it, so the badge never leads with advice
             while something underneath genuinely cannot publish. */
          /* D693 - "0 of 2 fully tagged" beside three green ticks reads as a failure. The
             tone was already advice; the words were a deficit counter. Say the
             opportunity, in the row's own language. */
          if(tagged<files.length)return {label:`${files.length-tagged} could use all 13 tags`,tone:"advice"};
          return {label:"Titles and tags ready",tone:"ready"};
        }
        const published=Number(batchReceipt?.publishedCount)||0;
        if(published)return {label:`${published} published`,tone:"ready"};
        const ready=drafts.filter(draft=>draft.status==="Created").length;
        return {label:`${ready} ${ready===1?"Printify draft":"Printify drafts"}`,tone:"attention"};
      }
      /* D504 - this read a second map, loaded by a second effect, so the chip and
         the rows on the same card could disagree with each other. Same map now. */
      const summary=bundleBatchSummary[recipe.id];
      if(!summary)return {label:bundleBatchIds[recipe.id]?"Checking…":"Not started yet",tone:"waiting"};
      /* D627 - "Checking…" forever was the old answer here. Say what is true. */
      if(summary.unreadable)return {label:"Batch not found",tone:"attention"};
      /* D694 · This branch was step-agnostic while the rows above it were not.
         On step 3 a card whose rows read "2 of 2 titles", "Attached", "2 of 2
         ready" carried the badge "2 drafts" - a step 2 answer on a step 3 card -
         and on step 4 it said "2 drafts" instead of "2 ready". Measured on the
         Hoodie + 1566 crewneck bundle: two cards, identical rows, different
         badges.

         D624 already wrote the rule down - "the badge summarises the rows or it
         summarises nothing" - and fixed it for the product she happens to be on.
         The other products kept the old behaviour, so the same defect survived on
         every card but one. Same per-step logic now, from the same map the rows
         read. */
      if(step==="images"){
        if(summary.drafts)return {label:`${summary.drafts} ${summary.drafts===1?"draft":"drafts"}`,tone:summary.status==="complete"?"ready":"attention"};
        if(summary.designs)return {label:`${summary.designs} ${summary.designs===1?"design":"designs"}`,tone:"attention"};
        return {label:"Not started yet",tone:"waiting"};
      }
      if(step==="listing"){
        if(!summary.designs)return {label:"Not started yet",tone:"waiting"};
        if(summary.titled<summary.designs)return {label:`${summary.titled} of ${summary.designs} titled`,tone:"attention"};
        /* A blocker outranks advice here too, so the badge never leads with the
           tag shortfall while Etsy fields underneath cannot publish. */
        if(summary.etsyReady<summary.designs)return {label:`${summary.etsyReady} of ${summary.designs} Etsy details ready`,tone:"attention"};
        if(summary.tagged<summary.designs)return {label:`${summary.designs-summary.tagged} could use all 13 tags`,tone:"advice"};
        return {label:"Titles and tags ready",tone:"ready"};
      }
      if(summary.published)return {label:`${summary.published} published`,tone:"ready"};
      if(summary.drafts)return {label:`${summary.drafts} ${summary.drafts===1?"Printify draft":"Printify drafts"}`,tone:"attention"};
      return {label:"Not started yet",tone:"waiting"};
    };
  }

  /* D378 - The product card rail shared by Images, Listing and Publish.
     Step 1 shows one card per product and you open one at a time; these steps
     showed a single product with a "CURRENT PRODUCT" chip and no sign the others
     existed. Same card, same header, same one-open-at-a-time behaviour, so all
     four steps read as one tool.

     The step's own content is the open card's body. Closed cards state where
     that product stands, and clicking one opens it. */
  /* D486 - a bundle's shared action does not belong inside one product's card.
     "Create Printify drafts for all 3 products" sat inside the Gildan Hoodie
     card, above two cards offering to open the other products - so the page
     showed a button that acts on everything, nested inside one third of what it
     acts on. A step whose action covers the whole bundle passes that action as a
     footer: the cards report their products, the action sits below all of them,
     and the per-card open controls disappear because there is nothing left to
     open one at a time for. */
  /* D486 - the other products' details are fetched when a bundle is first
     chosen, and never again. Reopening a saved bundle batch left their cards
     with a grey placeholder glyph instead of the product, on a page whose whole
     job is to show her the three products she is about to build. */
  useEffect(()=>{
    if(!activeBundle||bundleRecipes.length<2)return;
    const missing=bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id&&!bundleColorProducts[recipe.id]&&recipe.templateUrl);
    if(!missing.length)return;
    let alive=true;
    void Promise.all(missing.map(async recipe=>{
      const details=await fetchWithDeadline("/api/printify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productUrl:recipe.templateUrl,savedShippingProfileId:Number(recipe.etsyShippingProfileId)||0})},30000)
        .then(async response=>response.ok?(await response.json() as {product?:TemplateDetails}).product:undefined)
        .catch(()=>undefined);
      return details?[recipe.id,details] as const:null;
    })).then(entries=>{
      if(!alive)return;
      const loaded=Object.fromEntries(entries.filter(Boolean) as Array<readonly [string,TemplateDetails]>);
      if(Object.keys(loaded).length)setBundleColorProducts(current=>({...current,...loaded}));
    });
    return()=>{alive=false};
  },[activeBundle,bundleRecipes,activeRecipe,bundleColorProducts]);

  /* D499 - step 1 shows every product in the bundle as the same card, expanded,
     each with its own rows - Colors, Sizes, Pricing, Shipping - and a Change
     button on each. Steps 2, 3 and 4 showed one product's work and left the
     others as bare headers, so the page stopped telling her anything about two
     of the three products she is building. Same card, same rows, every step.

     The other products' work lives in their own batches, so it has to be read
     from them; the product being worked is read from state, which is always
     fresher than anything saved. */
  const [bundleBatchSummary,setBundleBatchSummary]=useState<Record<string,{designs:number;titled:number;tagged:number;etsyReady:number;drafts:number;described:boolean;complete:boolean;published:number;status:string;photos:number;mockups:number;unreadable?:boolean}>>({});
  /* D559 - the sibling batches were read for their counts and then thrown away,
     so the publish screen could only ever show the open product's listings while
     the button published all three. Her question, looking at it: "why if this is
     a hoodie t shirt and crew neck batch would it be showing me two hoodies
     only?" The same read keeps the listings and the settings each product needs
     to publish, so every listing in the bundle is on the page and selectable. */
  const [bundleMembers,setBundleMembers]=useState<Record<string,{recipeId:string;productName:string;drafts:DraftResult[];designs:Array<Omit<DesignFile,"file"|"previewUrl">>;selections:Record<string,number[]>;indices:number[];shippingProfileId:number;sizeGuideName:string;preparedMockupCounts:Record<string,number>}>>({});
  useEffect(()=>{
    if(!activeBundle||bundleRecipes.length<2)return;
    const wanted=bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id&&bundleBatchIds[recipe.id]);
    if(!wanted.length)return;
    let alive=true;
    const memberScratch:Record<string,{recipeId:string;productName:string;drafts:DraftResult[];designs:Array<Omit<DesignFile,"file"|"previewUrl">>;selections:Record<string,number[]>;indices:number[];shippingProfileId:number;sizeGuideName:string;preparedMockupCounts:Record<string,number>}>={};
    void (async()=>{
    const listing=await fetch("/api/batches").then(response=>response.ok?response.json():null).then((payload:{batches?:Array<{id?:string;status?:string;published_count?:number}>}|null)=>payload?.batches||[]).catch(()=>[] as Array<{id?:string;status?:string;published_count?:number}>);
    await Promise.all(wanted.map(async recipe=>{
      const id=bundleBatchIds[recipe.id];
      const payload=await fetch(`/api/batches?id=${encodeURIComponent(id)}`).then(response=>response.ok?response.json():null).catch(()=>null) as {batch?:{state?:Record<string,unknown>}}|null;
      const state=payload?.batch?.state as {designs?:Array<{id?:string;title?:string;tags?:string[];sizeGuideName?:string}>;drafts?:unknown[];description?:string;complete?:boolean;printifyImageSelections?:Record<string,number[]>;printifyImageIndices?:number[];preparedMockupCounts?:Record<string,number>;etsyShippingProfileId?:number;sizeGuideName?:string}|undefined;
      /* D627 · This returned null, so no summary was ever written for a member
         whose batch could not be read - and bundleProductsStillReading() reports
         exactly "has a batch id, has no summary". Measured live on ZZ TEST
         BUNDLE: the Gildan Hoodie member pointed at batch 2d2650a1, which 404s,
         so its card read "Checking…" forever and Publish stayed disabled saying
         "Goldie is still reading the other products in this batch". It was not
         still reading. The bundle could never be published by anyone, and the
         message promised it was about to finish. Unreadable is an answer. */
      if(!state)return [recipe.id,{designs:0,titled:0,tagged:0,etsyReady:0,drafts:0,described:false,complete:false,published:0,status:"",photos:0,mockups:0,unreadable:true}] as const;
      const designs=state.designs||[];
      /* D504 - the chip and the rows on the same card were fed by two different
         maps, loaded by two different effects at two different moments, so one
         could read "2 drafts" while the other read blank on the same
         card. One loader, one map, one answer per product. */
      const listed=listing.find(batch=>String(batch.id||"")===id);
      /* D559 - keep what publishing needs, not just what the card counts. */
      memberScratch[recipe.id]={recipeId:recipe.id,productName:recipe.name,
        drafts:(state.drafts||[]) as DraftResult[],
        designs:designs as Array<Omit<DesignFile,"file"|"previewUrl">>,
        selections:state.printifyImageSelections||{},
        indices:state.printifyImageIndices||[],
        shippingProfileId:Number(state.etsyShippingProfileId)||0,
        sizeGuideName:String(state.sizeGuideName||""),
        preparedMockupCounts:state.preparedMockupCounts||{}};
      return [recipe.id,{designs:designs.length,
        titled:designs.filter(design=>String(design.title||"").trim()).length,
        tagged:designs.filter(design=>(design.tags||[]).length>=13).length,
        /* D694 - the badge for a product she is not currently on could not see
           whether its Etsy fields were complete, so it had no way to report the
           one thing on this step that actually blocks publishing. Same map the
           rows read, so they cannot disagree. */
        etsyReady:designs.filter(design=>etsyRequiredComplete((design as {etsy?:{properties?:Array<{required?:boolean;value?:string}>}}).etsy)).length,
        drafts:(state.drafts||[]).length,
        described:Boolean(String(state.description||"").trim()),
        complete:Boolean(state.complete),
        published:Number(listed?.published_count)||0,
        status:String(listed?.status||""),
        photos:Object.values(state.printifyImageSelections||{}).reduce((total,ids)=>total+(Array.isArray(ids)?ids.length:0),0)||(state.printifyImageIndices||[]).length,
        mockups:Object.values(state.preparedMockupCounts||{}).reduce((total,count)=>total+(Number(count)||0),0)}] as const;
    })).then(entries=>{
      if(!alive)return;
      const loaded=Object.fromEntries(entries.filter(Boolean) as Array<readonly [string,{designs:number;titled:number;tagged:number;etsyReady:number;drafts:number;described:boolean;complete:boolean;published:number;status:string;photos:number;mockups:number;unreadable?:boolean}]>);
      if(Object.keys(loaded).length)setBundleBatchSummary(current=>({...current,...loaded}));
      if(Object.keys(memberScratch).length)setBundleMembers(current=>({...current,...memberScratch}));
    });
    })();
    return()=>{alive=false};
    /* D501 - savedRevision was in here, so every autosave - one per 700ms while
       she types a title - refetched every other product's batch. The other
       products' saved work can only change when she is working on one of them,
       which means when the active product changes. That is what this watches. */
  },[activeBundle,bundleRecipes,activeRecipe,bundleBatchIds]);

  function productRows(recipe:Recipe,isActive:boolean):Array<{label:string;value:string;detail?:string;advice?:string;done:boolean;target?:string;task?:string;report?:boolean;optional?:boolean;pending?:boolean}>{
    const mine=isActive
      ?{designs:files.length,titled:files.filter(file=>file.title.trim()).length,tagged:files.filter(file=>file.tags.length>=13).length,drafts:drafts.filter(draft=>draft.status==="Created").length,described:Boolean(description.trim()),complete,published:Number(batchReceipt?.publishedCount)||0,status:"",photos:Object.values(printifyImageSelections).reduce((total,ids)=>total+ids.length,0)||printifyImageIndices.length,mockups:Object.values(preparedMockupCounts).reduce((total,count)=>total+(Number(count)||0),0)}
      :bundleBatchSummary[recipe.id];
    /* D500 - a product with no batch yet had no summary to read, so it returned
       no rows and its card collapsed back to a bare header - the exact thing
       these rows exist to stop. Step 1 never does that: a product that is not
       set up still shows every row, saying it is not set. */
    const counts=mine||{designs:0,titled:0,tagged:0,drafts:0,described:false,complete:false,published:0,status:"",photos:0,mockups:0};
    /* D548 - the other products' batches are read after mount, so for a second or
       two every one of them has no summary and every row said blank.
       Measured on her bundle: step 2 showed all three products with two drafts
       each while step 4, a moment earlier, called two of them unstarted. A
       product with a batch is not unstarted - it is unread. */
    const unread=!isActive&&!mine&&Boolean(bundleBatchIds[recipe.id]);
    const blank=unread?"Checking…":"Not started yet";
    /* D556 - a product whose batch has not been read yet rendered every row with
       the alert mark and the alert colour, so three cards of "Checking…" read as
       three cards of problems. Waiting is not a fault. */
    const pending=unread;
    const plural=(count:number,word:string)=>`${count} ${count===1?word:`${word}s`}`;
    const started=Boolean(mine);
    /* D539 - step 2's rows are the four things she does to a product's photos,
       in the order she does them. Each one owns its panel; none of them points
       anywhere. */
    if(workflowStep==="designs")return [
      {label:"Review Printify placement",value:started?plural(counts.drafts,"listing"):blank,pending,done:counts.drafts>0,task:"placement"},
      {label:"Choose Printify photos",value:started?plural(counts.photos,"photo"):blank,pending,done:counts.photos>0,task:"printify"},
      {label:"Size guide",value:sizeGuideName||"None chosen",pending,done:Boolean(sizeGuideName),optional:true,task:"sizeguide"},
      /* D550 - lifestyle mockups are optional: nothing about publishing requires
         them, and her hoodie published-ready with four Printify photos and none.
         The row still rendered "! None made yet" in alert red on every product
         card, so a finished step reported a problem that does not exist. An
         optional row that is empty is not a warning. */
      /* D709 · One row. Uploading and ordering were two, and the second could
         not be done until the first had been, so the card advertised a step that
         was really the back half of the one above it. */
      {label:"Your photos and their order",value:started?plural(counts.photos+counts.mockups,"photo"):blank,pending,done:counts.photos+counts.mockups>0,task:"lifestyle"},
    ];
    /* D541 - both of these rows pointed at .final-review, so Listings and Titles
       and tags took you to the same block below the cards. Nothing on this step
       is per product: choosing what to publish and publishing it are one press
       in the footer, over the whole bundle. So the card reports what is about to
       go out for this product and does not offer to open anything. */
    if(finishPhase==="final"){
      /* D546 - the checklist under these cards repeated them line for line, so it
         went. Two of its lines were not repeated anywhere - how many titles are
         under 100 characters, and whether pricing and shipping were approved -
         and they belong on the rows that own that work. */
      const shortTitles=isActive?files.filter(file=>file.title.trim().length<100).length:0;
      return [
        {label:"Listings ready",value:started?plural(counts.drafts,"listing"):blank,pending,done:counts.drafts>0,report:true},
        {label:"Titles and tags",value:started?(()=>{
        /* D549 - her question, and she was right to ask it: "2 of 2 written · 1 at
           13 tags. Is that supposed to say one of thirteen tags? How could there be
           two titles written but only one tag?" It counted listings on the left and
           listings on the right, but only the left side said so, so the right side
           read as a tag count. Both sides count listings, out loud. */
        if(counts.tagged===counts.designs&&counts.designs>0)return `${counts.titled} of ${counts.designs} titles · all 13 tags`;
        return `${counts.titled} of ${counts.designs} titles · ${counts.tagged} of ${counts.designs} with all 13 tags`;
      })():blank,detail:isActive&&shortTitles?`${shortTitles} ${shortTitles===1?"title is":"titles are"} under 100 characters`:undefined,pending,/* D660 · Tags were folded into the same done-test as titles, so a listing with
   fewer than 13 tags carried the alert mark and the alert colour beside a
   product that genuinely could not publish. A missing title blocks; tags below
   thirteen are an optimisation, and Etsy accepts the listing either way -
   publishBlockers never mentions them. Done means titled; short tag counts are
   advice, in the detail line, not an error. */
done:started&&counts.designs>0&&counts.titled===counts.designs,advice:started&&counts.designs>0&&counts.titled===counts.designs&&counts.tagged<counts.designs?`${counts.designs-counts.tagged} of ${counts.designs} could use all 13 tags — optional, but Etsy ranks on them`:undefined,report:true},
        /* D490 - the checklist said only that one or more selected listings needed
           a photo, making her go and find which, on a page where everything else
           counted precisely. createdListingsMissingImages already knows exactly
           which drafts they are, so the row names them. D546 - it moved here with
           the checklist it used to live in. */
        {label:"Listing photos",value:started?plural(counts.photos+counts.mockups,"photo"):blank,detail:isActive?(()=>{
          const missing=createdListingsMissingImages(selectedPublishDrafts());
          if(!missing.length)return undefined;
          /* D494 - two designs exported minutes apart truncated to the same string,
             which is worse than not naming them. Filenames differ at the end, so
             keep both ends. */
          const shorten=(name:string,limit:number)=>name.length<=limit?name:`${name.slice(0,Math.ceil(limit/2)-1)}…${name.slice(-Math.floor(limit/2))}`;
          const named=missing.map(draft=>files.find(file=>file.id===draft.clientId)?.title?.trim()||files.find(file=>file.id===draft.clientId)?.file.name||"").filter(Boolean);
          if(missing.length===1&&named[0])return `${shorten(named[0],60)} still needs a photo`;
          if(named.length&&named.length===missing.length)return `${missing.length} listings still need a photo: ${named.map(name=>shorten(name,40)).join(", ")}`;
          return `${missing.length} of ${selectedPublishDrafts().length} selected listings still need a photo`;
        })():undefined,pending,done:counts.photos+counts.mockups>0,report:true},
        /* D548 - the checklist read "✓ Hoodies will be applied automatically", which is
           the name of her shipping profile in a sentence that sounds like it is about
           the garment. Say what the name refers to. */
        {label:"Pricing and shipping",value:isActive?(pricingApproved?`Approved · ${friendlyShippingProfileTitle(etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title)||"Etsy shipping profile"}`:"Needs review"):started?"Approved":blank,pending,done:isActive?pricingApproved:started,report:true},
        {label:"Published",value:counts.published?plural(counts.published,"listing"):"Not published yet",pending,done:counts.published>0,report:true},
      ];
    }
    return [
      /* D516 - Titles and Tags were two rows pointing at two different sections,
         which split one job in half on the page. Etsy tags come out of the same
         keyword bank as the title, in the same pass, by the same button - so it
         is one row, reporting both.
         D541 - and it opens its own panel now instead of scrolling into a block
         it shared with the description. The Etsy fields get a row too: during
         that phase both of the old rows pointed at content that was not even
         rendered, so pressing one threw the whole step back a phase. */
      {label:"Write titles and tags",value:started?(()=>{
        /* D549 - her question, and she was right to ask it: "2 of 2 written · 1 at
           13 tags. Is that supposed to say one of thirteen tags? How could there be
           two titles written but only one tag?" It counted listings on the left and
           listings on the right, but only the left side said so, so the right side
           read as a tag count. Both sides count listings, out loud. */
        if(counts.tagged===counts.designs&&counts.designs>0)return `${counts.titled} of ${counts.designs} titles · all 13 tags`;
        return `${counts.titled} of ${counts.designs} titles · ${counts.tagged} of ${counts.designs} with all 13 tags`;
      })():blank,pending,/* D660 · the same rule as the review row: a title is required,
        thirteen tags are an optimisation Etsy never demands. */
        done:started&&counts.designs>0&&counts.titled===counts.designs,advice:started&&counts.designs>0&&counts.titled===counts.designs&&counts.tagged<counts.designs?`${counts.designs-counts.tagged} of ${counts.designs} could use all 13 tags — optional, but Etsy ranks on them`:undefined,task:"titles"},
      {label:"Edit description",value:counts.described?"Attached":started?"Not attached":blank,pending,done:counts.described,task:"description"},
      {label:"Review Etsy category and fields",value:started?(()=>{
        if(!files.some(file=>file.etsy))return"Not created yet";
        const ready=files.filter(file=>etsyRequiredComplete(file.etsy)).length;
        if(ready===files.length)return`${ready} of ${files.length} ready`;
        /* D544 - "0 of 2 ready" is a score, not an instruction. When one field is
           blocking the whole batch, name it here. */
        const names=[...new Set(files.flatMap(file=>etsyMissingRequired(file.etsy)))];
        return names.length===1?`${ready} of ${files.length} ready · ${names[0]} still needed`:`${ready} of ${files.length} ready`;
      })():blank,pending,done:files.length>0&&files.every(file=>etsyRequiredComplete(file.etsy)),task:"etsy"},
    ];
  }

  /* D507 - step 2 listed every product in the bundle, and each one that had not
     been reached yet reported blank designs. That is not true and
     never was: the designs are uploaded once and carried to every product by the
     bundle run. The cards were describing per-product state on the one step that
     has none, and pressing Change on one of them switched products - which meant
     going back to step 1 and forward again to get to the same upload box she was
     already looking at. Step 2 shows the designs and the button that applies them
     to every product. */
  /* D539 - the rewrite she has been asking for. Until now the rows were bookmarks
     that scrolled into one enormous post-draft-workspace holding every listing's
     old page components, each with its own accordion inside it. Three rows, one
     pile, three scroll positions. A row is a control now: it decides which panel
     renders inside this product's card, and only that panel renders. The task
     survives switching product, so opening Printify photos on the hoodie and
     then choosing the tee opens the tee's Printify photos. */
  /* D544 - one honest question, asked in one place: has Goldie built the Etsy
     details for every listing yet? Before this, three different things claimed to
     know - a phase the state never enters, a URL parameter written by hand, and a
     progress index - and they disagreed. */
  const etsyDetailsPrepared=files.length>0&&files.every(file=>Boolean(file.etsy));
  const [activeTask,setActiveTask]=useState<string>("");
  /* D553 - openListing chose which listing's work was visible. Nothing chooses
     now: opening a task shows every listing's work, which is what step 2 did
     before D541. */
  /* D552 - her words: "when I click on choose printify photos, it pops me to the
     top of the design and images page, and then I have to scroll down to where I
     was." Measured on the live page, and nothing was scrolling: the open panel
     was 2817px of document, she was at 1917, and closing it to open another left
     a document of 1811 - so the browser clamped her scroll position down to 661.
     Not a jump, a collapse. The row she clicked stays exactly where it was on
     screen while the panels swap underneath it. */
  const rowAnchor=useRef<{element:HTMLElement;top:number}|null>(null);
  function holdRowInPlace(element:HTMLElement|null){
    if(element)rowAnchor.current={element,top:element.getBoundingClientRect().top};
  }
  useLayoutEffect(()=>{
    const held=rowAnchor.current;rowAnchor.current=null;
    if(!held||!held.element.isConnected)return;
    const drift=held.element.getBoundingClientRect().top-held.top;
    if(Math.abs(drift)>1)window.scrollBy({top:drift,behavior:"auto"});
  },[activeTask]);
  /* D541 - every task panel that works listing by listing shows the same row:
     the artwork, the listing name, where that listing stands on this one job,
     and Change. The job decides what opens underneath, so a listing's title is
     edited under Titles and its wording under Description, and neither one can
     drag the other along with it. */
  /* D553 - restored to what step 2 did before D541. Read off the build from
     4cf8c0f: every listing's working surface rendered open, one after another,
     each under its own name - "<p className=task-listing-name>{listingName}" then
     the editor. D541 wrapped each one in a collapsible row with a Change button,
     which turned a working surface into a chooser: to drag a photo she had to
     open the task, then pick a listing, then drag. Her words: "when I click to
     expand arrange final photo order, it is giving me columns of the listings
     with their titles, which is so fucking stupid."

     One collapse, at the task. Open the task and the work is there, for every
     listing, already open. */
/* D567 - loading="lazy" on an image with no intrinsic size is a deadlock: the
   element collapses to nothing, so the browser never decides it is near the
   viewport, so it never loads, so it never gets a size. Measured on her page -
   the scene tiles carry no lazy attribute and 8 of 8 loaded; every panel
   thumbnail carries it and 0 of 4 loaded, while a direct probe of the very same
   URL returned ok at 1536px. Those blank squares where a design thumbnail should
   be were never white-on-white artwork; they were images that never fetched. A
   panel is opened deliberately and holds a handful of images. */
  /* D687 · This used to render every listing fully expanded, one after another.
     At twenty listings that was 10,820px - 14.3 screens inside one panel, with no
     way to see which listings needed anything. It now renders through the shared
     ListingRows: a 76px row per listing, expanding into the same editor that used
     to always be open. `standing` becomes the row's meta counter and `flags`
     decides which rows announce themselves. */
  /* D691 · The row's one line has to preview what THIS panel is asking her to
     judge. All three showed the title, so Description and Etsy details rendered
     as three identical lists of titles and the preview line told her nothing
     about the thing she had opened the panel to check. */
  function taskSummary(task:string,design:DesignFile):string{
    if(task==="description")return (finalDescription(design,design.etsy)||"").replace(/\s+/g," ").trim()||"No description";
    if(task==="etsy")return design.etsy?.category?.trim()||"No Etsy category yet";
    return design.title.trim()||design.name;
  }
  function designTaskRows(task:string,standing:(design:DesignFile)=>string,inner:(design:DesignFile)=>ReactNode,flags?:(design:DesignFile)=>ListingFlag[]){
    return <ListingRows rows={files.map(design=>({
      key:`${task}:${design.id}`,
      thumb:design.previewUrl||drafts.find(draft=>draft.clientId===design.id)?.previewUrl||"",
      summary:taskSummary(task,design),
      meta:standing(design),
      flags:flags?flags(design):[],
      detail:<div onFocus={()=>setActiveDesign(design.id)}>{inner(design)}</div>,
    }))}/>;
  }

  /* D687 · The mechanical checks. Every one of these was already computable and
     was either reported too late or not at all: step 4 told her "1 title is under
     100 characters" AFTER she had scrolled the whole panel, and never said which
     listing. Catching mechanical failures before she reads a single row is what
     lets her spend the time on judgement instead of hunting. */
  function titleFlags(design:DesignFile):ListingFlag[]{
    const flags:ListingFlag[]=[];
    const length=(design.title||"").trim().length;
    /* Over 140 was flagged by nothing at all. Etsy rejects it. */
    if(length>140)flags.push({tone:"attention",label:`Over limit · ${length} chars`});
    else if(!length)flags.push({tone:"attention",label:"No title yet"});
    else if(length<100)flags.push({tone:"attention",label:`Short title · ${length} chars`});
    /* Tags are an optimisation, not a blocker - she was explicit about that - so
       this is a neutral note and never the accent. */
    const tags=(design.tags||[]).length;
    if(tags<13)flags.push({tone:"note",label:`${tags} of 13 tags`});
    return flags;
  }
  function descriptionFlags(design:DesignFile):ListingFlag[]{
    const text=finalDescription(design,design.etsy)||"";
    if(!text.trim())return [{tone:"attention",label:"No description"}];
    return [{tone:"note",label:design.descriptionOverride!==undefined?"Customized":"Same as batch"}];
  }
  function etsyFlags(design:DesignFile):ListingFlag[]{
    if(!design.etsy)return [{tone:"attention",label:design.title.trim()?"Not created yet":"Waiting for a title"}];
    if(etsyRequiredComplete(design.etsy))return [];
    const missing=etsyMissingRequired(design.etsy);
    if(!missing.length)return [{tone:"attention",label:"Needs review"}];
    /* Name them. "2 required fields missing" still leaves her opening the row to
       find out which. */
    return [{tone:"attention",label:`Missing ${missing.slice(0,2).join(", ")}${missing.length>2?` +${missing.length-2}`:""}`}];
  }

  function taskPanel(task:string){
    if(task==="sizeguide")return <div className="size-guide-row-panel"><p>Choose one image. Goldie adds it to every listing in this batch.</p><input ref={sizeGuidePicker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void applySizeGuide(file)}}/><div className="size-guide-row-actions"><button type="button" className="secondary-action" onClick={()=>sizeGuidePicker.current?.click()}>{sizeGuideName?"Replace size guide":"Choose size guide"}</button>{sizeGuideName&&<button type="button" className="secondary-action size-guide-remove" onClick={()=>void removeSizeGuide()}>Remove</button>}</div>{sizeGuideStatus&&<p role="status">{sizeGuideStatus}</p>}</div>;
    /* D541 - titles-resolving drives the pulse on each title field as the batch
       run fills them in. It rode on the listing-editor wrapper, so it went out
       with the block; it belongs on whatever holds the title fields. */
    if(task==="titles")return <div className={titlePulseIds.size?"titles-resolving":""}>
      <div className="task-panel-lead"><div><p className="mini-label">BATCH TITLE BUILDER</p><h3>Create titles for the whole batch</h3><p>Let Goldie select from your validated bank for each design, or choose the exact phrases yourself. No new keywords are ever added.</p></div><div className="title-builder-choice" role="group" aria-label="How do you want to create batch titles?"><button className={titleBuilderMode==="ai"?"active":""} onClick={()=>setTitleBuilderMode("ai")}><b>Goldie selects from my bank</b><span>Creates a different title for each design</span></button><button className={titleBuilderMode==="manual"?"active":""} onClick={()=>setTitleBuilderMode("manual")}><b>I choose from my bank</b><span>Uses your selections across the batch</span></button></div><div className="title-style-toggle"><span>Title format</span><button className={titleJoiner===", "?"active":""} onClick={()=>changeTitleJoiner(", ")}>With commas</button><button className={titleJoiner===" "?"active":""} onClick={()=>changeTitleJoiner(" ")}>Without commas</button>{/* D413 - Capitalization sat in its own card above the builder, but it is the
                    same decision as the comma style: how the title is formatted. One group. */}<button type="button" className={titleCaps?"active":""} aria-pressed={titleCaps} onClick={()=>changeTitleCaps(!titleCaps)}>{titleCaps?"Capitalized":"Not capitalized"}</button></div>{titleBuilderMode==="ai"?<div className="title-builder-pane"><KeywordBank selectionOnly initialId={autoTitleBankId||activeRecipe?.keywordListId||""} onSelect={list=>{setAutoTitleBank(list);setAutoTitleBankId(list?.id||"");/* D221 · Choosing the bank here IS establishing it for this product, the same as it was on the product card before the picker moved. Without this the choice would apply to this batch only and the next one would ask again. */if(activeRecipe&&list?.id&&list.id!==activeRecipe.keywordListId)void establish(activeRecipe,{keywordListId:list.id})}} title="Choose a keyword bank" copy="Goldie selects only exact phrases from this bank. It will not add keywords."/><div className="ai-title-disclaimer"><b>Review every title Goldie creates.</b><span>Goldie chooses the phrases it believes fit each design best from the bank you select. It does not verify that the keyword bank itself matches the design, and it will not reject mismatched phrases. Use your judgment before continuing.</span></div><button className="ai-title-button" title={batchHeldByAnotherTab?"This batch is open in another Goldie tab, so nothing saved here would be kept.":!autoTitleBank?"Choose a keyword bank first.":!files.length?"Upload a design first.":undefined} disabled={titleBuilding||!autoTitleBank||!files.length||batchHeldByAnotherTab} onClick={()=>void buildBatchTitle()}>{titleBuilding?`Creating ${files.length} titles…`:"Auto-create all titles"}</button>{/* D660 · The 1566 crewneck joined a bundle with no
             keyword bank, and only said so at step 3 with Auto-create disabled.
             Offered explicitly and never applied silently: two products in one
             bundle can legitimately want different banks, so copying it around
             on her behalf would be a guess about her keywords. */}
             {activeBundle&&bundleRecipes.length>1&&autoTitleBankId&&bundleRecipes.some(recipe=>recipe.id!==activeRecipe?.id&&recipe.keywordListId!==autoTitleBankId)?<button type="button" className="secondary-action" disabled={applyingBankToBundle} onClick={()=>void applyBankToBundle()}>{applyingBankToBundle?"Applying to every product…":`Use this keyword bank for every product in this bundle (${bundleRecipes.length})`}</button>:null}{titleBuildMessage&&<p className="title-build-message" role="status">{titleBuildMessage}</p>}</div>:<div className="title-builder-pane manual-title-builder"><KeywordBank initialId={manualKeywordBankId||activeRecipe?.keywordListId||""} onSelect={list=>setManualKeywordBankId(list?.id||"")} onAdd={addBatchKeyword} title="Choose a keyword bank" copy="Click keywords in the order you want them. Every click updates all listings below."/><div className="selected-batch-keywords"><div><b>Selected keywords</b>{batchKeywords.length>0&&<button onClick={clearBatchKeywords}>Clear all</button>}</div>{batchKeywords.length?<div className="selected-keyword-chips">{batchKeywords.map(keyword=><button key={keyword} onClick={()=>removeBatchKeyword(keyword)}>{keyword}<span>×</span></button>)}</div>:<p>No keywords selected yet.</p>}</div>{batchKeywords.length>0&&<div className="batch-title-preview"><b>Batch title preview</b><span>{batchKeywords.join(titleJoiner)}</span><small>Applied to every listing below. You can still edit any listing individually.</small></div>}</div>}</div>
      {designTaskRows("titles",design=>`${(design.title||"").trim().length}/140`,design=><div className="task-listing-edit">{/* D541 - D408 found this the hard way: at thumbnail size the artwork
        is unreadable, so the card cannot tell you which design you are writing a
        title for. The row stays compact; the preview comes back at a size you can
        read once the row is open. */}{(()=>{const shot=design.previewUrl||drafts.find(draft=>draft.clientId===design.id)?.previewUrl;return shot?<button type="button" className="task-listing-preview" onClick={()=>window.open(shot,"_blank","noopener,noreferrer")} aria-label={`Open a larger preview of ${design.title.trim()||design.name}`}><img src={shot} alt={design.name||"Design artwork"} decoding="async"/><span>Enlarge</span></button>:null})()}<div className="design-fields"><label>Title <span>{design.title.length}/140</span><textarea className="listing-title-field" rows={3} value={design.title} maxLength={140} onChange={event=>{const title=event.target.value;updateDesign(design.id,{title,tags:tagsFromTitle(title),etsy:undefined})}}/></label><label>Tags <span>{design.tags.length}/13</span><textarea className="listing-tags-field" rows={3} value={design.tags.join(", ")} onChange={event=>updateDesign(design.id,{tags:[...new Set(event.target.value.split(",").map(tag=>tag.trim().toLowerCase()).filter(tag=>tag&&tag.length<=20))].slice(0,13),etsy:undefined})} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}{!design.tags.length&&<small>Goldie will create matching tags with the title.</small>}</div><IndividualAutoTitle design={design} template={templateDetails} useCommas={titleJoiner===", "} paused={batchHeldByAnotherTab} onApply={(title,tags)=>{setActiveDesign(design.id);updateDesign(design.id,{title,tags,etsy:undefined,etsyError:""})}}/>{design.etsyError&&<small className="field-error">{design.etsyError}</small>}</div></div>,titleFlags)}
    </div>;
    if(task==="description")return <>
      <div className="task-panel-lead"><div className="batch-description-body"><p>This came from your saved product. Edit it once here to change the shared description on every listing in this batch.</p><label>Description for every listing<textarea rows={9} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add sizing, materials, production, care, and shipping information"/></label><small>Open any listing below only when that listing needs different wording.</small>{/* D232 · "Save this description as the default" went with the settings block. The
                     shared editor survived the move but the way to keep the wording for future
                     batches did not, so it comes back where the description is now edited. */}{description.trim()!==String(activeRecipe?.description||"").trim()&&<button type="button" className="save-product-default" disabled={!description.trim()||savingProductDefault==="description"} onClick={()=>void saveProductDefaults({description},"description")}>{savingProductDefault==="description"?"Saving…":"Save this description as the default"}</button>}</div></div>
      {designTaskRows("description",design=>`${(finalDescription(design,design.etsy)||"").length} chars`,design=><div className="individual-description-body"><p>The complete description is shown below. Edit it only if this listing needs different wording or an additional blurb.</p><label>Description for this listing<textarea rows={10} value={finalDescription(design,design.etsy)} onChange={event=>updateDesign(design.id,{descriptionOverride:event.target.value,etsyError:""})}/></label>{design.descriptionOverride!==undefined&&<div className="listing-card-actions"><button type="button" onClick={()=>updateDesign(design.id,{descriptionOverride:undefined,etsyError:""})}>Use the batch description again</button></div>}<small>Spacing and line breaks are preserved when this description is sent to Printify and Etsy.</small></div>,descriptionFlags)}
    </>;
    if(task==="etsy")return <>
      <div className="task-panel-lead"><div className="task-panel-heading"><h3>Review your Etsy listing details</h3><span className="done-mark">{files.filter(file=>etsyRequiredComplete(file.etsy)).length}/{files.length} ready</span></div><p className="step-copy">Goldie has pre-filled the Etsy category and every product field it could confidently match for each listing. Look everything over and change any selection that does not fit.</p>{files.every(file=>etsyRequiredComplete(file.etsy))&&<div className="variant-transfer-note"><span>✓</span><div><b>Core listing information is ready for your review.</b><small>This step contains additional Etsy category and product fields. Optional fields stay blank when there is not a clear match.</small></div></div>}</div>
      {designTaskRows("etsy",design=>{
        /* D691 · This is the row's right-hand counter, and etsyFlags already says
           whether the listing is ready. Returning "Ready" here printed the word
           twice on the same row, once as a chip and once beside it. Count the
           fields instead - that is what a counter is for. */
        const properties=(design.etsy?.properties)||[];
        const required=properties.filter(property=>property.required);
        if(!design.etsy)return "";
        if(!required.length)return "No required fields";
        return `${required.filter(property=>(property.value||"").trim()).length}/${required.length} fields`;
      },design=><div className="etsy-detail-body">{design.etsy?<EtsyDetailsEditor design={design} categories={etsyCategories} onChange={etsy=>updateDesign(design.id,{etsy,etsyError:""})} onCategory={taxonomyId=>changeEtsyCategory(design,taxonomyId)}/>:<div className={design.title.trim()?"etsy-detail-error":"etsy-detail-pending"}><b>{design.title.trim()?"Etsy details still need to be created.":"Waiting for this listing’s title."}</b><span>{design.title.trim()?design.etsyError:"Goldie fills in the Etsy category and product fields automatically once a title exists. Create titles above and this completes itself."}</span>{design.title.trim()&&<button aria-busy={preparingListingId===design.id} disabled={Boolean(preparingListingId)} onClick={()=>void retryOneEtsyListing(design)}>{preparingListingId===design.id?"Preparing this listing…":"Try this listing again"}</button>}</div>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}</div>,etsyFlags)}
    </>;
    const listings=drafts.map(draft=>({draft,design:files.find(file=>file.id===draft.clientId),selectedImages:draft.id?(printifyImageSelections[draft.id]??printifyImageIndices):printifyImageIndices}));
    /* D684 - "I don't need to see the title of the design... just show the listing
       photo and create some title that says what the listing is." Step 2 runs
       before titles are written in step 3, so design.title is empty here and every
       one of these headings fell through to design.name - the upload's filename,
       "ChatGPT Image Aug 28, 2026, 10_44_01 AM.png". That names a file on her disk.
       It never named the listing. Until a real title exists, say which product this
       is and which of the batch's listings she is looking at. */
    const listingLabel=(design:DesignFile|undefined)=>{
      const chosen=design?.title?.trim();
      if(chosen)return chosen;
      /* D685 - which listing of the batch this is now has its own heading
         ("Listing 1 of 2"), so repeating it here would say it twice. */
      return templateDetails?.blueprintTitle?.trim()||"Listing";
    };
    /* D687 · The three photo panels rendered this same head-then-work stack three
       times, copy-pasted. They now share ListingRows with the step 3 panels, so
       one change to a thumbnail size lands everywhere instead of in one of four
       places. defaultOpen is not decoration: D553 - "when I click to expand
       arrange final photo order, it is giving me columns of the listings with
       their titles, which is so fucking stupid". Dragging a photo is direct
       manipulation and has to be open. Reading a title is scanning, which is why
       step 3 collapses and these do not. */
    /* A listing with no photos cannot publish - step 4 already refuses it with
       "Add at least one listing photo". Saying so here, on the listing, is the
       difference between finding out now and finding out at the end. */
    const photoFlags=({count}:{count:number}):ListingFlag[]=>count?[]:[{tone:"attention",label:"No photos yet"}];
    const listingWorkRows=(work:(entry:{draft:typeof drafts[number];design:DesignFile;selectedImages:number[];count:number})=>ReactNode,flags?:(entry:{draft:typeof drafts[number];design:DesignFile;selectedImages:number[];count:number})=>ListingFlag[])=>{
      const usable=listings.filter(({draft,design})=>draft.status==="Created"&&design&&draft.id);
      return <ListingRows defaultOpen rows={usable.map(({draft,design,selectedImages})=>{
        const count=selectedImages.length+(preparedMockupCounts[draft.id||""]||0);
        const entry={draft,design:design as DesignFile,selectedImages,count};
        return {
          key:draft.clientId,
          thumb:draft.previewUrl||"",
          summary:listingLabel(design),
          meta:`${count} ${count===1?"photo":"photos"}`,
          flags:flags?flags(entry):[],
          detail:work(entry),
        };
      })}/>;
    };
    if(!listings.length)return null;
    if(task==="placement")return <>
          <div className="task-panel-body placement-review-grid">{listings.map(({draft,design},listingIndex)=>draft.status!=="Created"?<div className="task-listing failed" key={draft.clientId}>
            <div className="task-listing-ident"><span className="task-listing-index">Listing {listingIndex+1} of {listings.length}</span><p className="task-listing-name">{listingLabel(design)}</p></div>
            {/* D539 - a listing that failed to create still has to be reachable and
                still has to offer its retry and its help. */}
            {<><button className="error-help-link" onClick={()=>window.dispatchEvent(new CustomEvent("goldie-retry-listing",{detail:draft.clientId}))}>Retry this listing</button><button className="error-help-link" onClick={()=>window.dispatchEvent(new CustomEvent("goldie-support",{detail:draft.error??"A design failed"}))}>Get help with this error</button></>}
          </div>:<div className="task-listing placement-listing-card" key={draft.clientId}>
            {/* D694/D695 · These cards carried no number - placement kept its own
                layout under D680 and with it stayed exempt from the labelling
                every other panel has, so a bundle showed two unlabelled previews
                side by side. The number only: the name already sits under the
                preview in .placement-design-name beside the DPI and the Printify
                link, and D694 briefly printed it twice. Eyebrow identifies, the
                block under the image describes. */}
            <span className="task-listing-index placement-listing-index">Listing {listingIndex+1} of {listings.length}</span>
            {draft.previewUrl?<button className="printify-preview-button" onClick={()=>window.open(draft.previewUrl,"_blank","noopener,noreferrer")} aria-label={`Open a larger Printify preview for ${design?.title?.trim()||design?.name||draft.name||"this listing"}`}><img src={draft.previewUrl} alt={`Printify preview for ${draft.title||draft.name}`}/><span>Click to enlarge</span></button>:design?<div className="pending-preview"><img src={design.previewUrl} alt="Design preview" decoding="async"/><span>Printify preview processing</span></div>:<span className="draft-check">!</span>}
            <p className="placement-design-name">{design?.title?.trim()||design?.name||draft.name||"Listing"}</p>
            {design?(()=>{const displayScale=printTargetFor(templateDetails).scale;const quality=design.width&&templateDetails?.maxPrintWidth&&displayScale?printifyDpi(design.width,templateDetails.maxPrintWidth,displayScale):null;const qualityReady=Boolean(quality&&quality.dpi>=300);return <p className={`placement-dpi ${qualityReady?"pass":"check"}`}>{!quality?"Checking print quality…":qualityReady?`✓ ${quality.dpi} DPI · good to print`:`${quality.dpi} DPI · review before printing`}</p>})():null}
            {draft.editorUrl&&draft.id?<button type="button" className="placement-printify-link" title="Choose the correct shop in your Printify account first." onClick={()=>openDraft(draft)}>{openedDrafts.includes(draft.id)?"Printify opened":"Adjust in Printify"}</button>:null}
          </div>)}</div>
    </>;
    if(task==="printify")return <>
          {/* D552 - she asked for this gone once already: "there doesn't need to be
              a link that says recommended photos for the soft...". D540 moved it
              into this panel instead of deleting it, which is not what she asked
              for. The row is called "Choose Printify photos" and the photos are
              listed underneath it with counts; a collapsed essay about which views
              to pick was advice nobody opened. Gone. */}
          <div className="task-panel-body printify-photo-listings">{listingWorkRows(({draft,design,selectedImages,count})=>(<>{draft.status==="Created"&&<PrintifyImagePicker bare images={(draft.printifyImages||[]).filter(Boolean)} indices={selectedImages} reservedPhotos={(preparedMockupCounts[draft.id||""]||0)+(design?.sizeGuideName||sizeGuideName?1:0)} onApplyOne={values=>{/* D465 - the photos she picks ARE this product's default, the same way its colours and sizes are. There was a "Use these as this product's default" button asking a question with one sensible answer; the selection saves itself now and the button is gone. */if(activeRecipe)void saveImagePreferences(values);if(draft.id)setPrintifyImageSelections(current=>({...current,[draft.id!]:values}))}} onApplyAll={values=>{setPrintifyImageIndices(values);setPrintifyImageSelections(Object.fromEntries(drafts.filter(item=>item.id).map(item=>{const itemDesign=files.find(file=>file.id===item.clientId),reserved=(preparedMockupCounts[item.id!]||0)+(itemDesign?.sizeGuideName||sizeGuideName?1:0);return[item.id!,values.slice(0,Math.max(0,20-reserved))]})))}} onSaveRecipe={activeRecipe?saveImagePreferences:undefined}/>}</>),photoFlags)}</div>
    </>;
    if(task==="lifestyle")return <>
          {/* D709 · Uploading photos and arranging them were two panels, so every
              listing was walked twice to finish one job - and the ordering panel
              could only be understood after the uploading panel had been used,
              which is the definition of a step that should not be its own step.
              Her words: "I don't think it needs to be two steps." Upload lands
              the photo; the grid underneath it already holds the Printify photos
              and the size guide, so the order can be set where the photos are.
              The old lead here ended "you can arrange them with the Printify
              photos in the next section" - a sentence that existed only to
              apologise for the split. */}
          <div className="task-panel-lead"><p>Add your own photos to each design below, then drag them into the order buyers will see. The first photo is the one that shows in search.</p></div>
          <div className="task-panel-body">{listingWorkRows(({draft,design,selectedImages,count})=>(<>
                  <div className="listing-photo-design-identity">{(draft.previewUrl||design.previewUrl)?<img src={draft.previewUrl||design.previewUrl} alt={`${listingLabel(design)} listing photo`}/>:null}<div><span>PHOTOS FOR THIS LISTING</span><b>{listingLabel(design)}</b><small>{count} {count===1?"photo":"photos"} in this listing</small></div></div>
                  <UploadedListingPhotos productId={draft.id!} onCountChange={count=>setPreparedMockupCounts(current=>({...current,[draft.id!]:count}))}/>{draft.status==="Created"&&draft.id&&<ListingPhotoOrder productId={draft.id} printifyImages={(draft.printifyImages||[]).filter(Boolean)} indices={selectedImages} refreshKey={`${preparedMockupCounts[draft.id]||0}:${design?.sizeGuideName||sizeGuideName}`}/>}{draft.status==="Created"&&design&&draft.id&&<IndividualSizeGuide productId={draft.id} name={design.sizeGuideName} onSaved={name=>updateDesign(design.id,{sizeGuideName:name})}/>}{draft.status==="Created"&&draft.id&&<DownloadListingPhotos productId={draft.id} name={draft.title||draft.name} indices={selectedImages}/>}</>),photoFlags)}</div>
    </>;
    /* D709 · The ordering panel is gone; its work happens in the photos panel
       above, on the same pass through the listings. task="order" is aliased to it
       so older links still land somewhere real. */
    return null;
  }

  /* D683 - `header` exists because the "Review all listings in Printify" link
     could not be spaced correctly from outside this section. It used to sit in
     its own <section class="post-draft-workspace">, a direct child of
     .app-shell. .app-shell is a grid and .workspace is display:contents, so the
     sticky .workflow-progress rail becomes a grid item too and shared that row -
     sizing it to 81px while the link only filled 46px. The leftover 35px of grid
     row is what D679, D680 and D681 each failed to close with margins and
     padding, because no margin on a grid item can shrink a row that a sibling in
     the other column is sizing. Rendering the link inside this section puts it in
     the same row as the cards, where the section's own 22px grid gap is the only
     thing between them. */
  function stepProductCards(statusFor:(recipe:Recipe,index:number)=>{label:string;tone:"ready"|"attention"|"advice"|"waiting"},body:ReactNode,hidden=false,footer:ReactNode=null,showCards=true,header:ReactNode=null){
    const sharedAction=Boolean(footer);
    const list=activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[]);
    if(!list.length)return body;
    const many=list.length>1;
    /* D381 - This rail carried `batch-products` so it would inherit step 1's
       card layout. That class is `.app-shell .batch-products{display:grid
       !important}`, so NOTHING could hide this section - not .hidden-panel, not
       an inline display:none. The rail stayed open on every step, and because I
       had also stripped the drafts panel's own hidden state, step 2's "Create
       your Printify drafts" landed on step 1.

       Borrowing a class for its layout also borrows its !important. The rail owns
       its own layout now, hides with an inline style, and the panel inside keeps
       hiding itself too - two independent guards, because one was not enough. */
    return <section className="step-product-cards" style={hidden?{display:"none"}:undefined} aria-label="Products in this batch">
      {header}
      {showCards&&list.map((recipe,index)=>{
        const open=many?index===bundleIndex:true;
        const product=index===bundleIndex?templateDetails:bundleColorProducts[recipe.id];
        const status=statusFor(recipe,index);
        /* Spelled out rather than built with tone-${...}: a class the stylesheet
           targets but no file contains is exactly what the liveness test exists
           to catch, and a template literal hides it from that check. */
        const toneClass=status.tone==="ready"?"tone-ready":status.tone==="attention"?"tone-attention":status.tone==="advice"?"tone-advice":"tone-waiting";
        const photo=product?pickProductPhoto(product):"";
        /* D482 - the next product in a bundle offered "Open Gildan Tee" from the
           very first step, before the product she was actually working on had
           produced a single draft. Pressing it ran continueBundle, which carries
           the designs forward, mints a fresh batch and jumps to review - so a
           half-finished hoodie was abandoned and the tee opened at a step with
           nothing in it, which then fell back to the start. That handoff belongs
           to the finish receipt, at the point the current product is actually
           done. A product already underway can still be reopened at any time;
           what cannot happen is starting the next one early. */
        const reachable=many&&!open&&Boolean(bundleBatchIds[recipe.id]||index===bundleIndex+1);
        const opening=switchingProduct===recipe.id;
        return <article className={`batch-product-card step-product-card ${open?"is-open":"is-closed"} ${status.tone==="ready"||status.tone==="advice"?"is-ready":"needs-setup"} ${many?"in-batch":""}`} key={recipe.id}>
          <header
            {...(reachable?{role:"button",tabIndex:0,
              onClick:()=>openBundleProduct(index),
              onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openBundleProduct(index)}}}:{})}
            className={reachable?"is-openable":undefined}
            aria-expanded={many?open:undefined}
            aria-busy={opening||undefined}>
            {photo?<img className="bundle-product-photo" src={photo} alt="" loading="lazy" decoding="async"/>:<ProductGlyph title={product?.blueprintTitle||recipe.name}/>}
            <span className="bundle-product-id">
              {many&&<em className="batch-product-position">Product {index+1} of {list.length}</em>}
              <b>{recipe.name}</b>
              {/* D396 - Fell back to the status when the product was not loaded, so a
                  closed card printed blank twice: once here and once in
                  the chip beside it. The chip owns the status. */}
              <small>{product?.blueprintTitle||""}</small>
            </span>
            <span className={`batch-product-state step-product-state ${toneClass}`}>{status.label}</span>
          </header>
          {/* D499 - the same rows step 1 gives every product, on every step. The
              product being worked also shows its editor underneath them; the rest
              show their rows and a Change that opens them here. */}
          {/* D501 - the rows were gated on there being more than one product, so a
              single-product batch showed none on steps 2-4 while step 1 shows them
              for one product just the same. A card gets its rows either way. */}
          {(()=>{const rows=productRows(recipe,index===bundleIndex);if(!rows.length)return null;
            /* D503 - step 1's row is `batch-product-row settled clickable` with
               role=button, tabindex 0 and aria-expanded, so the whole row opens,
               by mouse or keyboard, and its Change carries class row-open. Mine
               were plain divs whose only control was the button, so clicking the
               row did nothing and nothing was reachable by keyboard. Same row. */
            /* D515 - every row scrolled to the same element, the card body, so
               clicking Titles landed on the description and clicking Description
               did nothing you could see. A row goes to its own section, and a
               section that is a <details> opens - and closes again on a second
               click, because a row that only ever opens is not a control. */
            /* D539 - a task row opens its own panel inside this card. It does
               not scroll anywhere, because there is nowhere else to go.
               D541 - and now no row has anywhere else to go. The selector
               machinery underneath this - open the section, walk up opening every
               <details> above it, scroll to it, and if it is not on this phase
               throw the step back a phase to find it - existed to serve rows that
               were bookmarks into a shared block. Steps 3 and 4 were the last two
               using it, and neither does now. */
            const openRow=(_target?:string,task?:string)=>{
              if(!task){if(!open&&reachable)openBundleProduct(index);return}
              if(!open){if(reachable){setActiveTask(task);openBundleProduct(index)}return}
              setActiveTask(current=>current===task?"":task);
            };
            /* D723 · Each task row is a prototype panel: index chip, title, description,
       state chip, and its work in the body. The row's own handlers, guards and
       reachability rules are unchanged and are handed to the panel. */
    return <div className="batch-product-rows">{rows.map((row,rowIndex)=>{const rowOpen=Boolean(open&&row.task&&activeTask===row.task);
      const reachableRow=!(switchingProduct||(!open&&!reachable));
      if(!row.report) return <FactoryPanel
        key={row.label}
        index={rowIndex+1}
        title={row.label}
        description={row.detail||row.advice||undefined}
        state={row.value}
        tone={row.done?"done":row.pending?"pending":row.optional?"optional":"attention"}
        open={rowOpen}
        onToggle={()=>{openRow(row.target,row.task)}}
        toggleLabel={opening?"Opening…":rowOpen?"Close":"Change"}
        toggleDisabled={!reachableRow}
        toggleTitle={!reachableRow?`Finish ${list[index-1]?.name||"the product above"} first`:undefined}
      >
        {/* D553 · clicking the panel's own surface closes it, while every real
            control inside keeps working. Carried over unchanged from the row
            implementation this replaces. */}
        <div onClick={event=>{const target=event.target as HTMLElement;
          if(target.closest("button,a,input,textarea,select,label,summary,[role='button'],[contenteditable='true'],[draggable='true']"))return;
          openRow(row.target,row.task)}}>{row.task?taskPanel(row.task):null}</div>
      </FactoryPanel>;
      return <Fragment key={row.label}><div
              className={`batch-product-row ${row.done?"settled":row.pending?"pending":row.optional?"optional":"needed"} ${rowOpen?"open":""} ${row.report?"reporting":switchingProduct||(!open&&!reachable)?"":"clickable"}`}
              role={row.report||switchingProduct||(!open&&!reachable)?undefined:"button"}
              tabIndex={row.report||switchingProduct||(!open&&!reachable)?undefined:0}
              aria-expanded={row.report?undefined:rowOpen}
              onClick={event=>{if(row.report)return;holdRowInPlace((event.currentTarget as HTMLElement));openRow(row.target,row.task)}}
              onKeyDown={(event:React.KeyboardEvent)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();if(row.report)return;holdRowInPlace(event.currentTarget as HTMLElement);openRow(row.target,row.task)}}}>
              {/* D721 · Section shape from the approved preview: an index chip, the
                  title with its description beneath, and the state on the right.
                  Every value here already existed on the row - label, detail,
                  value, advice and the done/pending/optional flags - so nothing
                  is invented and no behaviour changes; only the arrangement. */}
              <span className="row-index" aria-hidden="true" />
              <span className="row-heading">
                <span className="row-label">{row.label}</span>
                {row.detail?<small className="row-detail">{row.detail}</small>:null}
                {row.advice?<small className="row-advice">{row.advice}</small>:null}
              </span>
              <span className="row-value">{row.value}</span>
              <span className="row-mark" aria-hidden="true">{row.done?"✓":row.pending?"…":row.optional?"–":"!"}</span>
              {/* D502 - captured from both pages side by side: step 1 puts a Change
                  on every row of every card, including the product already open.
                  Step 3 put one only on a closed, reachable product - so the open
                  card's rows had no control at all and a product waiting its turn
                  had a "Finish Gildan Tee first" line step 1 never shows. Every
                  row carries Change; it says why when it cannot be used. */}
              {/* D541 - step 4 has no per-product work: the review and the one
                  publish button are step-level, in the footer. Both of its rows
                  carried a Change that scrolled to the same block underneath, so
                  two different rows went to one place. A row with nothing of its
                  own to open reports and says so. */}
              {row.report?null:<button type="button" className="row-open"
                disabled={Boolean(switchingProduct)||(!open&&!reachable)}
                title={!open&&!reachable?`Finish ${list[index-1]?.name||"the product above"} first`:undefined}
                onClick={event=>{event.stopPropagation();holdRowInPlace(event.currentTarget.closest(".batch-product-row") as HTMLElement|null);openRow(row.target,row.task)}}>
                {opening?"Opening…":rowOpen?"Close":"Change"}
              </button>}
            </div>
            {rowOpen&&<div className="task-panel open-task-column" onClick={event=>{const target=event.target as HTMLElement;if(target.closest("button,a,input,textarea,select,label,summary,[role='button'],[contenteditable='true'],[draggable='true']"))return;const rowElement=event.currentTarget.previousElementSibling as HTMLElement|null;holdRowInPlace(rowElement);openRow(row.target,row.task)}}>{taskPanel(row.task!)}</div>}
            </Fragment>})}</div>;
          })()}
          {open&&<div className="step-product-body">{body}</div>}
          {/* D498 - a closed product was a header with a foreign-looking "Open
              Gildan Tee →" button stuck under it, which read as leaving this page
              for another one. Every product is the same card: the one being worked
              is expanded, the rest are the same card collapsed. Clicking the
              header opens it in place, and the chevron says that is what will
              happen. */}
          {/* D499 - each row carries its own Change, exactly as step 1 does, so the separate expand strip that sat under the card is gone. */}
          {/* D396 - A card with no control and no explanation reads as broken. Each
              product is its own batch and they are worked in order, so say which one
              has to come first rather than showing an inert card. */}
          {/* D502 - the waiting line is on the disabled Change now, so a card is never a header with a sentence under it. */}
        </article>;
      })}
      {footer}
    </section>;
  }

  /* D378 - Steps 2-4 list every product in the bundle as a card, so a seller can
     point at any of them, not only the next one. Each member is a separate batch,
     so opening one means loading its batch - the same path Resume batch uses and
     the only one that restores drafts, titles and Etsy details correctly.
     A product that has not been started yet has no batch to load; that is what
     continueBundle is for, and it only ever moves to the next one. */
  function openBundleProduct(index:number){
    if(index===bundleIndex)return;
    const recipe=bundleRecipes[index];
    if(!recipe)return;
    const existing=bundleBatchIds[recipe.id];
    if(existing){
      if(switchingProduct)return;
      setSwitchingProduct(recipe.id);
      void (async()=>{
        try{
          /* D379 - The autosave is debounced, so the last few hundred
             milliseconds of typing may still be pending. Once batchIdRef points
             at the incoming batch that pending write would land on the wrong
             product, so flush the outgoing one first and wait for it. */
          await persistBatchNow(batchIdRef.current);
          setRestoringBatch(true);
          snapshotReady.current=false;
          await restoreBatchById(existing,workflowStep,null,true);
          window.scrollTo(0,0);
        }finally{setSwitchingProduct("")}
      })();
      return;
    }
    if(index===bundleIndex+1)void continueBundle();
  }

  async function continueBundle(){
    const next=bundleRecipes[bundleIndex+1];if(!activeBundle||!next)return;
    /* D493 - moving to the next product reset drafts and minted a new batch id
       without first writing the outgoing product's batch. Autosave is debounced,
       so the drafts it had just created were cleared from state before they were
       ever saved. Verified on a real three-product run: Printify held six drafts,
       and Goldie's own history showed 2, 0 and 0 - the first two products' work
       existed only in Printify, with nothing in Goldie pointing at it.
       openBundleProduct already flushes before switching; this path never did. */
    await persistBatchNow(batchIdRef.current);
    const carriedFiles=files.map(file=>({...file,id:crypto.randomUUID(),previewUrl:URL.createObjectURL(file.file),title:"",tags:[],blurb:undefined,descriptionOverride:undefined,sizeGuideName:undefined,etsy:undefined,etsyError:""}));
    const nextBatchId=crypto.randomUUID();batchIdRef.current=nextBatchId;window.localStorage.setItem("goldie-active-batch",nextBatchId);const url=new URL(window.location.href);url.searchParams.set("batch",nextBatchId);/* D484 - this forced "review" no matter which step she opened the product
       from. Opening the tee from step 2 threw her into step 3 with no designs
       processed and no drafts, and the step guard walked her back to the start -
       what she saw as being dumped on step one. A bundle's products are worked
       on the same page as each other, exactly as they are on step 1, so opening
       one keeps the step she is on. */
    /* D493 - the incoming product has no template loaded yet, so the step guard
       downgrades to setup and rewrites the URL, mid-run. The page then showed
       "Designs + images" while the URL said step=setup. D487 already built the
       machinery for exactly this: remember the step, restore it once it opens. */
    requestedStep.current=workflowStep;
    url.searchParams.set("step",workflowStep);url.searchParams.delete("phase");window.history.pushState({},"",url);
    setBundleIndex(current=>current+1);setDrafts([]);setComplete(false);setProcessed(0);setRunTotal(0);setOpenedDrafts([]);setOpenAllMessage("");setPreflightOpen(false);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");setFiles(carriedFiles);setDescription("");setActiveDesign("");syncedListingSignatures.current.clear();
    await saveBatchFiles(nextBatchId,carriedFiles.map(file=>file.file)).catch(()=>undefined);setActiveRecipe(next);setPrintifyImageIndices(next.printifyImageIndices||[]);setEtsyShippingProfileId(Number(next.etsyShippingProfileId)||0);setTemplate(next.templateUrl);setMockupTheme(next.defaultMockupTheme||"");setAutoTitleBankId(next.keywordListId||"");const nextPricing={...pricing,targetProfit:Number(next.defaultProfitTarget)||DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);const nextDetails=await loadTemplateUrl(next.templateUrl,nextPricing,Number(next.etsyShippingProfileId)||0,next.defaultColorIds||[],next.defaultSizeIds||[]);if(next.keywordListId&&nextDetails){const payload=await fetch("/api/keyword-lists").then(response=>response.json()).catch(()=>({lists:[]})) as {lists?:KeywordList[]},bank=payload.lists?.find(list=>list.id===next.keywordListId);if(bank){const titled=await Promise.all(carriedFiles.map(async file=>{try{const result=await autoTitleForDesign(file,bank.keywords,titleJoiner===", ",nextDetails);return {...file,title:styledTitle(result.title),tags:result.tags,titleWarning:result.titleWarning,titleError:""}}catch(error){return {...file,titleError:error instanceof Error?error.message:"Goldie could not create a complete title for this design."}}}));setFiles(titled)}}setWorkflowStep("designs");window.scrollTo({top:0});
  }
  async function createCustomShippingProfile(baseProfileId:number,domesticPrimary:number,domesticAdditional:number,title:string,international:InternationalShippingRate[]){const response=await fetch("/api/etsy/shipping-profiles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({baseProfileId,domesticPrimary,domesticAdditional,title,international})}),result=await response.json() as {id?:number;error?:string};if(!response.ok||!result.id)throw new Error(result.error||"The Etsy shipping profile could not be saved.");await loadEtsyShippingProfiles(result.id);if(activeRecipe){const updated={...activeRecipe,etsyShippingProfileId:result.id};await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,etsyShippingProfileId:result.id})});setActiveRecipe(updated)}setPricingApproved(false)}
  /* D125 · A product that has saved none of its own defaults is being set up for
   * the first time. The returning-product framing ("from your last batch",
   * "Saved for this product") is false for it and hides that these are choices
   * still to be made. */
  /* D513 - this was computed and then read by nobody, while MockupSetSelector
     took a firstRun prop that nobody passed. D125's whole point was that a
     product being set up for the first time should not be told its choices came
     "from your last batch" - and that framing has been dead for every seller
     since, because the two halves were never joined. Joined now.

     It also excluded bundles outright, so a bundle member being set up for the
     first time got the returning-product wording even once it was wired up.
     First run is a fact about the product, not about how it was opened. */
  const productFirstRun=Boolean(activeRecipe)
    &&!activeRecipe?.defaultColorIds?.length
    &&!activeRecipe?.defaultMockupTheme
    &&!activeRecipe?.keywordListId;
  async function startNewProduct(){
    if((files.length>0||drafts.length>0||complete)&&!await confirmAction({title:"Add a new product and clear this batch?",body:"Any designs and unfinished work in this batch will be removed. Your saved products and keyword banks are untouched.",confirmLabel:"Add a product",destructive:true}))return false;
    clearCurrentBatch(true);
    return true;
  }
  async function changeProduct(){
    if((files.length>0||drafts.length>0||complete)&&!await confirmAction({title:"Change product and start a new batch?",body:"Your uploaded designs and unfinished work in this batch will be removed. Your saved products and keyword banks are untouched.",confirmLabel:"Change product",destructive:true}))return false;
    clearCurrentBatch(true);return true;
  }
  async function saveImagePreferences(indices:number[]){if(!activeRecipe)return;const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,printifyImageIndices:indices})});if(!response.ok)throw new Error("These Printify photo preferences could not be saved. Please try again.");setPrintifyImageIndices(indices);setActiveRecipe({...activeRecipe,printifyImageIndices:indices})}
  function styledTitle(title:string){return (titleCaps?title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase()):title).slice(0,140)}
  function applyBatchTitle(title:string,explicitTags?:string[]){const next=styledTitle(title);setFiles(current=>current.map(file=>({...file,title:next,tags:explicitTags||tagsFromTitle(next),etsy:undefined,etsyError:""})))}
  function addBatchKeyword(keyword:string){if(batchKeywords.some(value=>value.toLocaleLowerCase()===keyword.trim().toLocaleLowerCase()))return;const next=[...batchKeywords,keyword.trim()];setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function removeBatchKeyword(keyword:string){const next=batchKeywords.filter(value=>value!==keyword);setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function clearBatchKeywords(){setBatchKeywords([]);applyBatchTitle("",[])}
  function changeTitleJoiner(joiner:string){setTitleJoiner(joiner);if(batchKeywords.length)applyBatchTitle(batchKeywords.join(joiner),tagsFromTitle(batchKeywords.join(", ")))}
  function changeTitleCaps(enabled:boolean){setTitleCaps(enabled);setFiles(current=>current.map(file=>({...file,title:(enabled?file.title.replace(/\b[\p{L}\p{N}]/gu,character=>character.toLocaleUpperCase()):file.title).slice(0,140),etsy:undefined,etsyError:""})))}
  async function buildBatchTitle(){if(!autoTitleBank)return setTitleBuildMessage("Choose a keyword bank first.");setTitleBuilding(true);setTitleBuildMessage(`Creating 0 of ${files.length} titles…`);let completed=0,failed=0;await runBounded(files,2,async design=>{try{const result=await autoTitleForDesign(design,autoTitleBank.keywords,titleJoiner===", ",templateDetails);return {design,result}}catch(error){return {design,error:error instanceof Error?error.message:"Goldie could not create this title."}}},item=>{completed+=1;if("result" in item&&item.result){updateDesign(item.design.id,{title:styledTitle(item.result.title),tags:item.result.tags,titleWarning:item.result.titleWarning,titleError:"",etsy:undefined,etsyError:""});pulseTitle(item.design.id)}else{failed+=1;updateDesign(item.design.id,{titleError:item.error,titleWarning:""})}setTitleBuildMessage(`Creating ${completed} of ${files.length} titles…`)});/* D230 · Read "1 titles created. 2 need another try" on a real run. */
      setTitleBuildMessage(failed?`${files.length-failed} ${files.length-failed===1?"title":"titles"} created. ${failed} ${failed===1?"needs":"need"} another try; each affected listing explains why below.`:`✓ ${files.length} unique ${files.length===1?"title":"titles"} and separately ranked Etsy tags created. Review them below.`);setTitleBuilding(false)/* D541 - this used to hunt down the results table and scroll to it,
       because the table sat far below the button inside one long block. The
       results are the rows directly under this button now, in the same open
       panel, so there is nowhere to travel to. */}

  /* D546 - she reached step 4 with two of three products never started, was told
     "Your batch is ready for its final check", and offered "Publish all 3
     products live on Etsy". Verified against the saved batch: the bundle held
     three recipes and exactly one had a batch at all - Gildan Tee and gildan
     crewneck had no drafts, no titles, nothing. Pressing publish would have put
     the hoodie's two listings live and then stalled on a product with nothing in
     it. Every number on that page counted the open product; the button counted
     products. Neither said what would actually be created. */
  function bundleProductsNotStarted(){
    if(!activeBundle||bundleRecipes.length<2)return[] as Recipe[];
    /* D548 - "no summary yet" is not the same as "no listings". The other
       products' batches are read after mount, so for a moment every one of them
       looks empty - and D546 would have refused to publish a ready bundle,
       naming products that were merely unread. A product with a batch is not
       unstarted; only a product with no batch at all is. */
    /* D627 - a member whose batch is gone has a batch id and zero drafts, so it
       slipped past both halves of this and would have been dropped from the
       press in silence. It counts as not started. */
    return bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id&&(bundleBatchSummary[recipe.id]?.unreadable||(!bundleBatchIds[recipe.id]&&!(Number(bundleBatchSummary[recipe.id]?.drafts)||0))));
  }
  function bundleProductsStillReading(){
    if(!activeBundle||bundleRecipes.length<2)return[] as Recipe[];
    return bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id&&Boolean(bundleBatchIds[recipe.id])&&!bundleBatchSummary[recipe.id]);
  }
  function bundleListingsToPublish(){
    if(!activeBundle||bundleRecipes.length<2)return selectedPublishDrafts().length;
    return bundleRecipes.reduce((total,recipe)=>total+(recipe.id===activeRecipe?.id
      ?selectedPublishDrafts().length
      :Number(bundleBatchSummary[recipe.id]?.drafts)||0),0);
  }

  function missingPublishFields(){/* D626 - `files` is the open product's designs, so titles, tags and Etsy details on every other product in the bundle went unchecked and could publish incomplete. */const chosen=selectedPublishDrafts(),clientIds=new Set(chosen.map(draft=>draft.clientId)),chosenFiles=bundlePublishFiles().filter(file=>clientIds.has(file.id)),missing:string[]=[];if(!chosen.length)missing.push("Select at least one successful listing");
    /* D635 - these blocked the press because a product SOMEWHERE in the bundle
       was empty or unreadable, whether or not it was being published. That is
       how the ready product got held hostage by a deleted batch. D546 added it
       because the confirmation claimed to publish 3 products while 2 had
       nothing; D634 fixed that claim at its source, so the confirmation now
       names only what will actually publish and this no longer has to guess.
       A product with no listings has no selected listings, so it cannot make a
       bad publish - it can only stop a good one. Still reading is different:
       until a member answers, the selection genuinely may be incomplete. */
    if(bundleProductsStillReading().length)missing.push("Goldie is still reading the other products in this batch");if(chosenFiles.some(file=>!file.title.trim()))missing.push("Titles");if(chosenFiles.some(file=>!file.tags.length))missing.push("Tags");if(!description.trim())missing.push("Permanent product description");if(chosenFiles.some(file=>!etsyRequiredComplete(file.etsy)))missing.push("Etsy details");if(chosenFiles.some(file=>personalizationProblem(file.etsy)))missing.push("Personalization settings");if(chosen.length&&!allCreatedListingsHaveImages(chosen))missing.push("At least one image on every selected listing");return missing}
  function openPublishConfirmation(){const chosen=selectedPublishDrafts(),missing=missingPublishFields();if(missing.length)return void stopWith("Complete every required selected listing field.",missing.map(field=>`Before publishing: ${field}`));const missingPhotos=createdListingsMissingImages(chosen);if(missingPhotos.length)return void stopWith("Add a photo to every selected listing before publishing.",missingPhotos.map(draft=>draft.name));setPublishConfirmOpen(true)}
  async function monitorPublishJob(jobId:string,resuming=false){
    /* D474 - this always said "resuming", including on a publish she had just
       started, which reads as though something went wrong. */
    setPublishing(true);setPublishMessage(resuming?"Goldie is safely resuming your queued batch…":"Goldie is publishing your listings…");
    try{let job:{id:string;status:string;total:number;completed:number;failed:number;queued:number;processing:number;finished:Array<{etsyListingId:number;url:string}>;failures?:Array<{productId:string;error:string}>;budget?:{remaining:number}}|undefined;
      while(!job||!["completed","needs_attention"].includes(job.status)||job.queued+job.processing>0){if(job){const currentJob=job,lowBudget=currentJob.budget?.remaining!==undefined&&currentJob.budget.remaining<25;setPublishMessage(lowBudget?"Your batch is safe in Goldie’s queue. Etsy’s shared allowance is resting before the next listing starts.":`Publishing safely: ${currentJob.completed} of ${currentJob.total} listings are live. You may leave this page and return later.`);await new Promise(resolve=>setTimeout(resolve,lowBudget?30000:1500))}const response=await fetch(`/api/printify/drafts/publish?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store"}),payload=await response.json() as {job?:typeof job;error?:string};if(!response.ok||!payload.job)throw new Error(payload.error||"Goldie could not check this queued batch.");job=payload.job}
      if(!job)throw new Error("Goldie could not load this queued batch.");localStorage.removeItem("goldie-active-publish-job");if(job.status==="needs_attention"){setPublishFailures(job.failures||[]);throw new Error(`${job.completed} of ${job.total} listings published. ${job.failed} ${job.failed===1?"listing needs":"listings need"} your attention before Goldie can finish the batch.`)}await rememberBatchDefaultsAfterPublish();setBatchReceipt({publishedCount:job.completed,etsyUrls:(job.finished||[]).map(item=>item.url).filter(Boolean),completedAt:new Date().toISOString()});setPublishMessage("");
    }catch(error){setPublishMessage(error instanceof Error?error.message:"Goldie could not resume this queued batch.")}finally{setPublishing(false)}
  }
  /* D419 - The confirm dialog's publish button had no disabled state, so a double
     click fired this twice before React could re-render and close the dialog:
     two POSTs, two queued jobs, duplicate live listings and two lots of Etsy's
     $0.20 listing fee per design. The button is disabled while publishing and
     this ref makes it impossible to enter twice regardless of what the UI does -
     the one place in this app where a stray click costs real money. */
  const publishInFlight=useRef(false);
  /* D495 - a bundle published one product at a time: publish the hoodie's
     listings, then go back, open the tee, publish again, then the crewneck.
     Step 2 already creates every product's drafts from one press; this is the
     same run at the other end. Goldie publishes the open product, moves itself
     to the next one and publishes that, until the bundle is done.

     Publishing spends real money, so this is deliberately more cautious than the
     drafts run: it will not start a product whose listings are not ready. It
     stops and says which product and what is missing, and nothing is published
     for that product or the ones after it. */
  const [publishRun,setPublishRun]=useState<{total:number}|null>(null);
  useEffect(()=>{runInProgress.current=Boolean(publishRun)},[publishRun]);
  /* D559 - nothing advances any more; one call publishes the bundle. */
  useEffect(()=>{
    if(!publishRun)return;
    if(publishing||switchingProduct||publishConfirmOpen||restoringBatch)return;
    /* D559 - this used to publish the open product, wait for its receipt, switch
       the whole app to the next product's batch, publish that, and repeat. The
       run depended on the tab staying open through two batch restores, and a
       stall between products left her half published. One call carries the whole
       bundle now, so there is nothing to advance to. */
    if(batchReceipt){setPublishRun(null);return}
    const chosen=publishTargets();
    if(!chosen.length)return;
    const blockers=[...missingPublishFields(),...createdListingsMissingImages(selectedPublishDrafts()).map(draft=>`${draft.name} has no photo`)];
    if(blockers.length){
      setPublishRun(null);
      stopWith("This batch is not ready to publish.",blockers);
      return;
    }
    void publishAll();
  },[publishRun,publishing,switchingProduct,publishConfirmOpen,restoringBatch,batchReceipt,bundleIndex,drafts,activeRecipe]);

  /* D559 - every listing the press will create, across every product in the
     bundle, each carrying the settings saved with its own batch. The open
     product is read from state because that is fresher than anything saved; the
     rest come from their own batches. */
  /* D561 - the count on screen and the list that gets sent were built two
     different ways, so they could disagree - and did: five ticked, "Publish 6
     listings" on the button. One source now. Everything the review shows, filtered
     by what is ticked, carrying the settings of whichever product owns it. */
  function publishTargets(){
    const chosen=new Set(selectedPublishIds);
    const memberOf=(id:string)=>Object.values(bundleMembers).find(member=>member.drafts.some(draft=>draft.id===id));
    return bundlePublishDrafts().filter(draft=>draft.status==="Created"&&draft.id&&chosen.has(draft.id)).map(draft=>{
      const mine=drafts.some(own=>own.id===draft.id);
      const member=mine?null:memberOf(draft.id!);
      return {id:draft.id!,productName:draft.productName||activeRecipe?.name||"",clientId:draft.clientId,
        selections:(mine?printifyImageSelections:member?.selections||{})[draft.id!]||[],
        indices:mine?printifyImageIndices:(member?.indices||printifyImageIndices),
        shippingProfileId:(mine?etsyShippingProfileId:member?.shippingProfileId)||etsyShippingProfileId};
    });
  }
  /* D559 - the publish review's inputs, gathered across the bundle rather than
     taken from whichever product happens to be open. */
  function bundlePublishDrafts(){
    if(!activeBundle||bundleRecipes.length<2)return drafts;
    const others=bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id).flatMap(recipe=>{
      const member=bundleMembers[recipe.id];if(!member)return [] as DraftResult[];
      return member.drafts.map(draft=>({...draft,productName:member.productName}));
    });
    return [...drafts.map(draft=>({...draft,productName:activeRecipe?.name||draft.productName})),...others];
  }
  function bundlePublishFiles(){
    if(!activeBundle||bundleRecipes.length<2)return files;
    const others=bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id).flatMap(recipe=>(bundleMembers[recipe.id]?.designs||[]) as Array<Omit<DesignFile,"file"|"previewUrl">>);
    return [...files,...others.map(design=>({...design,file:undefined as unknown as File,previewUrl:""} as DesignFile))];
  }
  function bundlePublishSelections(){
    if(!activeBundle||bundleRecipes.length<2)return printifyImageSelections;
    return bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id)
      .reduce((all,recipe)=>({...all,...(bundleMembers[recipe.id]?.selections||{})}),{...printifyImageSelections});
  }
  function bundlePublishMockupCounts(){
    if(!activeBundle||bundleRecipes.length<2)return preparedMockupCounts;
    return bundleRecipes.filter(recipe=>recipe.id!==activeRecipe?.id)
      .reduce((all,recipe)=>({...all,...(bundleMembers[recipe.id]?.preparedMockupCounts||{})}),{...preparedMockupCounts});
  }
  /* D626 · Lives here, below the bundle state it reads. Its dependency array is
     evaluated during render, so at its old position near the other selection
     effects it referenced bundleMembers hundreds of lines before that state was
     declared - a temporal dead zone throw on every render, caught only because
     tsc flagged it. */
  /* D626 · This pruned the publish selection down to the OPEN product's drafts:
     current.filter(id=>created.includes(id)) dropped every bundle member's id,
     and only the open product's were added back. D559 built the whole one-call
     bundle publish on top of this list, so whenever `drafts` changed identity -
     a retry, a mockup finishing, a restore - the other products silently fell
     out of the publish and the seller was back to publishing one product at a
     time without being told. The list is the bundle's now.
     D560's rule applies here too: a listing seen for the first time starts
     ticked, but after that her choice stands, so this can never re-tick a box
     she cleared. */
  const seededPublishIds=useRef<Set<string>>(new Set());
  /* D645 - the same rule on this side of the event. */
  const sellerChosePublish=useRef(false);
  useEffect(()=>{
    const created=bundlePublishDrafts().filter(draft=>draft.status==="Created"&&draft.id).map(draft=>draft.id!);
    const fresh=sellerChosePublish.current?[]:created.filter(id=>!seededPublishIds.current.has(id));
    created.forEach(id=>seededPublishIds.current.add(id));
    setSelectedPublishIds(current=>{
      const kept=current.filter(id=>created.includes(id));
      return fresh.length?[...new Set([...kept,...fresh])]:kept;
    });
  },[drafts,bundleMembers,activeBundle,bundleRecipes,activeRecipe]);

  async function publishAll(){
    if(publishInFlight.current)return;
    /* D559 - this sent the open product's listings only, and an effect then
       switched the app to the next product and sent that one, and so on. One
       call now carries every listing in the bundle with the settings its own
       product needs, so nothing switches and nothing is left behind. */
    const everything=publishTargets();
    const ids=everything.map(item=>item.id);if(!ids.length)return;
    const byProduct=Object.fromEntries(everything.map(item=>[item.id,{selections:item.selections,indices:item.indices,shippingProfileId:item.shippingProfileId}]));
    publishInFlight.current=true;setPublishConfirmOpen(false);setPublishing(true);setPublishFailures([]);setPublishMessage(`Goldie is safely queuing ${ids.length} selected ${ids.length===1?"listing":"listings"}…`);setBatchReceipt(null);
    try{
      const response=await fetch("/api/printify/drafts/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productIds:ids,printifyImageIndices,printifyImageSelections,etsyShippingProfileId,byProduct})}),payload=await response.json() as {job?:{id:string;status:string;total:number;completed:number;failed:number;queued:number;processing:number;finished:Array<{etsyListingId:number;url:string}>;failures?:Array<{productId:string;error:string}>;budget?:{remaining:number}};error?:string};if(!response.ok||!payload.job)throw new Error(payload.error||"The batch could not be queued.");
      const jobId=payload.job.id;localStorage.setItem("goldie-active-publish-job",jobId);await monitorPublishJob(jobId);
    }catch(error){setPublishMessage(error instanceof Error?error.message:"The batch could not be published.")}finally{publishInFlight.current=false;setPublishing(false)}
  }
  /* D651 · A size guide could be replaced but never removed. Attach the wrong
     file - which is easy, it is one picker among several on this step - and the
     only way out was to attach a different wrong file; there was no way back to
     none. It goes onto every listing in the batch, so that is not a small
     mistake to be stuck with. Removing clears it for everything this batch has
     not published yet, and says plainly what it cannot undo. */
  async function removeSizeGuide(){
    setSizeGuideName("");
    setFiles(current=>current.map(design=>({...design,sizeGuideName:undefined})));
    setSizeGuideStatus("Size guide removed. Listings this batch has already published keep the one they were given.");
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
      const result = await response.json() as { product?: TemplateDetails; error?: string;issues?:string[];title?:string;shop?:{id:number;title:string;count?:number} };
      if(requestVersion!==templateLoadVersion.current)return null;
      /* D654 - the store label was only recorded on a product that PASSED the
         shop check, so the products that most need labelling - the ones from a
         different store, which is the whole reason the label exists - stayed
         blank forever. The refusal knows the store too. */
      if(result.shop?.title&&Number(result.shop.count||0)>1){
        const refusedRecipe=activeRecipeRef.current;
        if(refusedRecipe&&refusedRecipe.printifyShopTitle!==result.shop.title){
          void fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:refusedRecipe.id,name:refusedRecipe.name,templateUrl:refusedRecipe.templateUrl,printifyShopTitle:result.shop.title,printifyShopId:result.shop.id})}).catch(()=>undefined);
          setActiveRecipe(current=>current&&current.id===refusedRecipe.id?{...current,printifyShopTitle:result.shop!.title,printifyShopId:result.shop!.id}:current);
          announceShop(refusedRecipe.id,result.shop.title,result.shop.id);
          setBundleRecipes(current=>current.map(item=>item.id===refusedRecipe.id?{...item,printifyShopTitle:result.shop!.title,printifyShopId:result.shop!.id}:item));
        }
      }
      if (!response.ok || !result.product){
        if(restoringRememberedProduct.current){
          const why=(result.issues&&result.issues[0])||result.error||"Goldie could not open it.";
          setRestoredProductNotice(`${activeRecipeRef.current?.name||"The product you used last"} could not be reopened. ${why} Choose a product below to start.`);
          try{window.localStorage.removeItem("goldie-active-recipe")}catch{/* private mode */}
          setActiveRecipe(null);setTemplateDetails(null);setTemplate("");
          throw new Error(result.error||"The product could not be loaded.");
        }
        setBlockingModal({title:result.title||"This Printify product isn’t ready yet.",issues:result.issues?.length?result.issues:[result.error||"The product could not be loaded."],copy:response.status===409?"Connect Printify and Etsy to the same shop, then load this product again. Connections is in the sidebar.":"Fix these items in Printify, save the product, then submit the same link again."});throw new Error(result.error || "The product could not be loaded.")}
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
      /* D329 · Apply the verified Etsy profile from this exact template response.
         Waiting for the independent profile-list and invalid-saved-id effects to
         race left the picker on its placeholder even after the server recovered
         the right profile from Etsy. The later profile-list validation still
         clears an id that genuinely is not on the connected shop. */
      const verifiedProfileId=Number(result.product.shippingTemplateId)||0;
      /* D333 · Applied only when nothing is already chosen. selectRecipe sets the
         seller's saved profile just before this runs, so an unconditional set
         replaced their saved choice with the Printify template's every time the
         product was selected — the D296 rule in reverse. The functional form
         reads the value that is actually current rather than a stale closure:
         keep what is there, otherwise take the template's. D329's own case, an
         empty picker after the server recovered the profile from Etsy, still
         works, because in that case there is nothing to keep. */
      if(verifiedProfileId)setEtsyShippingProfileId(current=>current||verifiedProfileId);
      /* D649 - record which Printify store this product came from, so its saved
         card can say so instead of the seller finding out by being refused. */
      const recipeForShop=activeRecipeRef.current;
      if(result.shop?.title&&Number(result.shop.count||0)>1&&recipeForShop&&recipeForShop.printifyShopTitle!==result.shop.title){
        void fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:recipeForShop.id,name:recipeForShop.name,templateUrl:recipeForShop.templateUrl,printifyShopTitle:result.shop.title,printifyShopId:result.shop.id})}).catch(()=>undefined);
        setActiveRecipe(current=>current&&current.id===recipeForShop.id?{...current,printifyShopTitle:result.shop!.title,printifyShopId:result.shop!.id}:current);
        announceShop(recipeForShop.id,result.shop.title,result.shop.id);
      }
      setTemplateDetails(result.product);setDescription(result.product.description||"");if(result.product.standardShipping!=null)setPricing(current=>({...current,shippingCost:result.product!.standardShipping!,shippingCharged:0}));setVariantPrices(Object.fromEntries((result.product.variants||[]).map(variant=>[String(variant.id),variant.templatePrice])));/* D472 - loading the Printify template used to clear the pricing approval
   unconditionally. Choosing a saved product loads its template, so every batch
   began un-approved no matter what the product had saved - and the control to
   approve again sits inside the collapsed Shipping section, so Next step
   refused with nothing on screen to press. Reproduced on a clean batch with a
   product carrying a $12 profit target and a valid Etsy profile.

   A product that already carries approved pricing keeps it. Approval is only
   cleared for a product that has none saved, which is the case it was for. */
setPricingApproved(recipeCarriesApprovedPricing({defaultProfitTarget:activeRecipe?.defaultProfitTarget,etsyShippingProfileId:activeRecipe?.etsyShippingProfileId})); return result.product;
    } catch (error) { if(requestVersion===templateLoadVersion.current)setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return null; }
    finally { if(requestVersion===templateLoadVersion.current)setLoadingTemplate(false); }
  }

  async function rememberProductColors(){if(!activeRecipe||!selectedColorIds.length)return;setRememberingColors(true);try{const updated={...activeRecipe,defaultColorIds:selectedColorIds};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,defaultColorIds:selectedColorIds})});if(!response.ok)throw new Error("Goldie could not save these color defaults.");setActiveRecipe(updated);setColorsRemembered(true)}catch(error){stopWith("These color defaults were not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setRememberingColors(false)}}

  async function rememberProductSizes(){if(!activeRecipe||!selectedSizeIds.length)return;setRememberingSizes(true);try{const updated={...activeRecipe,defaultSizeIds:selectedSizeIds};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,defaultSizeIds:selectedSizeIds})});if(!response.ok)throw new Error("Goldie could not save these size defaults.");setActiveRecipe(updated);setSizesRemembered(true)}catch(error){stopWith("These size defaults were not saved.",[error instanceof Error?error.message:"Try again in a moment."])}finally{setRememberingSizes(false)}}

  async function preparedUpload(design: DesignFile) {
    if(design.originalUnavailable)throw new Error("Upload the original design again in this browser before recreating its Printify draft.");
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

  /* D419 - Same exposure as publishing: the preflight confirm had no disabled
     state, so a double click ran the whole draft creation twice - Printify quota
     spent twice and duplicate drafts that then publish as duplicate listings. */
  const draftRunInFlight=useRef(false);
  async function runDrafts(targetFiles: DesignFile[], keepSuccessful = false) {
    if(draftRunInFlight.current)return;
    draftRunInFlight.current=true;
    try{
    if (!ready || !targetFiles.length || draftRunActive.current) return;
    draftRunActive.current=true;
    const completedDesignIds=new Set<string>();
    setRunning(true);
    setRunTotal(targetFiles.length);
    setComplete(false);
    const batchBytes=targetFiles.reduce((sum,file)=>sum+file.size,0);
    const batchConcurrency=batchBytes>LARGE_BATCH_THRESHOLD?1:MAX_CONCURRENT_DESIGNS;
    setPreparationMessage(batchConcurrency===1?"This is a large high-resolution batch, so Goldie is processing one design at a time safely":`Processing up to ${Math.min(batchConcurrency, targetFiles.length)} ${Math.min(batchConcurrency, targetFiles.length)===1?"design":"designs"} at a time without lowering their print resolution`);
    if (!keepSuccessful) setDrafts([]);
    else setDrafts((current) => current.filter((draft) => draft.status === "Created"));
    setProcessed(0);
    const createdDesignResults:Array<{status?:string;id?:string|null;error?:string}>=[];
    try {
      await runBounded(targetFiles, batchConcurrency, processDesign, (result) => {
        if(completedDesignIds.has(result.clientId))return;
        completedDesignIds.add(result.clientId);
        const productResult={...result,productName:activeRecipe?.name||templateDetails?.blueprintTitle||"Saved product"};
        createdDesignResults.push(productResult);
        setDrafts((current) => [...current, productResult]);
        if(result.id)setPrintifyImageSelections(current=>current[result.id!]?current:{...current,[result.id!]:printifyImageIndices});
        if(result.previewUrl)updateDesign(result.clientId,{previewUrl:result.previewUrl});
        setProcessed(Math.min(completedDesignIds.size,targetFiles.length));
      });
      /* D227 · Only move on if a draft actually exists. runDrafts used to set
         complete and jump to the Listing page whatever came back, so a run in
         which every draft failed looked exactly like a run in which every draft
         succeeded: the seller was carried forward, generated titles, and only
         then met "The matching Printify draft could not be found" beside each
         listing, with the rail refusing the page they were standing on and no
         route back. Measured on a real batch: both drafts came back
         status:"NeedsRetry" with a null id, and the app advanced anyway. */
      const createdNow=createdDesignResults.filter(result=>result.status==="Created"&&result.id).length;
      if(createdNow>0){
        setComplete(true);
        /* D440 - creating the drafts used to jump straight to Listing details,
           which is why she kept arriving at step 3 having never seen step 2. The
           photos and mockups appear on THIS page the moment the drafts exist, so
           this stays put and scrolls to them. Leaving Images is the Next step
           button's job, and that button refuses until every listing has a photo. */
        setFinishPhase("details");
        window.setTimeout(()=>document.querySelector(".draft-card")?.scrollIntoView({block:"start"}),0);
      }else{
        setComplete(false);
        stopWith(
          targetFiles.length===1?"That draft could not be created.":"None of these drafts could be created.",
          [...new Set(createdDesignResults.map(result=>result.error).filter(Boolean) as string[])].slice(0,3),
          "Nothing was charged against your plan. Fix the reason below and use Create Printify drafts again.",
        );
      }
    } finally {
      draftRunActive.current=false;
      setRunning(false);
      setPreparationMessage("");
      setRunTotal(0);
    }
    }finally{draftRunInFlight.current=false}
  }

  function finalDescription(design:DesignFile,details?:EtsyDetails){return design.descriptionOverride??[design.blurb??details?.blurb??"",description].filter(value=>value.trim()).join("\n\n")}
  async function syncListingFields(design:DesignFile,details?:EtsyDetails){const draft=drafts.find(item=>item.clientId===design.id);if(!draft?.id)throw new Error("The matching Printify draft could not be found.");const response=await fetch("/api/printify/drafts/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:draft.id,title:design.title,tags:design.tags,description:finalDescription(design,details),etsyDetails:details})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Printify could not save the completed listing.")}
  async function syncPreparedListing(design:DesignFile,details:EtsyDetails){await syncListingFields(design,details)}
  async function resolveEtsyOptions(details:EtsyDetails,taxonomyId?:number){const response=await fetch("/api/etsy/taxonomy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...details,taxonomyId,includeCategories:!haveEtsyCategories.current,product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model}})}),payload=await response.json() as {categories?:EtsyCategoryOption[];selected?:{id:number;path:string};properties?:EtsyPropertySelection[];error?:string};if(!response.ok||!payload.selected)throw new Error(payload.error||"Etsy listing options could not be loaded.");if(payload.categories?.length){haveEtsyCategories.current=true;setEtsyCategories(payload.categories)}
    /* D649 - fill Closure only when the product name settles it, and only when
       Etsy left it blank. An unresolved one stays blank and keeps blocking, which
       is the honest outcome. */
    const closure=verifiedClosure(templateDetails?.blueprintTitle,templateDetails?.model,templateDetails?.brand);
    if(closure&&payload.properties)payload.properties=payload.properties.map(property=>{
      if(!/closure/i.test(property.label)||property.value.trim())return property;
      const match=(property.possibleValues||[]).find(option=>option.name.toLowerCase()===closure.toLowerCase());
      return match?{...property,value:match.name,valueId:match.value_id}:property;
    });
    return {...details,category:payload.selected.path,taxonomyId:payload.selected.id,properties:payload.properties||[]} }
  async function rememberEtsyDefaults(details:EtsyDetails){if(!activeRecipe)return;const physical=Object.fromEntries((details.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));if(!Object.keys(physical).length)return;const updated={...activeRecipe,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}})});if(!response.ok)throw new Error("Goldie prepared the Etsy details but could not remember the product defaults.");setActiveRecipe(updated)}

  /* D662 · Two at a time, but not from the first design.
     
     D71 made one batch share one Etsy product baseline: the first design
     prepared establishes the taxonomy, category and physical attributes, and
     every design after it inherits them, so a batch cannot publish ten listings
     under subtly different Etsy categories. Concurrency 1 was what made that
     ordering hold, quietly - and the D71 test caught this change reintroducing
     the fault, which is exactly what it is there for.

     prepareOne reads etsyProductBaseline.current, then awaits, then writes it.
     Start two designs together and both read null, both resolve independently,
     and the later write wins - the batch is inconsistent again and nothing on
     screen would say so.

     So the first design runs alone to establish the baseline, and the rest run
     two at a time inheriting it. A ten-design batch goes from about ten calls
     in sequence to one plus nine in pairs, and stays deterministic. */
  async function prepareEtsyBatch(pending:DesignFile[]){
    if(!pending.length)return;
    const [first,...rest]=pending;
    await prepareOne(first);
    if(!rest.length)return;
    await runBounded(rest,BACKGROUND_ETSY_CONCURRENCY,async file=>{await prepareOne(file);return file},()=>undefined);
  }
  async function prepareOne(design:DesignFile){try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    image:await designPreviewDataUrl(design),
    product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model,description},title:design.title,tags:design.tags})}),payload=await response.json() as {details?:EtsyDetails;error?:string};if(!response.ok||!payload.details)throw new Error(payload.error||"Etsy details could not be prepared.");const defaults=productEtsyDefaults(templateDetails,activeRecipe?.etsyDefaults),initial={...payload.details,attributes:{...payload.details.attributes,...defaults},blurb:design.blurb?.trim()||payload.details.blurb},baseline=etsyProductBaseline.current,prepared=baseline?{...initial,taxonomyId:baseline.taxonomyId,category:baseline.category,attributes:{...initial.attributes,...baseline.attributes}}:initial,details=await resolveEtsyOptions(prepared);if(!baseline){const physical=Object.fromEntries((details.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));etsyProductBaseline.current={taxonomyId:details.taxonomyId,category:details.category,attributes:physical}}const updatedDesign={...design,blurb:details.blurb};await syncListingFields(updatedDesign,details);updateDesign(design.id,{blurb:details.blurb,etsy:details,etsyError:""});return details}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be prepared."});return null}}
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
      /* D226 · Drafts have just been created, so the sidebar quota is now stale. */
      setUsageRevision(current=>current+1);
      /* D221 · Etsy details live on the Listing page; there is no separate phase to move to. */
      setFinishPhase("details");
      /* D544 - this wrote phase=etsy while the line above sets the state to
         "details", so the URL disagreed with the app. Reloading then restored a
         phase the app never actually uses and step 3 behaved differently before
         and after a refresh. The URL says what is true. */
      const url=new URL(window.location.href);url.searchParams.set("step","finish");url.searchParams.set("phase","details");window.history.replaceState({},"",url);
      window.scrollTo(0,0);
    }finally{
      if(version===etsyPreparationVersion.current)setPreparingEtsy(false);
      etsyPreparationActive.current=false;
    }
  }
  async function saveAllEtsyDetails(){if(etsySaveActive.current)return;const unfinished=files.filter(file=>!etsyRequiredComplete(file.etsy));if(unfinished.length)return void stopWith("Finish every Etsy listing first.",unfinished.map(file=>`${file.name} still needs Etsy details.`));const invalid=files.map(file=>({file,problem:personalizationProblem(file.etsy)})).filter(item=>item.problem);if(invalid.length)return void stopWith("Finish the personalization options first.",invalid.map(item=>`${item.file.name}: ${item.problem}`));etsySaveActive.current=true;++etsyPreparationVersion.current;setPreparingEtsy(false);setSavingEtsyDetails(true);try{let failed=0;if(!localPreview)await runBounded(files,2,async design=>{try{await syncListingFields(design,design.etsy!);return true}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be saved."});return false}},saved=>{if(!saved)failed+=1});if(failed)return void stopWith("Some Etsy details were not saved.",[`${failed} ${failed===1?"listing needs":"listings need"} another attempt.`]);if(activeRecipe){const physical=Object.fromEntries((files[0]?.etsy?.properties||[]).filter(property=>PHYSICAL_ETSY_FIELDS.test(property.label)&&property.value.trim()).map(property=>[property.label,property.value]));if(Object.keys(physical).length){const updated={...activeRecipe,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}};const response=await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:activeRecipe.id,name:activeRecipe.name,templateUrl:activeRecipe.templateUrl,etsyDefaults:{...activeRecipe.etsyDefaults,...physical}})});if(response.ok)setActiveRecipe(updated)}}/* D221 · Photos moved to the Images page, so completing Etsy details moves on to
       the Publish page rather than to a phase that no longer renders. */
      setFinishPhase("final");const url=new URL(window.location.href);url.searchParams.set("step","finish");url.searchParams.set("phase","final");window.history.replaceState({},"",url);window.scrollTo(0,0)}finally{etsySaveActive.current=false;setSavingEtsyDetails(false)}}
  /* D485 - a bundle made her press "Create Printify drafts" once per product,
     walking each one through the step by hand, when step 1 had already collected
     colours, sizes, prices and shipping for all of them at once. One press now
     works the whole bundle: Goldie creates the current product's drafts, moves
     itself to the next product carrying the same designs, and repeats. The
     confirmation is asked once, not once per product. */
  const [bundleRun,setBundleRun]=useState<{total:number}|null>(null);
  useEffect(()=>{runInProgress.current=Boolean(bundleRun)},[bundleRun]);
  const bundleAdvancing=useRef(false);
  useEffect(()=>{
    if(!bundleRun)return;
    if(running||preparingEtsy||preflightOpen||switchingProduct)return;
    if(complete){
      if(bundleIndex+1>=bundleRecipes.length){setBundleRun(null);return}
      if(bundleAdvancing.current)return;
      bundleAdvancing.current=true;
      void continueBundle().finally(()=>{bundleAdvancing.current=false});
      return;
    }
    /* Waiting on the incoming product's own saved defaults to land. If one is
       genuinely not set up, stop rather than loop - stopWith names what is
       missing, and pressing the button again resumes from here. */
    if(!ready||!pricingApproved)return;
    const targets=files.filter(file=>bundleQualityDecisions[`${activeRecipe?.id}:${file.id}`]!=="exclude");
    if(!targets.length){setBundleRun(null);return}
    void runDrafts(targets);
  },[bundleRun,complete,running,preparingEtsy,preflightOpen,switchingProduct,ready,pricingApproved,bundleIndex,files,activeRecipe]);

  function createDrafts() {const issues=requiredForStep("review");if(issues.length)return void stopWith("This batch isn’t ready to create.",issues);const undecided=bundleQualityGroups.filter(group=>group.keys.some(key=>!bundleQualityDecisions[key]));
    /* D509 - a flagged design in a bundle got a blocking dialog of sentences -
       one run-on line per design per product, no sizes, and no way past it. The
       resolution table already existed and had done since the single-product
       flow: design, uploaded size, what Printify recommends, and a Proceed
       anyway. A bundle went down a different path and never reached it. Same
       table for both now, and it does not block: low resolution is a judgement
       for her to make, not a wall. */
    if(undecided.length){setPixelWarningOpen(true);return}if(planDraftsRemaining!==null&&requestedListingCount>planDraftsRemaining)return void stopWith("This batch is larger than your remaining plan allowance.",[activeBundle?`${files.length} designs × ${bundleProductCount} products = ${requestedListingCount} listings after exclusions. You have ${planDraftsRemaining} listings remaining this month.`:`${planDraftsRemaining} ${planDraftsRemaining===1?"listing remains":"listings remain"} this month, but this batch contains ${files.length} designs.`]);if(!etsyShippingProfileId)return void stopWith("Choose shipping before creating drafts.",["Choose the Etsy shipping profile Goldie should apply to every listing."]);if(!pricingApproved)return void stopWith("Finish shipping first.",["Choose a shipping profile, then save or discard any custom shipping profile changes."]);setPreflightOpen(true);}
  function confirmDrafts() { const recipeId=activeRecipe?.id;const targets=files.filter(file=>bundleQualityDecisions[`${recipeId}:${file.id}`]!=="exclude");setPreflightOpen(false);if(activeBundle&&bundleRecipes.length>1)setBundleRun({total:bundleRecipes.length});void runDrafts(targets); }

  function retryFailed() {
    const failedIds = new Set(drafts.filter((draft) => draft.status !== "Created").map((draft) => draft.clientId));
    void runDrafts(files.filter((file) => failedIds.has(file.id)), true);
  }

  function startOver() {
    setRestartBatchName(batchDisplayName||suggestedBatchName());
    setRestartBatchOpen(true);
  }

  function finishRestart(preserveSavedBatch=false){clearCurrentBatch(true,preserveSavedBatch);/* D488 - the one path that is allowed to discard, because she chose it by name. */setRestartBatchOpen(false);setRestartBatchName("");goToStep(connected?"setup":"connect",true,true)}
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
      /* D322 · This title changed once a product was selected — "Choose product"
         became "Build this batch" — so step 1 renamed itself mid-step and started
         describing the whole flow rather than the step you are on, while the rail
         and eyebrow both still read PRODUCT. The rail's own stage title is
         "Choose product", so that is the name three places already agree on. The
         title stays put; the copy carries the state. */
      ? { eyebrow: "STEP 1 OF 4", title: "Choose product", copy: "Check this product’s colours, sizes and pricing, then continue to your designs." }
      : { eyebrow: "STEP 1 OF 4", title: "Choose product", copy: "Choose a saved product or connect a completed Printify product." },
    designs: { eyebrow: "STEP 2 OF 4", title: "Designs + images", copy: "Add up to 20 finished designs, then choose the photos and mockups for each listing." },
    review: { eyebrow: "STEP 3 OF 4", title: "Create Printify drafts", copy: "Goldie creates an unpublished draft in Printify for every design in this batch." },
    finish: finishPhase==="details" ? { eyebrow: "STEP 3 OF 4 · LISTING", title: "Listing details", copy: "Create the titles and tags, then review the description for every listing." } : finishPhase==="etsy" ? { eyebrow: "STEP 3 OF 4 · LISTING", title: "Listing details", copy: "Review the Etsy category and product-specific details." } : { eyebrow: "STEP 4 OF 4 · PUBLISH", title: "Publish", copy: "Review every listing before publishing it live on Etsy." },
  }[workflowStep];

  return (
    <main className="app-shell" data-product-selected={templateDetails?"true":"false"}>
      {/* D528 - the host lives at the root layout now, so every page has one. */}
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
            <a className="active" href="/listing-factory" onClick={event=>guardNavigation(event,"/listing-factory")}>Listing Factory</a>
            <a href="/batches" onClick={event=>guardNavigation(event,"/batches")}>Batch History</a>
            <a href="/keywords" target="_blank" rel="noopener noreferrer">Keyword Banks</a>
            <a href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + Plan</a>
            {/* D639 - ?step=connect is honoured as an explicit request and the
                auto-skip leaves it alone, so this is the way back to the
                connection screen rather than a new page. */}
            <a href="/listing-factory?step=connect" onClick={event=>guardNavigation(event,"/listing-factory?step=connect")}>Connections</a>
          </nav>
          <button className="workflow-restart-button" type="button" disabled={running} onClick={startOver}>{/* D362 · The glyph ↻ renders at text weight in most UI faces, so at 11px it
              read as a stray mark rather than an arrow. A drawn icon keeps its
              stroke and its arrowhead at any size. */}
              <svg className="new-batch-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/></svg> Start a new batch</button>
          <GoldieCommandBar data={commandCenterData} onUseProduct={recipe=>{void chooseRecipe(recipe).then(selected=>{if(selected)goToStep("setup")})}} onStartBlank={()=>{clearCurrentBatch(true);goToStep("setup")}}/>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <a className="usage-link" href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + Plan</a>
          {signedIn!==null&&(localPreview&&!signedIn?<span className="account-link" title="Account sign-in is available on the published Listing Factory site.">Preview mode</span>:<a className="account-link" href={signedIn?"/account/sign-out?return_to=%2Flisting-factory":"/account/sign-in?return_to=%2Flisting-factory"}>{signedIn?"Sign out":"Sign in"}</a>)}
        </div>
        <div className="approved-sidebar-footer"><a className="approved-usage" href="/usage"><b>Usage + Plan</b><span>{sidebarUsage?`${sidebarUsage.used} / ${sidebarUsage.limit} listings`:"Loading usage…"}</span><div className="approved-usage-track" aria-hidden="true"><i style={{width:sidebarUsage?`${Math.min(100,sidebarUsage.used/sidebarUsage.limit*100)}%`:"0%"}} /></div></a>{listingGoal&&<a className="listing-goal-side" href="/goals"><span className="listing-goal-caption">This {listingGoal.period}&rsquo;s goal</span><b>{goalDone} of {listingGoal.target}</b><span className="listing-goal-track" aria-hidden="true"><i style={{width:`${Math.min(100,Math.round((goalDone/Math.max(1,listingGoal.target))*100))}%`}}/></span></a>}{/* D357 · "Powered by Goldie AI" is the widest line in the sidebar, so it sets
            the column's visual edge. Sitting above the copyright and the Etsy notice
            it made those look indented; at the bottom the block reads as one
            left-aligned stack that widens as it descends. */}
            <small>© 2026 Be A Wolf Biz</small><p className="etsy-api-disclosure">The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p><div className="approved-powered"><span>Powered by</span><b>Gold<span className="approved-footer-i">ı<i>✦</i></span>e AI</b></div></div>
      </header>

      {/* D721 · The main pane scrolls; the sidebar does not. The shell is a
          two-column grid at 100vh and this wrapper is the only scroller, which
          is what makes the sidebar fixed without position:fixed and without the
          padding-left reservation the old shell used. */}
      <div className="factory-main">
        {/* D721 · Top bar from the approved preview: the batch being worked on,
            its save state, and the account menu. Nothing here is new behaviour -
            batchDisplayName, the autosave state and the sign-out route all
            already existed; this gives them the position the preview shows. */}
        <header className="factory-top">
          <b className="factory-top-batch">{batchDisplayName?.trim()||"New listing batch"}</b>
          <div className="factory-top-right">
            <span className="factory-top-save">Saved just now</span>
            <div className="factory-account-wrap">
              <button type="button" className="factory-account" aria-haspopup="menu"
                aria-expanded={accountMenuOpen} onClick={()=>setAccountMenuOpen(open=>!open)}>
                <span className="factory-avatar" aria-hidden="true">BL</span>
                <span className="factory-account-label"><strong>Brittany</strong><small>Account</small></span>
                <span className="factory-account-caret" aria-hidden="true">⌄</span>
              </button>
              {accountMenuOpen&&<div className="factory-account-menu open" role="menu">
                <a role="menuitem" href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + Plan</a>
                {signedIn!==null&&(localPreview&&!signedIn
                  ? <span role="menuitem" title="Account sign-in is available on the published Listing Factory site.">Preview mode</span>
                  : <a role="menuitem" href={signedIn?"/account/sign-out?return_to=%2Flisting-factory":"/account/sign-in?return_to=%2Flisting-factory"}>{signedIn?"Sign out":"Sign in"}</a>)}
              </div>}
            </div>
          </div>
        </header>
        {/* D721 · prototype .goldie-work: the content column. max-width 1020,
            margin 0 66, padding 34/38 — read from the source, not invented. */}
        <div className="factory-work">

      {running&&uploadNoticeOpen&&<div className="upload-notice-backdrop" role="presentation"><section className="upload-notice" role="alertdialog" aria-modal="true" aria-labelledby="upload-notice-title" aria-describedby="upload-notice-copy"><span className="upload-notice-icon">!</span><p className="mini-label">UPLOADS IN PROGRESS</p><h2 id="upload-notice-title">Wait. Your files are still uploading.</h2><p id="upload-notice-copy">Are you sure you want to leave? Leaving now may stop the unfinished uploads.</p><div className="upload-notice-progress"><span className="upload-guard-pulse"/><b>{processed} of {runTotal} finished</b></div><div className="upload-notice-actions"><button autoFocus onClick={()=>{setUploadNoticeOpen(false);setLeaveTarget("")}}>Stay on this page</button><button className="danger" onClick={()=>{if(leaveTarget)window.location.href=leaveTarget}}>Leave and stop uploads</button></div></section></div>}

      {!returningHome&&<section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{workflowHero.eyebrow}</p>
          {restoreNotice&&<p className="batch-restore-notice" role="status">{restoreNotice}</p>}
          {/* D659 · Where the blocking modal used to be. Same information, on
              the page, next to the products she can actually choose. */}
          {restoredProductNotice&&<p className="batch-restore-notice" role="status">{restoredProductNotice}</p>}
          {/* D659 · More than one batch is open, so Goldie asks instead of
              picking one and instead of pretending there is nothing to resume. */}
          {resumeChoices.length>1&&<section className="batch-resume-choice" aria-label="Choose which batch to resume"><b>Which batch do you want to continue?</b><span>You have {resumeChoices.length} batches open. Goldie will not guess.</span><ul>{resumeChoices.map(choice=><li key={choice.id}><button type="button" onClick={()=>{setResumeChoices([]);setRestoringBatch(true);const target=new URL(window.location.href);target.searchParams.set("batch",choice.id);window.history.replaceState({},"",target);void restoreBatchById(choice.id,target.searchParams.get("step"),target.searchParams.get("phase"))}}><b>{choice.name}</b><small>{choice.drafts?`${choice.drafts} ${choice.drafts===1?"draft":"drafts"}`:"No drafts yet"}</small></button></li>)}</ul><button type="button" className="secondary-action" onClick={()=>setResumeChoices([])}>Start something new instead</button></section>}
          <div className="heading-with-help hero-title-help"><h1>{workflowHero.title}</h1><ContextHelp label={`Open detailed help for ${PROGRESS_STEPS[progressIndex]}`} title={WORKFLOW_HELP[progressIndex].title} intro={WORKFLOW_HELP[progressIndex].intro} sections={WORKFLOW_HELP[progressIndex].sections}/></div>
          <p className="hero-step-count">{workflowStep==="connect"?"Account setup · before you start":`Step ${railTopNumber} of ${RAIL_STAGES.length} · ${currentStage.label}`}</p>
          <p className="hero-copy">{workflowHero.copy}</p>
          {workflowStep==="connect"&&<div className="value-proof" aria-label="What this batch supports"><span><b>Up to 20 designs</b><small>in one batch</small></span><span><b>Costs and fees</b><small>shown for every variant</small></span><span><b>You approve</b><small>before anything goes live</small></span></div>}
        </div>
      </section>}

      {!returningHome&&<section className={`workspace ${complete&&workflowStep==="designs"?"mockup-workspace":""}`}>
        <nav className="workflow-progress" aria-label="Listing Factory progress" style={{"--rail-count":RAIL_STAGES.length} as React.CSSProperties}>
          <div className="workflow-progress-head"><div><p className="mini-label">{workflowStep==="connect"?"ACCOUNT SETUP":"YOUR BATCH"}</p>{/* D416 - On the Connect step this read "Step 1 of 4 · Product" under a heading
                that says "Connect your accounts", and the rail lit up Product. Connecting
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
            const done=reached&&(stage.index===8?stageStarted:(stageStarted&&progressGateIssues(stage.index).length===0)||(stagePosition>=0&&position<stagePosition));
            const issues=progressGateIssues(stage.index);
            const draftLine=stage.label==="Images"&&complete?` · ${createdDraftCount} ${createdDraftCount===1?"draft":"drafts"} created`:"";
            /* D227 · Never disable the stage the seller is currently on. When drafts failed,
               the rail greyed out Listing while the seller was standing on Listing —
               a control refusing the page it was already showing. */
            return <button key={stage.label} className={`${active?"active":""} ${done?"done":""}`} disabled={!active&&Boolean(issues.length)} aria-current={active?"step":undefined} title={issues[0]||undefined} onClick={()=>openProgressStep(stage.index)}><em className="progress-bubble-label">{stage.label}</em>{/* D352 · Zero-padding four steps ("01 of 04") is a template tic — it implies
                a longer sequence than exists and adds a character that carries no
                information. */}
                {/* D619 - the step you are STANDING on shows its number, never a
                    tick. It rendered a tick identical to the finished stages, so
                    Product, Images and Listing all read "done" at once and the
                    only thing marking your position was a pale box behind the
                    label. Remove the box and nothing said where you were.

                    You cannot have finished the step you are still on. */}
                <span>{!active&&done?"✓":String(position+1)}</span><span><b>{stage.title}</b><small>{issues[0]||`${progressStatus(stage.index,active,done,Boolean(issues.length))}${draftLine}`}</small></span></button>})}
          <p className="workflow-help">Goldie saves completed work. You can return to an earlier step without starting over.</p>
        </nav>
        <div className="workflow-stage">
        {/* D550 - opening a saved batch renders the heading, then nothing at all
            for several seconds, then the whole step. Captured on step 3: title,
            an empty page, and "Back / Saved automatically" floating in the middle
            of it. Every other slow thing in Goldie says it is working; this one
            looked broken. */}
        {restoringBatch&&<div className="batch-opening" role="status"><span className="batch-opening-spinner" aria-hidden="true"/><div><b>Opening your batch…</b><small>Goldie is reading your designs, drafts and listing details.</small></div></div>}
        {progressIndex>0&&<WorkflowMomentum
          current={railTopNumber}
          total={RAIL_STAGES.length}
          label={progressIndex===PROGRESS_STEPS.length-1?"Final review":`Next: ${PROGRESS_STEPS[Math.min(progressIndex+1,PROGRESS_STEPS.length-1)]}`}
        />}
        {/* D355 · The bundle banner is gone. It sat above the page announcing what
          had just been selected — but selecting it is what put you here, and the
          product cards below each carry their own name. It was a label for
          something the page was already showing, taking the first screenful. */}
        {progressIndex>0&&<GoldieInsight>{currentInsight()}</GoldieInsight>}
        {progressIndex===3&&files.length>0&&<ActionReceipt items={[{value:`${files.length} designs checked`,label:"Original artwork resolution preserved"},{value:`${pricedVariants.length} variants`,label:pricingApproved?"Pricing approved":"Ready for pricing review"}]}/>}
        {progressIndex===5&&titleCount>0&&<ActionReceipt items={[{value:`${titleCount} titles ready`,label:"Validated keyword phrases only"},{value:`${files.reduce((sum,file)=>sum+file.tags.length,0)} matching tags`,label:"Zero invented keywords"}]}/>}
        <div className={`steps-column ${workflowStep}-column`}>
          {workflowStep==="finish"&&finishPhase==="etsy"&&false&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Titles, tags, and descriptions complete</b><small>{files.length} {files.length===1?"listing is":"listings are"} ready for Etsy details.</small></div></div>}
          {workflowStep==="designs"&&complete&&<div className="step-success-banner" role="status"><span aria-hidden="true">✓</span><div><b>Etsy details complete</b><small>{files.length} {files.length===1?"listing is":"listings are"} ready for photos and mockups.</small></div></div>}
          
          <article className={`step-card connect-step workflow-panel ${connected ? "done" : ""} ${workflowStep==="connect"?"active-panel":"hidden-panel"}`}>
            
            <div className="step-content">
              {/* D284 · The page title already reads "Connect your accounts"; this card repeated it word for word directly beneath. */}
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
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<span className="sr-only">Connect Etsy before publishing</span><small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="disconnect-link" onClick={async()=>{if(!await confirmAction({title:"Disconnect your Etsy shop?",body:"Goldie will not be able to publish listings until you reconnect and authorise it again. Your existing Etsy listings are not affected.",confirmLabel:"Disconnect Etsy",cancelLabel:"Keep connected"}))return;await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" aria-busy={etsyConnecting} onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                  <small className="secure-copy">♢ Encrypted and saved securely.</small>
                </div>
              ) : (
                <div className="connection-stack connection-setup connected-connection-stack">
                  <div className="connection-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button className="disconnect-link" onClick={async () => { if(!await confirmAction({title:"Disconnect Printify?",body:"Goldie will not be able to create or publish drafts until you reconnect with a new API token. Your Printify products are not affected.",confirmLabel:"Disconnect Printify",cancelLabel:"Keep connected"}))return; await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="disconnect-link" onClick={async()=>{if(!await confirmAction({title:"Disconnect your Etsy shop?",body:"Goldie will not be able to publish listings until you reconnect and authorise it again. Your existing Etsy listings are not affected.",confirmLabel:"Disconnect Etsy",cancelLabel:"Keep connected"}))return;await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                </div>
              )}
              {connected&&connectionError&&<p className="field-warning" role="status">{connectionError}</p>}
              {etsyError&&<p className="field-error" role="alert">{etsyError}</p>}
              {/* D615 - a forward control belongs to the step that is open, and to
                  no other. This one rendered whenever Printify and Etsy were
                  connected, so it sat inside the collapsed Connect panel for the
                  whole rest of the batch, still enabled, still pointing back at
                  Product. The panel is display:none so a seller could not reach
                  it - but an enabled control that navigates backward has no
                  business existing at all, and one CSS regression is the
                  difference between hidden and live. */}
              {workflowStep==="connect"&&(localPreview||(connected&&etsyConnected))&&<button className="workflow-next" onClick={()=>goToStep("setup",false,localPreview)}>Next step <span>→</span></button>}
            </div>
          </article>

          <div className={`product-step workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}><SavedWorkflow bundleChosen={Boolean(activeBundle&&bundleRecipes.length>1)} savedRevision={savedRevision} connected={connected||localPreview} templateUrl={template} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} suggestedProductName={templateDetails?[templateDetails.brand,templateDetails.model].filter(Boolean).join(" ").trim()||templateDetails.blueprintTitle||"":""} selectedProductId={activeBundle?`bundle:${activeBundle.id}`:activeRecipe?.id||""} selectedSummary={templateDetails?<div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info">{bundleSelected?<><b>{activeBundle?.name}</b><span>{bundleRecipes.length} products · {bundleRecipes.map(item=>item.name).join(" · ")}</span><span>✓ Each product keeps its own colors, sizes, mockups, and keywords</span></>:<><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {variantSummary(summaryAxes(templateDetails,activeRecipe))}</span><span>✓ Product, placement, sizes, and shipping profile imported</span></>}</div><span className="template-badge">{bundleSelected?"Bundle selected":productSelected?"Product selected":"Save this product"}</span></div>:null} verifiedShippingProfileId={Number(templateDetails?.shippingTemplateId)||0} onTemplateUrl={(value) => { templateLoadVersion.current+=1;setLoadingTemplate(false);setTemplate(value);setTemplateDetails(null);setTemplateError(""); }} onUseRecipe={chooseRecipe} onUseBundle={useBundle} onStartNewProduct={startNewProduct} onChangeProduct={changeProduct} onVerifyTemplate={loadTemplateUrl} />
          {localPreview&&!templateDetails&&<button className="preview-demo-button" onClick={()=>void loadPreviewDemo()}>Load a complete poster demo to review every step</button>}
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          <BatchPreferencesPortal>
          {/* D457 - the "set up this product" framing is gone; a product saves its own defaults as they are chosen. */}
          
          {templateDetails&&productSelected&&<div className="saved-product-batch-page"><section className="batch-products" aria-label="Products in this batch">{(()=>{
            /* D385 - One card with one spinner while the bundle loads, then every
               product revealed together. Not a line of prose per product, and not
               a skeleton per product either - one card. */
            const list=activeBundle&&bundleRecipes.length>1?bundleRecipes:(activeRecipe?[activeRecipe]:[]);
            const waiting=list.some((recipe,index)=>!((!activeBundle||bundleRecipes.length<2||index===bundleIndex)?templateDetails:bundleColorProducts[recipe.id]));
            if(!waiting)return null;
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
              profilesError={shippingProfilesError}
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
          const panelFor=(open:string)=><>{open==="profit"&&pricingPanelFor("prices")}{open==="shipping"&&pricingPanelFor("shipping")}{open==="colors"&&<ProductColorSelector product={product} selected={shownColors} onChange={ids=>{if(isActive){setSelectedColorIds(ids);setPricingApproved(false)}else setBundleColorChoices(current=>({...current,[recipe.id]:ids}));if(ids.length)void establish(recipe,{defaultColorIds:ids})}} onRemember={()=>void saveProductDefaults({defaultColorIds:shownColors},`colors:${recipe.id}`)} remembering={savingProductDefault===`colors:${recipe.id}`} remembered={sameIdSet(shownColors,recipe.defaultColorIds)} inCard/>}{open==="sizes"&&<ProductSizeSelector product={product} selected={shownSizes} onChange={ids=>{if(isActive){setSelectedSizeIds(ids);setPricingApproved(false)}else setBundleSizeChoices(current=>({...current,[recipe.id]:ids}));if(ids.length)void establish(recipe,{defaultSizeIds:ids})}} onRemember={()=>void saveProductDefaults({defaultSizeIds:shownSizes},`sizes:${recipe.id}`)} remembering={savingProductDefault===`sizes:${recipe.id}`} remembered={sameIdSet(shownSizes,recipe.defaultSizeIds)} inCard/>}</>;const colorFacet=ready.facets.find(facet=>facet.name==="colors");const sizeFacet=ready.facets.find(facet=>facet.name==="sizes");const shownColors=(isActive?selectedColorIds:bundleColorChoices[recipe.id])||recipe.defaultColorIds||colorFacet?.suggested?.colorIds||[];const shownSizes=(isActive?selectedSizeIds:bundleSizeChoices[recipe.id])||recipe.defaultSizeIds||sizeFacet?.suggested?.sizeIds||[];return <article className={`batch-product-card ${ready.established?"is-ready":"needs-setup"} ${bundleSelected?"in-batch":""}`} key={recipe.id}><header>{pickProductPhoto(product)?<img className="bundle-product-photo" src={pickProductPhoto(product)} alt="" loading="lazy" decoding="async"/>:<ProductGlyph title={product.blueprintTitle}/>}<span className="bundle-product-id">{bundleSelected&&<em className="batch-product-position">Product {index+1} of {bundleRecipes.length}</em>}<b>{recipe.name}</b><small>{product.blueprintTitle}</small></span>{/* D347 · This read "1 to set", which names a count without naming what it
            counts. The card already marks the exact rows that need attention; the
            header only has to say that something in here does. */}
            <span className={`batch-product-state ${ready.established?"":"attention"}`} title={ready.established?"Ready":`${ready.questions.length} ${ready.questions.length===1?"setting needs":"settings need"} your attention`} aria-label={ready.established?"Ready":`${ready.questions.length} ${ready.questions.length===1?"setting needs":"settings need"} your attention`}>{ready.established?"Ready":<em aria-hidden="true">!</em>}</span></header><div className="batch-product-rows">{/* D338 · These rows used to be sorted so anything unset floated to the top,
                 so a product with no shipping profile showed Shipping first and Colors
                 third — the categories moved depending on what happened to be
                 missing. Position is how you find things; it cannot depend on state.
                 Fixed order, always: Colors, Sizes, Pricing, Shipping. An unset row
                 still marks itself, which is what "needed" already does. */
                ready.facets.map(facet=>{const label=({colors:"Colors",sizes:"Sizes",mockups:"Listing photos",keywords:"Keywords",shipping:"Shipping",profit:"Pricing",etsy:"Etsy details"} as Record<string,string>)[facet.name];const action=({colors:"Pick colors",sizes:"Pick sizes",mockups:"Upload listing photos",keywords:"Pick a keyword bank",shipping:"Pick a shipping profile",profit:"Set a profit goal",etsy:"Add Etsy details"} as Record<string,string>)[facet.name];const needed=facet.state==="ask";const inCard=["colors","sizes","profit","shipping"].includes(facet.name);const suggestion=(facet.suggested?.colorIds||facet.suggested?.sizeIds||[]).length;const openThis=()=>{if(inCard){toggle(facet.name);return}const dest=FACET_DESTINATION[facet.name];if(!dest)return;if(dest.step!==workflowStep)goToStep(dest.step);window.setTimeout(()=>{const block=document.querySelector<HTMLElement>(dest.selector);if(!block)return;block.scrollIntoView({block:"start"});block.classList.add("just-opened");window.setTimeout(()=>block.classList.remove("just-opened"),1600)},dest.step!==workflowStep?260:0)};return <Fragment key={facet.name}><div className={`batch-product-row ${needed?"needed":"settled"} ${isOpen(facet.name)?"open":""} ${inCard?"clickable":""}`} role={inCard?"button":undefined} tabIndex={inCard?0:undefined} aria-expanded={inCard?isOpen(facet.name):undefined} onClick={inCard?event=>{if((event.target as HTMLElement).closest("button"))return;openThis()}:undefined} onKeyDown={inCard?event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();openThis()}}:undefined}><span className="row-mark" aria-hidden="true">{needed?"!":"\u2713"}</span><span className="row-label">{label}</span><span className="row-value">{needed?action:facet.label}{facet.note?<small>{facet.note}</small>:null}</span><button type="button" className="row-open" onClick={openThis}>{isOpen(facet.name)?"Close":needed?"Choose":"Change"}</button></div>{isOpen(facet.name)?<>{panelFor(facet.name)}<button type="button" className="panel-collapse-foot" onClick={()=>toggle(facet.name)}>Close {label.toLowerCase()}</button></>:null}</Fragment>;})}</div></article>})}</section>{/* D232 · The "<product> — description and Etsy details" block is gone. It held
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
          {workflowStep==="setup"&&templateDetails&&productSelected&&<button type="button" className="workflow-next setup-forward" disabled={!complete&&Boolean(productStepBlocker())} title={productStepBlocker()||undefined} /* D402 - This used to carry a different label when drafts already existed, and
                 in that case it jumped straight to step 3. D383 renamed it to "Next step"
                 without changing where it went, so pressing Next on step 1 skipped Images
                 entirely. Next step means the next step; the rail is how you jump. */
                 onClick={()=>goToStep("designs")}>{/* D383 - This button relabelled itself with whatever was missing: "Pick a
                 keyword bank for Gildan Hoodie", "Choose product colors to continue".
                 The forward button is the forward button on every step; the gate
                 dialog already lists what is unfinished, by name, when you press it.
                 A control that renames itself is not a control you can learn. */}
              Next step <span>→</span></button>}
          </BatchPreferencesPortal>
          </div>

          <article className={`step-card designs-step workflow-panel ${workflowStep==="setup"?"batch-design-drop":""} ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${workflowStep==="designs"?"active-panel":"hidden-panel"}`}>{/* D238 · Choosing the mockup SET lived on Product while the mockups it controls are generated here on Images. Same setting, two pages — the exact split that caused the keyword-bank and shipping duplication. */}
            <div className="step-number" aria-hidden="true"/>
            <div className="step-content">
              <div className="step-heading"><div>{workflowStep!=="finish"&&<p className="mini-label">DESIGNS FOR THIS BATCH</p>}{/* D278 · On
                Listing this eyebrow read "TITLES, TAGS + DESCRIPTIONS" — the page
                title D256 retired — directly under the page eyebrow "STEP 3 OF 4 ·
                LISTING". Removing the card title in D248 left it as the only text
                in the header, still naming the step a third way. */}<div className="heading-with-help">{workflowStep!=="finish"&&<h2>Drop your designs here</h2>}{/* D248 · on Listing this
                read "Finish titles, tags, and descriptions" directly under the page
                title "Titles, tags + descriptions" — the same words, two serial-comma
                styles, 200px apart. The page title already names the step. */}</div></div>{files.length > 0 && workflowStep==="finish" && <span className="done-mark">✓ {files.length} listings</span>}</div>
              <p className="step-copy">{workflowStep==="finish"?"Create titles and matching tags, review each listing, and confirm the description shared across the batch.":`Build one focused batch of up to ${batchDesignLimit} finished designs. Upload a folder or select individual images.`}</p>
              {/* D247 · A three-step sub-rail inside step 3 of a four-step rail, numbering
              the work differently from the numbered sections directly beneath it:
              the rail called 2 "Review each listing" while the card called 2
              "Edit description". Two numbering systems, same page, disagreeing.
              The card's sections are the real structure and are on screen. */}
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
              {bundleQualityGroups.length>0&&<section className="bundle-quality-review" aria-label="Product-specific print quality warnings"><div><b>{bundleQualityGroups.length} of {files.length} {files.length===1?"design needs":"designs need"} a print decision</b><span>{productsInBatch.length>1?"The same artwork can be sharp on one product and too small for another. ":""}Anything below 215 DPI is flagged as very low resolution. Nothing is skipped silently.</span>{bundleProductsUnchecked.length?<span className="inline-note" role="status">Goldie could not read {bundleProductsUnchecked.join(", ")} yet, so {bundleProductsUnchecked.length===1?"it is":"they are"} not included in this check. Reopen {bundleProductsUnchecked.length===1?"that product":"those products"} to check {bundleProductsUnchecked.length===1?"it":"them"}.</span>:null}<div className="bundle-quality-bulk"><button type="button" onClick={()=>decideAllQuality("include")}>Proceed with all {bundleQualityGroups.length}</button><button type="button" onClick={()=>decideAllQuality("exclude")}>Exclude all {bundleQualityGroups.length}</button></div></div>{bundleQualityGroups.map(group=>{const decision=qualityGroupDecision(group.keys);const productList=[...new Set(group.products)];return <article className={group.critical?"critical-dpi":""} key={group.fileId}><div><b>{group.fileName}</b><span>{group.critical?<strong>VERY LOW RESOLUTION · {group.worstDpi} DPI · </strong>:null}{group.actualWidth} × {group.actualHeight}px is below the recommended size{productsInBatch.length>1?<> for <strong>{productList.join(", ")}</strong>{productList.length>1?` — ${productList.length} products in this bundle`:""}</>:<> for <strong>{productList[0]||"this product"}</strong></>}.</span></div><div><button className={decision==="include"?"selected":""} onClick={()=>decideQualityGroup(group.keys,"include")}>{group.critical?"I understand — proceed":"Proceed anyway"}</button><button className={decision==="exclude"?"selected exclude":""} onClick={()=>decideQualityGroup(group.keys,"exclude")}>{productList.length>1?"Exclude these listings":"Exclude this listing"}</button></div></article>})}</section>}
              {files.length>0&&(workflowStep==="setup"||workflowStep==="designs")&&<div className="design-upload-review" aria-label="Review uploaded designs">{files.map(file=><article key={file.id}><UploadedDesignPreview src={file.previewUrl} name={file.name}/><div><b title={file.name}>{file.name}</b><small>{file.width&&file.height?`${file.width} × ${file.height}px`:"Checking dimensions…"}</small></div><button type="button" onClick={()=>removeDesign(file.id)} aria-label={`Remove ${file.name}`}>Remove</button></article>)}</div>}
              {files.length>0&&!complete&&(workflowStep==="setup"||workflowStep==="designs")&&<>{designsFinished&&belowRecommendedPixels.length>0&&<div className={`pixel-warning-inline ${criticalDpiFiles.length?"critical-dpi":""}`} role="status"><span>!</span><div><b>{criticalDpiFiles.length?`${criticalDpiFiles.length} ${criticalDpiFiles.length===1?"design is":"designs are"} below 215 DPI — very low resolution.`:belowRecommendedPixels.length===1?"One design is below Printify’s recommended pixel size.":"Some designs are below Printify’s recommended pixel size."}</b><small>{criticalDpiFiles.length?"Goldie will identify every affected design so you can replace it or continue anyway.":"You can still continue, but Goldie will ask you to confirm first."}</small></div></div>}{/* D399 - Step 2 showed "Next step" here AND "Continue to create drafts" in the
                product card below. Creating the drafts is the step; this button only
                scrolled down to it. One forward control per step: the action while the
                drafts do not exist, the forward once they do. */}
              {workflowStep!=="setup"&&complete&&<button className="workflow-next" disabled={!designsFinished} onClick={continueFromDesigns}>{designsFinished?"Next step":`Preparing ${designsPreparing} ${designsPreparing===1?"design":"designs"}…`} {designsFinished&&<span>→</span>}</button>}</>}
              {files.length>0&&complete&&workflowStep==="designs"&&<button className="workflow-next" onClick={()=>goToStep("finish",false,true)}>Back to finishing your listings <span>→</span></button>}
            </div>
          </article>
          {workflowStep==="setup"&&<div id="batch-preferences-after-designs" className="batch-preferences-after-designs"/>}
          {/* D221 · Etsy details joins titles, tags and descriptions on one Listing page. They
           are the same job — the words and metadata of the listing — and they were two
           screens apart. */}
          {workflowStep==="finish"&&(finishPhase==="details"||finishPhase==="etsy")&&stepProductCards(bundleCardStatus("listing"),/* D541 - step 3 held one block: a title builder, a description editor and a
              table of every listing, with two rows that were bookmarks into spots
              inside it. Clicking Description showed titles and tags too, because
              they were never in a section of their own. The rows own panels now,
              exactly as step 2 does, and the card passes no body. */
            null,false,
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
              {!etsyDetailsPrepared?<><button className="secondary-action prepare-etsy" aria-busy={preparingEtsy} disabled={preparingEtsy||progressGateIssues(6).length>0||batchHeldByAnotherTab} title={batchHeldByAnotherTab?"This batch is open in another Goldie tab, so nothing prepared here would be kept.":progressGateIssues(6)[0]} onClick={()=>void continueToEtsyDetails()}>{preparingEtsy?"Preparing Etsy details…":"Prepare Etsy details"}</button>{preparingEtsy?<p className="etsy-preparing-note" role="status">This can take a moment when your batch has several listings. Keep this page open while Goldie prepares each one.</p>:progressGateIssues(6)[0]&&<p className="etsy-preparing-note gate-reason" role="status">{progressGateIssues(6)[0]}</p>}</>:<><button className="workflow-next" aria-busy={savingEtsyDetails} disabled={savingEtsyDetails||progressGateIssues(7).length>0} title={progressGateIssues(7)[0]} onClick={()=>void saveAllEtsyDetails()}>{savingEtsyDetails?"Saving Etsy details…":"Next step"} <span>→</span></button>{!savingEtsyDetails&&progressGateIssues(7)[0]&&<p className="etsy-preparing-note gate-reason" role="status">{progressGateIssues(7)[0]}</p>}</>}
            </>)}
          {workflowStep==="finish"&&finishPhase==="final"&&stepProductCards(bundleCardStatus("publish"),null,false,<>{/* D497 - publish covered one product until D495, so these cards kept their
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
              <article className="step-card final-review active-panel"><div className="step-content">{batchReceipt?<OutcomeReceipt goalLine={listingGoal?`That is ${goalDone} of your ${listingGoal.target} listings this ${listingGoal.period}.`:undefined} receipt={batchReceipt} productName={templateDetails?.blueprintTitle||""} shippingProfile={etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||""} imageCount={printifyImageIndices.length} sizeGuideName={sizeGuideName} tagCount={files.reduce((sum,file)=>sum+file.tags.length,0)} mockupCount={Object.values(preparedMockupCounts).reduce((sum,count)=>sum+count,0)} variantCount={pricedVariants.length*files.length} minutesSaved={Math.max(12,Math.round(files.length*11.1))} nextBundleProduct={bundleRecipes[bundleIndex+1]?.name} bundleComplete={Boolean(activeBundle&&bundleIndex===bundleRecipes.length-1)} onNextBundleProduct={()=>void continueBundle()} onNewBatch={()=>{clearCurrentBatch(true);goToStep("setup")}}/>:<><div className="step-heading"><div><p className="mini-label">FINAL REVIEW</p>{/* D660 · This said "ready for its final check" over a
                   disabled Publish button and a product with no titles at all.
                   The heading has to agree with the gate directly beneath it. */}
                   <h2>{publishBlockers().length?"Finish these items before publishing":activeBundle?"Your selected listings are ready for final review":"Your batch is ready for its final check"}</h2></div><span className="done-mark">✓ {drafts.filter(draft=>draft.status==="Created").length} {drafts.filter(draft=>draft.status==="Created").length===1?"draft":"drafts"}{activeBundle&&bundleRecipes.length>1?` on ${activeRecipe?.name||"this product"}`:""}</span></div>{/* D546 - the old lead-in pointed at a checklist that repeated
              what the product cards above already report, line for line. The cards
              own it. What this step still has to say is what publishing will do. */}<p className="step-copy">{activeBundle&&bundleRecipes.length>1?`Every product in this batch publishes in turn. Nothing goes live until you use the final button.`:"Nothing is published until you use the final button."}</p>{/* D546 - her words, looking at it: "this whole section doesn't need to be on
              the final step because above it, you list every product and everything
              that's in every product." It repeated the cards line for line - prices,
              description, Etsy details, photos - and the two things it alone
              reported moved into the rows that own them. */}
{/* D559 - her question: "why if this is a hoodie t shirt and crew neck batch
                would it be showing me two hoodies only?" Because it was handed the
                open batch's drafts, while the button published all three products.
                It gets every product's listings now, so the checkboxes govern the
                six listings the press will actually create. */}
            <FinalListingReview drafts={bundlePublishDrafts()} files={bundlePublishFiles()} selections={bundlePublishSelections()} defaultIndices={printifyImageIndices} preparedMockupCounts={bundlePublishMockupCounts()} batchSizeGuide={sizeGuideName} onRetry={clientId=>{const design=files.find(file=>file.id===clientId);if(design)void runDrafts([design],true)}} onEdit={setFinishPhase}/>{/* D548 - read as someone about to spend money, this said two untrue things.
              "Only the listings selected above" - the selection covers the product
              that is open, and on a bundle the button publishes every product, so
              the sentence promised a smaller press than the one it sat under. And
              it named the fee per listing without ever multiplying it, on the one
              screen where the total is the thing worth knowing. */}
            <div className="publish-live-warning">{(()=>{
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
              <small>Etsy charges its standard $0.20 USD listing fee for each listing created{total?`, so this press costs about $${(total*0.2).toFixed(2)} USD`:""}. This fee is charged by Etsy and is separate from your Goldie subscription.</small></>;
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
              matters is the press, and that is where it was missing. */}
              {etsyShop?<small className="publish-all-shop">to {etsyShop}</small>:null}</button>
              {(publishing||Boolean(publishRun))&&<p className="working-note" role="status">Publishing to Etsy can take a few minutes. Keep this page open — Goldie will show each listing as it goes live.</p>}<button className="keep-drafts-button" type="button" disabled={publishing} onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());setDraftSaveOpen(true)}}>Keep as Printify drafts for now</button>{!publishing&&<small className="keep-drafts-note">Nothing will publish to Etsy. Return to this exact batch from Batch History.</small>}{/* D474 - this describes the Keep as drafts button, but sat there while the
     button above it said Publishing, so the page said both that it was
     publishing and that nothing would publish. It belongs to a choice that is
     no longer available once publishing has started. */}{publishMessage&&<p className="publish-message" role="status">{publishMessage}</p>}{publishFailures.length>0&&<section className="publish-failure-panel" role="alert"><p className="mini-label">NOTHING WAS PUBLISHED</p><h3>{publishFailures.length===1?"1 listing could not be published":`${publishFailures.length} listings could not be published`}</h3><p className="publish-failure-lede">Etsy did not create {publishFailures.length===1?"this listing":"these listings"}, so you have not been charged a listing fee for {publishFailures.length===1?"it":"them"}. Here is exactly what Etsy said:</p><ul className="publish-failure-list">{publishFailures.map(failure=>{const draft=drafts.find(item=>item.id===failure.productId);return <li key={failure.productId}><strong>{draft?.title?.slice(0,60)||draft?.name||"Listing"}</strong><span>{failure.error}</span></li>})}</ul><p className="publish-failure-lede">Goldie has emailed this to you and recorded it. You can press publish again once it is fixed.</p></section>}</>}</div></article></>)}
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
        {stepProductCards(bundleCardStatus("images"),null,!(workflowStep==="designs"),<aside className={`launch-panel workflow-panel ${workflowStep==="designs"?"active-panel":"hidden-panel"}`}>
          <div className={`step-number launch-step-icon create-drafts-icon`} aria-hidden="true"/>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            {(running||workflowStep!=="review")&&<h2>{running ? `Creating drafts · ${processed} of ${runTotal} finished` : complete ? "Drafts created" : "Create your Printify drafts"}</h2>}
            <p>{running ? "Goldie is uploading each design and creating its Printify draft." : workflowStep==="review" ? "Goldie creates an unpublished Printify draft for every design in this batch." : complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : ""}</p>
          </div>

          

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            {!(activeBundle&&bundleRecipes.length>1)&&<div><span>Saved product</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button onClick={()=>goToStep("setup")}>Edit</button></div>}
            {!(activeBundle&&bundleRecipes.length>1)&&<div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>}
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            
          </div>

          {running && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="progress-ring" aria-hidden="true"><span>{processed}/{runTotal}</span></div>
              <div className="progress-copy"><b>Creating your Printify drafts</b><span>{preparationMessage || "Keep this page open while Goldie finishes the batch."}</span></div>
              <div className="progress-track"><span style={{ width: `${runTotal ? (processed / runTotal) * 100 : 0}%` }} /></div>
            </div>
          )}

          {!complete ? (
            <>
            <button className="launch-button" aria-busy={running||preparingEtsy||Boolean(bundleRun)} disabled={!ready || !pricingApproved || running||preparingEtsy||Boolean(bundleRun)} onClick={createDrafts}>
              {/* D485 - one press covers the whole bundle, so the button says so
                  rather than naming a single product, and reports which product
                  Goldie is on while it works its way through them. */}
              <span className="button-glint" />{bundleRun&&!running?`Moving to ${bundleRecipes[bundleIndex+1]?.name||"the next product"}…`:preparingEtsy?"Completing Etsy details…":running ? (activeBundle&&bundleRecipes.length>1?`${activeRecipe?.name||"Product"} ${bundleIndex+1} of ${bundleRecipes.length}: creating drafts · ${processed} of ${runTotal} finished…`:`Creating drafts · ${processed} of ${runTotal} finished…`) : !ready ? missingRequirement /* D229 · The button is also disabled when prices are not approved, and that branch had no label — it read "Continue to create drafts", greyed out, with nothing anywhere on the page saying why. Every condition that disables this button now names itself. */ : !pricingApproved ? "Approve prices on the Product page to continue" : activeBundle&&bundleRecipes.length>1?`Create Printify drafts for all ${bundleRecipes.length} products`:"Continue to create drafts"}<span>→</span>
            </button>
              {/* D708 · The label already changes while Goldie works, but a changing
                  label does not tell you HOW LONG. Draft creation and Etsy publishing
                  are the two steps that can sit for minutes, and a screen that looks
                  frozen is when a seller closes the tab or presses again. Her words:
                  "so they know that nothing is wrong." */}
              {(running||preparingEtsy||Boolean(bundleRun))&&<p className="working-note" role="status">This can take a few minutes. Keep this page open — Goldie will move on by itself when it is done.</p>}
            </>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status !== "Created") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status !== "Created").length} listings that need another try</button>}
              <button className="workflow-next" onClick={()=>goToStep("finish",false,true)}>Back to finishing your listings <span>→</span></button>
            </div>
          )}
          <p className="launch-note">This step creates unpublished Printify drafts. The final Goldie step publishes them live to Etsy only after a second confirmation.</p>
        </aside>,false)}
{/* D496 - a held tab has to say so where she is working, not silently stop
    saving. */}
        {batchHeldByAnotherTab&&<div className="batch-tab-conflict" role="status"><b>This batch is open in another Goldie tab.</b><span>Goldie has paused saving here so that tab’s work is not overwritten. Continue in the other tab, or take over here and it will pause there instead.</span><button type="button" onClick={takeOverBatchHere}>Take over editing here</button></div>}
        <div className="workflow-footer-actions">{progressIndex>0&&<button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button>}<span className="autosave-note"><i aria-hidden="true">✓</i> Saved automatically</span>{/* D386 - Saving a draft was only reachable from the Publish step, so
                stopping halfway meant trusting the autosave and remembering the
                batch later. Name it and park it from wherever you are. */}{workflowStep!=="connect"&&(files.length>0||drafts.length>0||Boolean(templateDetails))&&<button className="save-draft-link" type="button" onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());setDraftSaveOpen(true)}}>Save as draft</button>}</div>
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
        <button className="workflow-next" type="button" disabled={imagesStepIssues().length>0} title={imagesStepIssues()[0]} onClick={()=>{const missing=createdListingsMissingImages();if(missing.length){setImageStepError(`${missing.length} ${missing.length===1?"listing needs":"listings need"} at least one photo.`);setMissingPhotoDraftIds(missing.map(draft=>draft.clientId));return}setImageStepError("");setMissingPhotoDraftIds([]);/* D427 - one Next step on this page, and it is the one that checks every listing has a photo. The second copy in the card list bypassed that check entirely. Goes to Listing, not Publish. */setFinishPhase("details");void goToStep("finish",false,true);window.scrollTo(0,0)}}>Next step <span aria-hidden="true">→</span></button>
        {imagesStepIssues()[0]&&<p className="etsy-preparing-note gate-reason" role="status">{imagesStepIssues()[0]}</p>}
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

      {complete && workflowStep==="designs" && <div className="workflow-footer-actions post-draft-footer"><button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button><span className="autosave-note"><i aria-hidden="true">✓</i> Saved automatically</span><button className="save-draft-link" type="button" onClick={()=>{setBatchDisplayName(current=>current||suggestedBatchName());setDraftSaveOpen(true)}}>Save as draft</button></div>}

      {preflightOpen && <div className="preflight-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPreflightOpen(false)}}><section className="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title"><p className="mini-label">CREATE PRINTIFY DRAFTS</p>{/* D492 - the button says "Create Printify drafts for all 3 products" and this
    dialog, the last thing before it runs, said "Create 2 product drafts?" and
    named only the hoodie. It was describing one product while six drafts were
    about to be made. The confirmation has to describe the run it confirms. */}
<h2 id="preflight-title">{activeBundle&&bundleRecipes.length>1?`Create ${files.length*bundleRecipes.length} product drafts across ${bundleRecipes.length} products?`:`Create ${files.length} product ${files.length===1?"draft":"drafts"}?`}</h2><p className="preflight-timing">This usually takes about 15 seconds per listing. A batch of 20 can take a few minutes.</p><div className="preflight-list"><div><span>{activeBundle&&bundleRecipes.length>1?"Printify products":"Printify product"}</span><b>{activeBundle&&bundleRecipes.length>1?`✓ ${bundleRecipes.map(recipe=>recipe.name).join(", ")}`:`✓ ${templateDetails?.blueprintTitle||"Selected product"}`}</b></div><div><span>Design files</span><b>✓ {files.length} ready</b></div><div><span>Plan allowance</span><b>{planDraftsRemaining===null?"Checking current usage…":`✓ ${requestedListingCount} of ${planDraftsRemaining} remaining listings`}</b></div><div><span>Permanent description</span><b>{description.trim()?"✓ Imported from Printify":"None found. You can add one later"}</b></div><div><span>Variant pricing</span><b title={bundleVariantCounts.detail}>✓ All {bundleVariantCounts.total} enabled variants reviewed and approved{bundleVariantCounts.perProduct.length>1?` · ${bundleVariantCounts.detail}`:""}</b></div><div><span>Publishing</span><b>Unpublished Printify drafts only</b></div></div>{templateDetails?.hasLabelArtwork?<p className="preflight-note">Inside-label artwork is not copied to new products.</p>:null}<p className="preflight-explainer">After these drafts exist, Goldie will show their real previews and help finish each title, tags, description, Etsy details, and listing photos.</p><div className="preflight-actions"><button className="preflight-cancel" onClick={()=>setPreflightOpen(false)}>Go back</button><button className="preflight-confirm" disabled={running} aria-busy={running} onClick={confirmDrafts}>Create Printify drafts →</button></div></section></div>}

      {publishConfirmOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="publish-confirm-title"><span className="publish-confirm-icon">!</span><p className="mini-label">FINAL PUBLISH CONFIRMATION</p>{/* D495 - one press now publishes every product in the bundle, so the last
    screen before real money is spent has to say how many listings that is
    across how many products, not describe only the one that is open. */}
<h2 id="publish-confirm-title">{activeBundle&&bundleRecipes.length>1?`${publishTargets().length} ${publishTargets().length===1?"listing":"listings"} across ${new Set(publishTargets().map(item=>item.productName)).size} ${new Set(publishTargets().map(item=>item.productName)).size===1?"product":"products"} will go live on Etsy.`:"These listings will go live on Etsy."}</h2>{activeBundle&&bundleRecipes.length>1&&<p className="publish-confirm-bundle">Goldie publishes {[...new Set(publishTargets().map(item=>item.productName).filter(Boolean))].join(", ")||bundleRecipes.map(recipe=>recipe.name).join(", ")} one after another. If a product is not ready it stops there and tells you what is missing — nothing after it is published.</p>}<p>They will not be saved as Etsy drafts. Publishing starts as soon as you confirm below. Goldie will immediately apply the selected Etsy shipping profile.</p><p className="etsy-listing-fee-note">Etsy will charge its standard $0.20 USD listing fee for each listing created{activeBundle&&bundleRecipes.length>1?` \u2014 about $${(publishTargets().length*0.2).toFixed(2)} for ${publishTargets().length} ${publishTargets().length===1?"listing":"listings"}`:""}. This Etsy fee is separate from your Goldie subscription.</p>{missingPublishFields().length>0&&<div className="publish-missing"><b>Goldie found blank or unfinished fields:</b><ul>{missingPublishFields().map(field=><li key={field}>{field}</li>)}</ul><span>You can still publish, but review these first if they matter to this batch.</span></div>}<div className="publish-confirm-actions"><button onClick={()=>setPublishConfirmOpen(false)}>Go back and review</button><button className="danger" disabled={publishing} aria-busy={publishing} onClick={()=>{if(activeBundle&&bundleRecipes.length>1)setPublishRun({total:bundleRecipes.length});void publishAll()}}>Yes, publish live on Etsy</button></div></section></div>}

      {draftSaveOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!savingDraftBatch)setDraftSaveOpen(false)}}><section className="publish-confirm save-draft-modal" role="dialog" aria-modal="true" aria-labelledby="save-draft-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>×</button><span className="publish-confirm-icon">✓</span><p className="mini-label">SAVE FOR LATER</p><h2 id="save-draft-title">Keep these listings as Printify drafts?</h2><p>Great—this batch will be waiting for you in Batch History. Nothing will publish to Etsy until you return and choose to publish it.</p><label><span>Name this batch</span><input autoFocus maxLength={160} value={batchDisplayName} onChange={event=>setBatchDisplayName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/><small>Goldie suggested a name from the saved product and first listing topic. Change it to anything you will recognize.</small></label><div className="publish-confirm-actions"><button disabled={savingDraftBatch} onClick={()=>setDraftSaveOpen(false)}>Cancel</button><button className="save-draft-confirm" aria-busy={savingDraftBatch} disabled={savingDraftBatch||!batchDisplayName.trim()} onClick={()=>void saveDraftBatch()}>{savingDraftBatch?"Saving batch…":"Save to Batch History"}</button></div></section></div>}

      {draftSavedOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm save-draft-success" role="dialog" aria-modal="true" aria-labelledby="draft-saved-title"><span className="publish-confirm-icon">✓</span><p className="mini-label">BATCH SAVED</p><h2 id="draft-saved-title">Great—this batch is waiting for you.</h2><p><b>{batchDisplayName}</b> is saved in Batch History. The products remain unpublished Printify drafts, and every title, Etsy detail, and photo choice will be here when you return.</p><div className="publish-confirm-actions"><button onClick={()=>setDraftSavedOpen(false)}>Keep working here</button><button className="save-draft-confirm" onClick={()=>{window.location.href="/batches"}}>View Batch History</button></div></section></div>}

      {restartBatchOpen&&<div className="publish-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!restartingBatch)setRestartBatchOpen(false)}}><section className="publish-confirm restart-batch-modal" role="alertdialog" aria-modal="true" aria-labelledby="restart-batch-title"><button type="button" className="missing-photo-close" aria-label="Close" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>×</button><span className="publish-confirm-icon" aria-hidden="true">↻</span><p className="mini-label">START A NEW BATCH</p><h2 id="restart-batch-title">What should Goldie do with this batch?</h2><p>Your saved products, product defaults, and keyword banks will stay exactly as they are.</p>{(files.length>0||drafts.length>0)&&<label><span>Name this batch before saving</span><input maxLength={160} value={restartBatchName} onChange={event=>setRestartBatchName(event.target.value)} placeholder="Example: Gildan Tee · Bachelorette designs"/></label>}<div className="restart-batch-actions"><button type="button" disabled={restartingBatch} onClick={()=>setRestartBatchOpen(false)}>Cancel</button>{(files.length>0||drafts.length>0)&&<button type="button" className="save-restart" aria-busy={restartingBatch} disabled={restartingBatch||!restartBatchName.trim()} onClick={()=>void saveAndRestart()}>{restartingBatch?"Saving…":"Save to Batch History + start new"}</button>}<button type="button" className="discard-restart" disabled={restartingBatch} onClick={()=>finishRestart(false)}>{files.length||drafts.length?"Discard this batch + start new":"Start new batch"}</button></div><small className="restart-printify-note">Existing Printify drafts are not deleted from Printify.</small></section></div>}

      {blockingModal&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm blocking-modal" role="alertdialog" aria-modal="true" aria-labelledby="blocking-modal-title"><span className="publish-confirm-icon">!</span><p className="mini-label">REQUIRED BEFORE CONTINUING</p><h2 id="blocking-modal-title">{blockingModal.title}</h2>{blockingModal.copy&&<p>{blockingModal.copy}</p>}<div className="publish-missing"><b>Fix these items:</b><ul>{blockingModal.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setBlockingModal(null)}>Got it. I’ll fix this</button></div></section></div>}
      {pendingCategoryChange&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="category-change-title"><span className="publish-confirm-icon">!</span><p className="mini-label">ETSY CATEGORY CHANGE</p><h2 id="category-change-title">Change this listing’s Etsy category?</h2><p>{pendingCategoryChange.clearedCount} completed {pendingCategoryChange.clearedCount===1?"field does":"fields do"} not exist in the new category and will be cleared. Any compatible values will stay filled.</p><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPendingCategoryChange(null)}>Keep current category</button><button className="danger" onClick={()=>{const pending=pendingCategoryChange;setPendingCategoryChange(null);updateDesign(pending.designId,{etsy:pending.details,etsyError:""})}}>Change category and clear {pendingCategoryChange.clearedCount}</button></div></section></div>}
      {missingPhotoDraftIds.length>0&&typeof document!=="undefined"&&createPortal(<div className="publish-confirm-backdrop missing-photo-backdrop" role="presentation"><section className="publish-confirm missing-photo-modal" role="alertdialog" aria-modal="true" aria-labelledby="missing-photo-title"><button className="missing-photo-close" type="button" aria-label="Close" onClick={()=>setMissingPhotoDraftIds([])}>×</button><span className="publish-confirm-icon">!</span><p className="mini-label">PHOTOS REQUIRED</p><h2 id="missing-photo-title">{missingPhotoDraftIds.length} {missingPhotoDraftIds.length===1?"listing needs":"listings need"} a photo</h2><p>Add at least one Printify photo or lifestyle mockup to every listing shown below.</p><div className="missing-photo-list">{missingPhotoDraftIds.map(clientId=>{const draft=drafts.find(item=>item.clientId===clientId),design=files.find(item=>item.id===clientId),preview=draft?.previewUrl||design?.previewUrl;return <article key={clientId}>{preview?<img src={preview} alt="Product and design preview"/>:<div className="missing-photo-placeholder" aria-hidden="true"/>}<b>{design?.name||draft?.name||"Listing"}</b><button type="button" onClick={()=>jumpToMissingPhotoListing(clientId)}>Go to this listing</button></article>})}</div></section></div>,document.body)}
      {pixelWarningOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm pixel-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="pixel-warning-title"><span className="publish-confirm-icon">!</span><p className="mini-label">PRINT RESOLUTION CHECK</p><h2 id="pixel-warning-title">One or more of these designs fall below Printify’s pixel size recommendations for this product.</h2><p>These designs may still print, but they may show a lower resolution inside the Printify editor at the largest enabled size. Review the comparison below before deciding whether to continue.</p><div className="pixel-comparison" role="region" aria-label="Uploaded design pixel comparison"><div className="pixel-comparison-head" aria-hidden="true"><b>Design</b><b>Uploaded size</b><b>Printify recommends</b></div><div className="pixel-comparison-rows">{(activeBundle&&bundleQualityIssues.length
              ?bundleQualityIssues.map(issue=>({id:issue.key,name:`${issue.fileName} · ${issue.productName}`,width:issue.actualWidth,height:issue.actualHeight,needWidth:issue.requiredWidth,needHeight:issue.requiredHeight}))
              :belowRecommendedPixels.map(file=>({id:file.id,name:file.name,width:file.width||0,height:file.height||0,needWidth:recommendedPixelSize.width,needHeight:recommendedPixelSize.height})))
              .map(row=><div className="pixel-comparison-row" key={row.id}><b title={row.name}>{row.name}</b><span><small>Uploaded size</small>{row.width.toLocaleString()} × {row.height.toLocaleString()} px</span><span><small>Printify recommends</small>{row.needWidth.toLocaleString()} × {row.needHeight.toLocaleString()} px</span></div>)}</div></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPixelWarningOpen(false)}>Go back and review</button><button className="pixel-proceed" onClick={()=>{setPixelWarningOpen(false);
              /* D509 - pressing this on a bundle is the decision the old dialog
                 demanded, so record it and carry on rather than sending her back
                 to make it again on the page behind. */
              const undecided=bundleQualityGroups.filter(group=>group.keys.some(key=>!bundleQualityDecisions[key]));
              if(undecided.length){decideAllQuality("include");setPreflightOpen(true);return}
              if(complete){void goToStep("finish",false,true)}else{document.querySelector(".launch-panel")?.scrollIntoView({block:"start"})}}}>Proceed anyway</button></div></section></div>}

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat screen={workflowScreen(workflowStep,finishPhase,complete)} />
            </div>
      </div>
</main>
  );
}
