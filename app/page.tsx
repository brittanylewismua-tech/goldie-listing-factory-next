"use client";
/* eslint-disable @next/next/no-img-element, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SupportChat from "./support-chat";
import { runBounded } from "./bounded-work";
import { KeywordBank, SavedWorkflow, type KeywordList, type Pricing, type ProductBundle, type Recipe } from "./factory-tools";
import IntegratedMockups from "./integrated-mockups";
import { tagsFromTitle, titlesFromCsv } from "./seo-utils";
import { printifyDpi } from "./print-quality";
import { isPermanentUploadError, MAX_FILE_BYTES, oversizedFileMessage } from "./upload-policy";
import { safeImagePreviewDataUrl } from "./client-image-preview";
import { prepareArtworkFile } from "./client-artwork-upload";
import { clearBatchFiles, loadBatchFiles, saveBatchFiles } from "./batch-cache";
import { estimatedProfit, recommendedPrice } from "./pricing";
import { ActionReceipt, GoldieInsight, OutcomeReceipt, WorkflowMomentum, type BatchReceipt } from "./goldie-ui";
import { GoldieCommandBar, ReturningCommandCenter, type CommandCenterData } from "./returning-command-center";
import FinalListingReview from "./final-listing-review";

type VisibleBounds={left:number;top:number;right:number;bottom:number};
type EtsyCategoryOption={id:number;path:string};
type EtsyPropertySelection={propertyId:number;label:string;required:boolean;multiple:boolean;maxValues:number;possibleValues:Array<{value_id:number;name:string}>;valueId:number|null;value:string};
type PersonalizationQuestion={id:string;type:"text_input"|"dropdown"|"unlabeled_upload";question:string;instructions:string;required:boolean;maxCharacters:number;maxFiles:number;options:string[]};
type EtsyPersonalization={enabled:boolean;questions:PersonalizationQuestion[]};
type EtsyDetails={category:string;taxonomyId?:number;properties?:EtsyPropertySelection[];attributes:Record<string,string>;optional:Record<string,string>;blurb:string;confidence:"high"|"review";personalization?:EtsyPersonalization};
type DesignFile = { name: string; size: number; id: string; file: File; previewUrl: string; title: string; tags: string[]; contentHash?:string; blurb?:string; descriptionOverride?:string; sizeGuideName?:string; width?: number; height?: number; visibleBounds?:VisibleBounds; hasTransparency?:boolean; paddingStatus?:"checking"|"trimmed"|"full";etsy?:EtsyDetails;etsyError?:string };
type ProductVariant={id:number;title:string;cost:number;templatePrice:number;shipping?:number|null;options?:number[]};
type InternationalShippingRate={key:string;label:string;primary:number;additional:number};
type EditableInternationalShippingRate={key:string;label:string;primary:string;additional:string};
type EtsyShippingProfile={id:number;title:string;originCountry:string;currency:string;domesticPrimary:number;domesticAdditional:number;international:InternationalShippingRate[]};
type TemplateDetails = { id: string; batchId: string; title: string; description:string; blueprintId:number;blueprintTitle:string;brand:string;model:string;provider: string; enabledVariants: number; variants:ProductVariant[]; shop: string; standardShipping?:number|null;shippingCurrency?:string;shippingTemplateId:string;shippingProfileNeedsSelection?:boolean;freeShipping:boolean;maxPrintWidth?: number | null; maxPrintHeight?: number | null; placementScale?: number | null };
type DraftResult = { id?: string; clientId: string; name: string; title?: string; tags?: string[]; previewUrl?: string; printifyImages?: string[]; shopId?: number; editorUrl?: string; status: "Created" | "Failed"; error?: string; placement?:{x:number;y:number;scale:number};placementScale?:number };
type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
type FinishPhase = "details" | "etsy" | "mockups" | "final";

function personalizationProblem(details?:EtsyDetails){const personalization=details?.personalization;if(!personalization?.enabled)return"";if(!personalization.questions.length)return"Add at least one personalization question.";for(const [index,question] of personalization.questions.entries()){if(!question.question.trim())return`Personalization question ${index+1} needs a question.`;if(question.type==="dropdown"&&question.options.filter(option=>option.trim()).length<2)return`Personalization question ${index+1} needs at least two dropdown choices.`}return""}

const WORKFLOW_STEPS: Array<{id:WorkflowStep;number:string;label:string}> = [
  {id:"connect",number:"01",label:"Connect Printify"},
  {id:"setup",number:"02",label:"Choose product"},
  {id:"designs",number:"03",label:"Add designs"},
  {id:"review",number:"04",label:"Review batch"},
  {id:"finish",number:"05",label:"Finish listings"},
];
const PROGRESS_STEPS = ["Connect Printify","Choose product","Add designs","Review pricing","Create drafts","Titles, tags + descriptions","Etsy listing details","Images + mockups","Final review"];

const MAX_BATCH_FILES = 20;
const MAX_CONCURRENT_DESIGNS = 2;
const LARGE_BATCH_THRESHOLD = 400 * 1024 * 1024;
const DEFAULT_PRICING: Pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
function isRigidPaperProduct(template:TemplateDetails|null){return /poster|print|canvas|paper/i.test(`${template?.blueprintTitle||""} ${template?.brand||""} ${template?.model||""}`)}
function PrintifyImagePicker({ images,indices,onApplyOne,onApplyAll,onSaveRecipe }: { images: string[];indices:number[];onApplyOne:(indices:number[])=>void;onApplyAll:(indices:number[])=>void;onSaveRecipe?:(indices:number[])=>void }) { const [selected, setSelected] = useState<Set<number>>(new Set(indices)); useEffect(()=>setSelected(new Set(indices)),[indices,images.length]); if (!images.length) return <p className="preview-processing">Printify is still processing its product mockups. Open the editor to view them once they appear.</p>; const chosen=[...selected].sort((a,b)=>a-b);function toggle(index:number){const next=new Set(selected);if(next.has(index))next.delete(index);else next.add(index);setSelected(next);onApplyOne([...next].sort((a,b)=>a-b))}function deselect(){setSelected(new Set());onApplyOne([])}return <details className="printify-image-picker"><summary>Choose Printify flatlays ({selected.size} selected)</summary><p>Choose the Printify images for this listing. Changes are saved automatically.</p><div>{images.map((src, index) => <label className={selected.has(index) ? "selected" : ""} key={src}><input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)}/><img src={src} alt={`Printify product mockup ${index + 1}`}/></label>)}</div><div className="image-pref-actions"><button onClick={deselect}>Deselect all for this listing</button><button onClick={()=>onApplyAll(chosen)}>Use this selection for every listing</button>{onSaveRecipe&&<button onClick={()=>onSaveRecipe(chosen)}>Save as this product’s default</button>}</div></details>; }

function PriceField({value,minimum,label,onCommit}:{value:number;minimum:number;label:string;onCommit:(cents:number)=>void}){const [draft,setDraft]=useState((value/100).toFixed(2)),[confirmed,setConfirmed]=useState(false);useEffect(()=>setDraft((value/100).toFixed(2)),[value]);function commit(){const amount=Number(draft);if(!Number.isFinite(amount)){setDraft((value/100).toFixed(2));return}const cents=Math.round(Math.max(minimum,amount)*100);onCommit(cents);setDraft((cents/100).toFixed(2));setConfirmed(true);window.setTimeout(()=>setConfirmed(false),520)}return <label className={confirmed?"price-confirmed":""} aria-label={label}>$<input type="text" inputMode="decimal" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter"){event.currentTarget.blur()}if(event.key==="Escape"){setDraft((value/100).toFixed(2));event.currentTarget.blur()}}}/></label>}

function variantSize(title:string){const normalized=title.toUpperCase().replace(/\b(\d+)\s*X\s*L\b/g,"$1XL").replace(/\bX\s*L\b/g,"XL");const matches=normalized.match(/(?:^|\s|\/|-)(XXXS|XXS|XS|S|M|L|XL|2XL|3XL|4XL|5XL|6XL|7XL|8XL|9XL|10XL|\d+T|\d+M|\d+Y)(?=$|\s|\/|-)/g);return matches?.at(-1)?.trim().replace(/^\//,"").replace(/\/$/,"").trim()||""}

async function autoTitleForDesign(design:DesignFile,keywords:string[],useCommas:boolean,template:TemplateDetails|null){const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"title",image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:template?.blueprintTitle,brand:template?.brand,model:template?.model},keywords,useCommas})}),payload=await response.json() as {title?:string;keywords?:string[];error?:string};if(!response.ok||!payload.title)throw new Error(payload.error||"Goldie could not create this title.");return {title:payload.title,keywords:payload.keywords||[]}}

function IndividualAutoTitle({design,template,useCommas,initialBankId,onApply}:{design:DesignFile;template:TemplateDetails|null;useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[])=>void}){const [bank,setBank]=useState<KeywordList|null>(null),[building,setBuilding]=useState(false),[message,setMessage]=useState("");async function build(){if(!bank)return;setBuilding(true);setMessage("");try{const result=await autoTitleForDesign(design,bank.keywords,useCommas,template);onApply(result.title,tagsFromTitle(result.keywords.join(", ")));setMessage("✓ New title and matching tags applied to this listing only.")}catch(error){setMessage(error instanceof Error?error.message:"Goldie could not create this title.")}finally{setBuilding(false)}}return <><details className="individual-title-builder" onClick={event=>event.stopPropagation()}><summary>Create a different title with AI</summary><KeywordBank compact selectionOnly initialId={initialBankId||""} title="Keyword bank" copy="Goldie selects exact validated phrases from this bank. It never adds keywords." onSelect={setBank}/><button className="ai-title-button" disabled={!bank||building} onClick={()=>void build()}>{building?"Creating this title…":"Create title for this design"}</button>{message&&<p className="title-build-message" role="status">{message}</p>}</details><IndividualManualTitle useCommas={useCommas} initialBankId={initialBankId} onApply={onApply}/></>}

function IndividualManualTitle({useCommas,initialBankId,onApply}:{useCommas:boolean;initialBankId?:string;onApply:(title:string,tags:string[])=>void}){const [bankId,setBankId]=useState(initialBankId||""),[keywords,setKeywords]=useState<string[]>([]),[message,setMessage]=useState("");const title=keywords.join(useCommas?", ":" ");function add(keyword:string){setKeywords(current=>current.includes(keyword)?current:[...current,keyword]);setMessage("")}function apply(){if(!title)return;onApply(title,tagsFromTitle(keywords.join(", ")));setMessage("✓ Your title and matching tags were applied to this listing only.")}return <details className="individual-title-builder individual-manual-title" onClick={event=>event.stopPropagation()}><summary>Build this title yourself from a keyword bank</summary><KeywordBank compact initialId={bankId} title="Choose a keyword bank" copy="Click keywords in the order you want them for this listing." onSelect={list=>{setBankId(list?.id||"");setKeywords([]);setMessage("")}} onAdd={add}/><div className="individual-keyword-selection"><div><b>Selected keywords</b>{keywords.length>0&&<button type="button" onClick={()=>setKeywords([])}>Clear all</button>}</div>{keywords.length?<><div className="selected-keyword-chips">{keywords.map(keyword=><button type="button" key={keyword} onClick={()=>setKeywords(current=>current.filter(item=>item!==keyword))}>{keyword}<span>×</span></button>)}</div><div className="individual-title-preview"><small>Title preview</small><span>{title}</span></div><button type="button" className="apply-manual-title" onClick={apply}>Apply to this listing</button></>:<p>Choose a bank, then click the keywords you want to use.</p>}{message&&<p className="title-build-message" role="status">{message}</p>}</div></details>}

function PersonalizationEditor({value,onChange}:{value?:EtsyPersonalization;onChange:(value:EtsyPersonalization)=>void}){
  const enabled=Boolean(value?.enabled),questions=value?.questions||[];
  function blank(type:PersonalizationQuestion["type"]="text_input"):PersonalizationQuestion{return{id:crypto.randomUUID(),type,question:type==="text_input"?"Personalization":"",instructions:"",required:false,maxCharacters:256,maxFiles:1,options:type==="dropdown"?["Option 1","Option 2"]:[]}}
  function update(id:string,patch:Partial<PersonalizationQuestion>){onChange({enabled:true,questions:questions.map(question=>question.id===id?{...question,...patch}:question)})}
  function toggle(next:boolean){onChange({enabled:next,questions:next?(questions.length?questions:[blank()]):questions})}
  return <section className="personalization-editor"><div className="personalization-heading"><div><b>Personalization</b><small>Let buyers answer questions or upload files for this listing.</small></div><label className="personalization-switch"><input type="checkbox" checked={enabled} onChange={event=>toggle(event.target.checked)}/><span>{enabled?"On":"Off"}</span></label></div>{enabled&&<><div className="personalization-questions">{questions.map((question,index)=><article key={question.id}><div className="personalization-question-head"><b>Question {index+1}</b><button type="button" onClick={()=>onChange({enabled:true,questions:questions.filter(item=>item.id!==question.id)})}>Remove</button></div><label>Answer type<select value={question.type} onChange={event=>{const type=event.target.value as PersonalizationQuestion["type"];update(question.id,{type,options:type==="dropdown"&&question.options.length<2?["Option 1","Option 2"]:question.options})}}><option value="text_input">Text answer</option><option value="dropdown">Dropdown choices</option><option value="unlabeled_upload">File upload</option></select></label><label>Question<input maxLength={120} value={question.question} placeholder="Example: What name should appear on the shirt?" onChange={event=>update(question.id,{question:event.target.value})}/></label>{question.type!=="dropdown"&&<label>Instructions <span>{question.instructions.length}/120</span><textarea rows={2} maxLength={120} value={question.instructions} placeholder="Tell the buyer exactly what to provide." onChange={event=>update(question.id,{instructions:event.target.value})}/></label>}{question.type==="text_input"&&<label>Maximum characters<input type="number" min="1" max="1024" value={question.maxCharacters} onChange={event=>update(question.id,{maxCharacters:Math.max(1,Math.min(1024,Number(event.target.value)||1))})}/></label>}{question.type==="unlabeled_upload"&&<label>Maximum files<input type="number" min="1" max="10" value={question.maxFiles} onChange={event=>update(question.id,{maxFiles:Math.max(1,Math.min(10,Number(event.target.value)||1))})}/></label>}{question.type==="dropdown"&&<label>Dropdown choices<textarea rows={3} value={question.options.join("\n")} placeholder={"Small\nMedium\nLarge"} onChange={event=>update(question.id,{options:event.target.value.split(/\r?\n/).slice(0,20)})}/><small>Enter one choice per line.</small></label>}<label className="personalization-required"><input type="checkbox" checked={question.required} onChange={event=>update(question.id,{required:event.target.checked})}/>Buyer must answer this question</label></article>)}</div>{questions.length<5&&<button type="button" className="add-personalization-question" onClick={()=>onChange({enabled:true,questions:[...questions,blank()]})}>Add another question</button>}<small className="personalization-note">Etsy allows up to five questions. Review every question before publishing.</small></>}</section>
}

function EtsyDetailsEditor({design,categories,onChange,onCategory}:{design:DesignFile;categories:EtsyCategoryOption[];onChange:(details:EtsyDetails)=>void;onCategory:(taxonomyId:number)=>Promise<void>}){
  const details=design.etsy!,[loading,setLoading]=useState(false);
  async function choose(id:number){setLoading(true);try{await onCategory(id)}finally{setLoading(false)}}
  function setProperty(property:EtsyPropertySelection,value:string){const option=property.possibleValues.find(item=>String(item.value_id)===value),next={...property,valueId:option?.value_id||null,value:option?.name||value};onChange({...details,properties:(details.properties||[]).map(item=>item.propertyId===property.propertyId?next:item)})}
  return <><label>Etsy category<select value={details.taxonomyId||""} disabled={loading} onChange={event=>void choose(Number(event.target.value))}>{!details.taxonomyId&&<option value="">Choose an Etsy category</option>}{categories.map(category=><option key={category.id} value={category.id}>{category.path}</option>)}</select></label>{loading&&<small>Loading the exact Etsy options for this category…</small>}<div className="etsy-attribute-grid">{(details.properties||[]).map(property=><label key={property.propertyId}>{property.label}{property.required&&<em>Required</em>}{property.possibleValues.length?<select value={property.valueId||""} onChange={event=>setProperty(property,event.target.value)}><option value="">{property.required?"Choose one":"Not applicable"}</option>{property.possibleValues.map(option=><option key={option.value_id} value={option.value_id}>{option.name}</option>)}</select>:<input value={property.value} onChange={event=>setProperty(property,event.target.value)}/>}</label>)}</div><small className="optional-note">These are Etsy’s actual fields for the selected category. Optional fields can stay blank.</small><PersonalizationEditor value={details.personalization} onChange={personalization=>onChange({...details,personalization})}/></>
}

function IndividualSizeGuide({productId,name,onSaved}:{productId:string;name?:string;onSaved:(name:string)=>void}){const picker=useRef<HTMLInputElement>(null),[status,setStatus]=useState("");async function save(file:File){setStatus(`Saving ${file.name}…`);try{const form=new FormData();form.set("productId",productId);form.set("kind","size-guide");form.set("file",file);const response=await fetch("/api/etsy/images",{method:"POST",body:form}),payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"This size guide could not be saved.");onSaved(file.name);setStatus(`✓ ${file.name} will be used for this listing.`)}catch(error){setStatus(error instanceof Error?error.message:"This size guide could not be saved.")}}return <div className="individual-size-guide"><div><b>Size guide for this listing</b><small>{name||"Using the batch size guide"}</small></div><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void save(file)}}/><button type="button" onClick={()=>picker.current?.click()}>{name?"Replace custom size guide":"Use a different size guide"}</button>{status&&<p role="status">{status}</p>}</div>}

function DownloadListingPhotos({productId,name,indices}:{productId:string;name:string;indices:number[]}){const [downloading,setDownloading]=useState(false),[message,setMessage]=useState("");async function download(){if(downloading)return;setDownloading(true);setMessage("");try{const response=await fetch("/api/listing-photos/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,printifyImageIndices:indices})});if(!response.ok){const payload=await response.json() as {error?:string};throw new Error(payload.error||"These listing photos could not be downloaded.")}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`${name.replace(/[^a-z0-9._-]+/gi,"-").slice(0,90)||"listing"}-listing-photos.zip`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setMessage("✓ Download ready.")}catch(error){setMessage(error instanceof Error?error.message:"These listing photos could not be downloaded.")}finally{setDownloading(false)}}return <div className="listing-photo-download"><div><b>Keep a local copy</b><small>Selected Printify photos and created lifestyle mockups in one ZIP.</small></div><button type="button" disabled={downloading} onClick={()=>void download()}>{downloading?"Preparing photos…":"Download this listing’s photos"}</button>{message&&<p role="status">{message}</p>}</div>}

function PricingReview({variants,pricing,prices,productName,profiles,selectedProfileId,profilesLoading,profilesError,approved,onPricing,onPrices,onSelectProfile,onCreateProfile,onApprovalChange}:{variants:ProductVariant[];pricing:Pricing;prices:Record<string,number>;productName:string;profiles:EtsyShippingProfile[];selectedProfileId:number;profilesLoading:boolean;profilesError:string;approved:boolean;onPricing:(value:Pricing)=>void;onPrices:(value:Record<string,number>)=>void;onSelectProfile:(id:number)=>void;onCreateProfile:(baseId:number,charge:number,additional:number,title:string,international:InternationalShippingRate[])=>Promise<void>;onApprovalChange:(ready:boolean)=>void}){
  const selectedProfile=profiles.find(profile=>profile.id===selectedProfileId);
  const [customCharge,setCustomCharge]=useState(""),[customAdditional,setCustomAdditional]=useState(""),[customInternational,setCustomInternational]=useState<EditableInternationalShippingRate[]>([]),[customProfileName,setCustomProfileName]=useState(""),[savingProfile,setSavingProfile]=useState(false),[profileMessage,setProfileMessage]=useState(""),[recommendationMessage,setRecommendationMessage]=useState("");
  function resetProfileEditor(profile=selectedProfile){setCustomCharge(profile?profile.domesticPrimary.toFixed(2):"");setCustomAdditional(profile?profile.domesticAdditional.toFixed(2):"");setCustomInternational(profile?profile.international.map(rate=>({...rate,primary:rate.primary.toFixed(2),additional:rate.additional.toFixed(2)})):[]);setCustomProfileName("");setProfileMessage("")}
  useEffect(()=>{resetProfileEditor()},[selectedProfileId,selectedProfile?.title]);
  const enteredCharge=Number(customCharge),enteredAdditional=Number(customAdditional),buyerShipping=Number.isFinite(enteredCharge)&&enteredCharge>=0?enteredCharge:selectedProfile?.domesticPrimary||0,internationalDirty=Boolean(selectedProfile&&customInternational.some((rate,index)=>Math.abs(Number(rate.primary)-selectedProfile.international[index]?.primary)>.004||Math.abs(Number(rate.additional)-selectedProfile.international[index]?.additional)>.004)),customDirty=Boolean(selectedProfile&&(Math.abs(buyerShipping-selectedProfile.domesticPrimary)>.004||Math.abs(enteredAdditional-selectedProfile.domesticAdditional)>.004||internationalDirty||Boolean(customProfileName.trim())));
  useEffect(()=>onApprovalChange(Boolean(selectedProfile&&!customDirty)),[selectedProfile,customDirty,onApprovalChange]);
  function recalculate(nextPricing=pricing,nextBuyerShipping=buyerShipping){const next=Object.fromEntries(variants.map(variant=>{const shipping=Number(variant.shipping||0);return[String(variant.id),recommendedPrice(variant.cost,{...nextPricing,shippingCost:shipping,shippingCharged:nextBuyerShipping})]})),changed=variants.filter(variant=>next[String(variant.id)]!==(prices[String(variant.id)]??variant.templatePrice)).length;onPrices(next);setRecommendationMessage(changed?`✓ Updated ${changed} ${changed===1?"price":"prices"}. Review every size below before approving.`:"✓ Your current prices already meet this profit goal. Nothing needed to change.")}
  function changeProfit(value:number){const nextPricing={...pricing,targetProfit:Math.max(0,value)};onPricing(nextPricing);recalculate(nextPricing);}
  function changeVariantPrice(variant:ProductVariant,cents:number){const size=variantSize(variant.title);if(!size){onPrices({...prices,[String(variant.id)]:cents});setRecommendationMessage("✓ Price updated.");return}const matching=variants.filter(item=>variantSize(item.title)===size),safeCents=Math.max(cents,...matching.map(item=>item.cost)),next={...prices};for(const item of matching)next[String(item.id)]=safeCents;onPrices(next);setRecommendationMessage(matching.length>1?`✓ $${(safeCents/100).toFixed(2)} applied to all ${matching.length} ${size} color variants.`:`✓ ${size} price updated.`)}
  function chooseProfile(id:number){onSelectProfile(id);resetProfileEditor(profiles.find(item=>item.id===id))}
  function changeInternational(index:number,field:"primary"|"additional",value:string){setCustomInternational(current=>current.map((rate,i)=>i===index?{...rate,[field]:value}:rate));setProfileMessage("")}
  async function createProfile(){if(!selectedProfile)return;const charge=Number(customCharge),additional=Number(customAdditional),title=customProfileName.trim(),international=customInternational.map(rate=>({...rate,primary:Number(rate.primary),additional:Number(rate.additional)})),ratesValid=international.every(rate=>rate.primary>=0&&Number.isFinite(rate.primary)&&rate.additional>=0&&Number.isFinite(rate.additional));if(customCharge===""||customAdditional===""||!Number.isFinite(charge)||charge<0||!Number.isFinite(additional)||additional<0||!ratesValid||!title)return setProfileMessage("Name the profile and enter valid first-item and additional-item charges for every destination.");setSavingProfile(true);setProfileMessage("");try{await onCreateProfile(selectedProfile.id,charge,additional,title,international);setProfileMessage("✓ New Etsy shipping profile saved and selected.")}catch(error){setProfileMessage(error instanceof Error?error.message:"The shipping profile could not be saved.")}finally{setSavingProfile(false)}}
  return (
    <section className={"variant-pricing "+(approved?"approved":"")}>
      <div className="variant-pricing-head">
        <div><p className="mini-label">PRICING</p><h3>Review item prices and shipping</h3></div>
        {approved&&<span>✓ Approved</span>}
      </div>
      <section className="item-pricing-section"><div className="item-pricing-heading pricing-section-heading"><div><h4>1. Item prices <span>· {productName}</span></h4><p>Change a price once and Goldie applies it to every color in that same size. Profit includes Printify costs, shipping, and Etsy fees.</p></div><div className="profit-goal-control"><label>Profit goal<span className="money-input">$<input aria-label="Profit goal" type="number" min="0" step="0.01" value={pricing.targetProfit} onChange={event=>changeProfit(Number(event.target.value))}/></span><small>Prices update automatically.</small></label></div></div>{recommendationMessage&&<p className="recommendation-result" role="status">{recommendationMessage}</p>}
      <div className="variant-table-wrap"><table className="variant-table">
        <thead><tr><th>Size / color</th><th>Printify product cost</th><th>Your item price</th><th>Your estimated profit</th></tr></thead>
        <tbody>{variants.map(variant=>{const shipping=Number(variant.shipping||0),itemCents=prices[String(variant.id)]??variant.templatePrice,profit=estimatedProfit(itemCents,variant.cost,{...pricing,shippingCost:shipping,shippingCharged:buyerShipping});return <tr key={variant.id}><td><b>{variant.title}</b></td><td className="printify-product-cost"><b>${(variant.cost/100).toFixed(2)}</b><small>Product only</small></td><td><PriceField value={itemCents} minimum={variant.cost/100} label={"Price for "+variant.title} onCommit={cents=>changeVariantPrice(variant,cents)}/></td><td className={profit+0.005>=pricing.targetProfit?"profit-pass":"profit-low"}><b>${profit.toFixed(2)}</b><small className="profit-fee-note">All Etsy fees included</small></td></tr>})}</tbody>
      </table></div>
      <details className="pricing-math"><summary>See how Goldie calculated these prices</summary><p>Each recommendation includes the exact Printify product cost and shipping for that variant, the buyer’s domestic shipping charge from the selected Etsy profile, your Etsy transaction and payment fees, the listing fee, and your profit goal. Offsite Ads and sales tax are excluded because they vary by order.</p><div className="fee-profile-summary"><span>{pricing.etsyFeePercent.toFixed(1)}% Etsy percentage fees</span><span>${pricing.fixedFee.toFixed(2)} payment fee</span><span>${pricing.listingFee.toFixed(2)} listing fee</span><a href="/usage" target="_blank" rel="noopener noreferrer">Change fee settings ↗</a></div></details>
      </section>
      <section className="shipping-pricing-section">
      <div className="pricing-section-heading shipping-section-heading"><div><h4>2. Shipping <span>· {productName}</span></h4><p>Review the Etsy shipping profile that will be used for every listing in this batch.</p></div></div>
      <div className="pricing-controls">
        <label className="shipping-profile-select"><span>Shipping profile</span><select value={selectedProfileId||""} disabled={profilesLoading} onChange={event=>chooseProfile(Number(event.target.value))}><option value="">{profilesLoading?"Loading your shipping profiles…":"Choose your shipping profile"}</option>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.title}</option>)}</select><small>Selected automatically from your product template.</small></label>
      </div>
      {profilesError&&<div className="shipping-api-note error"><b>Shipping profiles could not be loaded.</b><span>{profilesError}</span></div>}
      {selectedProfile&&<div className="shipping-quick-summary"><span><b>{selectedProfile.originCountry} buyer pays</b> ${selectedProfile.domesticPrimary.toFixed(2)} first item · ${selectedProfile.domesticAdditional.toFixed(2)} additional</span><span><b>International</b> {selectedProfile.international.length?`${selectedProfile.international.length} rates saved`:"Not included"}</span></div>}
      {selectedProfile&&<details className="custom-shipping-builder"><summary>{customDirty?"⚠ Unsaved shipping changes":"Create a custom shipping profile (optional)"}</summary><div className="custom-shipping-body"><div className="shipping-builder-intro"><b>Create a copy. Your original profile will not change.</b><span>Name it, adjust any rates you want, then save it. Goldie will select the new profile for this batch.</span></div><label><span>1. Name your new shipping profile<small>This name will appear in Etsy and in Goldie next time.</small></span><b className="shipping-profile-name-label">Profile name</b><input aria-label="New shipping profile name" placeholder={`Example: ${selectedProfile.title}, $4 US shipping`} value={customProfileName} maxLength={60} onChange={event=>{setCustomProfileName(event.target.value);setProfileMessage("")}}/></label><h5>2. Edit {selectedProfile.originCountry} shipping</h5><div className="shipping-rate-row"><b>Domestic</b><label>First item<span className="money-input">$<input inputMode="decimal" value={customCharge} onChange={event=>{setCustomCharge(event.target.value);setProfileMessage("")}}/></span></label><label>Additional<span className="money-input">$<input inputMode="decimal" value={customAdditional} onChange={event=>{setCustomAdditional(event.target.value);setProfileMessage("")}}/></span></label></div><details className="international-shipping-editor"><summary>3. Edit international rates (optional) · {customInternational.length} destinations</summary>{customInternational.length?<div className="international-rate-list">{customInternational.map((rate,index)=><div className="shipping-rate-row" key={rate.key}><b>{rate.label}</b><label>First item<span className="money-input">$<input aria-label={`${rate.label} first item`} inputMode="decimal" value={rate.primary} onChange={event=>changeInternational(index,"primary",event.target.value)}/></span></label><label>Additional<span className="money-input">$<input aria-label={`${rate.label} additional item`} inputMode="decimal" value={rate.additional} onChange={event=>changeInternational(index,"additional",event.target.value)}/></span></label></div>)}</div>:<p className="no-international-rates">No international destinations.</p>}</details>{customDirty?<div className="custom-shipping-actions"><button disabled={savingProfile} onClick={()=>void createProfile()}>{savingProfile?"Saving shipping profile…":"Save new shipping profile"}</button><button type="button" onClick={()=>resetProfileEditor()}>Discard changes</button></div>:<div className="shipping-saved-state">No changes made.</div>}{profileMessage&&<small role="status">{profileMessage}</small>}</div></details>}
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

export default function Home() {
  const folderPicker = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const csvPicker = useRef<HTMLInputElement>(null);
  const sizeGuidePicker = useRef<HTMLInputElement>(null);
  const listingResultsRef = useRef<HTMLDivElement>(null);
  const syncedListingSignatures = useRef<Map<string,string>>(new Map());
  const batchIdRef=useRef("");
  const snapshotReady=useRef(false);
  const resumeAttempted=useRef(false);
  const draftRunActive=useRef(false);
  const templateLoadVersion=useRef(0);
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
  const [bulkTitles, setBulkTitles] = useState("");
  const [activeDesign, setActiveDesign] = useState<string>("");
  const [activeRecipe,setActiveRecipe]=useState<Recipe|null>(null);
  const [activeBundle,setActiveBundle]=useState<ProductBundle|null>(null);
  const [bundleRecipes,setBundleRecipes]=useState<Recipe[]>([]);
  const [bundleIndex,setBundleIndex]=useState(0);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [printifyImageIndices,setPrintifyImageIndices]=useState<number[]>([]);
  const [printifyImageSelections,setPrintifyImageSelections]=useState<Record<string,number[]>>({});
  const [sharedMockups,setSharedMockups]=useState<{theme:string;ids:string[]}|undefined>();
  const [preparingEtsy,setPreparingEtsy]=useState(false);
  const [savingEtsyDetails,setSavingEtsyDetails]=useState(false);
  const [workflowStep,setWorkflowStep]=useState<WorkflowStep>("connect");
  const [restoringBatch,setRestoringBatch]=useState(true);
  const [resumeProcessing,setResumeProcessing]=useState(false);
  const [finishPhase,setFinishPhase]=useState<FinishPhase>("details");
  const [uploadNoticeOpen,setUploadNoticeOpen]=useState(false);
  const [leaveTarget,setLeaveTarget]=useState("");
  const [publishConfirmOpen,setPublishConfirmOpen]=useState(false);
  const [titleJoiner,setTitleJoiner]=useState(", ");
  const [variantPrices,setVariantPrices]=useState<Record<string,number>>({});
  const [etsyShippingProfiles,setEtsyShippingProfiles]=useState<EtsyShippingProfile[]>([]);
  const [etsyShippingProfileId,setEtsyShippingProfileId]=useState(0);
  const [shippingProfilesLoading,setShippingProfilesLoading]=useState(false);
  const [shippingProfilesError,setShippingProfilesError]=useState("");
  const [pricingApproved,setPricingApproved]=useState(false);
  const [publishing,setPublishing]=useState(false);
  const [publishMessage,setPublishMessage]=useState("");
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
  const [sizeGuideName,setSizeGuideName]=useState("");
  const [sizeGuideStatus,setSizeGuideStatus]=useState("");
  const [commandCenterData,setCommandCenterData]=useState<CommandCenterData|null>(null);
  const [sidebarUsage,setSidebarUsage]=useState<{used:number;limit:number}>({used:0,limit:100});
  const [preparedMockupCounts,setPreparedMockupCounts]=useState<Record<string,number>>({});
  const [titlePulseIds,setTitlePulseIds]=useState<Set<string>>(new Set());

  const templateLoaded = templateDetails !== null;
  const productSelected = Boolean(activeRecipe);
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
  const pricedVariants=useMemo(()=>templateDetails?.variants||[],[templateDetails]);
  const createdDraftCount=drafts.filter(draft=>draft.status==="Created").length,titleCount=files.filter(file=>file.title.trim()).length,etsyReadyCount=files.filter(file=>file.etsy).length;
  const lowDpiCount=files.filter(file=>{const scale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale;return Boolean(file.width&&templateDetails?.maxPrintWidth&&scale&&printifyDpi(file.width,templateDetails.maxPrintWidth,scale).dpi<300)}).length;
  const recommendedPixelSize=useMemo(()=>{const scale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale||0;return {width:Math.round((templateDetails?.maxPrintWidth||0)*scale),height:Math.round((templateDetails?.maxPrintHeight||0)*scale)}},[templateDetails]);
  const belowRecommendedPixels=useMemo(()=>{if(!recommendedPixelSize.width||!recommendedPixelSize.height)return [];return files.filter(file=>Boolean(file.width&&file.height&&(file.width<recommendedPixelSize.width||file.height<recommendedPixelSize.height)))},[files,recommendedPixelSize]);
  function continueFromDesigns(){if(belowRecommendedPixels.length){setPixelWarningOpen(true);return}goToStep("review")}
  function progressStatus(index:number,active:boolean,done:boolean){if(index===0)return connected?"Printify connected":active?"Connect your account":"Not connected";if(index===1)return templateDetails?templateDetails.blueprintTitle:active?"Choose a saved product":"Complete the prior step";if(index===2)return files.length?`${files.length} designs ready`:active?"Add finished designs":"Complete the prior step";if(index===3)return pricingApproved?`${pricedVariants.length} variants approved`:active?"Review every variant":"Complete the prior step";if(index===4)return complete?`${createdDraftCount} drafts created`:active&&running?`${processed} of ${runTotal} created`:ready?"Ready to create":"Complete the prior step";if(index===5)return titleCount===files.length&&files.length?`${titleCount} titles complete`:active?`${titleCount} of ${files.length} titles complete`:done?"Titles complete":"Complete the prior step";if(index===6)return etsyReadyCount===files.length&&files.length?`${etsyReadyCount} listings ready`:active?`${etsyReadyCount} of ${files.length} ready`:done?"Etsy details complete":"Complete the prior step";if(index===7)return done?"Listing images reviewed":active?`${createdDraftCount} previews ready`:"Complete the prior step";return batchReceipt?`${batchReceipt.publishedCount} listings published`:active?"Ready to publish":"Complete the prior step"}
  function currentInsight(){if(progressIndex===1)return activeRecipe?`You used ${activeRecipe.name} recently. Its product facts and saved Etsy shipping profile will carry into this batch.`:"Choose a saved product once and Goldie will reuse its placement, variants, costs, and description.";if(progressIndex===2)return files.length?lowDpiCount?`${lowDpiCount} ${lowDpiCount===1?"design is":"designs are"} below 300 DPI at the largest enabled size. Review the DPI label before creating drafts.`:`All ${files.length} designs are loaded. Goldie will preserve their original artwork resolution.`:"Add finished artwork and Goldie will check each design against the real Printify print size.";if(progressIndex===3)return pricingApproved?`All ${pricedVariants.length} enabled variants are approved. Goldie will keep those size-based prices across every listing.`:"Goldie is calculating each enabled variant from its own product cost, Etsy fees, shipping, and your target profit.";if(progressIndex===4)return running?`${processed} of ${runTotal} Printify drafts are complete. Successful drafts will not be duplicated if a retry is needed.`:"Goldie is ready to create one unpublished Printify draft for every design.";if(progressIndex===5)return `Goldie selects only exact phrases from your validated eRank keyword bank and creates matching Etsy tags. It never invents keywords.`;if(progressIndex===6)return `${etsyReadyCount} of ${files.length} listings have product-specific Etsy categories and attributes ready for review.`;if(progressIndex===7)return `The Printify preview is the placement reference. Apply one flatlay selection to the batch when the listings use the same product setup.`;return batchReceipt?`The batch is complete and every Etsy link is recorded below.`:"Every required section is ready. Publishing will send these listings live, not to Etsy drafts."}
  async function loadPreviewDemo(){
    const imageResponse=await fetch('/mockups/pink-dorm-01-leaning-frame.png'),blob=await imageResponse.blob(),file=new File([blob],'western-poster.png',{type:blob.type||'image/png'}),secondFile=new File([blob],'cowgirl-poster.png',{type:blob.type||'image/png'});
    const details:TemplateDetails={id:'preview-poster',batchId:'preview-batch',title:'Matte vertical poster',description:'Museum-quality poster printed on premium matte paper.\n\nMade to order and carefully packaged for shipping.',blueprintId:1,blueprintTitle:'Matte Vertical Poster',brand:'Generic brand',model:'Matte Vertical Poster',provider:'Sensaria',enabledVariants:3,variants:[{id:101,title:'8×10',cost:650,templatePrice:1600,shipping:6.22},{id:102,title:'12×18',cost:1025,templatePrice:2400,shipping:6.22},{id:103,title:'24×36',cost:1850,templatePrice:3800,shipping:6.22}],shop:'Preview shop',standardShipping:6.22,shippingCurrency:'USD',shippingTemplateId:'9001',freeShipping:false,maxPrintWidth:7200,maxPrintHeight:10800,placementScale:1};
    const previewCategory:EtsyCategoryOption={id:1,path:'Home & Living · Wall Decor · Prints'};
    const etsy:EtsyDetails={category:previewCategory.path,taxonomyId:previewCategory.id,properties:[],attributes:{},optional:{},blurb:'',confidence:'high'};
    const previewFiles:DesignFile[]=[{name:file.name,size:file.size,id:'preview-design-1',file,previewUrl:URL.createObjectURL(file),title:'western wall art, cowgirl poster, pink western decor',tags:['western wall art','cowgirl poster','pink western decor'],width:6000,height:9000,paddingStatus:'full',etsy},{name:secondFile.name,size:secondFile.size,id:'preview-design-2',file:secondFile,previewUrl:URL.createObjectURL(secondFile),title:'retro cowgirl print, western poster, dorm wall art',tags:['retro cowgirl print','western poster','dorm wall art'],width:6000,height:9000,paddingStatus:'full',etsy}];
    const profile:EtsyShippingProfile={id:9001,title:'Poster shipping · $4 US',originCountry:'United States',currency:'USD',domesticPrimary:4,domesticAdditional:2.5,international:[{key:'CA',label:'Canada',primary:13.92,additional:8.5},{key:'EU',label:'European Union',primary:17.42,additional:10.25}]};
    setTemplate('https://printify.com/app/products/preview');setTemplateDetails(details);setDescription(details.description);setFiles(previewFiles);setDrafts(previewFiles.map((design,index)=>({id:`preview-draft-${index+1}`,clientId:design.id,name:design.name,title:design.title,tags:design.tags,previewUrl:'/mockups/pink-dorm-01-leaning-frame.png',printifyImages:['/mockups/pink-dorm-01-leaning-frame.png','/mockups/pink-dorm-02-hanging-poster.png','/mockups/pink-dorm-03-maximalist-bed.png'],editorUrl:'https://printify.com/app/products',status:'Created'})));setEtsyCategories([previewCategory]);setEtsyShippingProfiles([profile]);setEtsyShippingProfileId(profile.id);setVariantPrices({'101':1600,'102':2400,'103':3800});setPricingApproved(false);setComplete(true);setFinishPhase('details');setWorkflowStep('review');const url=new URL(window.location.href);url.searchParams.set('step','review');window.history.replaceState({},'',url);window.scrollTo({top:0,behavior:'smooth'});
  }

  function confirmUploadInterruption(){return !running||window.confirm("Are you sure you want to leave this step? Doing so may halt your current design uploads before the Printify drafts are finished.")}
  function stopWith(title:string,issues:string[],copy?:string){setBlockingModal({title,issues,copy});return false}
  function requiredForProgress(index:number){const step:WorkflowStep=index>=5?"finish":index>=3?"review":index===2?"designs":index===1?"setup":"connect";const issues=requiredForStep(step);if(index>=6){if(files.some(file=>!file.title.trim()))issues.push("Finish every listing title.");if(files.some(file=>!file.tags.length))issues.push("Finish every listing’s tags.");if(!description.trim())issues.push("Add the reusable product description.");}if(index>=7){if(files.some(file=>!file.etsy))issues.push("Review and save the Etsy details for every listing.");if(files.some(file=>personalizationProblem(file.etsy)))issues.push("Finish the required personalization settings.");}if(index>=8&&drafts.some(draft=>draft.id&&!(printifyImageSelections[draft.id]??printifyImageIndices).length))issues.push("Choose at least one Printify listing image for every listing.");return [...new Set(issues)]}
  function requiredForStep(step:WorkflowStep){if(localPreview)return [];const issues:string[]=[];if(step!=="connect"&&!connected)issues.push("Connect your Printify account.");if(step!=="connect"&&!etsyConnected)issues.push("Connect the Etsy shop that will receive these listings.");if(["designs","review","finish"].includes(step)){if(!productSelected)issues.push("Save or select a product or product bundle.");if(!templateDetails?.shippingTemplateId&&!templateDetails?.shippingProfileNeedsSelection)issues.push("Choose a valid Printify product with an imported shipping profile.");if(!templateDetails?.enabledVariants)issues.push("The product needs at least one enabled size or color.");if(!templateDetails?.batchId)issues.push("Reload the Printify product so Goldie can prepare this batch.");}if(["review","finish"].includes(step)){if(!files.length)issues.push("Add at least one finished design.");if(files.some(file=>!file.width||!file.height||file.paddingStatus==="checking"))issues.push("Wait until every design finishes loading and checking.");}if(step==="finish"){if(!etsyShippingProfileId)issues.push("Choose the Etsy shipping profile for this batch.");if(!pricingApproved)issues.push("Review and approve every enabled variant price.");if(!complete)issues.push("Create every Printify draft first.");if(drafts.some(draft=>draft.status==="Failed")||drafts.filter(draft=>draft.status==="Created").length!==files.length)issues.push("Retry failed drafts until every design has a matching Printify draft.");}return issues}
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
  function goToStep(step:WorkflowStep,replace=false,force=false){if(!force){const issues=requiredForStep(step);if(issues.length)return stopWith("Finish all sections first.",issues);if(!canOpenStep(step))return;}setWorkflowStep(step);const url=new URL(window.location.href);url.searchParams.set("step",step);window.history[replace?"replaceState":"pushState"]({},"",url);window.scrollTo({top:0,behavior:"smooth"})}

  useEffect(()=>{const read=()=>{const url=new URL(window.location.href),value=url.searchParams.get("step") as WorkflowStep|null,phase=url.searchParams.get("phase") as FinishPhase|null;if(value&&WORKFLOW_STEPS.some(step=>step.id===value))setWorkflowStep(value);if(phase&&["details","etsy","mockups","final"].includes(phase))setFinishPhase(phase)};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read)},[]);
  useEffect(()=>{if(workflowStep!=="finish")return;const url=new URL(window.location.href);url.searchParams.set("phase",finishPhase);window.history.replaceState({},"",url)},[workflowStep,finishPhase]);
  useEffect(()=>{if(workflowStep==="finish")window.scrollTo({top:0,behavior:"smooth"})},[workflowStep,finishPhase]);
  // Do not auto-skip the connection screen. Sellers need to see the status of
  // both accounts and use the explicit Continue action.
  useEffect(()=>{if(localPreview||checkingConnection||restoringBatch||canOpenStep(workflowStep))return;const fallback=!connected||!etsyConnected?"connect":!templateLoaded?"setup":!files.length?"designs":!complete?"review":"finish";goToStep(fallback,true,true);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[localPreview,checkingConnection,restoringBatch,connected,etsyConnected,templateLoaded,files.length,complete,workflowStep]);

  useEffect(()=>{void(async()=>{try{const url=new URL(window.location.href);const id=url.searchParams.get("batch")||"";if(!id)return;const response=await fetch(`/api/batches?id=${encodeURIComponent(id)}`);if(!response.ok)return;const payload=await response.json() as {batch?:{id:string;step:WorkflowStep;status:string;state?:Record<string,unknown>}};if(!payload.batch?.state)return;const state=payload.batch.state as {template?:string;templateDetails?:TemplateDetails;description?:string;pricing?:Pricing;mockupTheme?:string;activeRecipe?:Recipe;activeBundle?:ProductBundle;bundleRecipes?:Recipe[];bundleIndex?:number;designs?:Array<Omit<DesignFile,"file"|"previewUrl">>;drafts?:DraftResult[];complete?:boolean;finishPhase?:FinishPhase;bulkTitles?:string;printifyImageIndices?:number[];printifyImageSelections?:Record<string,number[]>;variantPrices?:Record<string,number>;etsyShippingProfileId?:number;pricingApproved?:boolean;sizeGuideName?:string;batchKeywords?:string[];titleJoiner?:string;titleBuilderMode?:"ai"|"manual";autoTitleBankId?:string;manualKeywordBankId?:string;sharedMockups?:{theme:string;ids:string[]};preparedMockupCounts?:Record<string,number>};const cached=await loadBatchFiles(id).catch(()=>[]);const designs=(state.designs||[]).map((design,index)=>{const file=cached[index];return file?{...design,file,previewUrl:URL.createObjectURL(file)}:null}).filter(Boolean) as DesignFile[];batchIdRef.current=id;setTemplate(state.template||"");setTemplateDetails(state.templateDetails||null);setDescription(state.description||"");if(state.pricing)setPricing(state.pricing);setVariantPrices(state.variantPrices||{});setEtsyShippingProfileId(Number(state.etsyShippingProfileId)||0);setPricingApproved(Boolean(state.pricingApproved));setMockupTheme(state.mockupTheme||"");setActiveRecipe(state.activeRecipe||null);setActiveBundle(state.activeBundle||null);setBundleRecipes(state.bundleRecipes||[]);setBundleIndex(Math.max(0,Number(state.bundleIndex)||0));setFiles(designs);setDrafts(state.drafts||[]);setComplete(Boolean(state.complete));setFinishPhase(state.finishPhase||"details");setBulkTitles(state.bulkTitles||"");setBatchKeywords(state.batchKeywords||[]);setTitleJoiner(state.titleJoiner||", ");setTitleBuilderMode(state.titleBuilderMode||"ai");setAutoTitleBankId(state.autoTitleBankId||"");setManualKeywordBankId(state.manualKeywordBankId||"");setSharedMockups(state.sharedMockups);setPreparedMockupCounts(state.preparedMockupCounts||{});setPrintifyImageIndices(state.printifyImageIndices||[]);setPrintifyImageSelections(state.printifyImageSelections||{});setSizeGuideName(state.sizeGuideName||"");setResumeProcessing(payload.batch.status==="processing"&&designs.length>0);const step=payload.batch.step||"connect";setWorkflowStep(step);url.searchParams.set("step",step);window.history.replaceState({},"",url);if(payload.batch.status==="processing"&&state.template)void loadTemplateUrl(state.template)}finally{snapshotReady.current=true;setRestoringBatch(false)}})()},[]);
  useEffect(()=>{setLocalPreview(["localhost","127.0.0.1"].includes(window.location.hostname));fetch("/api/account").then(response=>response.json()).then((result:{signedIn?:boolean})=>setSignedIn(Boolean(result.signedIn))).catch(()=>setSignedIn(null))},[]);
  useEffect(()=>{if(signedIn!==true||publishing)return;const jobId=window.localStorage.getItem("goldie-active-publish-job");if(jobId)void monitorPublishJob(jobId);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[signedIn]);

  useEffect(()=>{if(!resumeProcessing||resumeAttempted.current||!connected||!templateLoaded||!files.length)return;resumeAttempted.current=true;setResumeProcessing(false);const succeeded=new Set(drafts.filter(draft=>draft.status==="Created").map(draft=>draft.clientId));const remaining=files.filter(file=>!succeeded.has(file.id));if(remaining.length)void runDrafts(remaining,true)},[resumeProcessing,connected,templateLoaded,files,drafts]);

  useEffect(()=>{if(!snapshotReady.current||restoringBatch||(!files.length&&!drafts.length))return;const timer=window.setTimeout(()=>{const id=batchIdRef.current||crypto.randomUUID();batchIdRef.current=id;window.localStorage.setItem("goldie-active-batch",id);const designs=files.map(({file:ignoredFile,previewUrl:ignoredPreview,...design})=>design);void fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:running?"processing":complete?drafts.some(draft=>draft.status==="Failed")?"needs_attention":"complete":"draft",step:workflowStep,setupName:activeBundle?.name||activeRecipe?.name||"",productTitle:templateDetails?.blueprintTitle||"",designCount:files.length,state:{template,templateDetails,description,pricing,variantPrices,etsyShippingProfileId,pricingApproved,mockupTheme,activeRecipe,activeBundle,bundleRecipes,bundleIndex,designs,drafts,complete,finishPhase,bulkTitles,batchKeywords,titleJoiner,titleBuilderMode,autoTitleBankId,manualKeywordBankId,sharedMockups,preparedMockupCounts,printifyImageIndices,printifyImageSelections,sizeGuideName}})})},700);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[restoringBatch,workflowStep,finishPhase,template,templateDetails,description,pricing,variantPrices,etsyShippingProfileId,pricingApproved,mockupTheme,activeRecipe,activeBundle,bundleRecipes,bundleIndex,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}:${file.blurb||""}:${file.descriptionOverride??""}:${file.sizeGuideName||""}:${JSON.stringify(file.etsy||{})}`).join(";"),drafts,complete,running,bulkTitles,batchKeywords,titleJoiner,titleBuilderMode,autoTitleBankId,manualKeywordBankId,sharedMockups,preparedMockupCounts,printifyImageIndices,printifyImageSelections,sizeGuideName]);

  useEffect(() => {
    fetch("/api/printify")
      .then((response) => response.json())
      .then((result: { connected?: boolean; owner?: boolean; reason?: string; warning?: string }) => { setConnected(Boolean(result.connected)); setOwner(Boolean(result.owner)); if (result.reason || result.warning) setConnectionError(result.reason || result.warning || ""); })
      .catch(() => setConnected(false))
      .finally(() => setCheckingConnection(false));
  }, []);

  useEffect(()=>{fetch("/api/seller-preferences").then(response=>response.json()).then((result:{pricing?:Partial<Pricing>|null})=>{if(!result.pricing)return;setPricing(current=>({...current,etsyFeePercent:Number(result.pricing?.etsyFeePercent??current.etsyFeePercent),fixedFee:Number(result.pricing?.fixedFee??current.fixedFee),listingFee:Number(result.pricing?.listingFee??current.listingFee)}))}).catch(()=>undefined)},[]);

  useEffect(()=>{fetch("/api/etsy").then(response=>response.json()).then((result:{connected?:boolean;shopName?:string})=>{setEtsyConnected(Boolean(result.connected));setEtsyShop(result.shopName||"")}).catch(()=>setEtsyConnected(false));const message=new URL(window.location.href).searchParams.get("etsy");if(message){if(message==="connected"){setEtsyConnected(true);setEtsyError("")}else setEtsyError(message);const url=new URL(window.location.href);url.searchParams.delete("etsy");window.history.replaceState({},"",url)}},[]);
  async function loadEtsyShippingProfiles(preselect=0){setShippingProfilesLoading(true);setShippingProfilesError("");try{const response=await fetch("/api/etsy/shipping-profiles"),result=await response.json() as {profiles?:EtsyShippingProfile[];error?:string};if(!response.ok)throw new Error(result.error||"Your Etsy shipping profiles could not be loaded.");const profiles=result.profiles||[];setEtsyShippingProfiles(profiles);setEtsyShippingProfileId(current=>{const wanted=preselect||current;return wanted&&profiles.some(profile=>profile.id===wanted)?wanted:0})}catch(error){setShippingProfilesError(error instanceof Error?error.message:"Your Etsy shipping profiles could not be loaded.")}finally{setShippingProfilesLoading(false)}}
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
        issues=[...(!localPreview&&!etsyConnected?["Connect the Etsy shop that will receive these listings."]:[]),...missingPublishFields().map(field=>`${field} must be completed before publishing.`),...requiredForStep("finish")];
      }
      if(!issues.length)return;
      event.preventDefault();event.stopImmediatePropagation();stopWith("Finish all sections first.",[...new Set(issues)]);
    };
    document.addEventListener("click",guardFinalActions,true);
    return()=>document.removeEventListener("click",guardFinalActions,true);
  },[files,description,printifyImageIndices,pricingApproved,complete,drafts,connected,templateDetails,etsyConnected,localPreview]);

  useEffect(()=>{if(localPreview||!complete)return;const pending=files.filter(file=>!file.etsy&&file.title.trim());if(!pending.length)return;const timer=window.setTimeout(()=>{setPreparingEtsy(true);void runBounded(pending,2,async file=>{await prepareOne(file);return file},()=>undefined).finally(()=>setPreparingEtsy(false))},900);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[localPreview,complete,files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);
  useEffect(()=>{if(localPreview||!complete)return;const pending=files.filter(file=>{const draft=drafts.find(item=>item.clientId===file.id);const signature=`${file.title}\n${file.tags.join("|")}`;return Boolean(draft?.id&&file.title.trim()&&syncedListingSignatures.current.get(file.id)!==signature)});if(!pending.length)return;setDrafts(current=>current.map(draft=>{const file=files.find(item=>item.id===draft.clientId);return file?{...draft,title:file.title,tags:file.tags}:draft}));const timer=window.setTimeout(()=>{void Promise.all(pending.map(async file=>{try{await syncListingFields(file);syncedListingSignatures.current.set(file.id,`${file.title}\n${file.tags.join("|")}`)}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"Printify could not save this listing."})}}))},600);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[localPreview,complete,drafts.map(draft=>draft.id||draft.clientId).join(";"),files.map(file=>`${file.id}:${file.title}:${file.tags.join("|")}`).join(";")]);

  useEffect(()=>{if(localPreview||!complete||preparingEtsy)return;const prepared=files.filter(file=>file.etsy);if(!prepared.length)return;const timer=window.setTimeout(()=>{void runBounded(prepared,2,async file=>{try{await syncPreparedListing(file,file.etsy!);updateDesign(file.id,{etsyError:""})}catch(error){updateDesign(file.id,{etsyError:error instanceof Error?error.message:"The listing changes could not be saved."})}return file},()=>undefined)},1200);return()=>window.clearTimeout(timer);// eslint-disable-next-line react-hooks/exhaustive-deps
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
    const available=Math.max(0,MAX_BATCH_FILES-files.length),images=unique.slice(0,available),limitCount=unique.length-images.length;
    if(!images.length){if(duplicateCount){setFileError("");setFileNotice(`${duplicateCount===1?"That design is":"Those designs are"} already in this batch. No duplicate was added.`)}else{setFileNotice("");setFileError(`This batch already has ${MAX_BATCH_FILES} designs.`)}if(folderPicker.current)folderPicker.current.value="";if(imagePicker.current)imagePicker.current.value="";return}
    const combined=[...files,...images];
    setFileError("");setFileNotice([`${images.length} ${images.length===1?"design was":"designs were"} added.`,duplicateCount?`${duplicateCount} exact ${duplicateCount===1?"duplicate was":"duplicates were"} skipped.`:"",limitCount?`${limitCount} ${limitCount===1?"design was":"designs were"} not added because this batch is limited to ${MAX_BATCH_FILES}.`:""].filter(Boolean).join(" "));
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

  function updateDesign(id: string, change: Partial<DesignFile>) { setFiles((current) => current.map((file) => file.id === id ? { ...file, ...change } : file)); if(change.title!==undefined)setDrafts(current=>current.map(draft=>draft.clientId===id?{...draft,title:change.title}:draft)); }
  function pulseTitle(id:string){setTitlePulseIds(current=>new Set(current).add(id));window.setTimeout(()=>setTitlePulseIds(current=>{const next=new Set(current);next.delete(id);return next}),520)}
  function applyBulkTitles() { const titles = bulkTitles.split(/\r?\n/).map((v) => v.replace(/^"|"$/g, "").trim()).filter(Boolean); setFiles((current) => current.map((file, index) => titles[index] ? { ...file, title: titles[index], tags: tagsFromTitle(titles[index]),etsy:undefined,etsyError:"" } : file)); }
  async function importTitleCsv(list: FileList | null) { const file = list?.[0]; if (!file) return; const values = titlesFromCsv(await file.text()); setBulkTitles(values.join("\n")); setFiles((current) => current.map((design, index) => values[index] ? { ...design, title: values[index].slice(0, 140), tags: tagsFromTitle(values[index]),etsy:undefined,etsyError:"" } : design)); if (csvPicker.current) csvPicker.current.value = ""; }
  function clearCurrentBatch(clearProduct=true){
    const priorBatch=batchIdRef.current;
    if(priorBatch){void clearBatchFiles(priorBatch);void fetch(`/api/batches?id=${encodeURIComponent(priorBatch)}`,{method:"DELETE"})}
    drafts.forEach(draft=>{if(draft.id)void fetch(`/api/etsy/images?productId=${encodeURIComponent(draft.id)}`,{method:"DELETE"})});
    batchIdRef.current="";window.localStorage.removeItem("goldie-active-batch");
    const freshUrl=new URL(window.location.href);freshUrl.searchParams.delete("batch");window.history.replaceState({},"",freshUrl);
    files.forEach(file=>URL.revokeObjectURL(file.previewUrl));
    templateLoadVersion.current+=1;setLoadingTemplate(false);setFiles([]);setFileError("");setDrafts([]);setProcessed(0);setRunTotal(0);setComplete(false);setOpenedDrafts([]);setOpenAllMessage("");setBulkTitles("");setBatchKeywords([]);setTitleJoiner(", ");setTitleBuilderMode("ai");setAutoTitleBank(null);setAutoTitleBankId("");setManualKeywordBankId("");setActiveDesign("");setPreflightOpen(false);setUploadNoticeOpen(false);setPrintifyImageIndices([]);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");syncedListingSignatures.current.clear();
    if(clearProduct){setTemplate("");setTemplateDetails(null);setTemplateError("");setDescription("");setMockupTheme("");setActiveRecipe(null);setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);setPricing(current=>({...current,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0}))}
    if (folderPicker.current) folderPicker.current.value = "";
    if (imagePicker.current) imagePicker.current.value = "";
    if (csvPicker.current) csvPicker.current.value = "";
  }
  function selectRecipe(recipe:Recipe){setActiveRecipe(recipe);setPrintifyImageIndices(recipe.printifyImageIndices||[]);setEtsyShippingProfileId(Number(recipe.etsyShippingProfileId)||0);setTemplate(recipe.templateUrl);setMockupTheme("");const nextPricing={...pricing,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);void loadTemplateUrl(recipe.templateUrl,nextPricing,Number(recipe.etsyShippingProfileId)||0)}
  function useRecipe(recipe: Recipe) { const changingProduct=Boolean((activeRecipe?.id&&activeRecipe.id!==recipe.id)||(template&&template!==recipe.templateUrl));if(changingProduct&&(files.length>0||drafts.length>0||complete)){const count=files.length;if(!window.confirm(`Switch to “${recipe.name}” and start a new batch? This removes ${count} ${count===1?"design":"designs"} and all work from the current batch on this page.`))return false;clearCurrentBatch(false)}setActiveBundle(null);setBundleRecipes([]);setBundleIndex(0);selectRecipe(recipe);return true; }
  function useBundle(bundle:ProductBundle,recipes:Recipe[]){
    if(recipes.length<2){stopWith("This product bundle needs attention.",["Choose at least two available saved products."]);return false}
    if((files.length>0||drafts.length>0||complete)&&!window.confirm(`Start “${bundle.name}” and clear the current batch? Your current designs and unfinished work will be removed.`))return false;
    clearCurrentBatch(true);setActiveBundle(bundle);setBundleRecipes(recipes);setBundleIndex(0);selectRecipe(recipes[0]);return true;
  }
  async function continueBundle(){
    const next=bundleRecipes[bundleIndex+1];if(!activeBundle||!next)return;
    const carriedFiles=files.map(file=>({...file,id:crypto.randomUUID(),previewUrl:URL.createObjectURL(file.file),blurb:undefined,descriptionOverride:undefined,sizeGuideName:undefined,etsy:undefined,etsyError:""}));
    const nextBatchId=crypto.randomUUID();batchIdRef.current=nextBatchId;window.localStorage.setItem("goldie-active-batch",nextBatchId);const url=new URL(window.location.href);url.searchParams.set("batch",nextBatchId);url.searchParams.set("step","review");url.searchParams.delete("phase");window.history.pushState({},"",url);
    setBundleIndex(current=>current+1);setDrafts([]);setComplete(false);setProcessed(0);setRunTotal(0);setOpenedDrafts([]);setOpenAllMessage("");setPreflightOpen(false);setPrintifyImageSelections({});setSharedMockups(undefined);setPreparedMockupCounts({});setFinishPhase("details");setVariantPrices({});setPricingApproved(false);setSizeGuideName("");setSizeGuideStatus("");setBatchReceipt(null);setPublishMessage("");setFiles(carriedFiles);setDescription("");setActiveDesign("");syncedListingSignatures.current.clear();
    await saveBatchFiles(nextBatchId,carriedFiles.map(file=>file.file)).catch(()=>undefined);setActiveRecipe(next);setPrintifyImageIndices(next.printifyImageIndices||[]);setEtsyShippingProfileId(Number(next.etsyShippingProfileId)||0);setTemplate(next.templateUrl);setMockupTheme("");const nextPricing={...pricing,targetProfit:DEFAULT_PRICING.targetProfit,shippingCost:0,shippingCharged:0};setPricing(nextPricing);setTemplateDetails(null);await loadTemplateUrl(next.templateUrl,nextPricing,Number(next.etsyShippingProfileId)||0);setWorkflowStep("review");window.scrollTo({top:0,behavior:"smooth"});
  }
  async function createCustomShippingProfile(baseProfileId:number,domesticPrimary:number,domesticAdditional:number,title:string,international:InternationalShippingRate[]){const response=await fetch("/api/etsy/shipping-profiles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({baseProfileId,domesticPrimary,domesticAdditional,title,international})}),result=await response.json() as {id?:number;error?:string};if(!response.ok||!result.id)throw new Error(result.error||"The Etsy shipping profile could not be saved.");await loadEtsyShippingProfiles(result.id);if(activeRecipe){const updated={...activeRecipe,etsyShippingProfileId:result.id};await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(updated)});setActiveRecipe(updated)}setPricingApproved(false)}
  function startNewProduct(){
    if((files.length>0||drafts.length>0||complete)&&!window.confirm("Add a new product and clear the current product setup? Any designs and unfinished work in this batch will be removed."))return false;
    clearCurrentBatch(true);
    return true;
  }
  async function saveImagePreferences(indices:number[]){if(!activeRecipe)return;setPrintifyImageIndices(indices);await fetch("/api/product-recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...activeRecipe,printifyImageIndices:indices})});setActiveRecipe({...activeRecipe,printifyImageIndices:indices})}
  function applyBatchTitle(title:string,explicitTags?:string[]){const next=title.slice(0,140);setFiles(current=>current.map(file=>({...file,title:next,tags:explicitTags||tagsFromTitle(next),etsy:undefined,etsyError:""})))}
  function addBatchKeyword(keyword:string){if(batchKeywords.some(value=>value.toLocaleLowerCase()===keyword.trim().toLocaleLowerCase()))return;const next=[...batchKeywords,keyword.trim()];setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function removeBatchKeyword(keyword:string){const next=batchKeywords.filter(value=>value!==keyword);setBatchKeywords(next);applyBatchTitle(next.join(titleJoiner),tagsFromTitle(next.join(", ")))}
  function clearBatchKeywords(){setBatchKeywords([]);applyBatchTitle("",[])}
  function changeTitleJoiner(joiner:string){setTitleJoiner(joiner);if(batchKeywords.length)applyBatchTitle(batchKeywords.join(joiner),tagsFromTitle(batchKeywords.join(", ")))}
  async function buildBatchTitle(){if(!autoTitleBank)return setTitleBuildMessage("Choose a keyword bank first.");setTitleBuilding(true);setTitleBuildMessage(`Creating 0 of ${files.length} titles…`);let completed=0,failed=0;await runBounded(files,2,async design=>{try{const result=await autoTitleForDesign(design,autoTitleBank.keywords,titleJoiner===", ",templateDetails);return {design,result}}catch(error){return {design,error:error instanceof Error?error.message:"Goldie could not create this title."}}},item=>{completed+=1;if("result" in item&&item.result){updateDesign(item.design.id,{title:item.result.title,tags:tagsFromTitle(item.result.keywords.join(", ")),etsy:undefined,etsyError:""});pulseTitle(item.design.id)}else failed+=1;setTitleBuildMessage(`Creating ${completed} of ${files.length} titles…`)});setTitleBuildMessage(failed?`${files.length-failed} titles created. ${failed} need to be retried individually.`:`✓ ${files.length} unique titles and matching tags created. Review them below.`);setTitleBuilding(false);window.setTimeout(()=>listingResultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),100)}

  function missingPublishFields(){const missing:string[]=[];if(files.some(file=>!file.title.trim()))missing.push("Titles");if(files.some(file=>!file.tags.length))missing.push("Tags");if(!description.trim())missing.push("Permanent product description");if(files.some(file=>!file.etsy))missing.push("Etsy details");return missing}
  function openPublishConfirmation(){const missing=missingPublishFields();if(missing.length)return void stopWith("Complete every required listing field.",missing.map(field=>`${field} must be completed before publishing.`));const workflowIssues=requiredForStep("finish");if(workflowIssues.length)return void stopWith("This batch cannot be published yet.",workflowIssues);setPublishConfirmOpen(true)}
  async function monitorPublishJob(jobId:string){
    setPublishing(true);setPublishMessage("Goldie is safely resuming your queued batch…");
    try{let job:{id:string;status:string;total:number;completed:number;failed:number;queued:number;processing:number;finished:Array<{etsyListingId:number;url:string}>;budget?:{remaining:number}}|undefined;
      while(!job||!["completed","needs_attention"].includes(job.status)){if(job){setPublishMessage(job.budget?.remaining!==undefined&&job.budget.remaining<25?"Your batch is safe in Goldie’s queue. Etsy’s shared allowance is resting before the next listing starts.":`Publishing safely: ${job.completed} of ${job.total} listings are live. You may leave this page and return later.`);await new Promise(resolve=>setTimeout(resolve,job.budget?.remaining!==undefined&&job.budget.remaining<25?30000:1500))}const response=await fetch(`/api/printify/drafts/publish?jobId=${encodeURIComponent(jobId)}`,{cache:"no-store"}),payload=await response.json() as {job?:typeof job;error?:string};if(!response.ok||!payload.job)throw new Error(payload.error||"Goldie could not check this queued batch.");job=payload.job}
      localStorage.removeItem("goldie-active-publish-job");if(job.status==="needs_attention")throw new Error(`${job.completed} of ${job.total} listings published. ${job.failed} ${job.failed===1?"listing needs":"listings need"} your attention before Goldie can finish the batch.`);setBatchReceipt({publishedCount:job.completed,etsyUrls:(job.finished||[]).map(item=>item.url).filter(Boolean),completedAt:new Date().toISOString()});setPublishMessage("");
    }catch(error){setPublishMessage(error instanceof Error?error.message:"Goldie could not resume this queued batch.")}finally{setPublishing(false)}
  }
  async function publishAll(){
    const ids=drafts.filter(draft=>draft.status==="Created"&&draft.id).map(draft=>draft.id!);if(!ids.length)return;setPublishConfirmOpen(false);setPublishing(true);setPublishMessage("Goldie is safely queuing every listing…");setBatchReceipt(null);
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

  async function loadTemplateUrl(productUrl = template, pricingOverride?:Pricing, savedShippingProfileId=0):Promise<TemplateDetails|null> {
    const requestVersion=++templateLoadVersion.current;
    setLoadingTemplate(true); setTemplateError(""); setTemplateDetails(null);
    try {
      const response = await fetchWithDeadline("/api/printify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productUrl,savedShippingProfileId }) }, 90000);
      const result = await response.json() as { product?: TemplateDetails; error?: string;issues?:string[] };
      if(requestVersion!==templateLoadVersion.current)return null;
      if (!response.ok || !result.product){setBlockingModal({title:"This Printify product isn’t ready yet.",issues:result.issues?.length?result.issues:[result.error||"The product could not be loaded."],copy:"Fix these items in Printify, save the product, then submit the same link again."});throw new Error(result.error || "The product could not be loaded.")}
      setTemplateDetails(result.product);setDescription(result.product.description||"");if(result.product.standardShipping!=null)setPricing(current=>({...current,shippingCost:result.product!.standardShipping!,shippingCharged:0}));setVariantPrices(Object.fromEntries((result.product.variants||[]).map(variant=>[String(variant.id),variant.templatePrice])));setPricingApproved(false); return result.product;
    } catch (error) { if(requestVersion===templateLoadVersion.current)setTemplateError(error instanceof Error ? error.message : "The template could not be loaded."); return null; }
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
            const fullDescription=[design.blurb||design.etsy?.blurb,description].filter(Boolean).join("\n\n");
            const response = await fetchWithDeadline("/api/printify/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId: templateDetails?.batchId, title: design.title || undefined, tags: design.tags, pricing, etsyBuyerShipping:etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.domesticPrimary||0, shippingTemplateId:etsyShippingProfileId, variantPrices, description:fullDescription, maxPlacementScale:isRigidPaperProduct(templateDetails)?1:undefined, fileName: upload.fileName, stagedId: staged.stagedId, supportReference: staged.reference, clientId: design.id }) }, 4 * 60 * 1000);
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
  async function prepareOne(design:DesignFile){try{const response=await fetch("/api/listing-intelligence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:await safeImagePreviewDataUrl(design.file,1200,false),product:{blueprintTitle:templateDetails?.blueprintTitle,brand:templateDetails?.brand,model:templateDetails?.model,description},title:design.title,tags:design.tags})}),payload=await response.json() as {details?:EtsyDetails;error?:string};if(!response.ok||!payload.details)throw new Error(payload.error||"Etsy details could not be prepared.");const initial={...payload.details,blurb:design.blurb?.trim()||payload.details.blurb},details=await resolveEtsyOptions(initial);const updatedDesign={...design,blurb:details.blurb};await syncListingFields(updatedDesign,details);updateDesign(design.id,{blurb:details.blurb,etsy:details,etsyError:""});return details}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be prepared."});return null}}
  async function changeEtsyCategory(design:DesignFile,taxonomyId:number){if(!design.etsy)return;try{const details=await resolveEtsyOptions(design.etsy,taxonomyId);updateDesign(design.id,{etsy:details,etsyError:""})}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy options could not be loaded."})}}
  async function continueToEtsyDetails(){const missing:string[]=[];if(files.some(file=>!file.title.trim()))missing.push("Every listing needs a title.");if(files.some(file=>!file.tags.length))missing.push("Every listing needs at least one tag.");if(!description.trim())missing.push("Add the reusable product description.");if(missing.length)return void stopWith("Finish all sections first.",missing);setPreparingEtsy(true);try{let failed=0;await runBounded(files,2,prepareOne,result=>{if(!result)failed+=1});if(failed)return void stopWith("Goldie could not complete every Etsy listing.",[`${failed} ${failed===1?"listing needs":"listings need"} another attempt. Use the retry button beside each listing.`]);setFinishPhase("etsy");window.scrollTo({top:0,behavior:"smooth"})}finally{setPreparingEtsy(false)}}
  async function saveAllEtsyDetails(){const unfinished=files.filter(file=>!file.etsy);if(unfinished.length)return void stopWith("Finish every Etsy listing first.",unfinished.map(file=>`${file.name} still needs Etsy details.`));const invalid=files.map(file=>({file,problem:personalizationProblem(file.etsy)})).filter(item=>item.problem);if(invalid.length)return void stopWith("Finish the personalization options first.",invalid.map(item=>`${item.file.name}: ${item.problem}`));setSavingEtsyDetails(true);try{let failed=0;await runBounded(files,2,async design=>{try{await syncListingFields(design,design.etsy!);return true}catch(error){updateDesign(design.id,{etsyError:error instanceof Error?error.message:"Etsy details could not be saved."});return false}},saved=>{if(!saved)failed+=1});if(failed)return void stopWith("Some Etsy details were not saved.",[`${failed} ${failed===1?"listing needs":"listings need"} another attempt.`]);setFinishPhase("mockups");window.scrollTo({top:0,behavior:"smooth"})}finally{setSavingEtsyDetails(false)}}
  function createDrafts() {const issues=requiredForStep("review");if(issues.length)return void stopWith("This batch isn’t ready to create.",issues);if(!etsyShippingProfileId)return void stopWith("Choose shipping before creating drafts.",["Choose the Etsy shipping profile Goldie should apply to every listing."]);if(!pricingApproved)return void stopWith("Finish shipping first.",["Choose a shipping profile, then save or discard any custom shipping profile changes."]);setPreflightOpen(true);}
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
    connect: { eyebrow: "STEP 1 OF 9", title: "Connect Printify", copy: "Connect the Printify shop where Goldie will create your product drafts." },
    setup: { eyebrow: "STEP 2 OF 9", title: "Choose product", copy: "Choose a saved product or connect a completed Printify template." },
    designs: { eyebrow: "STEP 3 OF 9", title: "Add your designs", copy: "Add up to 20 finished designs for this batch." },
    review: { eyebrow: "STEP 4 OF 9", title: "Review pricing", copy: "Review every enabled variation before Goldie creates the drafts." },
    finish: finishPhase==="details" ? { eyebrow: "STEP 6 OF 9", title: "Titles, tags + descriptions", copy: "Create the titles and tags, then review the description for every listing." } : finishPhase==="etsy" ? { eyebrow: "STEP 7 OF 9", title: "Etsy listing details", copy: "Review the Etsy category and product-specific details." } : finishPhase==="mockups" ? { eyebrow: "STEP 8 OF 9", title: "Images + mockups", copy: "Choose the final images for every listing." } : { eyebrow: "STEP 9 OF 9", title: "Final review", copy: "Review every listing before publishing it live on Etsy." },
  }[workflowStep];

  return (
    <main className="app-shell">
      <section className="mobile-gate" aria-label="Desktop required">
        <div className="mobile-brand"><div className="approved-wm">Gold<span className="approved-i">ı<span>✦</span></span>e</div><div className="approved-sub">Listing Factory</div></div>
        <div className="mobile-card"><div className="mobile-command">⌘</div><h1>Oops, this one needs a bigger screen.</h1><p>Goldie Listing Factory is built for desktop. Hop onto your computer and sign in. Your saved work will be waiting for you.</p><div className="mobile-saved">✓ Your progress is saved automatically.</div></div>
        <div className="mobile-footer">Powered by Goldie AI · © 2026 Be A Wolf Biz</div>
      </section>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="approved-brand" aria-label="Goldie Listing Factory"><div className="approved-wm">Gold<span className="approved-i">ı<span>✦</span></span>e</div><div className="approved-sub">Listing Factory</div></div>
        </div>
        <div className="top-actions">
          <nav className="top-nav" aria-label="Goldie navigation">
            <a className="active" href="/" onClick={event=>guardNavigation(event,"/")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l1-4h16l1 4M3 9h18M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M9 13h6"/></svg>Listing Factory</a>
            <a href="/batches" onClick={event=>guardNavigation(event,"/batches")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>Batch History</a>
            <a href="/keywords" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a3 3 0 00-3 3 3 3 0 00-2 5.2A3 3 0 009 19a3 3 0 006 0 3 3 0 002-5.8A3 3 0 0015 8a3 3 0 00-3-3z"/><path d="M12 5v14"/></svg>Keyword Banks</a>
            <a href="/mockups" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/></svg>Mockup Sets</a>
            <a href="/usage" onClick={event=>guardNavigation(event,"/usage")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3.5v5c0 4.6-3.2 8.6-8 9.5-4.8-.9-8-4.9-8-9.5v-5L12 3z"/><path d="M9.2 12.2l1.9 1.9 3.9-3.9"/></svg>Usage</a>
          </nav>
          <GoldieCommandBar data={commandCenterData} onUseProduct={recipe=>{if(useRecipe(recipe))goToStep("setup")}} onStartBlank={()=>{clearCurrentBatch(true);goToStep("setup")}}/>
          {owner && <a className="diagnostics-link" href="/mastermind-admin" aria-label="Open Goldie Diagnostics" title="Goldie Diagnostics">★</a>}
          <a className="usage-link" href="/usage" onClick={event=>guardNavigation(event,"/usage")}>Usage + plan</a>
          {signedIn!==null&&(localPreview&&!signedIn?<span className="account-link" title="Account sign-in is available on the published Listing Factory site.">Preview mode</span>:<a className="account-link" href={signedIn?"/account/sign-out?return_to=%2Fmastermind":"/account/sign-in?return_to=%2Fmastermind"}>{signedIn?"Sign out":"Sign in"}</a>)}
        </div>
        <div className="approved-sidebar-footer"><a className="approved-usage" href="/usage"><b>Usage</b><span>{sidebarUsage.used} / {sidebarUsage.limit} listings</span><div className="approved-usage-track" aria-hidden="true"><i style={{width:`${Math.min(100,sidebarUsage.used/sidebarUsage.limit*100)}%`}} /></div></a><div className="approved-powered"><span>Powered by</span><b>Gold<span className="approved-footer-i">ı<i>✦</i></span>e AI</b></div><small>© 2026 Be A Wolf Biz</small></div>
      </header>

      {running&&uploadNoticeOpen&&<div className="upload-notice-backdrop" role="presentation"><section className="upload-notice" role="alertdialog" aria-modal="true" aria-labelledby="upload-notice-title" aria-describedby="upload-notice-copy"><span className="upload-notice-icon">!</span><p className="mini-label">UPLOADS IN PROGRESS</p><h2 id="upload-notice-title">Wait. Your files are still uploading.</h2><p id="upload-notice-copy">Are you sure you want to leave? Leaving now may stop the unfinished uploads.</p><div className="upload-notice-progress"><span className="upload-guard-pulse"/><b>{processed} of {runTotal} finished</b></div><div className="upload-notice-actions"><button autoFocus onClick={()=>{setUploadNoticeOpen(false);setLeaveTarget("")}}>Stay on this page</button><button className="danger" onClick={()=>{if(leaveTarget)window.location.href=leaveTarget}}>Leave and stop uploads</button></div></section></div>}

      {false&&<ReturningCommandCenter printifyConnected={connected} etsyConnected={etsyConnected} onData={setCommandCenterData} onUseProduct={recipe=>{if(useRecipe(recipe))goToStep("setup")}} onStartBlank={()=>{clearCurrentBatch(true);goToStep("setup")}}/>}

      {!returningHome&&<section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{workflowHero.eyebrow}</p>
          <h1>{workflowHero.title}</h1>
          <p className="hero-step-count">Step {progressIndex+1} of {PROGRESS_STEPS.length}</p>
          <p className="hero-copy">{workflowHero.copy}</p>
          {workflowStep==="connect"&&<div className="value-proof" aria-label="What this batch supports"><span><b>Up to 20 designs</b><small>in one batch</small></span><span><b>Costs and fees</b><small>shown for every variant</small></span><span><b>You approve</b><small>before anything goes live</small></span></div>}
        </div>
      </section>}

      {!returningHome&&<section className={`workspace ${complete&&workflowStep==="finish"&&finishPhase==="mockups"?"mockup-workspace":""}`}>
        <nav className="workflow-progress" aria-label="Listing Factory progress">
          <div className="workflow-progress-head"><div><p className="mini-label">YOUR BATCH</p><b>Step {progressIndex+1} of {PROGRESS_STEPS.length}</b></div>{(template||files.length>0||drafts.length>0)&&<button className="start-new-batch" disabled={running} onClick={startOver}>Clear batch + start over</button>}</div>
          {localPreview&&<p className="preview-mode-note">Preview mode · every step is unlocked <a href="/design-lab">Open design lab →</a></p>}
          {PROGRESS_STEPS.map((label,index)=>{const active=progressIndex===index,done=index<progressIndex,accountsReady=connected&&etsyConnected,available=localPreview||index===0||(index===1&&accountsReady)||(index===2&&accountsReady&&productSelected&&templateLoaded)||(index>=3&&index<=4&&accountsReady&&ready)||(index>=5&&accountsReady&&productSelected&&complete);return <button key={label} className={`${active?"active":""} ${done?"done":""}`} disabled={!available} aria-current={active?"step":undefined} onClick={()=>openProgressStep(index)}><span>{done?"✓":String(index+1).padStart(2,"0")}</span><span><b>{label}</b><small>{localPreview&&!active?"Open preview":progressStatus(index,active,done)}</small></span></button>})}
          <p className="workflow-help">Goldie saves completed work. You can return to an earlier step without starting over.</p>
        </nav>
        <div className="workflow-stage">
        {progressIndex>0&&<WorkflowMomentum
          current={progressIndex+1}
          total={PROGRESS_STEPS.length}
          label={progressIndex===PROGRESS_STEPS.length-1?"Final review":`Next: ${PROGRESS_STEPS[Math.min(progressIndex+1,PROGRESS_STEPS.length-1)]}`}
        />}
        {activeBundle&&bundleRecipes.length>1&&<section className="bundle-progress" aria-label={`Product bundle ${activeBundle.name}`}><div><span>PRODUCT BUNDLE · PRODUCT {bundleIndex+1} OF {bundleRecipes.length}</span><b>You are working on {bundleRecipes[bundleIndex]?.name}</b><small>{activeBundle.name}</small></div><ol>{bundleRecipes.map((recipe,index)=><li className={index<bundleIndex?"complete":index===bundleIndex?"current":""} key={recipe.id}><span>{index<bundleIndex?"✓":index+1}</span><b>{recipe.name}</b><small>{index<bundleIndex?"Complete":index===bundleIndex?"You are here":"Up next"}</small></li>)}</ol></section>}
        {progressIndex>0&&<GoldieInsight>{currentInsight()}</GoldieInsight>}
        {progressIndex===3&&files.length>0&&<ActionReceipt items={[{value:`${files.length} designs checked`,label:"Original artwork resolution preserved"},{value:`${pricedVariants.length} variants`,label:pricingApproved?"Pricing approved":"Ready for pricing review"}]}/>}
        {progressIndex===5&&titleCount>0&&<ActionReceipt items={[{value:`${titleCount} titles ready`,label:"Validated keyword phrases only"},{value:`${files.reduce((sum,file)=>sum+file.tags.length,0)} matching tags`,label:"Zero invented keywords"}]}/>}
        <div className={`steps-column ${workflowStep}-column`}>
          <article className={`step-card connect-step workflow-panel ${connected ? "done" : ""} ${workflowStep==="connect"?"active-panel":"hidden-panel"}`}>
            <div className="step-number">01</div>
            <div className="step-content">
              <div className="step-heading"><div><h2>Connect <em>Printify</em></h2></div></div>
              <p className="step-copy">Connect the Printify shop where Goldie will create your product drafts.</p>
              <p className="connect-timing">◷ Connecting usually takes about 2 minutes.</p>
              {checkingConnection ? (
                <div className="connection-row"><span className="connection-icon">P</span><div><b>Secure connection check…</b><small>This takes just a moment</small></div></div>
              ) : !connected ? (
                <div className="connection-stack connection-setup">
                  <section className="printify-service-group">
                  <div className="connection-row service-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify</b><small>Create and update your product drafts.</small></div><button onClick={()=>setShowTokenForm(value=>!value)}>{showTokenForm?"Close":"Connect Printify"}</button></div>
                  {showTokenForm&&<div className="inline-field approved-token-form"><label>Paste the token you copied from Printify</label><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste token here" aria-label="Printify token" /><button onClick={connectPrintify} disabled={!token.trim() || connecting}>{connecting ? "Connecting…" : "Connect securely"}</button></div>}
                  {connectionError && <p className="field-error" role="alert">{connectionError}</p>}
                  <details className="token-help approved-token-help">
                    <summary>How to get your Printify token <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></summary>
                    <div className="approved-token-instructions"><b>Get your Printify token step by step</b><div className="token-shop-warning"><b>First, make sure you are in the right Printify account</b><span>Sign in to the account that contains the Etsy shop and template products you want Goldie to use. A token connects the whole Printify account. In Step 2, your template tells Goldie which exact shop to use.</span></div>
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
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<span className="sr-only">Connect Etsy before publishing</span><small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="secondary-action" onClick={async()=>{await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                  <small className="secure-copy">♢ Encrypted and saved securely.</small>
                </div>
              ) : (
                <div className="connection-stack connection-setup connected-connection-stack">
                  <div className="connection-row"><span className="connection-icon"><img src="/printify-logo.svg" alt="" /></span><div><b>Printify connected</b><small>Your connection will be remembered</small></div><button onClick={async () => { await fetch("/api/printify", { method: "DELETE" }); setConnected(false); setToken(""); setTemplateDetails(null); setConnectionError(""); }}>Disconnect</button></div>
                  <div className={`connection-row etsy-connection service-row ${etsyConnected?"connected":""}`}><span className="connection-icon"><img src="/etsy-logo.svg" alt="" /></span><div><b>{etsyConnected?"Etsy connected":"Etsy"}</b>{etsyConnected&&<em className="etsy-shop-name">{etsyShop||"your shop"}</em>}<small>{etsyConnected?"Connected and verified.":"Required before Goldie publishes and finishes your listings."}</small></div>{etsyConnected?<button className="secondary-action" onClick={async()=>{await fetch("/api/etsy",{method:"DELETE"});setEtsyConnected(false);setEtsyShop("")}}>Disconnect</button>:<button className="secondary-action" onClick={()=>void connectEtsy()} disabled={etsyConnecting}>{etsyConnecting?"Opening Etsy…":"Connect Etsy"}</button>}</div>
                </div>
              )}
              {connected&&connectionError&&<p className="field-warning" role="status">{connectionError}</p>}
              {etsyError&&<p className="field-error" role="alert">{etsyError}</p>}
              {(localPreview||(connected&&etsyConnected))&&<button className="workflow-next" onClick={()=>goToStep("setup",false,localPreview)}>Next step <span>→</span></button>}
            </div>
          </article>

          <div className={`product-step workflow-panel ${workflowStep==="setup"?"active-panel":"hidden-panel"}`}><SavedWorkflow connected={connected||localPreview} templateUrl={template} templateVerified={templateLoaded} loadingTemplate={loadingTemplate} verifiedShippingProfileId={Number(templateDetails?.shippingTemplateId)||0} onTemplateUrl={(value) => { templateLoadVersion.current+=1;setLoadingTemplate(false);setTemplate(value);setTemplateDetails(null);setTemplateError(""); }} onUseRecipe={useRecipe} onUseBundle={useBundle} onStartNewProduct={startNewProduct} onVerifyTemplate={loadTemplateUrl} />
          {localPreview&&!templateDetails&&<button className="preview-demo-button" onClick={()=>void loadPreviewDemo()}>Load a complete poster demo to review every step</button>}
          {templateError && <p className="field-error recipe-error" role="alert">{templateError}</p>}
          {templateDetails && <div className="template-proof recipe-proof"><div className="product-thumb"><span>YOUR<br/>ART</span></div><div className="template-info"><b>{templateDetails.blueprintTitle}</b><span>{templateDetails.provider} · {templateDetails.enabledVariants} enabled variants</span><span>✓ Product, placement, variants, and shipping profile imported</span></div><span className="template-badge">{productSelected?"Product selected":"Save this product"}</span></div>}
          {templateDetails&&!productSelected&&<p className="field-warning recipe-error" role="status">Name and save this product before continuing, or select one of your saved products above.</p>}
          {templateDetails&&productSelected&&<button className="workflow-next" onClick={()=>goToStep("designs")}>Next step <span>→</span></button>}</div>

          <article className={`step-card designs-step workflow-panel ${files.length ? "done" : ""} ${workflowStep==="finish"?"finish-mode":""} ${workflowStep==="designs"||(workflowStep==="finish"&&finishPhase==="details")?"active-panel":"hidden-panel"}`}>
            <div className="step-number">{workflowStep==="finish"?"06":"03"}</div>
            <div className="step-content">
              <div className="step-heading"><div><p className="mini-label">{workflowStep==="finish"?"TITLES, TAGS + DESCRIPTIONS":"DESIGNS"}</p><h2>{workflowStep==="finish"?"Finish titles, tags, and descriptions":"Add your finished designs"}</h2></div>{files.length > 0 && <span className="done-mark">✓ {files.length} {workflowStep==="finish"?"listings":"loaded"}</span>}</div>
              <p className="step-copy">{workflowStep==="finish"?"Create titles and matching tags, review each listing, and confirm the description shared across the batch.":"Build one focused batch of up to 20 finished designs. Upload a folder or select individual images."}</p>
              {workflowStep==="finish"&&<div className="finish-guide"><span><b>1</b> Create titles + tags</span><span><b>2</b> Review each listing</span><span><b>3</b> Confirm description</span></div>}
              <p className="batch-limits" aria-label="Batch limits"><span>20 designs maximum</span><i /> <span>100 MB per design · no combined file-size cap</span><i /> <span>Large batches process one design at a time without lowering DPI</span></p>
              <div className="file-reminder"><b>Before uploading</b><span>Designs must already be upscaled if needed. Use a transparent-background PNG whenever the background should not print.</span></div>
              <input ref={folderPicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => void chooseFiles(event.target.files)} />
              <input ref={imagePicker} className="hidden-picker" type="file" multiple accept=".png,.jpg,.jpeg" onChange={(event) => void chooseFiles(event.target.files)} />
              <div className="upload-actions">
              <button className="folder-drop" onClick={() => folderPicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">↑</span>
                <span><b>{files.length ? designsFinished?`${files.length} of 20 designs ready`:`Preparing designs: ${designsReady} of ${files.length} ready` : "Choose a folder"}</b><small>{files.length ? `${(totalSize / 1024 / 1024).toFixed(1)} MB selected${totalSize>LARGE_BATCH_THRESHOLD?" · will process one at a time":""} · Choose again to add more` : "Your folder can contain up to 20 designs"}</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              <button className="folder-drop" onClick={() => imagePicker.current?.click()}>
                <span className="upload-icon" aria-hidden="true">＋</span>
                <span><b>Choose individual images</b><small>Select one image or several at once</small></span>
                <span className="browse-chip">Browse</span>
              </button>
              </div>
              {fileError && <p className="file-limit-error" role="alert"><b>That batch can’t be added.</b><span>{fileError}</span></p>}
              {fileNotice&&<p className="file-add-notice" role="status"><b>Upload updated</b><span>{fileNotice}</span></p>}
              {files.length>0&&<section className={`design-preparation-status ${designsFinished?"ready":"working"}`} role="status" aria-live="polite"><span className="design-status-icon" aria-hidden="true">{designsFinished?"✓":""}</span><div><b>{designsFinished?`All ${files.length} designs are ready`:`Goldie is preparing your designs: ${designsReady} of ${files.length} ready`}</b><small>{designsFinished?"Dimensions and print-quality information are loaded. You can continue.":"Keep this page open. Goldie is reading every file and checking its dimensions before you can continue."}</small><div className="design-status-track"><i style={{width:`${files.length?designsReady/files.length*100:0}%`}}/></div></div><strong>{designsReady}/{files.length}</strong></section>}
              {files.length > 0 && <div className="batch-capacity"><div><b>{files.length}/20 designs</b><span>{20 - files.length} spaces remaining</span></div><div className="capacity-track"><span style={{ width: `${(files.length / 20) * 100}%` }} /></div></div>}
              {files.length>0&&!complete&&workflowStep==="designs"&&<>{designsFinished&&belowRecommendedPixels.length>0&&<div className="pixel-warning-inline" role="status"><span>!</span><div><b>{belowRecommendedPixels.length===1?"One design is":"Some designs are"} below Printify’s recommended pixel size.</b><small>You can still continue, but Goldie will ask you to confirm first.</small></div></div>}<button className="workflow-next" disabled={!designsFinished} onClick={continueFromDesigns}>{designsFinished?"Next step":`Preparing ${designsPreparing} ${designsPreparing===1?"design":"designs"}…`} {designsFinished&&<span>→</span>}</button></>}
              {files.length > 0 && complete && workflowStep==="finish" && finishPhase==="details" && <div className={`listing-editor ${titlePulseIds.size?"titles-resolving":""}`}>
                <div className="editor-heading"><div><b>1. Create titles and tags</b><span>Goldie analyzes every design separately and selects only exact phrases from your validated keyword bank. Goldie never adds keywords. Review or edit any listing afterward.</span></div><span>{files.length} listings</span></div>
                <section className="batch-title-builder"><div><p className="mini-label">BATCH TITLE BUILDER</p><h3>Create titles for the whole batch</h3><p>Let Goldie select from your validated bank for each design, or choose the exact phrases yourself. No new keywords are ever added.</p></div><div className="title-builder-choice" role="group" aria-label="How do you want to create batch titles?"><button className={titleBuilderMode==="ai"?"active":""} onClick={()=>setTitleBuilderMode("ai")}><b>Goldie selects from my bank</b><span>Creates a different title for each design</span></button><button className={titleBuilderMode==="manual"?"active":""} onClick={()=>setTitleBuilderMode("manual")}><b>I choose from my bank</b><span>Uses your selections across the batch</span></button></div><div className="title-style-toggle"><span>Title style</span><button className={titleJoiner===", "?"active":""} onClick={()=>changeTitleJoiner(", ")}>Title with commas</button><button className={titleJoiner===" "?"active":""} onClick={()=>changeTitleJoiner(" ")}>Title without commas</button></div>{titleBuilderMode==="ai"?<div className="title-builder-pane"><KeywordBank selectionOnly initialId={autoTitleBankId||activeRecipe?.keywordListId||""} onSelect={list=>{setAutoTitleBank(list);setAutoTitleBankId(list?.id||"")}} title="Choose a keyword bank" copy="Goldie selects only exact phrases from this bank. It will not add keywords."/><div className="ai-title-disclaimer"><b>Review every title Goldie creates.</b><span>Goldie chooses the phrases it believes fit each design best from the bank you select. It does not verify that the keyword bank itself matches the design, and it will not reject mismatched phrases. Use your judgment before continuing.</span></div><button className="ai-title-button" disabled={titleBuilding||!autoTitleBank||!files.length} onClick={()=>void buildBatchTitle()}>{titleBuilding?`Creating ${files.length} titles…`:"Auto-create all titles"}</button>{titleBuildMessage&&<p className="title-build-message" role="status">{titleBuildMessage}</p>}</div>:<div className="title-builder-pane manual-title-builder"><KeywordBank initialId={manualKeywordBankId||activeRecipe?.keywordListId||""} onSelect={list=>setManualKeywordBankId(list?.id||"")} onAdd={addBatchKeyword} title="Choose a keyword bank" copy="Click keywords in the order you want them. Every click updates all listings below."/><div className="selected-batch-keywords"><div><b>Selected keywords</b>{batchKeywords.length>0&&<button onClick={clearBatchKeywords}>Clear all</button>}</div>{batchKeywords.length?<div className="selected-keyword-chips">{batchKeywords.map(keyword=><button key={keyword} onClick={()=>removeBatchKeyword(keyword)}>{keyword}<span>×</span></button>)}</div>:<p>No keywords selected yet.</p>}</div>{batchKeywords.length>0&&<div className="batch-title-preview"><b>Batch title preview</b><span>{batchKeywords.join(titleJoiner)}</span><small>Applied to every listing below. You can still edit any listing individually.</small></div>}</div>}</section>
                <details className="permanent-description batch-description"><summary><span><b>2. Edit description</b><small>Review or change the description used for every listing</small></span><em>{description.trim()?"✓ Added":"Review"}</em></summary><div className="batch-description-body"><p>This came from your Printify template. Edit it once here to change the shared description on every listing in this batch.</p><label>Description for every listing<textarea rows={9} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add sizing, materials, production, care, and shipping information"/></label><small>Open any listing below only when that listing needs different wording.</small></div></details>
                <div className="design-table" ref={listingResultsRef}>{files.map((design) => { const displayScale=isRigidPaperProduct(templateDetails)?Math.min(templateDetails?.placementScale||1,1):templateDetails?.placementScale;const quality = design.width && templateDetails?.maxPrintWidth && displayScale ? printifyDpi(design.width, templateDetails.maxPrintWidth, displayScale) : null; const qualityReady = Boolean(quality && quality.dpi >= 300),completeDescription=finalDescription(design,design.etsy),draftPreview=drafts.find(draft=>draft.clientId===design.id)?.previewUrl||design.previewUrl; return <article className={`design-line ${activeDesign === design.id ? "active" : ""}`} key={design.id} onClick={() => setActiveDesign(design.id)}><button type="button" className="listing-preview-button" onClick={event=>{event.stopPropagation();window.open(draftPreview,"_blank","noopener,noreferrer")}} aria-label={`Open larger Printify preview for ${design.title||design.name}`}><img src={draftPreview} alt={`Printify preview for ${design.title||design.name}`}/><span>Enlarge</span></button><div className="design-fields"><label>Title <span>{design.title.length}/140</span><input value={design.title} maxLength={140} onChange={(e) => { const title = e.target.value; updateDesign(design.id, { title, tags: tagsFromTitle(title),etsy:undefined }); }}/></label><label>Tags <span>{design.tags.length}/13</span><input value={design.tags.join(", ")} onChange={(e) => updateDesign(design.id, { tags: [...new Set(e.target.value.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag && tag.length <= 20))].slice(0, 13),etsy:undefined })} placeholder="Exact title phrases, separated by commas"/></label><div className="tag-row">{design.tags.map((tag) => <span key={tag}>{tag}</span>)}{!design.tags.length && <small>Goldie will create matching tags with the title.</small>}</div><IndividualAutoTitle design={design} template={templateDetails} useCommas={titleJoiner===", "} onApply={(title,tags)=>{setActiveDesign(design.id);updateDesign(design.id,{title,tags,etsy:undefined,etsyError:""})}}/><details className="individual-description" onClick={event=>event.stopPropagation()}><summary><span>Customize this listing’s description</span><small>{design.descriptionOverride!==undefined?"✓ Customized":"Same as batch"}</small></summary><div><p>The complete description is shown below. Edit it only if this listing needs different wording or an additional blurb.</p><label>Description for this listing<textarea rows={10} value={completeDescription} onChange={event=>updateDesign(design.id,{descriptionOverride:event.target.value,etsyError:""})}/></label>{design.descriptionOverride!==undefined&&<button type="button" onClick={()=>updateDesign(design.id,{descriptionOverride:undefined,etsyError:""})}>Use the batch description again</button>}<small>Spacing and line breaks are preserved when this description is sent to Printify and Etsy.</small></div></details>{design.etsy&&<details className="etsy-auto"><summary>✓ Etsy details completed · {design.etsy.category}</summary><small>Category and Etsy-specific fields are reviewed on the next step.</small></details>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}{design.paddingStatus==="trimmed"&&<small className="padding-note">Transparent padding detected · placement scale preserved for print quality</small>}</div><div className={`quality-pill ${qualityReady ? "pass" : "check"}`}><b>{!quality ? "Calculating Printify DPI…" : qualityReady ? `✓ ${quality.dpi} DPI in Printify` : `${quality.dpi} DPI in Printify`}</b><small>{quality ? `${quality.level} resolution · 300 DPI recommended` : design.width ? `${design.width} × ${design.height}px` : "Reading dimensions…"}</small></div></article>; })}</div>
                <button className="workflow-next" disabled={preparingEtsy} onClick={()=>void continueToEtsyDetails()}>{preparingEtsy?"Preparing Etsy details…":"Next step"} <span>→</span></button>{preparingEtsy&&<p className="etsy-preparing-note" role="status">This can take a moment when your batch has several listings. Keep this page open while Goldie prepares each one.</p>}
              </div>}
            </div>
          </article>
          {workflowStep==="finish"&&finishPhase==="etsy"&&<article className="step-card etsy-details-step active-panel"><div className="step-number">07</div><div className="step-content"><div className="step-heading"><div><p className="mini-label">ETSY LISTING DETAILS</p><h2>Review your Etsy listing details</h2></div><span className="done-mark">{files.filter(file=>file.etsy).length}/{files.length} ready</span></div><p className="step-copy">Goldie has pre-filled the Etsy category and every product field it could confidently match for each listing. Look everything over and change any selection that does not fit.</p><div className="variant-transfer-note"><span>✓</span><div><b>Titles, tags, descriptions, sizes, colors, and prices are set.</b><small>This step contains additional Etsy category and product fields. Optional fields stay blank when there is not a clear match.</small></div></div><div className="etsy-detail-list">{files.map(design=><article className="etsy-detail-card" key={design.id}><img src={design.previewUrl} alt=""/><div><span className="etsy-listing-name">{design.title||design.name}</span>{design.etsy?<EtsyDetailsEditor design={design} categories={etsyCategories} onChange={etsy=>updateDesign(design.id,{etsy,etsyError:""})} onCategory={taxonomyId=>changeEtsyCategory(design,taxonomyId)}/>:<div className="etsy-detail-error"><b>Etsy details still need to be created.</b><span>{design.etsyError}</span><button onClick={()=>void prepareOne(design)}>Try this listing again</button></div>}{design.etsyError&&<small className="field-error">{design.etsyError}</small>}</div></article>)}</div><button className="workflow-next" disabled={savingEtsyDetails||files.some(file=>!file.etsy)} onClick={()=>void saveAllEtsyDetails()}>{savingEtsyDetails?"Saving Etsy details…":"Next step"} <span>→</span></button></div></article>}
          {workflowStep==="finish"&&finishPhase==="final"&&<article className="step-card final-review active-panel"><div className="step-number">09</div><div className="step-content">{batchReceipt?<OutcomeReceipt receipt={batchReceipt} productName={templateDetails?.blueprintTitle||""} shippingProfile={etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||""} imageCount={printifyImageIndices.length} sizeGuideName={sizeGuideName} tagCount={files.reduce((sum,file)=>sum+file.tags.length,0)} mockupCount={Object.values(preparedMockupCounts).reduce((sum,count)=>sum+count,0)} variantCount={pricedVariants.length*files.length} minutesSaved={Math.max(12,Math.round(files.length*11.1))} nextBundleProduct={bundleRecipes[bundleIndex+1]?.name} bundleComplete={Boolean(activeBundle&&bundleIndex===bundleRecipes.length-1)} onNextBundleProduct={()=>void continueBundle()} onDuplicate={()=>{clearCurrentBatch(false);goToStep("designs")}} onNewBatch={()=>{clearCurrentBatch(true);goToStep("setup")}}/>:<><div className="step-heading"><div><p className="mini-label">FINAL REVIEW</p><h2>Your batch is ready for its final check</h2></div><span className="done-mark">✓ {drafts.filter(draft=>draft.status==="Created").length} drafts</span></div><p className="step-copy">Confirm the checklist below. Nothing is published until you use the final button.</p><div className="final-checklist"><span>✓ Every enabled variation and price was reviewed</span><span>✓ {etsyShippingProfiles.find(profile=>profile.id===etsyShippingProfileId)?.title||"Etsy shipping profile"} will be applied automatically</span><span>{files.every(file=>file.title.trim())?"✓":"!"} Titles are complete</span><span>{files.every(file=>file.tags.length)?"✓":"!"} Tags are complete</span><span>{description.trim()?"✓":"!"} Description {description.trim()?"is attached":"is blank"}</span><span>{files.every(file=>file.etsy)?"✓":"!"} Etsy categories and product details {files.every(file=>file.etsy)?"are ready":"still need review"}</span><span>✓ Printify placement and listing images were reviewed</span>{sizeGuideName&&<span>✓ {sizeGuideName} will be applied to every Etsy listing</span>}</div>
<FinalListingReview drafts={drafts} files={files} selections={printifyImageSelections} defaultIndices={printifyImageIndices} batchSizeGuide={sizeGuideName} onEdit={setFinishPhase}/><div className="final-review-actions"><button onClick={()=>setFinishPhase("details")}>Review titles + description</button><button onClick={()=>setFinishPhase("etsy")}>Review Etsy details</button><button onClick={()=>setFinishPhase("mockups")}>Review images + mockups</button></div><div className="publish-live-warning"><b>These listings will be published live on Etsy.</b><span>They will not go to Etsy drafts. Nothing happens until you confirm again in the next window.</span></div><button className="publish-all-button" disabled={publishing||drafts.some(draft=>draft.status==="Failed")} onClick={openPublishConfirmation}>{publishing?"Publishing…":"Publish all live on Etsy"}</button>{publishMessage&&<p className="publish-message" role="status">{publishMessage}</p>}</>}</div></article>}
        </div>

        <aside className={`launch-panel workflow-panel ${workflowStep==="review"?"active-panel":"hidden-panel"}`}>
          <div className={`step-number launch-step-icon ${progressIndex===4?"create-drafts-icon":"pricing-icon"}`}>{String(progressIndex+1).padStart(2,"0")}</div>
          <div className="launch-top">
            <Image src="/goldie-g.png" width={2000} height={2000} alt="" className="goldie-g" />
            <p className="mini-label">BATCH SUMMARY</p>
            <h2>{running ? `${processed} of ${runTotal} complete` : workflowStep==="review" ? "Pricing review" : complete ? "Batch finished" : "Current batch"}</h2>
            <p>{running ? "Goldie is uploading each design and creating its Printify draft." : workflowStep==="review" ? "Confirm shipping and item prices, then continue." : complete ? `${drafts.filter((draft) => draft.status === "Created").length} of ${files.length} drafts were created in Printify.` : "Complete this step to create unpublished drafts in Printify."}</p>
          </div>

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
            onPricing={setPricing}
            onPrices={setVariantPrices}
            onSelectProfile={value=>{setEtsyShippingProfileId(value);setPricingApproved(false)}}
            onCreateProfile={createCustomShippingProfile}
            onApprovalChange={setPricingApproved}
          />}

          <div className="summary-list">
            <div><span>Printify</span><b className={connected ? "ready-text" : "waiting-text"}>{connected ? "Connected" : "Waiting"}</b></div>
            <div><span>Saved product</span><b>{activeRecipe?.name||templateDetails?.blueprintTitle||"Not selected"}</b><button onClick={()=>goToStep("setup")}>Edit</button></div>
            <div><span>Product</span><b>{templateDetails?.blueprintTitle||"Not selected"}</b></div>
            <div><span>Designs</span><b>{files.length ? `${files.length} / 20` : "Not added"}</b></div>
            <div><span>Profit target</span><b>${pricing.targetProfit.toFixed(2)} per item</b></div>
            <div><span>Printify fulfillment shipping</span><b>{templateDetails?.standardShipping!=null?`${templateDetails.shippingCurrency} ${templateDetails.standardShipping.toFixed(2)} cost`:"Calculated by Printify"}</b></div>
            <div><span>Keyword bank</span><b>{activeRecipe?.keywordListId?"Saved with product":"Choose after drafts"}</b></div>
            <div><span>Mockup set</span><b>{mockupTheme||"Choose after drafts"}</b></div>
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
            <button className="launch-button" disabled={!ready || !pricingApproved || running||preparingEtsy} onClick={createDrafts}>
              <span className="button-glint" />{preparingEtsy?"Completing Etsy details…":running ? `${processed} of ${runTotal} complete…` : ready ? "Continue to create drafts" : missingRequirement}<span>→</span>
            </button>
          ) : (
            <div className="batch-actions">
              {drafts.some((draft) => draft.status === "Failed") && <button className="retry-button" onClick={retryFailed}>Retry {drafts.filter((draft) => draft.status === "Failed").length} failed designs</button>}
            </div>
          )}
          <p className="launch-note">This step creates unpublished Printify drafts. The final Goldie step publishes them live to Etsy only after a second confirmation.</p>
        </aside>
        <div className="workflow-footer-actions">{progressIndex>0&&<button className="workflow-back" type="button" onClick={goBackOneStep}><span aria-hidden="true">←</span> Back</button>}<span className="autosave-note"><i aria-hidden="true">✓</i> Saved automatically</span></div>
        </div>
      </section>}

      {complete && workflowStep==="finish" && finishPhase==="mockups" && <details className="recommended-listing-photos"><summary>Recommended listing photo mix</summary><ul><li>3 lifestyle model mockups</li><li>Printify flatlays of each color offered</li><li>1 item-specific size guide</li></ul></details>}
      {complete && workflowStep==="finish" && finishPhase==="mockups" && <section className="post-draft-workspace"><div className="post-draft-heading"><div><p className="mini-label">STEP 8 · IMAGES + MOCKUPS</p><h2>Review placement and choose listing images.</h2><p>The large preview below is the real Printify placement Goldie uses as the required reference for lifestyle mockups.</p></div>{drafts.filter((draft) => draft.status === "Created").length > 1 && <button className="open-all-button" onClick={openAllDrafts}>Open all in Printify</button>}</div><section className="batch-size-guide"><div><p className="mini-label">OPTIONAL · APPLY TO THE WHOLE BATCH</p><h3>Add one size guide to every Etsy listing</h3><span>Choose it once. Goldie attaches it to every listing in this batch automatically when you publish.</span></div><input ref={sizeGuidePicker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void applySizeGuide(file)}}/><button onClick={()=>sizeGuidePicker.current?.click()}>{sizeGuideName?"Replace size guide":"Choose size guide"}</button>{sizeGuideStatus&&<p role="status">{sizeGuideStatus}</p>}</section>{openAllMessage && <p className="open-all-message" role="status">{openAllMessage}</p>}<div className="draft-card-grid">{drafts.map((draft) => { const design=files.find(file=>file.id===draft.clientId),selectedImages=draft.id?(printifyImageSelections[draft.id]??printifyImageIndices):printifyImageIndices; return <article className={`draft-card ${draft.status === "Failed" ? "failed" : ""}`} key={draft.clientId}><div className="draft-card-top">{draft.previewUrl ? <button className="printify-preview-button" onClick={()=>window.open(draft.previewUrl,"_blank","noopener,noreferrer")} aria-label="Open larger Printify preview"><img src={draft.previewUrl} alt={`Printify preview for ${draft.title || draft.name}`}/><span>Click to enlarge</span></button> : design ? <div className="pending-preview"><img src={design.previewUrl} alt="Design preview"/><span>Printify preview processing</span></div> : <span className="draft-check">!</span>}<div><span className="draft-state">{draft.status === "Created" ? "PRINTIFY DRAFT CREATED" : "DRAFT FAILED"}</span><h3>{draft.title || draft.name}</h3><small>{draft.status === "Created" ? "Unpublished · pricing, tags, and description applied" : draft.error}</small>{design?.tags?.length ? <div className="tag-row">{design.tags.map(tag=><span key={tag}>{tag}</span>)}</div> : null}</div>{draft.editorUrl && draft.id ? <button className={`edit-draft-button ${openedDrafts.includes(draft.id) ? "opened" : ""}`} onClick={() => openDraft(draft)}><i />{openedDrafts.includes(draft.id) ? "Printify opened" : "Open in Printify to resize or reposition"}</button> : null}</div>{draft.status === "Created" && <PrintifyImagePicker images={(draft.printifyImages || []).filter(Boolean)} indices={selectedImages} onApplyOne={values=>{if(draft.id)setPrintifyImageSelections(current=>({...current,[draft.id!]:values}))}} onApplyAll={values=>{setPrintifyImageIndices(values);setPrintifyImageSelections(Object.fromEntries(drafts.filter(item=>item.id).map(item=>[item.id!,values])))}} onSaveRecipe={activeRecipe?(values)=>void saveImagePreferences(values):undefined}/>} {draft.status === "Created" && design && draft.id && <IndividualSizeGuide productId={draft.id} name={design.sizeGuideName} onSaved={name=>updateDesign(design.id,{sizeGuideName:name})}/>} {draft.status === "Created" && design && draft.id && <details className="draft-mockups"><summary>Add Your Own Mockups (Optional)</summary><IntegratedMockups design={design.file} productId={draft.id} defaultTheme={mockupTheme} referenceUrl={draft.previewUrl} sharedSelection={sharedMockups} onShare={setSharedMockups} onPrepared={count=>setPreparedMockupCounts(current=>({...current,[draft.id!]:count}))}/></details>}{draft.status === "Created"&&draft.id&&<DownloadListingPhotos productId={draft.id} name={draft.title||draft.name} indices={selectedImages}/>} {draft.status === "Failed" && <button className="error-help-link" onClick={() => window.dispatchEvent(new CustomEvent("goldie-support", { detail: draft.error ?? "A design failed" }))}>Get help with this error</button>}</article>})}</div><button className="workflow-next mockup-next" onClick={()=>setFinishPhase("final")}>Next step <span>→</span></button></section>}

      {preflightOpen && <div className="preflight-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPreflightOpen(false)}}><section className="preflight" role="dialog" aria-modal="true" aria-labelledby="preflight-title"><p className="mini-label">CREATE PRINTIFY DRAFTS</p><h2 id="preflight-title">Create {files.length} product {files.length===1?"draft":"drafts"}?</h2><div className="preflight-list"><div><span>Printify product</span><b>✓ {templateDetails?.blueprintTitle}</b></div><div><span>Design files</span><b>✓ {files.length} ready</b></div><div><span>Permanent description</span><b>{description.trim()?"✓ Imported from Printify":"None found. You can add one later"}</b></div><div><span>Variant pricing</span><b>✓ All {pricedVariants.length} enabled variants reviewed and approved</b></div><div><span>Publishing</span><b>Unpublished Printify drafts only</b></div></div><p className="preflight-explainer">After these drafts exist, Goldie will show their real previews and help finish each title, tags, unique introduction, Etsy details, and mockups.</p><div className="preflight-actions"><button className="preflight-cancel" onClick={()=>setPreflightOpen(false)}>Go back</button><button className="preflight-confirm" onClick={confirmDrafts}>Create Printify drafts →</button></div></section></div>}

      {publishConfirmOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm" role="alertdialog" aria-modal="true" aria-labelledby="publish-confirm-title"><span className="publish-confirm-icon">!</span><p className="mini-label">FINAL PUBLISH CONFIRMATION</p><h2 id="publish-confirm-title">These listings will go live on Etsy.</h2><p>They will not be saved as Etsy drafts. Publishing starts as soon as you click the red button below. Goldie will immediately apply the selected Etsy shipping profile.</p>{missingPublishFields().length>0&&<div className="publish-missing"><b>Goldie found blank or unfinished fields:</b><ul>{missingPublishFields().map(field=><li key={field}>{field}</li>)}</ul><span>You can still publish, but review these first if they matter to this batch.</span></div>}<div className="publish-confirm-actions"><button onClick={()=>setPublishConfirmOpen(false)}>Go back and review</button><button className="danger" onClick={()=>void publishAll()}>Yes, publish live on Etsy</button></div></section></div>}

      {blockingModal&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm blocking-modal" role="alertdialog" aria-modal="true" aria-labelledby="blocking-modal-title"><span className="publish-confirm-icon">!</span><p className="mini-label">REQUIRED BEFORE CONTINUING</p><h2 id="blocking-modal-title">{blockingModal.title}</h2>{blockingModal.copy&&<p>{blockingModal.copy}</p>}<div className="publish-missing"><b>Fix these items:</b><ul>{blockingModal.issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setBlockingModal(null)}>Got it. I’ll fix this</button></div></section></div>}
      {pixelWarningOpen&&<div className="publish-confirm-backdrop" role="presentation"><section className="publish-confirm pixel-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="pixel-warning-title"><span className="publish-confirm-icon">!</span><p className="mini-label">PRINT RESOLUTION CHECK</p><h2 id="pixel-warning-title">One or more of these designs fall below Printify’s pixel size recommendations for this product.</h2><p>These designs may still print, but they may show a lower resolution inside the Printify editor at the largest enabled size. Review the comparison below before deciding whether to continue.</p><div className="pixel-comparison" role="region" aria-label="Uploaded design pixel comparison"><div className="pixel-comparison-head" aria-hidden="true"><b>Design</b><b>Uploaded size</b><b>Printify recommends</b></div><div className="pixel-comparison-rows">{belowRecommendedPixels.map(file=><div className="pixel-comparison-row" key={file.id}><b title={file.name}>{file.name}</b><span><small>Uploaded size</small>{file.width?.toLocaleString()} × {file.height?.toLocaleString()} px</span><span><small>Printify recommends</small>{recommendedPixelSize.width.toLocaleString()} × {recommendedPixelSize.height.toLocaleString()} px</span></div>)}</div></div><div className="publish-confirm-actions"><button autoFocus onClick={()=>setPixelWarningOpen(false)}>Go back and review</button><button className="pixel-proceed" onClick={()=>{setPixelWarningOpen(false);goToStep("review")}}>Proceed anyway</button></div></section></div>}

      <footer className="factory-legal-footer"><span>GOLDIE LISTING FACTORY</span><small>The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</small><span>BE A WOLF BIZ · 2026</span></footer>
      <SupportChat />
    </main>
  );
}
