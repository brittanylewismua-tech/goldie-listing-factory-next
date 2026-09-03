export type PrintifyMockupImage={src:string;variantIds:number[];position:string};
export type PrintifyColorVariant={id:number;colorId?:number|null;options?:number[]};

export function printifyMockupDetails(images:string[]|undefined){
  return (images||[]).filter(Boolean).map(src=>{
    const url=new URL(src),parts=url.pathname.split("/").filter(Boolean),mockup=parts.indexOf("mockup");
    const variantId=mockup>=0?Number(parts[mockup+2]):NaN;
    const camera=url.searchParams.get("camera_label")||parts.at(-1)||"";
    return {src,variantIds:Number.isFinite(variantId)?[variantId]:[],position:camera};
  });
}

/* Older saved batches predate the normalized `colorId` field. Their raw
   Printify option ids are still present in `options`, so color previews must
   accept either representation instead of silently falling back to one image
   for every swatch. */
export function printifyVariantIdsForColor(variants:PrintifyColorVariant[],colorIds:Iterable<number>){
  const ids=new Set([...colorIds].filter(Number.isFinite));
  /* Option-value ids are only meaningful inside their own axis. A colour id
     can numerically collide with a size/style id, and the old OR condition
     then chose (usually) the White/S variant for unrelated colours. Fresh
     product data carries the normalized colour axis explicitly, so use it
     exclusively whenever it exists. Raw options remain the compatibility
     fallback for older saved batches that predate `colorId`. */
  return new Set(variants.filter(variant=>variant.colorId!=null
    ? ids.has(variant.colorId)
    : (variant.options||[]).some(id=>ids.has(id))).map(variant=>variant.id));
}

/* Printify can return a broad fallback image before the color-specific images.
   Choosing the first metadata match makes every color look identical. Prefer
   the image whose URL names one of this color's real variant ids, then the
   narrowest matching front image. */
export function printifyMockupForColor(images:PrintifyMockupImage[]|undefined,variantIds:Iterable<number>){
  const ids=[...variantIds].filter(Number.isFinite);
  if(!ids.length||!images?.length)return "";
  const front=images.filter(image=>/front|chest/i.test(image.position||""));
  const pool=front.length?front:images;
  const namesVariant=(src:string,id:number)=>new RegExp(`(?:/|_|-)${id}(?:/|_|-|\\.|\\?)`).test(src);
  const exact=pool.find(image=>ids.some(id=>namesVariant(image.src,id)));
  if(exact)return exact.src;
  const metadataMatch=pool
    .filter(image=>image.variantIds.some(id=>ids.includes(id)))
    .sort((a,b)=>a.variantIds.length-b.variantIds.length)[0];
  if(metadataMatch&&metadataMatch.variantIds.length<=ids.length)return metadataMatch.src;
  /* Never manufacture a Printify CDN URL. A variant-looking path is not proof
     that the corresponding mockup exists; doing this produced broken images
     for every colour Printify had not generated. */
  return metadataMatch&&metadataMatch.variantIds.length<=ids.length?metadataMatch.src:"";
}
