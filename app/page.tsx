"use client";
/* eslint-disable @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";
import { KeywordBank, SavedWorkflow, type Pricing, type Recipe } from "./factory-tools";
import IntegratedMockups from "./integrated-mockups";
import { tagsFromTitle, titlesFromCsv } from "./seo-utils";
import { printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchFiles, saveBatchFiles } from "./batch-cache";
import { recommendedPrice } from "./pricing";

type VisibleBounds={left:number;top:number;right:number;bottom:number};
type EtsyDetails={category:string;attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review"};
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; title: string; tags: string[]; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";etsy?:EtsyDetails;etsyError?:string };
type ProductVariant={id:number;title:string;cost:number;templatePrice:number;shipping?:number|null;options?:number[]};
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number; variants:ProductVariant[]; shop: string; standardShipping?:number|null;shippingCurrency?:string;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string; placement?:{x:number;y:number;scale:number};placementScale?:number };
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
type FinishPhase = "details" | "mockups" | "final";

const WORKFLOW_STEPS: Array<{id:WorkflowStep;number:string;label:string}> = [
  {id:"connect",number:"01",label:"Connect Printify"},
  {id:"setup",number:"02",label:"Choose product"},
  {id:"designs",number:"03",label:"Add designs"},
  {id:"review",number:"04",label:"Review batch"},
  {id:"finish",number:"05",label:"Finish listings"},
];
const PROGRESS_STEPS = ["Connect Printify","Choose product","Add designs","Review pricing","Create drafts","Titles + Etsy details","Images + mockups","Final review"];

const MAX_BATCH_FILES = 20;
const MAX_CONCURRENT_DESIGNS = 2;
const LARGE_BATCH_THRESHOLD = 400 * 1024 * 1024;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
function isRigidPaperProduct(template:TemplateDetails|null){return /poster|print|canvas|paper/i.test(`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`)}
function PrintifyImagePicker({ images,indices,onApplyAll,onSaveRecipe }: { images: string[];indices:number[];onApplyAll:(indices:number[])=>void;onSaveRecipe?:(indices:number[])=>void }) { const [selected, setSelected] = useState<Set<number>>(new Set(indices.length?indices:images.slice(0,3).map((_,i)=>i))); useEffect(()=>setSelected(new Set(indices.length?indices:images.slice(0,3).map((_,i)=>i))),[indices,images.length]); if (!images.length) return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>; const chosen=[...selected].sort((a,b)=>a-b); return <details className="printify-image-picker"><summary>Choose Printify flatlays ({selected.size} selected)</summary><p>Goldie remembers these image positions for the final Etsy image mix. Printify does not expose its own saved mockup selection, so this does not alter the editor.</p><div>{images.map((src, index) => <label className={selected.has(index) ? "selected" : ""} key={src}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/><img src={src} alt={`Printify product mockup ${index + 1}`}/></label>)}</div><div className="image-pref-actions"><button onClick={()=>onApplyAll(chosen)}>Use for every listing</button>{onSaveRecipe&&<button onClick={()=>onSaveRecipe(chosen)}>Save to this product</button>}</div></details>; }

function PlacementEditor({draft,design,template,onSaved}:{draft:DraftResult;design:DesignFile;template:TemplateDetails|null;onSaved:(draft:DraftResult)=>void}){const [placement,setPlacement]=useState({x:0,y:0,scale:1}),[saving,setSaving]=useState(false),[message,setMessage]=useState("");const templateScale=isRigidPaperProduct(template)?Math.min(template?.placementScale||1,1):(template?.placementScale||1),baseScale=draft.placementScale||templateScale,actualScale=baseScale*placement.scale,quality=design.width&&template?.maxPrintWidth?printifyDpi(design.width,template.maxPrintWidth,actualScale):null;async function save(){if(!draft.id)return;setSaving(true);setMessage("");try{const response=await fetch("/api/printify/drafts/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:draft.id,placement})}),payload=await response.json() as {draft?:DraftResult;error?:string};if(!response.ok)throw new Error(payload.error||"Placement could not be saved.");onSaved({...draft,...payload.draft});setPlacement({x:0,y:0,scale:1});setMessage("Saved to Printify. The preview may take a moment to refresh.")}catch(error){setMessage(error instanceof Error?error.message:"Placement could not be saved.")}finally{setSaving(false)}}return <details className="placement-editor"><summary>Resize or reposition this design</summary><p className="placement-help">Adjust from the current Printify placement, then save. Every enabled size keeps its own correct starting placement.</p><div className="placement-grid"><label>Design size <b>{Math.round(placement.scale*100)}%</b><input type="range" min="0.5" max="1.5" step="0.01" value={placement.scale} onChange={e=>setPlacement({...placement,scale:Number(e.target.value)})}/></label><label>Move left / right <b>{placement.x===0?"Centered":`${placement.x>0?"Right":"Left"} ${Math.abs(Math.round(placement.x*100))}%`}</b><input type="range" min="-.3" max=".3" step="0.01" value={placement.x} onChange={e=>setPlacement({...placement,x:Number(e.target.value)})}/></label><label>Move up / down <b>{placement.y===0?"Centered":`${placement.y>0?"Down":"Up"} ${Math.abs(Math.round(placement.y*100))}%`}</b><input type="range" min="-.3" max=".3" step="0.01" value={placement.y} onChange={e=>setPlacement({...placement,y:Number(e.target.value)})}/></label></div><div className={`live-dpi ${quality&&quality.dpi>=300?"pass":"check"}`}><b>{quality?`${quality.dpi} DPI after this size change`:"DPI unavailable"}</b><span>{quality?.dpi&&quality.dpi<300?"Below 300 DPI—make the design smaller until the DPI is acceptable.":"300 DPI target met."}</span></div><button onClick={()=>void save()} disabled={saving||placement.x===0&&placement.y===0&&placement.scale===1}>{saving?"Saving…":"Save these changes to Printify"}</button>{message&&<small role="status">{message}</small>}</details>}

function PricingReview({variants,pricing,prices,shippingPercent,approved,onPricing,onPrices,onShippingPercent,onApprove}:{variants:ProductVariant[];pricing:Pricing;prices:Record<string,number>;shippingPercent:number;approved:boolean;onPricing:(value:Pricing)=>void;onPrices:(value:Record<string,number>)=>void;onShippingPercent:(value:number)=>void;onApprove:()=>void}){
  const normalizedPercent=Math.max(0,Math.min(100,shippingPercent));
  const productCosts=variants.map(variant=>variant.cost/100),shippingRates=variants.map(variant=>Number(variant.shipping||0));
  const productCostMin=Math.min(...productCosts),productCostMax=Math.max(...productCosts),shippingMin=Math.min(...shippingRates);
  const referenceShipping=Math.max(0,...shippingRates);
  const shippingProfile=normalizedPercent===100?"printify":normalizedPercent===0?"free":"custom";
  const buyerShipping=(_shipping:number,percent=normalizedPercent)=>referenceShipping*percent/100;
  const moneyRange=(minimum:number,maximum:number)=>minimum===maximum?`$${minimum.toFixed(2)}`:`$${minimum.toFixed(2)}–$${maximum.toFixed(2)}`;
  const recalculate=(nextPricing=pricing,nextPercent=normalizedPercent)=>onPrices(Object.fromEntries(variants.map(variant=>{const shipping=Number(variant.shipping||0);return[String(variant.id),recommendedPrice(variant.cost,{...nextPricing,shippingCost:shipping,shippingCharged:buyerShipping(shipping,nextPercent)})]})));
  function changeProfit(value:number){const next={...pricing,targetProfit:Math.max(0,value)};onPricing(next);recalculate(next);}
  function changeShipping(value:number){const next=Math.max(0,Math.min(100,value||0));onShippingPercent(next);recalculate(pricing,next)}
  function changeBuyerShippingAmount(value:number){changeShipping(referenceShipping?Math.round(Math.max(0,Math.min(referenceShipping,value))*100/referenceShipping*10000)/10000:0)}
  function changeShippingProfile(value:string){
    if(value==="printify")changeShipping(100);
    else if(value==="free")changeShipping(0);
    else changeShipping(normalizedPercent>0&&normalizedPercent<100?normalizedPercent:50);
  }
  return (
    <section className={"variant-pricing "+(approved?"approved":"")}>
      <div className="variant-pricing-head">
        <div><p className="mini-label">PRICING REVIEW</p><h3>See and approve every enabled variant</h3><p>Goldie pulled the exact Printify cost and US shipping for each enabled size and color. Edit any item price before approval.</p></div>
        {approved&&<span>✓ Approved</span>}
      </div>
      <div className="pricing-cost-snapshot">
        <div><span>Printify product cost</span><b>{moneyRange(productCostMin,productCostMax)}</b><small>Varies by enabled size and color</small></div>
        <div><span>Printify shipping</span><b>{moneyRange(shippingMin,referenceShipping)}</b><small>{"$"+referenceShipping.toFixed(2)+" highest rate protects every variant"}</small></div>
        <div><span>Your Etsy fees</span><b>{pricing.etsyFeePercent.toFixed(1)}% + ${(pricing.fixedFee+pricing.listingFee).toFixed(2)}</b><small>${pricing.fixedFee.toFixed(2)} payment + ${pricing.listingFee.toFixed(2)} listing</small></div>
        <div><span>Profit goal</span><b>${pricing.targetProfit.toFixed(2)}</b><small>Minimum target for one item</small></div>
      </div>
      <div className="pricing-controls">
        <label>Profit target<input type="number" min="0" step="0.01" value={pricing.targetProfit} onChange={event=>changeProfit(Number(event.target.value))}/></label>
        <div className="shipping-split">
          <label className="shipping-profile-select">
            <span>Buyer shipping charge used for pricing</span>
            <select aria-label="Buyer shipping charge used for pricing" value={shippingProfile} onChange={event=>changeShippingProfile(event.target.value)}>
              <option value="printify">Buyer pays the Printify rate — {moneyRange(shippingMin,referenceShipping)}</option>
              <option value="free">Free shipping — buyer pays $0.00</option>
              <option value="custom">Choose a different buyer charge</option>
            </select>
          </label>
          <p>{shippingProfile==="printify"?"Printify will automatically assign and update the correct shipping profile when these products publish to Etsy.":shippingProfile==="free"?"Goldie builds the Printify shipping cost into every variant’s item price.":"Choose what the buyer pays. Goldie builds the rest of Printify’s shipping cost into every variant’s item price."}</p>
          {shippingProfile==="custom"&&<div className="custom-profile-controls">
            <div className="shipping-presets">
              <button type="button" className={normalizedPercent===25?"active":""} onClick={()=>changeShipping(25)}><b>Buyer pays 25%</b><small>Buyer pays ${(referenceShipping*.25).toFixed(2)}</small></button>
              <button type="button" className={normalizedPercent===50?"active":""} onClick={()=>changeShipping(50)}><b>Split it 50/50</b><small>Buyer pays ${(referenceShipping*.5).toFixed(2)}</small></button>
              <button type="button" className={normalizedPercent===75?"active":""} onClick={()=>changeShipping(75)}><b>Buyer pays 75%</b><small>Buyer pays ${(referenceShipping*.75).toFixed(2)}</small></button>
            </div>
            <label className="custom-shipping"><span>Exact shipping price buyers should pay</span><span className="money-input">$<input aria-label="Custom buyer shipping price" type="number" min="0" max={referenceShipping.toFixed(2)} step="0.01" value={buyerShipping(referenceShipping).toFixed(2)} onChange={event=>changeBuyerShippingAmount(Number(event.target.value))}/></span></label>
          </div>}
        </div>
        <button onClick={()=>recalculate()}>Reset recommendations</button>
      </div>
      {shippingProfile==="custom"&&<div className="shipping-api-note"><b>This custom amount needs a matching Etsy shipping profile.</b><span>Until Etsy access is connected, choose or create that profile in Etsy after publishing. Goldie’s item prices already account for the exact buyer charge shown here.</span></div>}
      <div className="fee-profile-summary" aria-label="Etsy fees included in every calculation">
        <span>{pricing.etsyFeePercent.toFixed(1)}% Etsy transaction + payment percentage</span><span>${pricing.fixedFee.toFixed(2)} fixed payment fee</span><span>${pricing.listingFee.toFixed(2)} listing / renewal fee</span><a href="/usage" target="_blank" rel="noopener noreferrer">Review or change Etsy fee profile ↗</a>
      </div>
      <div className="variant-table-wrap"><table className="variant-table">
        <thead><tr><th>Enabled variant</th><th>Printify cost</th><th>Printify shipping</th><th>Buyer pays</th><th>Built into price</th><th>Etsy % fee</th><th>Fixed payment fee</th><th>Listing fee</th><th>Total Etsy fees</th><th>Item price</th><th>Projected profit<br/>(1-item order)</th></tr></thead>
        <tbody>{variants.map(variant=>{const shipping=Number(variant.shipping||0),charged=buyerShipping(shipping),included=Math.max(0,shipping-charged),itemCents=prices[String(variant.id)]??recommendedPrice(variant.cost,{...pricing,shippingCost:shipping,shippingCharged:charged}),item=itemCents/100,percentFee=(item+charged)*pricing.etsyFeePercent/100,fixedFee=pricing.fixedFee,listingFee=pricing.listingFee,fees=percentFee+fixedFee+listingFee,profit=item+charged-variant.cost/100-shipping-fees;return <tr key={variant.id}><td><b>{variant.title}</b></td><td>${(variant.cost/100).toFixed(2)}</td><td>${shipping.toFixed(2)}</td><td>${charged.toFixed(2)}</td><td>${included.toFixed(2)}</td><td>${percentFee.toFixed(2)}</td><td>${fixedFee.toFixed(2)}</td><td>${listingFee.toFixed(2)}</td><td><b>${fees.toFixed(2)}</b></td><td><label aria-label={"Price for "+variant.title}>$<input type="number" min={(variant.cost/100).toFixed(2)} step="0.01" value={(itemCents/100).toFixed(2)} onChange={event=>onPrices({...prices,[String(variant.id)]:Math.round(Math.max(variant.cost/100,Number(event.target.value)||0)*100)})}/></label></td><td className={profit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}>${profit.toFixed(2)}</td></tr>})}</tbody>
      </table></div>
      <p className="pricing-footnote">Every recommendation shows a single-item order and includes the complete Etsy fee profile above. Offsite Ads and order-specific sales tax processing are excluded because they cannot be known for every order.</p>
      <button className="approve-pricing" onClick={onApprove}>{approved?"✓ Pricing approved":"Approve all variant prices"}</button>
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

export default function Home() {
  const folderPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const csvPicker = useRef<HTMLInputElement>(null);
  const syncedListingSignatures = useRef<Map<string,string>>(new Map());
  const batchIdRef=useRef("");
  const snapshotReady=useRef(false);
  const resumeAttempted=useRef(false);
  const draftRunActive=useRef(false);
  const templateLoadVersion=useRef(0);
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [template, setTemplate] = useState("");
  const [templateDetails, setTemplateDetails] = useState<TemplateDetails | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [fileError, setFileError] = useState("");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [openedDrafts, setOpenedDrafts] = useState<string[]>([]);
  const [openAllMessage, setOpenAllMessage] = useState("");
  const [owner, setOwner] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState("");
  const [runTotal, setRunTotal] = useState(0);
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [mockupTheme, setMockupTheme] = useState("");
  const [bulkTitles, setBulkTitles] = useState("");
  const [activeDesign, setActiveDesign] = useState<string>("");
  const [activeRecipe,setActiveRecipe]=useState<Recipe|null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [printifyImageIndices,setPrintifyImageIndices]=useState<number[]>([]);
  const [sharedMockups,setSharedMockups]=useState<{theme:string;ids:string[]}|undefined>();
  const [preparingEtsy,setPreparingEtsy]=useState(false);
  const [workflowStep,setWorkflowStep]=useState<WorkflowStep>("connect");
  const [restoringBatch,setRestoringBatch]=useState(true);
  const [resumeProcessing,setResumeProcessing]=useState(false);
  const [finishPhase,setFinishPhase]=useState<FinishPhase>("details");
  const [uploadNoticeOpen,setUploadNoticeOpen]=useState(false);
  const [leaveTarget,setLeaveTarget]=useState("");
  const [publishConfirmOpen,setPublishConfirmOpen]=useState(false);
  const [titleJoiner,setTitleJoiner]=useState(", ");
  const [variantPrices,setVariantPrices]=useState<Record<string,number>>({});
  const [shippingPercent,setShippingPercent]=useState(100);
  const [pricingApproved,setPricingApproved]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [publishMessage,setPublishMessage]=useState("");
  const [titleBuilding,setTitleBuilding]=useState(false);
  const [titleBuildMessage,setTitleBuildMessage]=useState("");
  const [batchKeywords,setBatchKeywords]=useState<string[]>([]);

  const templateLoaded = templateDetails !== null;
  const ready = connected && templateLoaded && files.length > 0;
  const missingRequirement = !connected ? "Connect Printify first" : !templateLoaded ? "Choose or add a saved product" : files.length === 0 ? "Add at least one design" : "";
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const progressIndex = workflowStep==="finish" ? finishPhase==="details"?5:finishPhase==="mockups"?6:7 : workflowStep==="connect"?0:workflowStep==="setup"?1:workflowStep==="designs"?2:(preflightOpen||running)?4:3;
  const pricedVariants=useMemo(()=>templateDetails?.variants||[],[templateDetails]);

  function confirmUploadInterruption(){return !running||window.confirm("Are you sure you want to leave this step? Doing so may halt your current design uploads before the Printify drafts are finished.")}
  function openProgressStep(index:number){if(!confirmUploadInterruption())return;if(index===0)return goToStep("connect");if(index===1)return goToStep("setup");if(index===2)return goToStep("designs");if(index===3)return goToStep("review");if(index===4){goToStep("review");return createDrafts()}if(!complete)return;setFinishPhase(index===5?"details":index===6?"mockups":"final");goToStep("finish",false,true)}

  function canOpenStep(step:WorkflowStep){if(step==="connect")return true;if(step==="setup")return connected;if(step==="designs")return connected&&templateLoaded;if(step==="review")return ready;return complete}
  function goToStep(step:WorkflowStep,replace=false,force=false){if(!force&&!canOpenStep(step))return;setWorkflowStep(step);const url=new URL(window.location.href);url.searchParams.set("step",step);window.history[replace?"replaceState":"pushState"]({},"",url);window.scrollTo({top:0,behavior:"smooth"})}

  useEffect(()=>{const read=()=>{const value=new URL(window.location.href).searchParams.get("step") as WorkflowStep|null;if(value&&WORKFLOW_STEPS.some(step=>step.id===value))setWorkflowStep(value)};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read)},[]);
  useEffect(()=>{if(checkingConnection)return;if(workflowStep==="connect"&&connected)goToStep("setup",true);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[checkingConnection]);
  useEffect(()=>{if(checkingConnection||restoringBatch||canOpenStep(workflowStep))return;const fallback=!connected?"connect":!templateLoaded?"setup":!files.length?"designs":!complete?"review":"finish";goToStep(fallback,true,true);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[checkingConnection,restoringBatch,connected,templateLoaded,files.length,complete,workflowStep]);

  useEffect(()=>{void(async()=>{try{const url=new URL(window.location.href);const id=url.searchParams.get("batch")||"";if(!id)return;const response=await fetch(`/api/batches?id=${encodeURIComponent(id)}`);if(!response.ok)return;const payload=await response.json() as {batch?:{id:string;step:WorkflowStep;status:string;state?:Record<string,unknown>}};if(!payload.batch?.state)return;const state=payload.batch.state as {template?:string;templateDetails?:TemplateDetails;description?:string;pricing?:Pricing;mockupTheme?:string;activeRecipe?:Recipe;designs?:Array<Omit<DesignFile,"file"|"previewUrl">>;drafts?:DraftResult[];complete?:boolean;bulkTitles?:string;printifyImageIndices?:number[];variantPrices?:Record<string,number>;shippingPercent?:number;shippingMode?:"buyer"|"free";pricingApproved?:boolean};const cached=await loadBatchFiles(id).catch(()=>[]);const designs=(state.designs||[]).map((design,index)=>{const file=cached[index];return file?{...design,file,previewUrl:URL.createObjectURL(file)}:null}).filter(Boolean) as DesignFile[];batchIdRef.current=id;setTemplate(state.template||"");setTemplateDetails(state.templateDetails||null);setDescription(state.description||"");if(state.pricing)setPricing(state.pricing);setVariantPrices(state.variantPrices||{});setShippingPercent(state.shippingPercent??(state.shippingMode==="free"?0:100));setPricingApproved(Boolean(state.pricingApproved));setMockupTheme(state.mockupTheme||"");setActiveRecipe(state.activeRecipe||null);setFiles(designs);setDrafts(state.drafts||[]);setComplete(Boolean(state.complete));setBulkTitles(state.bulkTitles||"");setPrintifyImageIndices(state.printifyImageIndices||[]);setResumeProcessing(payload.batch.status==="processing"&&designs.length>0);const step=state.complete?"finish":payload.batch.step;setWorkflowStep(step);url.searchParams.set("step",step);window.history.replaceState({},"",url);if(payload.batch.status==="processing"&&state.template)void loadTemplateUrl(state.template)}finally{snapshotReady.current=true;setRestoringBatch(false)}})()},[]);

  useEffect(()=>{if(!resumeProcessing||resumeAttempted.current||!connected||!templateLoaded||!files.length)return;resumeAttempted.current=true;setResumeProcessing(false);const succeeded=new Set(drafts.filter(draft=>draft.status==="Created").map(draft=>draft.clientId));const remaining=files.filter(file=>!succeeded.has(file.id));if(remaining.length)void runDrafts(remaining,true)},[resumeProcessing,connected,templateLoaded,files,drafts]);

  useEffect(()=>{if(!snapshotReady.current||restoringBatch||(!files.length&&!drafts.length))return;const timer=window.setTimeout(()=>{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);const designs=files.map(({file:ignoredFile,previewUrl:ignoredPreview,...design})=>design);void fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:running?"processing":complete?drafts.some(draft=>draft.status==="Failed")?"needs_attention":"complete":"draft",step:workflowStep,setupName:activeRecipe?.name||"",productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{template,templateDetails,description,pricing,variantPrices,shippingPercent,pricingApproved,mockupTheme,activeRecipe,designs,drafts,complete,bulkTitles,printifyImageIndices}})})},700);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[restoringBatch,workflowStep,template,templateDetails,description,pricing,variantPrices,shippingPercent,pricingApproved,mockupTheme,activeRecipe,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}:${JSON.stringify(file.etsy||{})}`).join(";"),drafts,complete,running,bulkTitles,printifyImageIndices]);

  useEffect(() => {
    fetch("/api/printify")
      .then((response) => response.json())
      .then((result: { connected?: boolean; owner?: boolean; reason?: string; warning?: string }) => { setConnected(Boolean(result.connected)); setOwner(Boolean(result.owner)); if (result.reason || result.warning) setConnectionError(result.reason || result.warning || ""); })
      .catch(() => setConnected(false))
      .finally(() => setCheckingConnection(false));
  }, []);

  useEffect(() => {
    if (!running) return;
    const protectBatch = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectBatch);
    return () => window.removeEventListener("beforeunload", protectBatch);
  }, [running]);

  useEffect(()=>{if(!complete)return;const pending=files.filter(file=>!file.etsy&&file.title.trim());if(!pending.length)return;const timer=window.setTimeout(()=>{setPreparingEtsy(true);void runBounded(pending,2,async file=>{await prepareOne(file);return file},()=>undefined).finally(()=>setPreparingEtsy(false))},900);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[complete,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);
  useEffect(()=>{if(!complete)return;const pending=files.filter(file=>{const draft=drafts.find(item=>item.clientId===file.id);const signature=`${file.title}\n${file.tags.join("|")}`;return Boolean(draft?.id&&file.title.trim()&&syncedListingSignatures.current.get(file.id)!==signature)});if(!pending.length)return;setDrafts(current=>current.map(draft=>{const file=files.find(item=>item.id===draft.clientId);return file?{...draft,title:file.title,tags:file.tags}:draft}));const timer=window.setTimeout(()=>{void Promise.all(pending.map(async file=>{try{await syncListingFields(file);syncedListingSignatures.current.set(file.id,`${file.title}\n${file.tags.join("|")}`)}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"Printify could not save this listing."})}}))},600);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[complete,drafts.map(draft=>draft.id||draft.clientId).join(";"),files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);

  useEffect(()=>{if(!complete||preparingEtsy)return;const prepared=files.filter(file=>file.etsy);if(!prepared.length)return;const timer=window.setTimeout(()=>{void runBounded(prepared,2,async file=>{try{await syncPreparedListing(file,file.etsy!);updateDesign(file.id,{etsyError:""})}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"The listing changes could not be saved."})}return file},()=>undefined)},1200);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[complete,preparingEtsy,files.map(file=>file.etsy?`${file.id}:${file.title}:${file.tags.join("|")}:${JSON.stringify(file.etsy)}`:"").join(";")]);

  function chooseFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list)
      .filter((file) => /\.(png|jpe?g)$/i.test(file.name))
      .map((file) => ({ name: file.name, size: file.size, id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), title:"", tags:[],paddingStatus:"checking" as const }));
    if (images.length === 0) {
      setFileError("No supported designs were found. Choose PNG or JPG images.");
      setFiles([]);
      return;
    }
    if (images.length > MAX_BATCH_FILES) {
      setFileError(`This batch has ${images.length} designs. Choose no more than ${MAX_BATCH_FILES} designs at a time.`);
      return;
    }
    const oversized = images.find((image) => image.size > MAX_FILE_BYTES);
    if (oversized) {
      setFileError(oversizedFileMessage(oversized.name,oversized.size));
      setFiles([]);
      return;
    }
    setFileError("");
    setFiles(images);
    const durableBatchId=batchIdRef.current||crypto.randomUUID();batchIdRef.current=durableBatchId;window.localStorage.setItem("goldie-active-batch",durableBatchId);const batchUrl=new URL(window.location.href);batchUrl.searchParams.set("batch",durableBatchId);window.history.replaceState({},"",batchUrl);void saveBatchFiles(durableBatchId,images.map(image=>image.file)).catch(()=>undefined);
    setComplete(false);
    setDrafts([]);
    setProcessed(0);
    images.forEach((design) => { const probe = document.createElement("img"); probe.onload = () => { setFiles((current) => current.map((item) => item.id === design.id ? { ...item, width: probe.naturalWidth, height: probe.naturalHeight } : item)); URL.revokeObjectURL(probe.src); }; probe.src = URL.createObjectURL(design.file); });
    void analyzePadding(images);
  }

  async function analyzePadding(images:DesignFile[]) { for(const design of images){ if(!/\.png$/i.test(design.name)){updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:false,paddingStatus:"full"});continue} try{const bitmap=await createImageBitmap(design.file,{resizeWidth:512,resizeHeight:512,resizeQuality:"low"});const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext("2d",{willReadFrequently:true})!;context.drawImage(bitmap,0,0);bitmap.close();const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1,hasTransparency=false;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const alpha=pixels[(y*canvas.width+x)*4+3];if(alpha<250)hasTransparency=true;if(alpha>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}const bounds=right<0?{left:0,top:0,right:1,bottom:1}:{left:left/canvas.width,top:top/canvas.height,right:(right+1)/canvas.width,bottom:(bottom+1)/canvas.height};const trimmed=bounds.left>.015||bounds.top>.015||bounds.right<.985||bounds.bottom<.985;updateDesign(design.id,{visibleBounds:bounds,hasTransparency,paddingStatus:trimmed?"trimmed":"full"})}catch{updateDesign(design.id,{visibleBounds:{left:0,top:0,right:1,bottom:1},hasTransparency:true,paddingStatus:"full"})} } }

  function updateDesign(id: string, change: Partial<DesignFile>) { setFiles((current) => current.map((file) => file.id === id ? { ...file, ...change } : file)); if(change.title!==undefined)setDrafts(current=>current.map(draft=>draft.clientId===id?{...draft,title:change.title}:draft)); }
  function applyBulkTitles() { const titles = bulkTitles.split(/\r?\n/).map((v) => v.replace(/^"|"$/g, "").trim()).filter(Boolean); setFiles((current) => current.map((file, index) => titles[index] ? { ...file, title: titles[index], tags: tagsFromTitle(titles[index]),etsy:undefined,etsyError:"" } : file)); }
  async function importTitleCsv(list: FileList | null) { const file = list?.[0]; if (!file) return; const values = titlesFromCsv(await file.text()); setBulkTitles(values.join("\n")); setFiles((current) => current.map((design, index) => values[index] ? { ...design, title: values[index].slice(0, 140), tags: tagsFromTitle(values[index]),etsy:undefined,etsyError:"" } : design)); if (csvPicker.current) csvPicker.current.value = ""; }
  function clearCurrentBatch(clearProduct=true){
    const priorBatch=batchIdRef.current;
    if(priorBatch){void clearBatchFiles(priorBatch);void fetch(`/api/batches?id=${encodeURIComponent(priorBatch)}`,{method:"DELETE"})}
    batchIdRef.current="";window.localStorage.removeItem("goldie-active-batch");
    const freshUrl=new URL(window.location.href);freshUrl.searchParams.delete("batch");window.history.replaceState({},"",freshUrl);
    files.forEach(file=>URL.revokeObjectURL(file.previewUrl));
    templateLoadVersion.current+=1;setLoadingTemplate(false);setFiles([]);setFileError("");setDrafts([]);setProcessed(0);setRunTotal(0);setComplete(false);setOpenedDrafts([]);setOpenAllMessage("");setBulkTitles("");setBatchKeywords([]);setActiveDesign("");setPreflightOpen(false);setUploadNoticeOpen(false);setPrintifyImageIndices([]);setSharedMockups(undefined);setFinishPhase("details");setVariantPrices({});setShippingPercent(100);setPricingApproved(false);syncedListingSignatures.current.clear();
    if(clearProduct){setTemplate("");setTemplateDetails(null);setTemplateError("");setDescription("");setMockupTheme("");setActiveRecipe(null);setPricing(current=>({...current,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0}))}
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
    if (csvPicker.current) csvPicker.current.value = "";
  }
  function useRecipe(recipe: Recipe) { const changingProduct=Boolean((activeRecipe?.id&&activeRecipe.id!==recipe.id)||(template&&template!==recipe.templateUrl));if(changingProduct&&(files.length>0||drafts.length>0||complete)){const count=files.length;if(!window.confirm(`Switch to “${recipe.name}” and start a new batch? This removes ${count} ${count===1?"design":"designs"} and all work from the current batch on this page.`))return false;clearCurrentBatch(false)}setActiveRecipe(recipe);setPrintifyImageIndices(recipe.printifyImageIndices||[]);setTemplate(recipe.templateUrl);setMockupTheme(recipe.defaultMockupTheme || "");const nextPricing={...pricing,targetProfit:Number(recipe.pricing?.targetProfit??DEFAULT_PRICING.targetProfit)};setPricing(nextPricing);setTemplateDetails(null);void loadTemplateUrl(recipe.templateUrl,nextPricing);return true; }
  function startNewProduct(){
    if((files.length>0||drafts.length>0||complete)&&!window.confirm("Add a new product and clear the current product setup? Any designs and unfinished work in this batch will be removed."))return false;
    clearCurrentBatch(true);
    return true;
  }
  async function saveImagePreferences(indices:number[]){if(!activeRecipe)return;setPrintifyImageIndices(indices);await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...activeRecipe,printifyImageIndices:indices})});setActiveRecipe({...activeRecipe,printifyImageIndices:indices})}
  function applyBatchTitle(title:string,explicitTags?:string[]){const next=title.slice(0,140);setFiles(current=>current.map(file=>({...file,title:next,tags:explicitTags||tagsFromTitle(next),etsy:undefined,etsyError:""})))}
  function addBatchKeyword(keyword:string){const current=files.length&&files.every(file=>file.title===files[0].title)?files[0].title:"",base=batchKeywords.length?batchKeywords:current.split(/[,|]/).map(value=>value.trim()).filter(Boolean);if(base.some(value=>value.toLocaleLowerCase()===keyword.trim().toLocaleLowerCase()))return;const next=[...base,keyword.trim()];setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function changeTitleJoiner(joiner:string){setTitleJoiner(joiner);if(batchKeywords.length)applyBatchTitle(batchKeywords.join(joiner),tagsFromTitle(batchKeywords.join(", ")))}
  async function buildBatchTitle(){const current=files.length&&files.every(file=>file.title===files[0].title)?files[0].title:"",keywords=batchKeywords.length?batchKeywords:current.split(/[,|]/).map(value=>value.trim()).filter(Boolean);if(!keywords.length){setTitleBuildMessage("Choose keyword phrases first.");return}setTitleBuilding(true);setTitleBuildMessage("");try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"title",image:await safeImagePreviewDataUrl(files[0].file,1200,false),product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model},keywords,useCommas:titleJoiner===", "})}),payload=await response.json() as {title?:string;keywords?:string[];error?:string};if(!response.ok||!payload.title)throw new Error(payload.error||"Goldie could not build this title.");setBatchKeywords(payload.keywords||keywords);applyBatchTitle(payload.title,tagsFromTitle(keywords.join(", ")));setTitleBuildMessage("Title applied to every listing. Matching tags were rebuilt from your validated phrases.")}catch(error){setTitleBuildMessage(error instanceof Error?error.message:"Goldie could not build this title.")}finally{setTitleBuilding(false)}}

  function missingPublishFields(){const missing:string[]=[];if(files.some(file=>!file.title.trim()))missing.push("Titles");if(files.some(file=>!file.tags.length))missing.push("Tags");if(!description.trim())missing.push("Permanent product description");if(files.some(file=>!file.etsy))missing.push("Etsy details");return missing}
  async function publishAll(){const ids=drafts.filter(draft=>draft.status==="Created"&&draft.id).map(draft=>draft.id!);if(!ids.length)return;setPublishConfirmOpen(false);setPublishing(true);setPublishMessage("");try{const response=await fetch("/api/printify/drafts/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productIds:ids})}),payload=await response.json() as {published?:string[];error?:string};if(!response.ok)throw new Error(payload.error||"The batch could not be published.");setPublishMessage(`${payload.published?.length||ids.length} listings were published to Etsy through Printify.`)}catch(error){setPublishMessage(error instanceof Error?error.message:"The batch could not be published.")}finally{setPublishing(false)}}

  async function connectPrintify() {
    setConnecting(true); setConnectionError("");
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }, 60000);
      const result = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !result.connected) throw new Error(result.error || "Printify could not be connected.");
      setConnected(true); setToken(""); window.setTimeout(()=>goToStep("setup"),250);
    } catch (error) { setConnected(false); setConnectionError(error instanceof Error ? error.message : "Printify could not be connected."); }
    finally { setConnecting(false); }
  }

  async function loadTemplateUrl(productUrl = template, pricingOverride?:Pricing) {
    const requestVersion=++templateLoadVersion.current;
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string };
      if(requestVersion!==templateLoadVersion.current)return false;
      if (!response.ok || !result.product) throw new Error(result.error || "The template could not be loaded.");
      setTemplateDetails(result.product);setDescription(result.product.description||"");if(result.product.standardShipping!=null)setPricing(current=>({...current,shippingCost:result.product!.standardShipping!,shippingCharged:result.product!.standardShipping!}));setVariantPrices(Object.fromEntries((result.product.variants||[]).map(variant=>[String(variant.id),recommendedPrice(variant.cost,{...(pricingOverride||pricing),shippingCost:Number(variant.shipping||0),shippingCharged:Number(variant.shipping||0)})])));setShippingPercent(100);setPricingApproved(false); return true;
    } catch (error) { if(requestVersion===templateLoadVersion.current)setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return false; }
    finally { if(requestVersion===templateLoadVersion.current)setLoadingTemplate(false); }
  }

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
            const fullDescription=[design.etsy?.blurb,description].filter(Boolean).join("\n\n");
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: design.title || undefined, tags: design.tags, pricing, shippingPercent, variantPrices, description:fullDescription, maxPlacementScale:isRigidPaperProduct(templateDetails)?1:undefined, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
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
        return { clientId: design.id, name: design.name, status: "Failed", error: friendlyUploadError(new Error(`${rawMessage}${/Support reference:/i.test(rawMessage) ? "" : ` Support reference: ${supportReference}.`}`)) };
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
        setDrafts((current) => [...current, result]);
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

  async function syncListingFields(design:DesignFile,details?:EtsyDetails){const draft=drafts.find(item=>item.clientId===design.id);if(!draft?.id)throw new Error("The matching Printify draft could not be found.");const response=await fetch("/api/printify/drafts/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:draft.id,title:design.title,tags:design.tags,description:[details?.blurb,description].filter(Boolean).join("\n\n"),etsyDetails:details})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Printify could not save the completed listing.")}
  async function syncPreparedListing(design:DesignFile,details:EtsyDetails){await syncListingFields(design,details)}
  async function prepareOne(design:DesignFile){try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model,description},title:design.title,tags:design.tags})}),payload=await response.json() as {details?:EtsyDetails;error?:string};if(!response.ok||!payload.details)throw new Error(payload.error||"Etsy details could not be prepared.");await syncListingFields(design,payload.details);updateDesign(design.id,{etsy:payload.details,etsyError:""});return payload.details}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be prepared."});return null}}
  function createDrafts() {if(!pricingApproved)return;setPreflightOpen(true);}
  function confirmDrafts() { setPreflightOpen(false); void runDrafts(files); }

  function retryFailed() {
    const failedIds = new Set(drafts.filter((draft) => draft.status === "Failed").map((draft) => draft.clientId));
    void runDrafts(files.filter((file) => failedIds.has(file.id)), true);
  }

  function startOver() {
    if((files.length||drafts.length||template)&&!window.confirm("Clear this batch and start over? This removes the selected product, uploaded designs, titles, pricing work, and draft results from Goldie. It does not delete products already created in Printify."))return;
    clearCurrentBatch(true);
    goToStep(connected?"setup":"connect",true,true);
  }

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
    connect: { eyebrow: "STEP 1 · PRINTIFY", title: "Connect Printify.", copy: "Goldie creates unpublished drafts in your own Printify shop. Connect once, then move on." },
    setup: { eyebrow: "STEP 2 · PRODUCT", title: "Choose what you’re making.", copy: "Choose a saved product or add one by connecting its completed Printify template. The template is required; Goldie imports its variants, shipping, costs, placement, and description." },
    designs: { eyebrow: "STEP 3 · DESIGNS", title: "Add this batch’s designs.", copy: "Upload up to 20 finished designs. Goldie keeps this batch saved while you move through the remaining steps." },
    review: { eyebrow: "STEP 4 · PREFLIGHT", title: "Review before creating drafts.", copy: "Confirm the product, design count, pricing target, keyword bank, and mockup defaults in one place." },
    finish: finishPhase==="details" ? { eyebrow: "STEP 6 · LISTING DETAILS", title: "Build the listing details.", copy: "Choose keywords, complete each title, review the automatic Etsy details, and let Goldie generate matching tags." } : finishPhase==="mockups" ? { eyebrow: "STEP 7 · IMAGES + MOCKUPS", title: "Choose the listing images.", copy: "Review the real Printify previews, choose flatlays, and add your own mockups." } : { eyebrow: "STEP 8 · FINAL REVIEW", title: "Review the finished batch.", copy: "Confirm the words, pricing, images, and mockups before you publish the listings from Printify." },
  }[workflowStep];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Image src="/goldie-wordmark.webp" width={236} height={120} alt="Goldie" className="wordmark" priority />
          <span className="brand-divider" />
          <div>
            <p className="product-name">Listing + Mockup Factory</p>
          </div>
        </div>
        <div className="top-actions">
          <nav className="top-nav"><a className="active" href="/" onClick={event=>guardNavigation(event,"/")}>Listing Factory</a><a href="/batches" onClick={event=>guardNavigation(event,"/batches")}>Batch History</a><a href="/keywords" target="_blank" rel="noopener noreferrer">Keyword Banks ↗</a><a href="/mockups" target="_blank" rel="noopener noreferrer">Mockup Sets ↗</a></nav>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <a className="usage-link" href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + plan</a>
          <span className="secure-pill"><i /> Secure workspace</span>
        </div>
      </header>

      {running&&uploadNoticeOpen&&<div className="upload-notice-backdrop" role="presentation"><section className="upload-notice" role="alertdialog" aria-modal="true" aria-labelledby="upload-notice-title" aria-describedby="upload-notice-copy"><span className="upload-notice-icon">!</span><p className="mini-label">UPLOADS IN PROGRESS</p><h2 id="upload-notice-title">Wait—your files are still uploading.</h2><p id="upload-notice-copy">Are you sure you want to leave? Leaving now may stop the unfinished uploads.</p><div className="upload-notice-progress"><span className="upload-guard-pulse"/><b>{processed} of {runTotal} finished</b></div><div className="upload-notice-actions"><button autoFocus onClick={()=>{setUploadNoticeOpen(false);setLeaveTarget("")}}>Stay on this page</button><button className="danger" onClick={()=>{if(leaveTarget)window.location.href=leaveTarget}}>Leave and stop uploads</button></div></section></div>}

      <section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{workflowHero.eyebrow}</p>
          <h1>{workflowHero.title}</h1>
          <p className="hero-copy">{workflowHero.copy}</p>
        </div>
        <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="hero-watermark" />
      </section>

      <section className={`workspace ${complete&&workflowStep==="finish"&&finishPhase==="mockups"?"mockup-workspace":""}`}>
        <nav className="workflow-progress" aria-label="Listing Factory progress">
          <div className="workflow-progress-head"><div><p className="mini-label">YOUR BATCH</p><b>Step {progressIndex+1} of {PROGRESS_STEPS.length}</b></div>{(template||files.length>0||drafts.length>0)&&<button className="start-new-batch" disabled={running} onClick={startOver}>Clear batch + start over</button>}</div>
          {PROGRESS_STEPS.map((label,index)=>{const active=progressIndex===index,done=index<progressIndex,available=index===0||(index===1&&connected)||(index===2&&templateLoaded)||(index>=3&&index<=4&&ready)||(index>=5&&complete);return <button key={label} className={`${active?"active":""} ${done?"done":""}`} disabled={!available} aria-current={active?"step":undefined} onClick={()=>openProgressStep(index)}><span>{done?"✓":String(index+1).padStart(2,"0")}</span><span><b>{label}</b><small>{active?"You are here":done?"Complete":available?"Ready":"Complete the prior step"}</small></span></button>})}
          <p className="workflow-help">Goldie saves completed work. You can return to an earlier step without starting over.</p>
        </nav>
        <div className="workflow-stage">
        <div className="steps-column">
          <article className={`step-card workflow-panel ${connected ? "done" : ""} ${workflowStep==="connect"?"active-panel":"hidden-panel"}`}>
            <div className="step-number">01</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">PRINTIFY CONNECTION</p><h2>Your Printify account</h2></div>{connected && <span className="done-mark">✓ Connected</span>}</div>
              <p className="step-copy">Create drafts directly inside your own Printify shop. Connect once and Goldie will remember your Printify account securely.</p>
              {checkingConnection ? (
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Checking Printify connection…</b><small>This takes just a moment</small></div></div>
              ) : !connected ? (
                <div className="connection-setup">
                  <details className="token-help">
                    <summary>How to get your Printify token <span>Step-by-step instructions</span></summary>
                    <div className="token-shop-warning"><b>Before you generate anything</b><span>Sign in to the Printify account that contains the shop and template products you want Goldie to use. The token connects the account; the Printify template you choose in Step 2 identifies the exact shop.</span></div>
                    <ol>
                      <li>In Printify, open <b>My Profile</b>, then choose <b>Connections</b>.</li>
                      <li>If Printify asks for a developer contact email, enter one you check.</li>
                      <li>Under Personal Access Tokens, select <b>Generate</b>.</li>
                      <li>Name it <b>Goldie</b>, enable the product and upload access Goldie requests, then generate the token.</li>
                      <li>Copy the token immediately—it is only shown once—and paste it below.</li>
                    </ol>
                    <a href="https://help.printify.com/hc/en-us/articles/4483626447249-How-can-I-generate-an-API-token" target="_blank" rel="noreferrer">Open Printify’s official token instructions ↗</a>
                  </details>
                  <div className="inline-field"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your Printify token" aria-label="Printify token" /><button onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect Printify"}</button></div>
                  <small>Your token is encrypted before it is saved and is never displayed again.</small>
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                </div>
              ) : (
                <><div className="connection-row"><span className="connection-icon">P</span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>{connectionError && <p className="field-warning" role="status">{connectionError}</p>}</>
              )}
              {connected&&<button className="workflow-next" onClick={()=>goToStep("setup")}>Choose a product <span>→</span></button>}
            </div>
          </article>

          <div className={`workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}><SavedWorkflow connected={connected} templateUrl={template} mockupTheme={mockupTheme} pricing={pricing} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} onTemplateUrl={(value) => { templateLoadVersion.current+=1;setLoadingTemplate(false);setTemplate(value);setTemplateDetails(null);setTemplateError(""); }} onUseRecipe={useRecipe} onStartNewProduct={startNewProduct} onVerifyTemplate={loadTemplateUrl} onPricing={setPricing} onMockupTheme={setMockupTheme} />
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          {templateDetails && <><div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {templateDetails.enabledVariants} enabled variants</span><span>{description?"Description imported":"No description found"} · {templateDetails.standardShipping!=null?`${templateDetails.shippingCurrency} ${templateDetails.standardShipping.toFixed(2)} standard shipping imported`:"Shipping checked during pricing"}</span></div><span className="template-badge">Product facts imported</span></div><button className="workflow-next" onClick={()=>goToStep("designs")}>Add finished designs <span>→</span></button></>}</div>

          <article className={`step-card workflow-panel ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${workflowStep==="designs"||(workflowStep==="finish"&&finishPhase==="details")?"active-panel":"hidden-panel"}`}>
            <div className="step-number">{workflowStep==="finish"?"06":"03"}</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">{workflowStep==="finish"?"FINISH LISTINGS":"DESIGNS"}</p><h2>{workflowStep==="finish"?"Complete the listing details":"Add your finished designs"}</h2></div>{files.length > 0 && <span className="done-mark">✓ {files.length} {workflowStep==="finish"?"drafts ready":"loaded"}</span>}</div>
              <p className="step-copy">{workflowStep==="finish"?"Work from top to bottom. Finish the words first, confirm Goldie’s Etsy details, then choose the images and mockups for each listing.":"Build one focused batch of up to 20 finished designs. Upload a folder or select individual images."}</p>
              {workflowStep==="finish"&&<div className="finish-guide"><span><b>1</b> Choose keywords</span><span><b>2</b> Build titles + tags</span><span><b>3</b> Review Etsy details</span></div>}
              <p className="batch-limits" aria-label="Batch limits"><span>20 designs maximum</span><i /> <span>100 MB per design · no combined file-size cap</span><i /> <span>Large batches process one design at a time without lowering DPI</span></p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. Use a transparent-background PNG whenever the background should not print.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? `${files.length} of 20 designs ready` : "Choose a folder"}</b><small>{files.length ? `${(totalSize / 1024 / 1024).toFixed(1)} MB selected${totalSize>LARGE_BATCH_THRESHOLD?" · will process one at a time":""} · Choose again to replace` : "Your folder can contain up to 20 designs"}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Choose individual images</b><small>Select one image or several at once</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
              {fileError && <p className="file-limit-error" role="alert"><b>That batch can’t be added.</b><span>{fileError}</span></p>}
              {files.length > 0 && <div className="batch-capacity"><div><b>{files.length}/20 designs</b><span>{20 - files.length} spaces remaining</span></div><div className="capacity-track"><span style={{ width: `${(files.length / 20) * 100}%` }} /></div></div>}
              {files.length>0&&!complete&&workflowStep==="designs"&&<button className="workflow-next" onClick={()=>goToStep("review")}>Review this batch <span>→</span></button>}
              {files.length > 0 && complete && <div className="listing-editor">
                <div className="editor-heading"><div><b>1. Build titles for the whole batch—or customize exceptions</b><span>Start with one shared title for speed. Every keyword click updates all listings and regenerates their matching Etsy tags. Open an individual listing only when it needs different wording.</span></div><span>{files.length} listings</span></div>
                <section className="batch-title-builder"><div><p className="mini-label">KEYWORD + AI TITLE BUILDER</p><h3>Create a single title for this batch</h3><p>Choose only phrases backed by your keyword research. Arrange them yourself or let Goldie turn those exact phrases into a readable title—without inventing keywords.</p></div><div className="title-style-toggle"><span>Title style</span><button className={titleJoiner===", "?"active":""} onClick={()=>changeTitleJoiner(", ")}>Title with commas</button><button className={titleJoiner===" "?"active":""} onClick={()=>changeTitleJoiner(" ")}>Title without commas</button></div><label>Shared batch title <span>{(files.length&&files.every(file=>file.title===files[0].title)?files[0].title:"").length}/140</span><input value={files.length&&files.every(file=>file.title===files[0].title)?files[0].title:""} maxLength={140} onChange={event=>{setBatchKeywords([]);applyBatchTitle(event.target.value)}} placeholder="Choose keywords below or type the shared title"/></label><KeywordBank onAdd={addBatchKeyword}/><button className="ai-title-button" disabled={titleBuilding||!files.some(file=>file.title.trim())} onClick={()=>void buildBatchTitle()}>{titleBuilding?"Goldie is building the title…":"Let Goldie arrange these keywords"}</button>{titleBuildMessage&&<p className="title-build-message" role="status">{titleBuildMessage}</p>}</section>
                <details className="permanent-description"><summary>Permanent product description</summary><p>Goldie adds a design-specific keyword introduction above this reusable product information.</p><textarea rows={7} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Sizing, materials, production, care, and shipping information"/></details>
                <div className="design-table">{files.map((design) => { const displayScale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale;const quality = design.width && templateDetails?.maxPrintWidth && displayScale ? printifyDpi(design.width, templateDetails.maxPrintWidth, displayScale) : null; const qualityReady = Boolean(quality && quality.dpi >= 300); return <article className={`design-line ${activeDesign === design.id ? "active" : ""}`} key={design.id} onClick={() => setActiveDesign(design.id)}><img src={design.previewUrl} alt=""/><div className="design-fields"><label>Title <span>{design.title.length}/140</span><input value={design.title} maxLength={140} onChange={(e) => { const title = e.target.value; updateDesign(design.id, { title, tags: tagsFromTitle(title),etsy:undefined }); }}/></label><label>Tags <span>{design.tags.length}/13</span><input value={design.tags.join(", ")} onChange={(e) => updateDesign(design.id, { tags: [...new Set(e.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag.length <= 20))].slice(0, 13),etsy:undefined })} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map((tag) => <span key={tag}>{tag}</span>)}{!design.tags.length && <small>Add comma-separated title phrases to generate matching Etsy tags.</small>}</div><details className="individual-title-builder" onClick={event=>event.stopPropagation()}><summary>Create an individual title for this listing</summary><KeywordBank compact title="Choose a different keyword bank" copy="These keyword clicks update only this listing." onAdd={keyword=>{setActiveDesign(design.id);const title=design.title?`${design.title}, ${keyword}`:keyword;updateDesign(design.id,{title:title.slice(0,140),tags:tagsFromTitle(title),etsy:undefined,etsyError:""})}}/></details>{design.etsy&&<details className="etsy-auto"><summary>✓ Etsy details completed · {design.etsy.category}</summary><label>Design-specific introduction<textarea value={design.etsy.blurb} rows={3} onChange={e=>updateDesign(design.id,{etsy:{...design.etsy!,blurb:e.target.value}})}/></label><div className="etsy-attribute-grid">{Object.entries({...design.etsy.attributes,...design.etsy.optional}).map(([key,value])=><label key={key}>{key}<input value={value} onChange={e=>updateDesign(design.id,{etsy:{...design.etsy!,attributes:{...design.etsy!.attributes,[key]:e.target.value}}})}/></label>)}</div><small>Optional fields Goldie could not justify were left blank.</small></details>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}{design.paddingStatus==="trimmed"&&<small className="padding-note">Transparent padding detected · placement scale preserved for print quality</small>}</div><div className={`quality-pill ${qualityReady ? "pass" : "check"}`}><b>{!quality ? "Calculating Printify DPI…" : qualityReady ? `✓ ${quality.dpi} DPI in Printify` : `${quality.dpi} DPI in Printify`}</b><small>{quality ? `${quality.level} resolution · 300 DPI recommended` : design.width ? `${design.width} × ${design.height}px` : "Reading dimensions…"}</small></div></article>; })}</div>
                <button className="workflow-next" onClick={()=>setFinishPhase("mockups")}>Choose images and mockups <span>→</span></button>
              </div>}
            </div>
          </article>
          {workflowStep==="finish"&&finishPhase==="final"&&<article className="step-card final-review active-panel"><div className="step-number">08</div><div className="step-content"><div className="step-heading"><div><p className="mini-label">FINAL REVIEW</p><h2>Your batch is ready for its final check</h2></div><span className="done-mark">✓ {drafts.filter(draft=>draft.status==="Created").length} drafts</span></div><p className="step-copy">Confirm the checklist below. Nothing is published until you use the final button.</p><div className="final-checklist"><span>✓ Every enabled variant price was reviewed and approved</span>{shippingPercent<100&&<span>! Partial shipping must be confirmed in Etsy after Printify publishes</span>}<span>{files.every(file=>file.title.trim())?"✓":"!"} Titles are complete</span><span>{files.every(file=>file.tags.length)?"✓":"!"} Matching Etsy tags are complete</span><span>{description.trim()?"✓":"!"} Permanent product description {description.trim()?"is attached":"is blank"}</span><span>{files.every(file=>file.etsy)?"✓":"!"} Product-specific Etsy details {files.every(file=>file.etsy)?"are complete":"still need review"}</span><span>✓ Printify placement and Goldie mockups were reviewed</span></div><div className="final-review-actions"><button onClick={()=>setFinishPhase("details")}>Review listing details</button><button onClick={()=>setFinishPhase("mockups")}>Review images + mockups</button></div><div className="publish-live-warning"><b>These listings will be published live on Etsy.</b><span>Printify does not send them to Etsy drafts. Goldie will show you exactly which fields are blank before anything is published.</span></div><button className="publish-all-button" disabled={publishing||drafts.some(draft=>draft.status==="Failed")} onClick={()=>setPublishConfirmOpen(true)}>{publishing?"Publishing…":"Publish all live on Etsy"}</button>{publishMessage&&<p className="publish-message" role="status">{publishMessage}</p>}</div></article>}
        </div>

        <aside className={`launch-panel workflow-panel ${workflowStep==="review"?"active-panel":"hidden-panel"}`}>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `${processed} of ${runTotal} complete` : complete ? "Batch finished" : "Current batch"}</h2>
            <p>{complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : running ? "Goldie is uploading each design and creating its Printify draft." : "Complete the three sections to create unpublished drafts in Printify."}</p>
          </div>

          {pricedVariants.length>0&&<PricingReview variants={pricedVariants} pricing={pricing} prices={variantPrices} shippingPercent={shippingPercent} approved={pricingApproved} onPricing={value=>{setPricing(value);setPricingApproved(false)}} onPrices={value=>{setVariantPrices(value);setPricingApproved(false)}} onShippingPercent={value=>{setShippingPercent(value);setPricingApproved(false)}} onApprove={()=>setPricingApproved(true)}/>}

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Saved product</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button onClick={()=>goToStep("setup")}>Edit</button></div>
            <div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            <div><span>Profit target</span><b>${pricing.targetProfit.toFixed(2)} per item</b></div>
            <div><span>Standard shipping</span><b>{templateDetails?.standardShipping!=null?`${templateDetails.shippingCurrency} ${templateDetails.standardShipping.toFixed(2)}`:"Calculated from Printify"}</b></div>
            <div><span>Keyword bank</span><b>{activeRecipe?.keywordListId?"Saved with product":"Choose after drafts"}</b></div>
            <div><span>Mockup set</span><b>{mockupTheme||"Choose after drafts"}</b></div>
            <div><span>Publishing</span><b>Draft only</b></div>
          </div>

          {running && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="progress-ring" aria-hidden="true"><span>{processed}/{runTotal}</span></div>
              <div className="progress-copy"><b>Creating your Printify drafts</b><span>{preparationMessage || "Keep this page open while Goldie finishes the batch."}</span></div>
              <div className="progress-track"><span style={{ width: `${runTotal ? (processed / runTotal) * 100 : 0}%` }} /></div>
            </div>
          )}

          {!complete ? (
            <button className="launch-button" disabled={!ready || !pricingApproved || running||preparingEtsy} onClick={createDrafts}>
              <span className="button-glint" />{preparingEtsy?"Completing Etsy details…":running ? `${processed} of ${runTotal} complete…` : ready&&!pricingApproved?"Approve pricing to continue":ready ? "Continue to create drafts" : missingRequirement}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status === "Failed") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status === "Failed").length} failed designs</button>}
            </div>
          )}
          <p className="launch-note">Listings remain unpublished until you publish them in Printify.</p>
          {(template || description || files.length > 0 || drafts.length > 0) && <button className="start-over-button" disabled={running} onClick={startOver}>Clear batch + start over</button>}

        </aside>
        </div>
      </section>

      {complete && workflowStep==="finish" && finishPhase==="mockups" && <section className="post-draft-workspace"><div className="post-draft-heading"><div><p className="mini-label">STEP 7 · IMAGES + MOCKUPS</p><h2>Review placement and choose listing images.</h2><p>The large preview below is the real Printify placement Goldie uses as the required reference for lifestyle mockups.</p></div>{drafts.filter((draft) => draft.status === "Created").length > 1 && <button className="open-all-button" onClick={openAllDrafts}>Open all in Printify</button>}</div><p className="manual-image-note"><b>Size guides:</b> Keep your reusable size guide in its normal computer folder. Printify does not let Goldie attach it through the API, so upload it manually with any Goldie mockups you add in Printify.</p>{openAllMessage && <p className="open-all-message" role="status">{openAllMessage}</p>}<div className="draft-card-grid">{drafts.map((draft) => { const design=files.find(file=>file.id===draft.clientId); return <article className={`draft-card ${draft.status === "Failed" ? "failed" : ""}`} key={draft.clientId}><div className="draft-card-top">{draft.previewUrl ? <button className="printify-preview-button" onClick={()=>window.open(draft.previewUrl,"_blank","noopener,noreferrer")} aria-label="Open larger Printify preview"><img src={draft.previewUrl} alt={`Printify preview for ${draft.title || draft.name}`}/><span>Click to enlarge</span></button> : design ? <div className="pending-preview"><img src={design.previewUrl} alt="Design preview"/><span>Printify preview processing</span></div> : <span className="draft-check">!</span>}<div><span className="draft-state">{draft.status === "Created" ? "PRINTIFY DRAFT CREATED" : "DRAFT FAILED"}</span><h3>{draft.title || draft.name}</h3><small>{draft.status === "Created" ? "Unpublished · pricing, tags, and description applied" : draft.error}</small>{design?.tags?.length ? <div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}</div> : null}</div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Opened" : "Adjust in Printify"}</button> : null}</div>{draft.status==="Created"&&design&&<PlacementEditor draft={draft} design={design} template={templateDetails} onSaved={saved=>setDrafts(current=>current.map(item=>item.clientId===saved.clientId?saved:item))}/>} {draft.status === "Created" && <PrintifyImagePicker images={(draft.printifyImages || []).filter(Boolean)} indices={printifyImageIndices} onApplyAll={setPrintifyImageIndices} onSaveRecipe={activeRecipe?(values)=>void saveImagePreferences(values):undefined}/>} {draft.status === "Created" && design && <details className="draft-mockups"><summary>Optional: add your own mockups</summary><IntegratedMockups design={design.file} defaultTheme={mockupTheme} referenceUrl={draft.previewUrl} editorUrl={draft.editorUrl} sharedSelection={sharedMockups} onShare={setSharedMockups}/></details>}{draft.status === "Failed" && <button className="error-help-link" onClick={() => window.dispatchEvent(new CustomEvent("goldie-support", { detail: draft.error ?? "A design failed" }))}>Get help with this error</button>}</article>})}</div><button className="workflow-next mockup-next" onClick={()=>setFinishPhase("final")}>Continue to final review <span>→</span></button></section>}

      {preflightOpen && <div className="preflight-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPreflightOpen(false)}}><section className="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title"><p className="mini-label">CREATE PRINTIFY DRAFTS</p><h2 id="preflight-title">Create {files.length} product {files.length===1?"draft":"drafts"}?</h2><div className="preflight-list"><div><span>Printify product</span><b>✓ {templateDetails?.blueprintTitle}</b></div><div><span>Design files</span><b>✓ {files.length} ready</b></div><div><span>Permanent description</span><b>{description.trim()?"✓ Imported from Printify":"None found — can be added later"}</b></div><div><span>Variant pricing</span><b>✓ All {pricedVariants.length} enabled variants reviewed and approved</b></div><div><span>Publishing</span><b>Unpublished Printify drafts only</b></div></div><p className="preflight-explainer">After these drafts exist, Goldie will show their real previews and help finish each title, tags, unique introduction, Etsy details, and mockups.</p><div className="preflight-actions"><button className="preflight-cancel" onClick={()=>setPreflightOpen(false)}>Go back</button><button className="preflight-confirm" onClick={confirmDrafts}>Create Printify drafts →</button></div></section></div>}

      {publishConfirmOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="publish-confirm-title"><span className="publish-confirm-icon">!</span><p className="mini-label">FINAL PUBLISH CONFIRMATION</p><h2 id="publish-confirm-title">These listings will go live on Etsy.</h2><p>They will not be saved as Etsy drafts. Publishing starts as soon as you click the red button below.</p>{shippingPercent<100&&<div className="publish-missing shipping-publish-warning"><b>Your {shippingPercent}% buyer-paid shipping split cannot be applied by Printify.</b><span>Printify will send its full shipping template. After publishing, change the Etsy shipping profile to the buyer charge shown in Goldie. Automatic application requires Etsy API access.</span></div>}{missingPublishFields().length>0&&<div className="publish-missing"><b>Goldie found blank or unfinished fields:</b><ul>{missingPublishFields().map(field=><li key={field}>{field}</li>)}</ul><span>You can still publish, but review these first if they matter to this batch.</span></div>}<div className="publish-confirm-actions"><button onClick={()=>setPublishConfirmOpen(false)}>Go back and review</button><button className="danger" onClick={()=>void publishAll()}>Yes, publish live on Etsy</button></div></section></div>}

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
