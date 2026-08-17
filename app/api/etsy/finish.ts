import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, etsyFetch } from "./client";

type Listing={listing_id:number;shop_id:number;title?:string};
type PersonalizationQuestion={id?:string;type:"text_input"|"dropdown"|"unlabeled_upload";question:string;instructions?:string;required:boolean;maxCharacters?:number;maxFiles?:number;options?:string[]};
type EtsyDetails={category?:string;taxonomyId?:number;properties?:Array<{propertyId:number;valueId?:number|null;value:string}>;attributes?:Record<string,string>;optional?:Record<string,string>;personalization?:{enabled:boolean;questions:PersonalizationQuestion[]}};
type DraftData={id:string;batchId?:string;description?:string;etsyDetails?:EtsyDetails;etsyShippingProfileId?:number};
type TaxonomyNode={id:number;name:string;children?:TaxonomyNode[]};
type EtsyProperty={property_id:number;display_name?:string;name?:string;possible_values?:Array<{value_id:number;name:string}>};
type Runtime={DB:D1Database;ARTWORK:R2Bucket};
const runtime=()=>env as unknown as Runtime;
const words=(value:string)=>new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2));
const flatten=(nodes:TaxonomyNode[]):TaxonomyNode[]=>nodes.flatMap(node=>[node,...flatten(node.children||[])]);
function chooseTaxonomy(nodes:TaxonomyNode[],details:EtsyDetails){const target=words(details.category||"");return flatten(nodes).map(node=>({node,score:[...words(node.name)].filter(word=>target.has(word)).length*10+(node.name.toLowerCase()===String(details.category||"").toLowerCase()?100:0)})).sort((a,b)=>b.score-a.score)[0]}
async function applyEtsyDetails(token:string,shopId:number,listingId:number,details:EtsyDetails,shippingProfileId:number,description:string){
  const tree=await etsyFetch<{results?:TaxonomyNode[]}>("/seller-taxonomy/nodes",token),match=chooseTaxonomy(tree.results||[],details);
  const taxonomyId=Number(details.taxonomyId)||match?.node.id;if(!taxonomyId||!match&& !details.taxonomyId)throw new Error(`Goldie could not safely match the Etsy category “${details.category||"unknown"}”. Review this listing before publishing.`);
  const listingBody=new URLSearchParams({taxonomy_id:String(taxonomyId),shipping_profile_id:String(shippingProfileId),description});
  await etsyFetch(`/shops/${shopId}/listings/${listingId}`,token,{method:"PATCH",body:listingBody});
  if(details.properties?.length){for(const property of details.properties){if(!property.value.trim()&&!property.valueId)continue;const body=new URLSearchParams();if(property.valueId)body.append("value_ids",String(property.valueId));else body.append("values",property.value);await etsyFetch(`/shops/${shopId}/listings/${listingId}/properties/${property.propertyId}`,token,{method:"PUT",body})}return}
  const propertyPayload=await etsyFetch<{results?:EtsyProperty[]}>(`/seller-taxonomy/nodes/${taxonomyId}/properties`,token),properties=propertyPayload.results||[],requested={...(details.attributes||{}),...(details.optional||{})};
  for(const [label,value] of Object.entries(requested)){if(!value.trim())continue;const labelWords=words(label),property=properties.map(item=>({item,score:[...words(item.display_name||item.name||"")].filter(word=>labelWords.has(word)).length})).sort((a,b)=>b.score-a.score)[0];if(!property||property.score<=0)continue;const body=new URLSearchParams(),valueWords=words(value),choice=(property.item.possible_values||[]).map(item=>({item,score:[...words(item.name)].filter(word=>valueWords.has(word)).length+(item.name.toLowerCase()===value.toLowerCase()?10:0)})).sort((a,b)=>b.score-a.score)[0];if(choice&&choice.score>0)body.append("value_ids",String(choice.item.value_id));else body.append("values",value);await etsyFetch(`/shops/${shopId}/listings/${listingId}/properties/${property.item.property_id}`,token,{method:"PUT",body})}
}
async function applyPersonalization(token:string,shopId:number,listingId:number,details:EtsyDetails){
  if(details.personalization===undefined)return;
  if(!details.personalization.enabled){await etsyFetch(`/shops/${shopId}/listings/${listingId}/personalization`,token,{method:"DELETE"});return}
  const questions=details.personalization.questions.slice(0,5).map(question=>{
    const base={question_text:String(question.question||"Personalization").trim().slice(0,120),question_type:question.type,required:Boolean(question.required)};
    if(question.type==="dropdown")return{...base,options:(question.options||[]).map(label=>({label:label.trim()})).filter(option=>option.label).slice(0,20)};
    if(question.type==="unlabeled_upload")return{...base,instructions:String(question.instructions||"").trim().slice(0,120),max_allowed_files:Math.max(1,Math.min(10,Number(question.maxFiles)||1))};
    return{...base,instructions:String(question.instructions||"").trim().slice(0,120),max_allowed_characters:Math.max(1,Math.min(1024,Number(question.maxCharacters)||256))};
  });
  if(!questions.length)throw new Error("Add at least one personalization question or turn personalization off.");
  await etsyFetch(`/shops/${shopId}/listings/${listingId}/personalization?supports_multiple_personalization_questions=true`,token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({personalization_questions:questions})});
}
async function applyListingImages(userId:string,token:string,shopId:number,listingId:number,productId:string,keptPrintifyIndices:number[]){
  const current=await etsyFetch<{results?:Array<{listing_image_id:number;rank?:number}>}>(`/listings/${listingId}/images`,token),images=current.results||[],keep=new Set(keptPrintifyIndices);
  for(let index=0;index<images.length;index++)if(!keep.has(index))await etsyFetch(`/shops/${shopId}/listings/${listingId}/images/${images[index].listing_image_id}`,token,{method:"DELETE"});
  const prefix=`etsy-listing-images/${userId}/${productId}/`,stored=await runtime().ARTWORK.list({prefix}),ordered=[...stored.objects].sort((a,b)=>a.key.includes("/size-guide/")?1:b.key.includes("/size-guide/")?-1:a.uploaded.getTime()-b.uploaded.getTime()),available=Math.max(0,10-Math.min(10,keep.size));
  for(const object of ordered.slice(0,available)){const value=await runtime().ARTWORK.get(object.key);if(!value)continue;const form=new FormData(),fileName=value.customMetadata?.name||object.key.split("/").pop()||"listing-image.jpg";form.set("image",new File([await value.arrayBuffer()],fileName,{type:value.httpMetadata?.contentType||"image/jpeg"}));const response=await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,{method:"POST",headers:{"x-api-key":etsyApiCredential(),Authorization:`Bearer ${token}`},body:form});if(!response.ok)throw new Error(`Etsy rejected ${fileName} (${response.status}).`)}
}

