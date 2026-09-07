import {EtsyRateLimited} from '../../etsy/request-pacing';
/** Photos only. This module has no listing creation, publication or renewal capability. */
export type DeliveryImage={listing_image_id:number;rank:number;url_fullxfull?:string};
export type DeliveryState={listingId:number;expected:DeliveryImage[];uploaded:number[];pending?:{rank:number;imageId?:number};startedAt:number};
export type DeliveryPhoto={key:string;type:string};
export type DeliveryIO={
  read():Promise<{shopId:number;state:string;images:DeliveryImage[]}>;
  backup(images:DeliveryImage[]):Promise<void|boolean>;
  save(state:DeliveryState):Promise<void>;
  upload(photo:DeliveryPhoto,rank:number):Promise<number>;
  remove(imageId:number):Promise<void>;
};
export class DeliveryReviewRequired extends Error{}
const signature=(images:DeliveryImage[])=>JSON.stringify([...images].sort((a,b)=>a.rank-b.rank).map(i=>[i.rank,i.listing_image_id]));
export function checkDeliveryListing(actual:{shopId:number;state:string},shopId:number,targetState:'active'|'draft'='active'){
  if(actual.shopId!==shopId)throw new DeliveryReviewRequired('The Etsy listing belongs to a different shop. No photos were changed.');
  if(actual.state!==targetState)throw new DeliveryReviewRequired(targetState==='draft'?'This listing is no longer an Etsy draft. Draft photo delivery stopped.':'This Etsy listing is not active. Publish it yourself in Printify before delivering its photos.');
}
/** One durable operation per call. A pending write is never blindly repeated. */
export async function deliveryStep(io:DeliveryIO,shopId:number,listingId:number,photos:DeliveryPhoto[],saved:DeliveryState|null,targetState:'active'|'draft'='active'){
  if(!Number.isSafeInteger(listingId)||listingId<=0||photos.length<1||photos.length>20)throw new DeliveryReviewRequired('Choose between 1 and 20 photos for this listing.');
  const current=await io.read();checkDeliveryListing(current,shopId,targetState);
  let state=saved;
  if(state&&state.listingId!==listingId)throw new DeliveryReviewRequired('Printify now points to a different Etsy listing. Delivery stopped.');
  if(state?.pending)throw new DeliveryReviewRequired('Etsy did not confirm the last photo change. Delivery paused to prevent duplicate uploads. Contact support to check the saved delivery receipt.');
  if(!state){
    if(await io.backup(current.images)===false)return {done:false,state:null};
    state={listingId,expected:current.images,uploaded:[],startedAt:Date.now()};
    await io.save(state);
  }
  if(signature(current.images)!==signature(state.expected))throw new DeliveryReviewRequired('These Etsy photos changed outside this delivery. Delivery paused to protect those edits.');
  if(state.uploaded.length<photos.length){
    const rank=state.uploaded.length+1;
    const next={...state,pending:{rank}};await io.save(next);
    let imageId:number;
    try{imageId=await io.upload(photos[rank-1],rank)}catch(error){
      if(error instanceof EtsyRateLimited)await io.save(state);
      throw error;
    }
    if(!Number.isSafeInteger(imageId)||imageId<=0)throw new DeliveryReviewRequired('Etsy did not return a photo receipt. Delivery paused; it will not upload that photo again.');
    state={...state,uploaded:[...state.uploaded,imageId],expected:[...state.expected.filter(i=>i.rank!==rank),{rank,listing_image_id:imageId}]};
    await io.save(state);
    return {done:false,state};
  }
  // Remove only the exact original surplus IDs, after all chosen photos have receipts.
  const extra=[...state.expected].filter(i=>i.rank>photos.length).sort((a,b)=>b.rank-a.rank)[0];
  if(extra){
    await io.save({...state,pending:{rank:extra.rank,imageId:extra.listing_image_id}});
    try{await io.remove(extra.listing_image_id)}catch(error){
      if(error instanceof EtsyRateLimited)await io.save(state);
      throw error;
    }
    state={...state,expected:state.expected.filter(i=>i.listing_image_id!==extra.listing_image_id)};
    await io.save(state);return {done:false,state};
  }
  // This read follows all writes; completion cannot be inferred from upload responses alone.
  if(state.uploaded.some((id,index)=>!current.images.some(i=>i.rank===index+1&&i.listing_image_id===id))||current.images.length!==photos.length)throw new DeliveryReviewRequired('Etsy photo order could not be verified. Delivery paused for review.');
  return {done:true,state};
}
