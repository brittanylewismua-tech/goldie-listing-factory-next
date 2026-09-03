export type RawProductColor={id:number;title?:string;colors?:string[]};
export type ProductColorOption={id:number;ids:number[];title:string;swatch:string;available:boolean;templateEnabled:boolean};

/* Printify sometimes gives two internal option ids the same seller-facing
   colour name. Group the label, but retain every id so variant availability is
   preserved and old saved defaults can be mapped to the visible choice. */
export function groupProductColors(values:RawProductColor[],availableIds:Set<number>,templateIds:Set<number>){
  const groups=new Map<string,ProductColorOption>();
  for(const value of values){
    const title=(value.title||`Color ${value.id}`).trim(),key=title.toLocaleLowerCase(),current=groups.get(key);
    if(current){
      current.ids.push(value.id);
      current.available||=availableIds.has(value.id);
      current.templateEnabled||=templateIds.has(value.id);
      if(!current.swatch)current.swatch=value.colors?.[0]||"";
    }else groups.set(key,{id:value.id,ids:[value.id],title,swatch:value.colors?.[0]||"",available:availableIds.has(value.id),templateEnabled:templateIds.has(value.id)});
  }
  return [...groups.values()];
}

export function canonicalProductColorIds(options:ProductColorOption[]){
  return new Map(options.flatMap(color=>color.ids.map(id=>[id,color.id] as const)));
}

export function productColorVariantIds(color:ProductColorOption,variants:Array<{id:number;title?:string;options?:number[]}>,colorAxisIndex=0){
  /* Printify variant option ids are positional: each entry corresponds to the
     product option at the same index. Compare only the colour-axis entry. A
     bare `some()` lets an unrelated size/style option with the same numeric id
     turn every colour into the same garment; parsing variant titles is also
     unsafe because Printify does not promise title-segment order. */
  const matches=variants.filter(variant=>color.ids.includes((variant.options||[])[colorAxisIndex]));
  return [...new Set(matches.map(variant=>variant.id))];
}
