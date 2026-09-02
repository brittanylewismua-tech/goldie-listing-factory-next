export type PrintifyMockupImage={src:string;variantIds:number[];position:string};

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
    const derived=seed.src.replace(/(\/\d+\/)(\d+)(\/(?:front|back|chest)[^/?#]*)/i,`$1${ids[0]}$3`);
    if(derived!==seed.src)return derived;
  }
  return metadataMatch?.src||"";
}
