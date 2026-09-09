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
  await recordEtsyCall(result);if(!result.ok)throw Error(`Etsy could not read ${state} listings (${result.status}).`);
  const page=await result.json() as {count:number;results:Array<{listing_id:number;title:string;state:string;url:string}>};
  scans.push({state,count:page.count,scanned:page.results.length,complete:page.count<=page.results.length});
  for(const listing of page.results)if(listing.title===product.title)matches.push({id:listing.listing_id,title:listing.title,state:listing.state,url:listing.url});
 }
 return {readOnly:true,productId,title:product.title,etsyShopId:etsy.shopId,linkedListingId:Number(product.external?.id)||null,locked:!!product.is_locked,variants:product.variants.length,enabled:product.variants.filter(v=>v.is_enabled).length,maxSkuLength:Math.max(0,...product.variants.map(v=>(v.sku||'').length)),prices:[...new Set(product.variants.filter(v=>v.is_enabled).map(v=>v.price))],variantFingerprint:await hash(product.variants.map(({id,price,is_enabled})=>({id,price,is_enabled}))),artworkFingerprint:await hash(product.print_areas),exactTitleMatches:matches,scans};
}
