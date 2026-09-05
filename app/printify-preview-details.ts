export type PreviewDetail={src:string;variantIds:number[];position:string};
function canonical(src:string){try{const url=new URL(src);url.searchParams.delete('goldie_artwork');return url.toString()}catch{return src}}
export function printifyMockupIdentity(src:string,acrossProducts=false){
  try{
    const url=new URL(src),match=url.pathname.match(/^\/mockup\/([^/]+)\/(\d+)\/(\d+)(?:\/|$)/);
    if(url.hostname!=="images.printify.com"||!match)return canonical(src);
    for(const key of ["goldie_artwork","camera_label","s"])url.searchParams.delete(key);
    url.searchParams.sort();
    return `${acrossProducts?"":match[1]+":"}${match[2]}:${match[3]}?${url.searchParams}`;
  }catch{return src}
}
export function uniqueMockupEntries(images:string[],selected:number[]=[]){
  const chosen=new Set(selected),entries=new Map<string,{src:string;index:number}>();
  images.forEach((src,index)=>{
    const key=printifyMockupIdentity(src),previous=entries.get(key);
    if(!previous||(!chosen.has(previous.index)&&chosen.has(index)))entries.set(key,{src,index});
  });
  return [...entries.values()];
}
export function correspondingMockupIndices(source:string[],selected:number[],target:string[]){
  const wanted=new Set(selected.filter(index=>source[index]).map(index=>printifyMockupIdentity(source[index],true)));
  return uniqueMockupEntries(target).filter(item=>wanted.has(printifyMockupIdentity(item.src,true))).map(item=>item.index);
}
/** Camera angles survive metadata/variant saves. One artwork revision invalidates
 * their cache; simply opening Preview must not download every image again. */
export function mergePreviewDetails(groups:PreviewDetail[][],revision?:number):PreviewDetail[]{
  // The first group is persisted: its indices are referenced by selected photos
  // and photo order. Never compact those slots during an unrelated draft save.
  const images:PreviewDetail[]=[],slots=new Map<string,number[]>();
  groups.forEach((group,groupIndex)=>{for(const image of group){
    if(!image.src)continue;
    const url=canonical(image.src),key=printifyMockupIdentity(url);
    const src=revision?`${url}${url.includes('?')?'&':'?'}goldie_artwork=${revision}`:url;
    const existing=slots.get(key);
    if(groupIndex>0&&existing){for(const index of existing)images[index]={...image,src}}
    else{const index=images.length;images.push({...image,src});slots.set(key,[...(existing||[]),index])}
  }});
  return images;
}
