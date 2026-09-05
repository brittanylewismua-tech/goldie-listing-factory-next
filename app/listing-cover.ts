import {mergePhotoOrder} from './photo-order-state.ts';
export function listingCoverUrl(images:string[],selected:number[],stored:Array<{id:string;src:string}>,savedOrder:string[],fallback=''):string{
  const photos=[...stored,...selected.filter(index=>Boolean(images[index])).map(index=>({id:`printify:${index}`,src:images[index]}))];
  const first=mergePhotoOrder(photos.map(photo=>photo.id),savedOrder,[])[0];
  return photos.find(photo=>photo.id===first)?.src||fallback;
}
