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
  return pool
    .filter(image=>image.variantIds.some(id=>ids.includes(id)))
    .sort((a,b)=>a.variantIds.length-b.variantIds.length)[0]?.src||"";
}
