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
  /* Printify sometimes returns one broad mockup even though its CDN path is
     variant-addressed: .../<product>/<variant>/front-dark.jpg. In that real
     response shape, returning the broad image makes every colour identical.
     Keep the same generated mockup and address the first real variant for the
     colour instead. */
  const seed=metadataMatch||pool[0];
  if(seed){
    /* Printify's current CDN path is
       /mockup/<product uuid>/<variant id>/<blueprint id>/front-dark.jpg.
       The older replacement changed the last number (the blueprint), leaving
       the variant untouched, so every unselected colour showed the same white
       garment until a save returned fresh image metadata. Prefer the explicit
       mockup shape; retain the shorter legacy shape as a fallback. */
    const current=seed.src.replace(
      /(\/mockup\/[^/]+\/)(\d+)(\/\d+\/(?:front|back|chest)[^/?#]*)/i,
      `$1${ids[0]}$3`
    );
    const derived=current!==seed.src?current:seed.src.replace(
      /(\/mockup\/[^/]+\/)(\d+)(\/(?:front|back|chest)[^/?#]*)/i,
      `$1${ids[0]}$3`
    );
    if(derived!==seed.src)return derived;
  }
  return metadataMatch?.src||"";
}
