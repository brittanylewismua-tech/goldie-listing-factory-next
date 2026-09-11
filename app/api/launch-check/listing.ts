import {env} from 'cloudflare:workers';
import {unpackDraftMedia} from '@/app/draft-media-storage';
import {decryptPrintifyToken} from '../printify/token-crypto';
import {etsyConnection,etsyApiCredential,etsyBudget,recordEtsyCall} from '../etsy/client';
/** Read-only owner diagnostics. Candidate matches are never linked or modified automatically. */
export async function inspectLaunchListing(owner:string,productId:string){
 const runtime=env as unknown as {DB:D1Database;ARTWORK:R2Bucket;PRINTIFY_TOKEN_KEY:string};
 const owned=await runtime.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(owner,productId).first<{response_json:string}>();
 if(!owned)throw Error('That The Listing Factory draft does not belong to this account.');
 const draft=await unpackDraftMedia(owned.response_json,owner,runtime.ARTWORK) as {shopId:number};
 const connection=await runtime.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(owner).first<{encrypted_token:string}>();
 if(!connection)throw Error('Printify is not connected.');
 const token=await decryptPrintifyToken(connection.encrypted_token,runtime.PRINTIFY_TOKEN_KEY);
 const response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${productId}.json`,{headers:{Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Printify could not read the QA product.');
 const product=await response.json() as {title:string;external?:{id?:string|number};is_locked?:boolean;variants:Array<{id:number;sku?:string;price:number;is_enabled:boolean}>;print_areas?:unknown};
 const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const etsy=await etsyConnection(owner);
 if((await etsyBudget()).remaining<4)throw Error('Wait for Etsy API capacity before checking.');
 const matches:Array<{id:number;title:string;state:string;url:string}> = [],scans:Array<{state:string;count:number;scanned:number;complete:boolean}>=[];
 for(const state of ['draft','active','inactive']){
  const result=await fetch(`https://api.etsy.com/v3/application/shops/${etsy.shopId}/listings?state=${state}&limit=100&sort_on=created&sort_order=desc`,{headers:{'x-api-key':etsyApiCredential(),Authorization:`Bearer ${etsy.token}`},signal:AbortSignal.timeout(20000)});
  await recordEtsyCall(result,"qa");if(!result.ok)throw Error(`Etsy could not read ${state} listings (${result.status}).`);
  const page=await result.json() as {count:number;results:Array<{listing_id:number;title:string;state:string;url:string}>};
  scans.push({state,count:page.count,scanned:page.results.length,complete:page.count<=page.results.length});
  for(const listing of page.results)if(listing.title===product.title)matches.push({id:listing.listing_id,title:listing.title,state:listing.state,url:listing.url});
 }
 return {readOnly:true,productId,title:product.title,etsyShopId:etsy.shopId,linkedListingId:Number(product.external?.id)||null,locked:!!product.is_locked,variants:product.variants.length,enabled:product.variants.filter(v=>v.is_enabled).length,maxSkuLength:Math.max(0,...product.variants.map(v=>(v.sku||'').length)),prices:[...new Set(product.variants.filter(v=>v.is_enabled).map(v=>v.price))],variantFingerprint:await hash(product.variants.map(({id,price,is_enabled})=>({id,price,is_enabled}))),artworkFingerprint:await hash(product.print_areas),exactTitleMatches:matches,scans};
}

/** Delete only explicitly named, owner-created QA drafts after a complete
 * provider preflight. This maintenance path cannot select customer products. */
