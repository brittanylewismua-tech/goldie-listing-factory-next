"use client";
/* eslint-disable @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";
import { KeywordBank, SavedWorkflow, type Pricing, type Recipe } from "./factory-tools";
import IntegratedMockups from "./integrated-mockups";
import { tagsFromTitle, titlesFromCsv } from "./seo-utils";
import { normalizedPlacementScale, printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchFiles, saveBatchFiles } from "./batch-cache";

type VisibleBounds={left:number;top:number;right:number;bottom:number};
type EtsyDetails={category:string;attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review"};
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; title: string; tags: string[]; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";etsy?:EtsyDetails;etsyError?:string };
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number; shop: string; standardShipping?:number|null;shippingCurrency?:string;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string };
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";

const WORKFLOW_STEPS: Array<{id:WorkflowStep;number:string;label:string}> = [
  {id:"connect",number:"01",label:"Connect Printify"},
  {id:"setup",number:"02",label:"Choose setup"},
  {id:"designs",number:"03",label:"Add designs"},
  {id:"review",number:"04",label:"Review batch"},
  {id:"finish",number:"05",label:"Finish listings"},
];

const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 500 * 1024 * 1024;
const MAX_CONCURRENT_DESIGNS = 2;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
function PrintifyImagePicker({ images,indices,onApplyAll,onSaveRecipe }: { images: string[];indices:number[];onApplyAll:(indices:number[])=>void;onSaveRecipe?:(indices:number[])=>void }) { const [selected, setSelected] = useState<Set<number>>(new Set(indices.length?indices:images.slice(0,3).map((_,i)=>i))); useEffect(()=>setSelected(new Set(indices.length?indices:images.slice(0,3).map((_,i)=>i))),[indices,images.length]); if (!images.length) return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>; const chosen=[...selected].sort((a,b)=>a-b); return <details className="printify-image-picker"><summary>Choose Printify flatlays ({selected.size} selected)</summary><p>Goldie remembers these image positions for the final Etsy image mix. Printify does not expose its own saved mockup selection, so this does not alter the editor.</p><div>{images.map((src, index) => <label className={selected.has(index) ? "selected" : ""} key={src}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/><img src={src} alt={`Printify product mockup ${index + 1}`}/></label>)}</div><div className="image-pref-actions"><button onClick={()=>onApplyAll(chosen)}>Use for every listing</button>{onSaveRecipe&&<button onClick={()=>onSaveRecipe(chosen)}>Save to this listing setup</button>}</div></details>; }

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

  const templateLoaded = templateDetails !== null;
  const ready = connected && templateLoaded && files.length > 0;
  const missingRequirement = !connected ? "Connect Printify first" : !templateLoaded ? "Choose or create a saved listing setup" : files.length === 0 ? "Add at least one design" : "";
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function canOpenStep(step:WorkflowStep){if(step==="connect")return true;if(step==="setup")return connected;if(step==="designs")return connected&&templateLoaded;if(step==="review")return ready;return complete}
  function goToStep(step:WorkflowStep,replace=false,force=false){if(!force&&!canOpenStep(step))return;setWorkflowStep(step);const url=new URL(window.location.href);url.searchParams.set("step",step);window.history[replace?"replaceState":"pushState"]({},"",url);window.scrollTo({top:0,behavior:"smooth"})}

  useEffect(()=>{const read=()=>{const value=new URL(window.location.href).searchParams.get("step") as WorkflowStep|null;if(value&&WORKFLOW_STEPS.some(step=>step.id===value))setWorkflowStep(value)};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read)},[]);
  useEffect(()=>{if(checkingConnection)return;if(workflowStep==="connect"&&connected)goToStep("setup",true);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[checkingConnection]);
  useEffect(()=>{if(checkingConnection||restoringBatch||canOpenStep(workflowStep))return;const fallback=!connected?"connect":!templateLoaded?"setup":!files.length?"designs":!complete?"review":"finish";goToStep(fallback,true,true);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[checkingConnection,restoringBatch,connected,templateLoaded,files.length,complete,workflowStep]);

  useEffect(()=>{void(async()=>{try{const id=window.localStorage.getItem("goldie-active-batch")||"";if(!id)return;const response=await fetch(`/api/batches?id=${encodeURIComponent(id)}`);if(!response.ok)return;const payload=await response.json() as {batch?:{id:string;step:WorkflowStep;status:string;state?:Record<string,unknown>}};if(!payload.batch?.state)return;const state=payload.batch.state as {template?:string;templateDetails?:TemplateDetails;description?:string;pricing?:Pricing;mockupTheme?:string;activeRecipe?:Recipe;designs?:Array<Omit<DesignFile,"file"|"previewUrl">>;drafts?:DraftResult[];complete?:boolean;bulkTitles?:string;printifyImageIndices?:number[]};const cached=await loadBatchFiles(id).catch(()=>[]);const designs=(state.designs||[]).map((design,index)=>{const file=cached[index];return file?{...design,file,previewUrl:URL.createObjectURL(file)}:null}).filter(Boolean) as DesignFile[];batchIdRef.current=id;setTemplate(state.template||"");setTemplateDetails(state.templateDetails||null);setDescription(state.description||"");if(state.pricing)setPricing(state.pricing);setMockupTheme(state.mockupTheme||"");setActiveRecipe(state.activeRecipe||null);setFiles(designs);setDrafts(state.drafts||[]);setComplete(Boolean(state.complete));setBulkTitles(state.bulkTitles||"");setPrintifyImageIndices(state.printifyImageIndices||[]);setResumeProcessing(payload.batch.status==="processing"&&designs.length>0);const step=state.complete?"finish":payload.batch.step;setWorkflowStep(step);const url=new URL(window.location.href);url.searchParams.set("step",step);window.history.replaceState({},"",url);if(payload.batch.status==="processing"&&state.template)void loadTemplateUrl(state.template)}finally{snapshotReady.current=true;setRestoringBatch(false)}})()},[]);

  useEffect(()=>{if(!resumeProcessing||resumeAttempted.current||!connected||!templateLoaded||!files.length)return;resumeAttempted.current=true;setResumeProcessing(false);const succeeded=new Set(drafts.filter(draft=>draft.status==="Created").map(draft=>draft.clientId));const remaining=files.filter(file=>!succeeded.has(file.id));if(remaining.length)void runDrafts(remaining,true)},[resumeProcessing,connected,templateLoaded,files,drafts]);

  useEffect(()=>{if(!snapshotReady.current||restoringBatch||(!template&&!files.length&&!drafts.length))return;const timer=window.setTimeout(()=>{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);const designs=files.map(({file:ignoredFile,previewUrl:ignoredPreview,...design})=>design);void fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:running?"processing":complete?drafts.some(draft=>draft.status==="Failed")?"needs_attention":"complete":"draft",step:workflowStep,setupName:activeRecipe?.name||"",productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{template,templateDetails,description,pricing,mockupTheme,activeRecipe,designs,drafts,complete,bulkTitles,printifyImageIndices}})})},700);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[restoringBatch,workflowStep,template,templateDetails,description,pricing,mockupTheme,activeRecipe,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}:${JSON.stringify(file.etsy||{})}`).join(";"),drafts,complete,running,bulkTitles,printifyImageIndices]);

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
    const selectedBytes = images.reduce((sum, image) => sum + image.size, 0);
    if (selectedBytes > MAX_BATCH_BYTES) {
      setFileError(`This batch is ${(selectedBytes / 1024 / 1024).toFixed(1)} MB. Reduce it to 500 MB or less.`);
      return;
    }
    setFileError("");
    setFiles(images);
    const durableBatchId=batchIdRef.current||crypto.randomUUID();batchIdRef.current=durableBatchId;window.localStorage.setItem("goldie-active-batch",durableBatchId);void saveBatchFiles(durableBatchId,images.map(image=>image.file));
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
  function useRecipe(recipe: Recipe) { setActiveRecipe(recipe);setPrintifyImageIndices(recipe.printifyImageIndices||[]);setTemplate(recipe.templateUrl);setMockupTheme(recipe.defaultMockupTheme || ""); setPricing(current=>({ ...current, targetProfit:Number(recipe.pricing?.targetProfit??DEFAULT_PRICING.targetProfit) })); setTemplateDetails(null); void loadTemplateUrl(recipe.templateUrl); }
  async function saveImagePreferences(indices:number[]){if(!activeRecipe)return;setPrintifyImageIndices(indices);await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...activeRecipe,printifyImageIndices:indices})});setActiveRecipe({...activeRecipe,printifyImageIndices:indices})}
  function addKeyword(keyword: string) { const id = activeDesign || files[0]?.id; if (!id) return; setFiles((current) => current.map((file) => { if (file.id !== id) return file; const title = file.title ? `${file.title}, ${keyword}` : keyword; return { ...file, title: title.slice(0, 140), tags: tagsFromTitle(title),etsy:undefined,etsyError:"" }; })); }

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

  async function loadTemplateUrl(productUrl = template) {
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || "The template could not be loaded.");
      setTemplateDetails(result.product);setDescription(result.product.description||"");if(result.product.standardShipping!=null)setPricing(current=>({...current,shippingCost:result.product!.standardShipping!,shippingCharged:result.product!.standardShipping!})); return true;
    } catch (error) { setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return false; }
    finally { setLoadingTemplate(false); }
  }

  async function preparedUpload(design: DesignFile) {
    // Preserve original bytes whenever Printify can accept them directly.
    // Oversized opaque artwork is recompressed without changing dimensions;
    // transparent artwork is never flattened or silently degraded.
    const file=design.file;
    if (!/\.(png|jpe?g)$/i.test(file.name) || !/^image\/(png|jpeg)$/i.test(file.type || "image/png")) {
      throw new Error("Choose a PNG or JPG file. WebP artwork must be exported as PNG before uploading.");
    }
    return prepareArtworkFile(file, design.hasTransparency !== false);
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
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: design.title || undefined, tags: design.tags, pricing, description:fullDescription, visibleBounds:design.visibleBounds, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
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
    if (!ready || !targetFiles.length) return;
    setRunning(true);
    setRunTotal(targetFiles.length);
    setComplete(false);
    setPreparationMessage(`Processing up to ${Math.min(MAX_CONCURRENT_DESIGNS, targetFiles.length)} designs at a time without opening or compressing them`);
    if (!keepSuccessful) setDrafts([]);
    else setDrafts((current) => current.filter((draft) => draft.status === "Created"));
    setProcessed(0);
    await runBounded(targetFiles, MAX_CONCURRENT_DESIGNS, processDesign, (result) => {
      setDrafts((current) => [...current, result]);
      if(result.previewUrl)updateDesign(result.clientId,{previewUrl:result.previewUrl});
      setProcessed((current) => current + 1);
    });
    setRunning(false);
    setPreparationMessage("");
    setRunTotal(0);
    setComplete(true);
    goToStep("finish",false,true);
  }

  async function syncListingFields(design:DesignFile,details?:EtsyDetails){const draft=drafts.find(item=>item.clientId===design.id);if(!draft?.id)throw new Error("The matching Printify draft could not be found.");const response=await fetch("/api/printify/drafts/update",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:draft.id,title:design.title,tags:design.tags,description:[details?.blurb,description].filter(Boolean).join("\n\n"),etsyDetails:details})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Printify could not save the completed listing.")}
  async function syncPreparedListing(design:DesignFile,details:EtsyDetails){await syncListingFields(design,details)}
  async function prepareOne(design:DesignFile){try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model,description},title:design.title,tags:design.tags})}),payload=await response.json() as {details?:EtsyDetails;error?:string};if(!response.ok||!payload.details)throw new Error(payload.error||"Etsy details could not be prepared.");await syncListingFields(design,payload.details);updateDesign(design.id,{etsy:payload.details,etsyError:""});return payload.details}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be prepared."});return null}}
  function createDrafts() {setPreflightOpen(true);}
  function confirmDrafts() { setPreflightOpen(false); void runDrafts(files); }

  function retryFailed() {
    const failedIds = new Set(drafts.filter((draft) => draft.status === "Failed").map((draft) => draft.clientId));
    void runDrafts(files.filter((file) => failedIds.has(file.id)), true);
  }

  function startOver() {
    const priorBatch=batchIdRef.current;if(priorBatch)void clearBatchFiles(priorBatch);batchIdRef.current="";window.localStorage.removeItem("goldie-active-batch");
    setTemplate("");
    setTemplateDetails(null);
    setTemplateError("");
    setDescription("");
    setFiles([]);
    setFileError("");
    setDrafts([]);
    setProcessed(0);
    setComplete(false);
    setOpenedDrafts([]);
    syncedListingSignatures.current.clear();
    setOpenAllMessage("");
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
    if (csvPicker.current) csvPicker.current.value = "";
    goToStep(connected?"setup":"connect",true,true);
  }

  function openDraft(draft: DraftResult) {
    if (!draft.id || !draft.editorUrl) return;
    window.open(draft.editorUrl, "_blank", "noopener,noreferrer");
    setOpenedDrafts((current) => current.includes(draft.id!) ? current : [...current, draft.id!]);
  }

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
    setup: { eyebrow: "STEP 2 · LISTING SETUP", title: "Choose what you’re making.", copy: "Use a saved setup or connect a completed Printify template. Goldie imports the product, variants, shipping, and description for you." },
    designs: { eyebrow: "STEP 3 · DESIGNS", title: "Add this batch’s designs.", copy: "Upload up to 20 finished designs. Goldie keeps this batch saved while you move through the remaining steps." },
    review: { eyebrow: "STEP 4 · PREFLIGHT", title: "Review before creating drafts.", copy: "Confirm the product, design count, pricing target, keyword bank, and mockup defaults in one place." },
    finish: { eyebrow: "STEP 5 · FINISH", title: "Finish your listings.", copy: "Use the real Printify previews to complete titles, matching tags, Etsy details, and final mockup choices." },
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
          <nav className="top-nav"><a className="active" href="/">Listing Factory</a><a href="/batches">Batch History</a><a href="/keywords">Keyword Banks</a><a href="/mockups">Mockup Sets</a></nav>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <a className="usage-link" href="/usage">Usage + plan</a>
          <span className="secure-pill"><i /> Secure workspace</span>
        </div>
      </header>

      <section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{workflowHero.eyebrow}</p>
          <h1>{workflowHero.title}</h1>
          <p className="hero-copy">{workflowHero.copy}</p>
        </div>
        <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="hero-watermark" />
      </section>

      <section className="workspace">
        <nav className="workflow-progress" aria-label="Listing Factory progress">
          <div><p className="mini-label">YOUR BATCH</p><b>Step {WORKFLOW_STEPS.findIndex(item=>item.id===workflowStep)+1} of {WORKFLOW_STEPS.length}</b></div>
          {WORKFLOW_STEPS.map((step,index)=>{const active=workflowStep===step.id,available=canOpenStep(step.id),done=index<WORKFLOW_STEPS.findIndex(item=>item.id===workflowStep);return <button key={step.id} className={`${active?"active":""} ${done?"done":""}`} disabled={!available} aria-current={active?"step":undefined} onClick={()=>goToStep(step.id)}><span>{done?"✓":step.number}</span><span><b>{step.label}</b><small>{active?"You are here":done?"Complete":available?"Ready":"Complete the prior step"}</small></span></button>})}
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
                  <div className="inline-field"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your Printify token" aria-label="Printify token" /><button onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect Printify"}</button></div>
                  <small>Your token is encrypted before it is saved and is never displayed again.</small>
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                </div>
              ) : (
                <><div className="connection-row"><span className="connection-icon">P</span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>{connectionError && <p className="field-warning" role="status">{connectionError}</p>}</>
              )}
              {connected&&<button className="workflow-next" onClick={()=>goToStep("setup")}>Choose a listing setup <span>→</span></button>}
            </div>
          </article>

          <div className={`workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}><SavedWorkflow connected={connected} templateUrl={template} mockupTheme={mockupTheme} pricing={pricing} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} onTemplateUrl={(value) => { setTemplate(value); setTemplateDetails(null); setTemplateError(""); }} onUseRecipe={useRecipe} onVerifyTemplate={loadTemplateUrl} onPricing={setPricing} onMockupTheme={setMockupTheme} />
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          {templateDetails && <><div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {templateDetails.enabledVariants} enabled variants</span><span>{description?"Description imported":"No description found"} · {templateDetails.standardShipping!=null?`${templateDetails.shippingCurrency} ${templateDetails.standardShipping.toFixed(2)} standard shipping imported`:"Shipping checked during pricing"}</span></div><span className="template-badge">Product facts imported</span></div><button className="workflow-next" onClick={()=>goToStep("designs")}>Add finished designs <span>→</span></button></>}</div>

          <article className={`step-card workflow-panel ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${workflowStep==="designs"||workflowStep==="finish"?"active-panel":"hidden-panel"}`}>
            <div className="step-number">03</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">DESIGNS</p><h2>Add your finished designs</h2></div>{files.length > 0 && <span className="done-mark">✓ {files.length} loaded</span>}</div>
              <p className="step-copy">Build one focused batch of up to 20 finished designs. Upload a folder or select individual images.</p>
              <p className="batch-limits" aria-label="Batch limits"><span>20 designs maximum</span><i /> <span>100 MB per design · 500 MB per batch</span><i /> <span>Large opaque artwork is optimized without changing DPI</span></p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. Use a transparent-background PNG whenever the background should not print.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? `${files.length} of 20 designs ready` : "Choose a folder"}</b><small>{files.length ? `${(totalSize / 1024 / 1024).toFixed(1)} of 500 MB selected · Choose again to replace` : "Your folder can contain up to 20 designs"}</small></span>
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
                <div className="editor-heading"><div><b>Finish every listing from its real Printify draft</b><span>Build the final title and tags here. Goldie automatically completes the unique introduction and product-specific Etsy details when you leave the field.</span></div><span>{files.length} listings</span></div>
                <div className="bulk-title-box"><textarea value={bulkTitles} onChange={(e) => setBulkTitles(e.target.value)} rows={3} placeholder="Paste one title per line from eRank or a CSV column"/><div><button onClick={applyBulkTitles}>Apply titles in order</button><button className="secondary-import" onClick={() => csvPicker.current?.click()}>Import title CSV</button><input ref={csvPicker} hidden type="file" accept=".csv,text/csv" onChange={(event) => void importTitleCsv(event.target.files)}/></div></div>
                <KeywordBank onAdd={addKeyword} preferredListId={activeRecipe?.keywordListId}/>
                <div className="design-table">{files.map((design) => { const quality = design.width && templateDetails?.maxPrintWidth && templateDetails?.placementScale ? printifyDpi(design.width, templateDetails.maxPrintWidth, normalizedPlacementScale(templateDetails.placementScale, design.visibleBounds)) : null; const qualityReady = Boolean(quality && quality.dpi >= 300); return <article className={`design-line ${activeDesign === design.id ? "active" : ""}`} key={design.id} onClick={() => setActiveDesign(design.id)}><img src={design.previewUrl} alt=""/><div className="design-fields"><label>Title <span>{design.title.length}/140</span><input value={design.title} maxLength={140} onChange={(e) => { const title = e.target.value; updateDesign(design.id, { title, tags: tagsFromTitle(title),etsy:undefined }); }}/></label><label>Tags <span>{design.tags.length}/13</span><input value={design.tags.join(", ")} onChange={(e) => updateDesign(design.id, { tags: [...new Set(e.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag.length <= 20))].slice(0, 13),etsy:undefined })} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map((tag) => <span key={tag}>{tag}</span>)}{!design.tags.length && <small>Add comma-separated title phrases to generate matching Etsy tags.</small>}</div>{design.etsy&&<details className="etsy-auto"><summary>✓ Etsy details completed · {design.etsy.category}</summary><label>Design-specific introduction<textarea value={design.etsy.blurb} rows={3} onChange={e=>updateDesign(design.id,{etsy:{...design.etsy!,blurb:e.target.value}})}/></label><div className="etsy-attribute-grid">{Object.entries({...design.etsy.attributes,...design.etsy.optional}).map(([key,value])=><label key={key}>{key}<input value={value} onChange={e=>updateDesign(design.id,{etsy:{...design.etsy!,attributes:{...design.etsy!.attributes,[key]:e.target.value}}})}/></label>)}</div><small>Optional fields Goldie could not justify were left blank.</small></details>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}{design.paddingStatus==="trimmed"&&<small className="padding-note">✓ Transparent padding will be normalized to the template artwork</small>}</div><div className={`quality-pill ${qualityReady ? "pass" : "check"}`}><b>{!quality ? "Calculating Printify DPI…" : qualityReady ? `✓ ${quality.dpi} DPI in Printify` : `${quality.dpi} DPI in Printify`}</b><small>{quality ? `${quality.level} resolution · 300 DPI recommended` : design.width ? `${design.width} × ${design.height}px` : "Reading dimensions…"}</small></div></article>; })}</div>
              </div>}
            </div>
          </article>
        </div>

        <aside className={`launch-panel workflow-panel ${workflowStep==="review"?"active-panel":"hidden-panel"}`}>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `${processed} of ${runTotal} complete` : complete ? "Batch finished" : "Current batch"}</h2>
            <p>{complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : running ? "Goldie is uploading each design and creating its Printify draft." : "Complete the three sections to create unpublished drafts in Printify."}</p>
          </div>

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Listing setup</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button onClick={()=>goToStep("setup")}>Edit</button></div>
            <div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            <div><span>Profit target</span><b>${pricing.targetProfit.toFixed(2)} per item</b></div>
            <div><span>Standard shipping</span><b>{templateDetails?.standardShipping!=null?`${templateDetails.shippingCurrency} ${templateDetails.standardShipping.toFixed(2)}`:"Calculated from Printify"}</b></div>
            <div><span>Keyword bank</span><b>{activeRecipe?.keywordListId?"Saved with setup":"Choose after drafts"}</b></div>
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
            <button className="launch-button" disabled={!ready || running||preparingEtsy} onClick={createDrafts}>
              <span className="button-glint" />{preparingEtsy?"Completing Etsy details…":running ? `${processed} of ${runTotal} complete…` : ready ? "Review and create drafts" : missingRequirement}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status === "Failed") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status === "Failed").length} failed designs</button>}
            </div>
          )}
          <p className="launch-note">Listings remain unpublished until you publish them in Printify.</p>
          {(template || description || files.length > 0 || drafts.length > 0) && <button className="start-over-button" disabled={running} onClick={startOver}>Clear all / start over</button>}

        </aside>
        </div>
      </section>

      {complete && workflowStep==="finish" && <section className="post-draft-workspace"><div className="post-draft-heading"><div><p className="mini-label">PRINTIFY DRAFTS + MOCKUPS</p><h2>Review the real product previews, then finish each listing.</h2><p>Only open Printify when a preview needs manual size or placement adjustment. Mockup choices can be different for every listing.</p></div>{drafts.filter((draft) => draft.status === "Created").length > 1 && <button className="open-all-button" onClick={openAllDrafts}>Open all in Printify</button>}</div>{openAllMessage && <p className="open-all-message" role="status">{openAllMessage}</p>}<div className="draft-card-grid">{drafts.map((draft) => { const design=files.find(file=>file.id===draft.clientId); return <article className={`draft-card ${draft.status === "Failed" ? "failed" : ""}`} key={draft.clientId}><div className="draft-card-top">{draft.previewUrl ? <img src={draft.previewUrl} alt={`Printify preview for ${draft.title || draft.name}`}/> : design ? <div className="pending-preview"><img src={design.previewUrl} alt="Design preview"/><span>Printify preview processing</span></div> : <span className="draft-check">!</span>}<div><span className="draft-state">{draft.status === "Created" ? "PRINTIFY DRAFT CREATED" : "DRAFT FAILED"}</span><h3>{draft.title || draft.name}</h3><small>{draft.status === "Created" ? "Unpublished · pricing, tags, and description applied" : draft.error}</small>{design?.tags?.length ? <div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}</div> : null}</div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Opened" : "Adjust in Printify"}</button> : null}</div>{draft.status === "Created" && <PrintifyImagePicker images={(draft.printifyImages || []).filter(Boolean)} indices={printifyImageIndices} onApplyAll={setPrintifyImageIndices} onSaveRecipe={activeRecipe?(values)=>void saveImagePreferences(values):undefined}/>} {draft.status === "Created" && design && <details className="draft-mockups"><summary>Optional: create Goldie lifestyle mockups</summary><IntegratedMockups design={design.file} defaultTheme={mockupTheme} referenceUrl={draft.previewUrl} sharedSelection={sharedMockups} onShare={setSharedMockups}/></details>}{draft.status === "Failed" && <button className="error-help-link" onClick={() => window.dispatchEvent(new CustomEvent("goldie-support", { detail: draft.error ?? "A design failed" }))}>Get help with this error</button>}</article>})}</div></section>}

      {preflightOpen && <div className="preflight-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPreflightOpen(false)}}><section className="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title"><p className="mini-label">CREATE PRINTIFY DRAFTS</p><h2 id="preflight-title">Create {files.length} product {files.length===1?"draft":"drafts"}?</h2><div className="preflight-list"><div><span>Printify product</span><b>✓ {templateDetails?.blueprintTitle}</b></div><div><span>Design files</span><b>✓ {files.length} ready</b></div><div><span>Permanent description</span><b>{description.trim()?"✓ Imported from Printify":"None found — can be added later"}</b></div><div><span>Variant pricing</span><b>✓ Costs, shipping, fees, and profit applied</b></div><div><span>Publishing</span><b>Unpublished Printify drafts only</b></div></div><p className="preflight-explainer">After these drafts exist, Goldie will show their real previews and help finish each title, tags, unique introduction, Etsy details, and mockups.</p><div className="preflight-actions"><button className="preflight-cancel" onClick={()=>setPreflightOpen(false)}>Go back</button><button className="preflight-confirm" onClick={confirmDrafts}>Create Printify drafts →</button></div></section></div>}

      <footer><span>GOLDIE LISTING FACTORY</span><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
