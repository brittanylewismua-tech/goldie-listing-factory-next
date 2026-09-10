import {EtsyRateLimited} from '../../etsy/request-pacing';
import {backupPhotoChunk,type BackupReceipt} from './backup';
import {candidateWaitMs,transferPollMs} from './timing';
import {transferDraft,DraftTransferReviewRequired,type TransferState,type TransferProduct} from './transfer-engine';
import {verifyShopPairing} from '../../printify/shop-match';
import {etsyFetch} from '../../etsy/client';
import {DraftReviewRequired,DraftWriteRejected,type DraftSnapshot,type DraftState} from './draft-engine';
import {finishDraftMetadata,draftWithSize,synchronizeNarrowedInventory,type EtsyInventory,type PrintifyDraftProduct} from './draft-service';
import {env} from 'cloudflare:workers';
import {etsyConnection,etsyApiCredential,etsyBudget,recordEtsyCall,waitForEtsyCapacity} from '../../etsy/client';
import {decryptPrintifyToken} from '../../printify/token-crypto';
import {readPrintifyPublishState} from '../../printify/publish-state';
import {deliveryStep,DeliveryReviewRequired,type DeliveryImage,type DeliveryPhoto,type DeliveryState} from './engine';
export type DeliveryEnv={DB:D1Database;ARTWORK:R2Bucket;PRINTIFY_TOKEN_KEY:string;IMAGES?:{input(stream:ReadableStream):{output(options:{format:'image/jpeg';background:string;quality:number}):Promise<{response():Response}>}};PHOTO_DELIVERY:Workflow<{id:string;owner:string}>};
export type DeliveryRow={transfer_json?:string|null;draft_json?:string|null;draft_state_json?:string|null;id:string;user_id:string;product_id:string;printify_shop_id:number;etsy_shop_id:number;fingerprint:string;status:string;photos_json:string;state_json:string|null;candidate_listing_id:number|null;candidate_seen_at:number|null;error:string|null;created_at:number;updated_at:number;expires_at:number};
export const printifyWaitMessage=(automatic:boolean,locked:boolean,reason:string)=>automatic&&locked?null:reason+' Automatic checking will retry.';
export function deliveryMessage(value:string){return /Invalid redirect|UNIQUE constraint|SQLITE|TypeError|Cannot read|Unexpected token|binding/i.test(value)?'Photo delivery could not be prepared. Your original photos are saved. Please try again.':value.slice(0,500)}
export const deliveryEnv=()=>env as unknown as DeliveryEnv;
export const readDelivery=(id:string,owner:string)=>deliveryEnv().DB.prepare('SELECT * FROM photo_deliveries WHERE id=? AND user_id=?').bind(id,owner).first<DeliveryRow>();
export async function deliveryStatus(id:string,owner:string,status:string,error:string|null=null){await deliveryEnv().DB.prepare('UPDATE photo_deliveries SET status=?,error=?,updated_at=? WHERE id=? AND user_id=?').bind(status,error,Date.now(),id,owner).run()}
export async function limitedImage(response:Response){
  if(!response.ok||!response.body)throw Error('A listing photo could not be read.');
  const type=(response.headers.get('content-type')||'').split(';')[0];
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error('A listing photo has an unsupported file type.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20*1024*1024){await reader.cancel();throw Error('Each listing photo must be 20 MB or smaller.')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return {bytes,type};
}
function trustedImageUrl(value:string,host:'printify'|'etsy'){
  const url=new URL(value);if(url.protocol!=='https:'||!(host==='printify'?url.hostname==='images.printify.com':url.hostname==='i.etsystatic.com'))throw Error('The photo address could not be verified.');return url.toString();
}
export async function readSourceImage(src:string,wait:(ms:number)=>Promise<unknown>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  const originalUrl=trustedImageUrl(src,'printify');
  for(let attempt=0;attempt<3;attempt++){
    let currentUrl=originalUrl,response:Response|undefined,retryable=false;
    try{
      for(let redirect=0;redirect<3;redirect++){
        response=await fetch(currentUrl,{signal:AbortSignal.timeout(20000),redirect:'manual'});
        if(response.status>=300&&response.status<400&&response.headers.get('location')){
          await response.body?.cancel().catch(()=>undefined);
          if(redirect===2)throw Error('A listing photo could not be read.');
          currentUrl=trustedImageUrl(new URL(response.headers.get('location')!,currentUrl).toString(),'printify');
          continue;
        }
        break;
      }
    }catch(error){
      if(error instanceof Error&&/could not be verified/.test(error.message))throw error;
      if(attempt===2)throw Error('A listing photo could not be read.',{cause:error});
      await wait(attempt===0?250:750);continue;
    }
    if(response?.ok)return limitedImage(response);
    retryable=Boolean(response&&(response.status===429||response.status>=500));
    await response?.body?.cancel().catch(()=>undefined);
    if(!retryable||attempt===2)throw Error('A listing photo could not be read.');
    await wait(attempt===0?250:750);
  }
  throw Error('A listing photo could not be read.');
}
/** Etsy does not accept WebP and renders transparent PNG areas black. Match the editor's white photo background. */
export async function prepareEtsyImage(data:{bytes:Uint8Array;type:string}){
  if(data.type==='image/jpeg')return data;
  const images=deliveryEnv().IMAGES;if(!images)throw Error('Photo conversion is temporarily unavailable. Your original upload is safe.');
  const output=await images.input(new Blob([new Uint8Array(data.bytes)]).stream()).output({format:'image/jpeg',background:'#ffffff',quality:95});
  return limitedImage(output.response());
}

export async function runDeliveryTick(id:string,owner:string){
  const row=await readDelivery(id,owner);if(!row||!['waiting','delivering'].includes(row.status))return {done:true,progress:false};
  if(Date.now()>row.expires_at){await deliveryStatus(id,owner,'expired','Automatic checking ended after 24 hours. Prepare photo delivery again when you are ready to publish.');return {done:true,progress:false}}
  const runtime=deliveryEnv();
  try{
    const capacity=await runtime.DB.prepare('SELECT paused_until FROM etsy_queue_state WHERE id=1').first<{paused_until:number}>();
    if(capacity&&capacity.paused_until*1000>Date.now()){
      await deliveryStatus(id,owner,row.status,'Etsy asked The Listing Factory to slow down. Your saved draft will continue automatically.');
      return {done:false,progress:false,waitMs:Math.max(1000,capacity.paused_until*1000-Date.now())};
    }
    const connection=await etsyConnection(owner);
    if(Number(connection.shopId)!==row.etsy_shop_id)throw new DeliveryReviewRequired('The connected Etsy shop changed. Return to the original shop before preparing delivery again.');
    const tokenRow=await runtime.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(owner).first<{encrypted_token:string}>();
    if(!tokenRow)throw new DeliveryReviewRequired('Reconnect Printify to deliver the photos.');
    const token=await decryptPrintifyToken(tokenRow.encrypted_token,runtime.PRINTIFY_TOKEN_KEY);
    let printifyProduct:PrintifyDraftProduct|undefined;
    const published=await readPrintifyPublishState(async(url,init)=>{const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});if(response.ok){const product=await response.clone().json() as PrintifyDraftProduct;printifyProduct=product;if(product.is_locked)return new Response(null,{status:423})}return response},token,row.printify_shop_id,row.product_id);
    if(published.state!=='published'){
      if(row.state_json)throw new DeliveryReviewRequired('Printify could no longer confirm the linked Etsy listing. Delivery paused.');
      if(row.draft_json&&row.transfer_json&&published.state==='unpublished'){
        const shopsResponse=await fetch('https://api.printify.com/v1/shops.json',{headers:{Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory'},signal:AbortSignal.timeout(15000)});
        if(!shopsResponse.ok)throw Error('Printify could not verify the connected store.');
        const shops=await shopsResponse.json() as {id:number;sales_channel:string}[];
        if(!shops.some(shop=>Number(shop.id)===row.printify_shop_id&&shop.sales_channel==='etsy'))throw new DraftTransferReviewRequired('The selected Printify store is not connected to Etsy.');
        const transfer=JSON.parse(row.transfer_json) as TransferState;
        if(transfer.phase==='ready'){
          const pairing=await verifyShopPairing({printifyToken:token,printifyShopId:row.printify_shop_id,etsyShopId:row.etsy_shop_id,etsyToken:connection.token,etsyFetch});
          if(pairing.result==='mismatched')throw new DraftTransferReviewRequired('This Printify store is connected to a different Etsy shop. No draft was sent.');
        }
        const url=`https://api.printify.com/v1/shops/${row.printify_shop_id}/products/${row.product_id}`,headers={Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory','Content-Type':'application/json'};
        await transferDraft({
          inspect:async product=>{await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/printify-after-hidden.json`,JSON.stringify(product))},
          wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
          read:async()=>{const response=await fetch(`${url}.json`,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Printify could not verify the draft before transfer.');return response.json() as Promise<TransferProduct>},
          hide:async()=>{const response=await fetch(`${url}.json`,{method:'PUT',headers,body:JSON.stringify({visible:false}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Printify could not save the hidden draft setting. No transfer was sent.')},
          backup:async product=>{await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/printify-before-transfer.json`,JSON.stringify(product))},
          claim:async state=>{const claim=await runtime.DB.prepare("UPDATE photo_deliveries SET transfer_json=?,status='delivering',updated_at=? WHERE id=? AND user_id=? AND transfer_json=? AND status IN ('waiting','delivering')").bind(JSON.stringify(state),Date.now(),id,owner,row.transfer_json).run();return Boolean(claim.meta.changes)},
          save:async state=>{await runtime.DB.prepare('UPDATE photo_deliveries SET transfer_json=?,updated_at=? WHERE id=? AND user_id=?').bind(JSON.stringify(state),Date.now(),id,owner).run()},
          send:async()=>{const response=await fetch(`${url}/publish.json`,{method:'POST',headers,body:JSON.stringify({title:true,description:true,images:true,variants:true,tags:true,shipping_template:true}),signal:AbortSignal.timeout(25000)});return {ok:response.ok,status:response.status,detail:response.ok?undefined:(await response.text()).replace(/[<>]/g,'').slice(0,250)}},
        },row.product_id,transfer);
        return {done:false,progress:false,waitMs:10000};
      }
      if(published.state==='unknown')await deliveryStatus(id,owner,row.transfer_json?row.status:'waiting',printifyWaitMessage(Boolean(row.transfer_json),Boolean(printifyProduct?.is_locked),published.reason));
      else await deliveryStatus(id,owner,row.transfer_json?row.status:'waiting');
      const waitMs=transferPollMs(row.transfer_json?JSON.parse(row.transfer_json) as TransferState:null,Date.now());
      return waitMs?{done:false,progress:false,waitMs}:{done:false,progress:false};
    }
    if(row.state_json&&(JSON.parse(row.state_json) as DeliveryState).listingId!==published.listingId)throw new DeliveryReviewRequired('Printify now points to a different Etsy listing. Delivery stopped before any draft changes.');
    const automatic=Boolean(row.draft_json&&row.transfer_json);
    if(!row.state_json&&(row.candidate_listing_id!==published.listingId||!row.candidate_seen_at)){
      await runtime.DB.prepare('UPDATE photo_deliveries SET candidate_listing_id=?,candidate_seen_at=?,updated_at=?,error=NULL WHERE id=? AND user_id=?').bind(published.listingId,Date.now(),Date.now(),id,owner).run();
      return {done:false,progress:false,waitMs:candidateWaitMs(automatic,null,Date.now())};
    }
    const remainingWait=candidateWaitMs(automatic,row.candidate_seen_at,Date.now());
    if(!row.state_json&&remainingWait>0)return {done:false,progress:false,waitMs:remainingWait};
    if((await etsyBudget()).remaining<(row.draft_json?15:6)){await deliveryStatus(id,owner,row.status,'Waiting for Etsy API capacity. Your photo set is saved.');return {done:false,progress:false}}
    const request=async(path:string,init?:RequestInit)=>{
      await waitForEtsyCapacity();
      const response=await fetch(`https://api.etsy.com/v3/application${path}`,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)), 'x-api-key':etsyApiCredential(),Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(25000)});
      await recordEtsyCall(response);
      if(response.status===429)throw new EtsyRateLimited('Etsy asked The Listing Factory to slow down. Your saved draft will continue automatically.');
      if(!response.ok){const detail=(await response.text()).replace(/[<>]/g,'').slice(0,250);const message=`Etsy returned ${response.status}: ${detail}`;if(row.draft_json&&[400,401,403,404,409,422].includes(response.status))throw new DraftWriteRejected(message);throw Error(message);}
      return response;
    };
    const listingId=published.listingId,photos=JSON.parse(row.photos_json) as DeliveryPhoto[];
    // Reserve the editing phase before backup. Cancellation can win only before this claim.
    if(row.status==='waiting'){
      const claim=await runtime.DB.prepare("UPDATE photo_deliveries SET status='delivering',updated_at=? WHERE id=? AND user_id=? AND status='waiting'").bind(Date.now(),id,owner).run();
      if(!claim.meta.changes)return {done:true,progress:false};
    }
    const draftSnapshot=row.draft_json?draftWithSize(JSON.parse(row.draft_json) as DraftSnapshot,printifyProduct!):null;
    if(draftSnapshot?.selected_variant_ids?.length){
      const baselineKey=`photo-delivery/${owner}/inventory-baselines/${row.etsy_shop_id}/${listingId}/${row.product_id}.json`;
      const readBaseline=async()=>{
        const stable=await runtime.ARTWORK.get(baselineKey);if(stable)return stable.json<EtsyInventory>();
        const prior=await runtime.DB.prepare('SELECT id FROM photo_deliveries WHERE user_id=? AND product_id=? AND etsy_shop_id=? AND candidate_listing_id=? ORDER BY created_at ASC LIMIT 50').bind(owner,row.product_id,row.etsy_shop_id,listingId).all<{id:string}>();
        for(const candidate of prior.results||[]){const object=await runtime.ARTWORK.get(`photo-delivery/${owner}/${candidate.id}/inventory-backup.json`);if(object)return object.json<EtsyInventory>()}
        return null;
      };
      await synchronizeNarrowedInventory(request,listingId,row.etsy_shop_id,printifyProduct!,draftSnapshot,async inventory=>{
        const body=JSON.stringify(inventory);await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/inventory-backup.json`,body,{httpMetadata:{contentType:'application/json'}});
        if(!await runtime.ARTWORK.head(baselineKey))await runtime.ARTWORK.put(baselineKey,body,{httpMetadata:{contentType:'application/json'}});
      },readBaseline);
    }
    const metadataArgs=draftSnapshot?{request,listingId,shopId:row.etsy_shop_id,product:printifyProduct!,snapshot:draftSnapshot,saved:row.draft_state_json?JSON.parse(row.draft_state_json) as DraftState:null,
      save:async(state:DraftState)=>{await runtime.DB.prepare('UPDATE photo_deliveries SET draft_state_json=?,updated_at=? WHERE id=? AND user_id=?').bind(JSON.stringify(state),Date.now(),id,owner).run()},
      backup:async(view:unknown)=>{await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/draft-backup.json`,JSON.stringify(view),{httpMetadata:{contentType:'application/json'}})}
    }:null;
    if(metadataArgs&&!metadataArgs.saved?.verified){await finishDraftMetadata(metadataArgs);return {done:false,progress:true};}
    const result=await deliveryStep({
      read:async()=>{
        const listing=await (await request(`/listings/${listingId}`)).json() as {shop_id:number;state:string};
        // Validate ownership before requesting images, and before every possible mutation.
        if(Number(listing.shop_id)!==row.etsy_shop_id)throw new DeliveryReviewRequired('The Etsy listing belongs to a different shop. No photos were changed.');
        const images=await (await request(`/listings/${listingId}/images`)).json() as {results:DeliveryImage[]};
        if(!Array.isArray(images.results))throw Error('Etsy returned an unreadable photo list.');
        return {shopId:Number(listing.shop_id),state:listing.state,images:images.results};
      },
      backup:async images=>{
        const prefix=`photo-delivery/${owner}/${id}/`;
        return backupPhotoChunk(images,{
        load:async()=>{const object=await runtime.ARTWORK.get(prefix+'backup-progress.json');return object?object.json<BackupReceipt>():null},
        save:async receipt=>{await runtime.ARTWORK.put(prefix+'backup-progress.json',JSON.stringify(receipt),{httpMetadata:{contentType:'application/json'}})},
        copy:async image=>{
          if(!image.url_fullxfull)throw Error('An existing Etsy photo could not be backed up. No photos were changed.');
          const data=await limitedImage(await fetch(trustedImageUrl(image.url_fullxfull,'etsy'),{signal:AbortSignal.timeout(20000),redirect:'manual'}));
          await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/backup/${image.listing_image_id}`,data.bytes,{httpMetadata:{contentType:data.type}});
        },
        finish:async()=>{await runtime.ARTWORK.put(prefix+'backup.json',JSON.stringify(images),{httpMetadata:{contentType:'application/json'}})}
        });
      },
      save:async state=>{await runtime.DB.prepare("UPDATE photo_deliveries SET state_json=?,status='delivering',error=NULL,updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify(state),Date.now(),id,owner).run()},
      upload:async(photo,rank)=>{
        if(!photo.key.startsWith(`photo-delivery/${owner}/${id}/selected/`))throw new DeliveryReviewRequired('The saved photo ownership could not be verified.');
        const object=await runtime.ARTWORK.get(photo.key);if(!object)throw Error('A saved photo is missing.');
        const form=new FormData();form.set('image',new File([await object.arrayBuffer()],`photo-${rank}.${photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg'}`,{type:photo.type}));form.set('rank',String(rank));form.set('overwrite','true');
        const response=await request(`/shops/${row.etsy_shop_id}/listings/${listingId}/images`,{method:'POST',body:form});
        const image=await response.json() as {listing_image_id:number};return Number(image.listing_image_id);
      },
      remove:async imageId=>{await request(`/shops/${row.etsy_shop_id}/listings/${listingId}/images/${imageId}`,{method:'DELETE'})},
    },row.etsy_shop_id,listingId,photos,row.state_json?JSON.parse(row.state_json) as DeliveryState:null,row.draft_json?'draft':'active');
    if(result.done&&metadataArgs)await finishDraftMetadata({...metadataArgs,verifyOnly:true});
    if(result.done)await deliveryStatus(id,owner,'completed');
    return {done:result.done,progress:true};
  }catch(error){
    const latest=await readDelivery(id,owner),uncertain=latest?.state_json&&(JSON.parse(latest.state_json) as DeliveryState).pending;
    const metadataPending=latest?.draft_state_json&&(JSON.parse(latest.draft_state_json) as DraftState).pending;
    const terminal=error instanceof DraftTransferReviewRequired||error instanceof DeliveryReviewRequired||error instanceof DraftReviewRequired||Boolean(uncertain);
    await deliveryStatus(id,owner,terminal?'needs_attention':latest?.state_json||metadataPending||(latest?.transfer_json&&['submitted','accepted'].includes(JSON.parse(latest.transfer_json).phase))?'delivering':row.status,uncertain?'Etsy did not confirm the last photo change. Delivery paused to prevent duplicate uploads. Contact support with this batch.':error instanceof Error?error.message:'Photo delivery could not finish.');
    return {done:terminal,progress:false};
  }
}
