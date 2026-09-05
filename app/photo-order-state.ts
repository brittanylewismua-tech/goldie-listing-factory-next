/** Adding a photo must not silently replace an already visible cover photo. */
export function mergePhotoOrder(available:string[],saved:string[],current:string[]):string[]{
  const valid=new Set(available);
  const baseline=saved.length?saved:current;
  return [...new Set([...baseline.filter(id=>valid.has(id)),...available])];
}
