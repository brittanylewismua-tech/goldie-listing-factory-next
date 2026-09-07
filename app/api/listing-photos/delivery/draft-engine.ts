/** A draft finisher never creates a listing or changes its publication state. */
export class DraftReviewRequired extends Error {}
export type Question={question_type:string;question_text:string;required:boolean;instructions?:string;max_allowed_characters?:number;max_allowed_files?:number;options?:{label:string}[]};
export type DraftSnapshot={title:string;description:string;tags:string[];taxonomy_id:number;shipping_profile_id:number;properties:{property_id:number;value_ids:number[];values:string[]}[];questions:Question[]};
export type SourceDraft={title?:string;description?:string;tags?:string[];etsyShippingProfileId?:number;etsyDetails?:{taxonomyId?:number;properties?:{propertyId:number;valueId?:number|null;value:string;required?:boolean;label?:string}[];attributes?:Record<string,string>;optional?:Record<string,string>;personalization?:{enabled:boolean;questions:{type:string;question:string;required:boolean;instructions?:string;maxCharacters?:number;maxFiles?:number;options?:string[]}[]}}};
const fail=(message:string):never=>{throw new DraftReviewRequired(message)};
const positive=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
export function freezeDraft(source:SourceDraft):DraftSnapshot{
 const d=source.etsyDetails;
 if(!positive(d?.taxonomyId))fail('Choose and save an exact Etsy category before preparing this draft.');
 if(!positive(source.etsyShippingProfileId))fail('Choose and save an Etsy shipping profile.');
 const title=String(source.title||'').trim(),description=String(source.description||'').trim(),tags=(source.tags||[]).map(t=>t.trim());
 if(!title||title.length>140||!description||description.length>102400)fail('Save a valid title and description before preparing this draft.');
 if(tags.length>13||tags.some(t=>!t||t.length>20)||new Set(tags.map(t=>t.toLowerCase())).size!==tags.length)fail('Save up to 13 distinct Etsy tags, each 20 characters or fewer.');
 const properties=(d?.properties||[]).filter(p=>p.value?.trim()||p.valueId||p.required).map(p=>{
  if(!positive(p.propertyId)||!p.value?.trim())fail(`Choose a value for ${p.label||'every required Etsy attribute'}.`);
  if(p.valueId!=null&&!positive(p.valueId))fail('An Etsy attribute has an invalid saved choice. Select it again.');
  return {property_id:p.propertyId,value_ids:p.valueId?[p.valueId]:[],values:[p.value.trim()]};
 });
 if(new Set(properties.map(p=>p.property_id)).size!==properties.length)fail('An Etsy attribute was selected twice. Review its saved choices.');
 if(!d?.properties&&Object.values({...d?.attributes,...d?.optional}).some(v=>v.trim()))fail('Reopen Etsy details and save the current attribute choices before preparing this draft.');
 const input=d?.personalization?.enabled?d.personalization.questions:[];
 if(d?.personalization?.enabled&&(!input.length||input.length>5))fail('Choose between one and five personalization questions.');
 const questions=input.map(q=>{
  const question_text=q.question.trim(),instructions=(q.instructions||'').trim();
  if(!question_text||question_text.length>120||instructions.length>120)fail('Personalization questions and instructions must be 120 characters or fewer.');
  const base={question_type:q.type,question_text,required:Boolean(q.required)};
  if(q.type==='dropdown'){
   const options=(q.options||[]).map(label=>({label:label.trim()}));
   if(options.length<2||options.length>30||options.some(o=>!o.label||o.label.length>20)||new Set(options.map(o=>o.label.toLowerCase())).size!==options.length)fail('Use 2–30 distinct dropdown choices, each 20 characters or fewer.');
   return {...base,options};
  }
  if(q.type==='text_input'){
   const count=q.maxCharacters??256;if(!positive(count)||count>1024)fail('Text personalization needs a character limit from 1 to 1024.');
   return {...base,instructions,max_allowed_characters:count};
  }
  if(q.type==='unlabeled_upload'){
   const count=q.maxFiles??1;if(!positive(count)||count>10)fail('File personalization needs a file limit from 1 to 10.');
   return {...base,instructions,max_allowed_files:count};
  }
  return fail('This personalization question type is not supported.');
 });
 return {title,description,tags,taxonomy_id:d!.taxonomyId!,shipping_profile_id:source.etsyShippingProfileId!,properties,questions};
}
export type DraftView={shopId:number;state:string;basic:Omit<DraftSnapshot,'properties'|'questions'>;properties:DraftSnapshot['properties'];questions:Question[]};
export type DraftOperation={key:string;value:unknown};
export type DraftState={listingId:number;index:number;pending?:DraftOperation;verified?:boolean};
export type DraftIO={read():Promise<DraftView>;save(state:DraftState):Promise<void>;backup(view:DraftView):Promise<void>;write(operation:DraftOperation):Promise<void>};
export function canonicalQuestions(questions:Question[]){return questions.map(q=>{
 const base={question_type:q.question_type,question_text:q.question_text,required:Boolean(q.required)};
 if(q.question_type==='dropdown')return {...base,options:(q.options||[]).map(o=>({label:o.label}))};
 if(q.question_type==='text_input')return {...base,instructions:q.instructions||'',max_allowed_characters:q.max_allowed_characters};
 if(q.question_type==='unlabeled_upload')return {...base,instructions:q.instructions||'',max_allowed_files:q.max_allowed_files};
 return q; // Unknown types must compare unequal, never silently disappear.
})}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function operations(s:DraftSnapshot):DraftOperation[]{const {properties,questions,...basic}=s;return [{key:'basic',value:basic},...properties.map(p=>({key:`property:${p.property_id}`,value:p})),{key:'questions',value:canonicalQuestions(questions)}]}
function currentValue(view:DraftView,key:string){
 if(key==='basic')return {...view.basic,tags:[...view.basic.tags].sort()};
 if(key==='questions')return canonicalQuestions(view.questions);
 const id=Number(key.split(':')[1]),p=view.properties.find(p=>p.property_id===id);return p?{property_id:p.property_id,value_ids:[...p.value_ids].sort((a,b)=>a-b),values:[...p.values].sort()}:null;
}
function desiredValue(op:DraftOperation){if(op.key==='basic'){const v=op.value as DraftView['basic'];return {...v,tags:[...v.tags].sort()}}if(op.key.startsWith('property:')){const p=op.value as DraftSnapshot['properties'][number];return {...p,value_ids:[...p.value_ids].sort((a,b)=>a-b),values:[...p.values].sort()}}return op.value}
export function verifyDraft(view:DraftView,shopId:number,snapshot:DraftSnapshot){
 if(view.shopId!==shopId)fail('This Etsy draft belongs to another shop. Nothing further was changed.');
 if(view.state!=='draft')fail('This listing is no longer an Etsy draft. Finishing stopped; Goldie will not edit a live listing in draft mode.');
 const mismatch=operations(snapshot).find(op=>!same(currentValue(view,op.key),desiredValue(op)));
 if(mismatch)fail(`Etsy did not match the saved ${mismatch.key==='basic'?'listing details':mismatch.key==='questions'?'personalization':'attribute '+mismatch.key.split(':')[1]}. Review this draft before publishing.`);
}
/** At most one write. A lost response is reconciled by reading, never by repeating a POST. */
export async function draftStep(io:DraftIO,shopId:number,listingId:number,snapshot:DraftSnapshot,saved:DraftState|null){
 const view=await io.read();
 if(view.shopId!==shopId||view.state!=='draft')fail('The linked listing must be a draft in the original Etsy shop. No draft changes were made.');
 if(saved&&saved.listingId!==listingId)fail('Printify now links to another Etsy listing. Finishing stopped.');
 let state=saved||{listingId,index:0};const ops=operations(snapshot);
 if(!saved){await io.backup(view);await io.save(state)}
 if(state.pending){
  if(!same(currentValue(view,state.pending.key),desiredValue(state.pending)))fail('Etsy did not confirm the last draft change. Finishing paused to prevent duplicate or conflicting changes.');
  state={listingId,index:state.index+1};await io.save(state);
 }
 while(state.index<ops.length&&same(currentValue(view,ops[state.index].key),desiredValue(ops[state.index]))){state={listingId,index:state.index+1};await io.save(state)}
 if(state.index>=ops.length){verifyDraft(view,shopId,snapshot);state={...state,verified:true};await io.save(state);return {done:true}}
 // Final full readback also catches changes to earlier fields while finishing.
 const op=ops[state.index];await io.save({...state,pending:op});await io.write(op);
 return {done:false};
}
