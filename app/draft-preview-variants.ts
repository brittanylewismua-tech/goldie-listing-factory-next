export type DraftVariant={id:number;is_enabled?:boolean};
export type DraftMockupImage={variant_ids?:number[]};
export type DraftPrintArea<T=unknown>={variant_ids:number[];placeholders:T[];background?:string};

export function expandPrintAreasForPreview<T>(areas:DraftPrintArea<T>[],variantSources:Record<string,number>){
  return areas.map(area=>({
    ...area,
    variant_ids:[...new Set([
      ...area.variant_ids,
      ...Object.entries(variantSources)
        .filter(([,source])=>area.variant_ids.includes(Number(source)))
        .map(([variant])=>Number(variant)),
    ])],
  }));
}

export function creationVariantIds(selectedVariantIds:number[],previewVariantIds:number[]){
  const selected=[...new Set(selectedVariantIds.filter(Number.isFinite))];
  const preview=[...new Set(previewVariantIds.filter(Number.isFinite))];
  if(!selected.length)return [];
  /* Printify permits at most 100 enabled variants. Preserve every seller
     choice first, then use the remaining slots for one real preview variant
     per additional colour. */
  return [...new Set([...selected,...preview])].slice(0,100);
}

export function mockupCoverageComplete(images:DraftMockupImage[],variantIds:number[]){
  const pictured=new Set(images.flatMap(image=>image.variant_ids||[]));
  return variantIds.every(id=>pictured.has(id));
}

export function restoredVariants(variants:DraftVariant[],selectedVariantIds:number[]){
  const selected=new Set(selectedVariantIds);
  return variants.map(variant=>({id:variant.id,is_enabled:selected.has(variant.id)}));
}
