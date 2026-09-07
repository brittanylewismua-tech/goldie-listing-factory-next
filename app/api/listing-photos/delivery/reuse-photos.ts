import type {DeliveryState} from './engine';
type HashedPhoto={key:string;type:string;digest?:string};
export const photoDigest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,'0')).join('');
/** Only completed, exact-content receipts may be carried forward. deliveryStep still verifies live Etsy image IDs/order. */
export async function reusablePhotoReceipt(previous:{status:string;photos:HashedPhoto[];state:DeliveryState|null;prefix:string},next:HashedPhoto[],readDigest:(key:string)=>Promise<string|null>):Promise<DeliveryState|null>{
 const state=previous.state;
 if(previous.status!=='completed'||!state||state.pending||!Number.isSafeInteger(state.listingId)||state.listingId<=0||!next.length||previous.photos.length!==next.length||state.uploaded.length!==next.length||state.expected.length!==next.length)return null;
 if(state.uploaded.some((id,index)=>!Number.isSafeInteger(id)||id<=0||!state.expected.some(image=>image.rank===index+1&&image.listing_image_id===id)))return null;
 for(let i=0;i<next.length;i++){
  const old=previous.photos[i];if(!old.key.startsWith(previous.prefix)||!next[i].digest||old.type!==next[i].type)return null;
  const digest=old.digest||await readDigest(old.key);if(!digest||digest!==next[i].digest)return null;
 }
 return {...state,expected:state.expected.map(image=>({...image})),uploaded:[...state.uploaded]};
}
