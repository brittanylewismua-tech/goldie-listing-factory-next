import type {DeliveryImage} from './engine';
export type BackupReceipt={images:DeliveryImage[];completed:number[]};
/** Four photos per durable tick, at most two buffers in memory. No Etsy writes. */
export async function backupPhotoChunk(images:DeliveryImage[],io:{load():Promise<BackupReceipt|null>;save(receipt:BackupReceipt):Promise<void>;copy(image:DeliveryImage):Promise<void>;finish():Promise<void>}){
 const signature=(items:DeliveryImage[])=>JSON.stringify(items.map(i=>[i.listing_image_id,i.rank,i.url_fullxfull]).sort((a,b)=>Number(a[0])-Number(b[0])));
 const old=await io.load();
 if(old&&signature(old.images)!==signature(images))throw Error('The Etsy photos changed while their backup was being saved. No photos were replaced.');
 const receipt=old||{images,completed:[]};
 if(!old)await io.save(receipt);
 const remaining=images.filter(i=>!receipt.completed.includes(i.listing_image_id)).slice(0,4);
 for(let offset=0;offset<remaining.length;offset+=2){
  const pair=remaining.slice(offset,offset+2);
  const results=await Promise.allSettled(pair.map(image=>io.copy(image)));
  results.forEach((result,index)=>{if(result.status==='fulfilled')receipt.completed.push(pair[index].listing_image_id)});
  await io.save(receipt);
  const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 }
 if(images.some(image=>!receipt.completed.includes(image.listing_image_id)))return false;
 await io.finish();return true;
}
