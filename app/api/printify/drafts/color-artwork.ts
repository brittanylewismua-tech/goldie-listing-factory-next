export type DraftPrintArea={variant_ids:number[];background?:string;placeholders?:Array<{position:string;images?:Array<{id?:string;x?:number;y?:number;scale?:number;angle?:number}>}>};
const sameSide=(actual:string,requested:string)=>actual.toLowerCase()===requested.toLowerCase()||(/front|chest/i.test(actual)&&/front|chest/i.test(requested))||(/back/i.test(actual)&&/back/i.test(requested));

export function primaryImageForSide(areas:DraftPrintArea[],position:string){
  const weights=new Map<string,number>();
  for(const area of areas){const id=area.placeholders?.find(item=>sameSide(item.position,position))?.images?.find(item=>item.id)?.id;if(id)weights.set(id,(weights.get(id)||0)+area.variant_ids.length)}
  return [...weights].sort((left,right)=>right[1]-left[1])[0]?.[0];
}

export function replaceArtworkForVariants(areas:DraftPrintArea[],position:string,variantIds:number[],imageId:string,bounds?:{left:number;top:number;right:number;bottom:number},maxPlacementScale?:number,primaryImageId?:string,originalAreas:DraftPrintArea[]=areas){
  const requested=new Set(variantIds.map(Number)),covered=new Set<number>(),result:DraftPrintArea[]=[];
  for(const area of areas){
    const chosen=area.variant_ids.filter(id=>requested.has(id)),retained=area.variant_ids.filter(id=>!requested.has(id));
    /* Printify's product response can include catalog placeholders with no
       artwork. They are useful metadata on reads, but invalid in a product PUT:
       including one without `images` produces validation code 8150. Preserve
       every configured print area while omitting only genuinely empty
       placeholders from both halves of the split. */
    const configured=(area.placeholders||[]).filter(item=>item.images?.some(image=>image.id));
    if(retained.length)result.push({...area,variant_ids:retained,placeholders:configured});
    if(!chosen.length)continue;
    const target=area.placeholders?.find(item=>sameSide(item.position,position)),source=target?.images?.find(item=>item.id);
    if(!target||!source)throw new Error(`This Printify draft has no prepared ${position} placement.`);
    // These are finished Printify placements, already compensated for padding.
    // Reapplying artworkPlacement here compounds scale on every replacement.
    // Anchor replacements and resets to the main image, not the last alternate.
    const original=originalAreas.find(area=>area.variant_ids.includes(chosen[0]))?.placeholders?.find(item=>sameSide(item.position,position))?.images?.find(image=>image.id===primaryImageId);
    const main=primaryImageId?originalAreas.flatMap(area=>area.placeholders||[]).filter(item=>sameSide(item.position,position)).flatMap(item=>item.images||[]).find(image=>image.id===primaryImageId):undefined;
    const placement=original||main||source;
    result.push({...area,variant_ids:chosen,placeholders:(area.placeholders||[]).flatMap(item=>item===target?[{...item,images:[{id:imageId,x:placement.x,y:placement.y,scale:placement.scale,angle:placement.angle}]}]:item.images?.some(image=>image.id)?[item]:[])});
    chosen.forEach(id=>covered.add(id));
  }
  const missing=variantIds.filter(id=>!covered.has(id));
  if(missing.length)throw new Error(`Printify did not expose artwork placement for ${missing.length} selected variant${missing.length===1?"":"s"}.`);
  return result;
}
