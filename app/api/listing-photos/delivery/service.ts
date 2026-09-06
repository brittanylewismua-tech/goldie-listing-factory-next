import {env} from 'cloudflare:workers';
import {etsyConnection,etsyApiCredential,etsyBudget,recordEtsyCall} from '../../etsy/client';
import {decryptPrintifyToken} from '../../printify/token-crypto';
import {readPrintifyPublishState} from '../../printify/publish-state';
import {deliveryStep,DeliveryReviewRequired,type DeliveryImage,type DeliveryPhoto,type DeliveryState} from './engine';
export type DeliveryEnv={DB:D1Database;ARTWORK:R2Bucket;PRINTIFY_TOKEN_KEY:string;IMAGES?:{input(stream:ReadableStream):{output(options:{format:'image/jpeg';background:string;quality:number}):Promise<{response():Response}>}};PHOTO_DELIVERY:Workflow<{id:string;owner:string}>};
export type DeliveryRow={id:string;user_id:string;product_id:string;printify_shop_id:number;etsy_shop_id:number;fingerprint:string;status:string;photos_json:string;state_json:string|null;candidate_listing_id:number|null;candidate_seen_at:number|null;error:string|null;created_at:number;updated_at:number;expires_at:number};
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
export async function readSourceImage(src:string){return limitedImage(await fetch(trustedImageUrl(src,'printify'),{signal:AbortSignal.timeout(20000),redirect:'manual'}))}
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
    const connection=await etsyConnection(owner);
    if(Number(connection.shopId)!==row.etsy_shop_id)throw new DeliveryReviewRequired('The connected Etsy shop changed. Return to the original shop before preparing delivery again.');
    const tokenRow=await runtime.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(owner).first<{encrypted_token:string}>();
    if(!tokenRow)throw new DeliveryReviewRequired('Reconnect Printify to deliver the photos.');
    const token=await decryptPrintifyToken(tokenRow.encrypted_token,runtime.PRINTIFY_TOKEN_KEY);
    const published=await readPrintifyPublishState(async(url,init)=>{const response=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});if(response.ok){const product=await response.clone().json() as {is_locked?:boolean};if(product.is_locked)return new Response(null,{status:423})}return response},token,row.printify_shop_id,row.product_id);
    if(published.state!=='published'){
      if(row.state_json)throw new DeliveryReviewRequired('Printify could no longer confirm the linked Etsy listing. Delivery paused.');
      if(published.state==='unknown')await deliveryStatus(id,owner,'waiting',published.reason+' Automatic checking will retry.');
      else await deliveryStatus(id,owner,'waiting');
      return {done:false,progress:false};
    }
    if(!row.state_json&&(row.candidate_listing_id!==published.listingId||!row.candidate_seen_at)){
      await runtime.DB.prepare('UPDATE photo_deliveries SET candidate_listing_id=?,candidate_seen_at=?,updated_at=?,error=NULL WHERE id=? AND user_id=?').bind(published.listingId,Date.now(),Date.now(),id,owner).run();
      return {done:false,progress:false,waitMs:30000};
    }
    if(!row.state_json&&Date.now()-Number(row.candidate_seen_at)<30000)return {done:false,progress:false,waitMs:30000};
    if((await etsyBudget()).remaining<6){await deliveryStatus(id,owner,row.status,'Waiting for Etsy API capacity. Your photo set is saved.');return {done:false,progress:false}}
    const request=async(path:string,init?:RequestInit)=>{
      const response=await fetch(`https://api.etsy.com/v3/application${path}`,{...init,headers:{'x-api-key':etsyApiCredential(),Authorization:`Bearer ${connection.token}`},signal:AbortSignal.timeout(25000)});
      await recordEtsyCall(response);
      if(!response.ok)throw Error(`Etsy returned ${response.status}.`);
      return response;
    };
    const listingId=published.listingId,photos=JSON.parse(row.photos_json) as DeliveryPhoto[];
    // Reserve the editing phase before backup. Cancellation can win only before this claim.
    if(row.status==='waiting'){
      const claim=await runtime.DB.prepare("UPDATE photo_deliveries SET status='delivering',updated_at=? WHERE id=? AND user_id=? AND status='waiting'").bind(Date.now(),id,owner).run();
      if(!claim.meta.changes)return {done:true,progress:false};
    }
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
        for(const image of images){
          if(!image.url_fullxfull)throw Error('An existing Etsy photo could not be backed up. No photos were changed.');
          const data=await limitedImage(await fetch(trustedImageUrl(image.url_fullxfull,'etsy'),{signal:AbortSignal.timeout(20000),redirect:'manual'}));
          await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/backup/${image.listing_image_id}`,data.bytes,{httpMetadata:{contentType:data.type}});
        }
        await runtime.ARTWORK.put(`photo-delivery/${owner}/${id}/backup.json`,JSON.stringify(images),{httpMetadata:{contentType:'application/json'}});
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
    },row.etsy_shop_id,listingId,photos,row.state_json?JSON.parse(row.state_json) as DeliveryState:null);
    if(result.done)await deliveryStatus(id,owner,'completed');
    return {done:result.done,progress:true};
  }catch(error){
    const latest=await readDelivery(id,owner),uncertain=latest?.state_json&&(JSON.parse(latest.state_json) as DeliveryState).pending;
    const terminal=error instanceof DeliveryReviewRequired||Boolean(uncertain);
    await deliveryStatus(id,owner,terminal?'needs_attention':latest?.state_json?'delivering':row.status,uncertain?'Etsy did not confirm the last photo change. Delivery paused to prevent duplicate uploads. Contact support with this batch.':error instanceof Error?error.message:'Photo delivery could not finish.');
    return {done:terminal,progress:false};
  }
}