export async function finishEtsyListing(userId:string,draft:DraftData,listingId:number,printifyImageIndices:number[]){
  const connection=await etsyConnection(userId);
  const listing=await etsyFetch<Listing>(`/listings/${listingId}`,connection.token);
  if(Number(listing.shop_id)!==Number(connection.shopId))throw new Error("Etsy returned a listing from a different shop. Goldie stopped without editing it.");
  if(!draft.etsyDetails?.category)throw new Error("Etsy category details are missing for this listing.");
  if(!draft.etsyShippingProfileId)throw new Error("Choose an Etsy shipping profile before publishing.");
  await applyEtsyDetails(connection.token,connection.shopId,listingId,draft.etsyDetails,draft.etsyShippingProfileId,String(draft.description||""));
  await applyPersonalization(connection.token,connection.shopId,listingId,draft.etsyDetails);
  await applyListingImages(userId,connection.token,connection.shopId,listingId,draft.id,printifyImageIndices);
  await env.DB.prepare("INSERT INTO etsy_listing_links (printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at) VALUES (?,?,?,?, 'finished',NULL,CURRENT_TIMESTAMP) ON CONFLICT(printify_product_id) DO UPDATE SET etsy_listing_id=excluded.etsy_listing_id,status='finished',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(draft.id,userId,draft.batchId||"",listingId).run();
  return {listingId,shopId:connection.shopId,url:`https://www.etsy.com/listing/${listingId}`};
}