export async function cleanupLaunchListings(owner:string,batchIds:string[]){
 const runtime=env as unknown as {DB:D1Database;ARTWORK:R2Bucket;PRINTIFY_TOKEN_KEY:string};
 if(batchIds.length<1||batchIds.length>8||batchIds.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))throw Error('Choose 1 to 8 exact QA provider batch IDs.');
 const marks=batchIds.map(()=>'?').join(',');
 const rows=await runtime.DB.prepare(`SELECT batch_id,response_json FROM printify_draft_results WHERE user_id=? AND batch_id IN (${marks}) AND status='succeeded'`).bind(owner,...batchIds).all<{batch_id:string;response_json:string}>();
 if(!rows.results.length||new Set(rows.results.map(row=>row.batch_id)).size!==new Set(batchIds).size)throw Error('Every QA provider batch must belong to this account and contain a successful draft.');
 const drafts=await Promise.all(rows.results.map(async row=>unpackDraftMedia(row.response_json,owner,runtime.ARTWORK) as Promise<{id:string;shopId:number;title:string}>));
 const unique=[...new Map(drafts.map(draft=>[draft.id,draft])).values()];
 if(unique.some(draft=>!/^QA (?:CAPACITY|E2E)/.test(draft.title)))throw Error('Cleanup is restricted to exact QA CAPACITY or QA E2E products.');
 const connection=await runtime.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(owner).first<{encrypted_token:string}>();
 if(!connection)throw Error('Printify is not connected.');
 const token=await decryptPrintifyToken(connection.encrypted_token,runtime.PRINTIFY_TOKEN_KEY),headers={Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory'};
 const etsy=await etsyConnection(owner),etsyHeaders={'x-api-key':etsyApiCredential(),Authorization:`Bearer ${etsy.token}`};
 const products:Array<{id:string;shopId:number;title:string;etsyId:number|null;missing:boolean}>=[];
 for(const draft of unique){
  const response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${draft.id}.json`,{headers,signal:AbortSignal.timeout(15000)});
  if(response.status===404){products.push({...draft,etsyId:null,missing:true});continue}
  if(!response.ok)throw Error('Printify could not preflight every exact QA product. Nothing was deleted.');
  const product=await response.json() as {title:string;external?:{id?:string|number}};
  if(!/^QA (?:CAPACITY|E2E)/.test(product.title)||product.title!==draft.title)throw Error('A selected product is no longer the exact QA draft. Nothing was deleted.');
  const etsyId=Number(product.external?.id)||null;
  if(etsyId){
   const listingResponse=await fetch(`https://api.etsy.com/v3/application/listings/${etsyId}`,{headers:etsyHeaders,signal:AbortSignal.timeout(15000)});await recordEtsyCall(listingResponse,"qa");
   if(!listingResponse.ok)throw Error('Etsy could not preflight every linked QA draft. Nothing was deleted.');
   const listing=await listingResponse.json() as {shop_id:number;state:string;title:string};
   if(Number(listing.shop_id)!==Number(etsy.shopId)||listing.state!=='draft'||!/^QA (?:CAPACITY|E2E)/.test(listing.title))throw Error('A linked Etsy item is not an exact QA draft. Nothing was deleted.');
  }
  products.push({...draft,etsyId,missing:false});
 }
 const deletedEtsy:number[]=[],pendingEtsy:number[]=[];let etsyDeleteError='';
 for(const product of products){if(!product.etsyId)continue;try{const response=await fetch(`https://api.etsy.com/v3/application/listings/${product.etsyId}`,{method:'DELETE',headers:etsyHeaders,signal:AbortSignal.timeout(15000)});await recordEtsyCall(response,"qa");if(!response.ok)throw Error(`Etsy returned ${response.status}.`);deletedEtsy.push(product.etsyId)}catch(error){pendingEtsy.push(product.etsyId);etsyDeleteError=error instanceof Error?error.message:'Etsy could not delete the QA draft.'}}
 const deletedPrintify:string[]=[],alreadyMissingPrintify=products.filter(product=>product.missing).map(product=>product.id);
 for(const product of products){if(product.missing)continue;const response=await fetch(`https://api.printify.com/v1/shops/${product.shopId}/products/${product.id}.json`,{method:'DELETE',headers,signal:AbortSignal.timeout(15000)});if(!response.ok&&response.status!==404)throw Error(`Printify could not delete QA product ${product.id}.`);(response.status===404?alreadyMissingPrintify:deletedPrintify).push(product.id)}
 return {deletedPrintify,alreadyMissingPrintify,deletedEtsy,pendingEtsy,etsyDeleteError,productIds:products.map(product=>product.id),etsyListingIds:products.flatMap(product=>product.etsyId?[product.etsyId]:[])};
}
