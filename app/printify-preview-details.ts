export type PreviewDetail={src:string;variantIds:number[];position:string};
function canonical(src:string){try{const url=new URL(src);url.searchParams.delete('goldie_artwork');return url.toString()}catch{return src}}
/** Camera angles survive metadata/variant saves. One artwork revision invalidates
 * their cache; simply opening Preview must not download every image again. */
export function mergePreviewDetails(groups:PreviewDetail[][],revision?:number):PreviewDetail[]{
  const images=new Map<string,PreviewDetail>();
  for(const group of groups)for(const image of group){
    if(!image.src)continue;
    const key=canonical(image.src);
    const src=revision?`${key}${key.includes('?')?'&':'?'}goldie_artwork=${revision}`:key;
    images.set(key,{...image,src});
  }
  return [...images.values()];
}
