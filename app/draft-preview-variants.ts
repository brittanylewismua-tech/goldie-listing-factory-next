export type DraftVariant={id:number;is_enabled?:boolean};
export type DraftMockupImage={variant_ids?:number[]};

export function creationVariantIds(selectedVariantIds:number[],previewVariantIds:number[]){
  const selected=[...new Set(selectedVariantIds.filter(Number.isFinite))];
  const preview=[...new Set(previewVariantIds.filter(Number.isFinite))];
  if(!selected.length)return [];
  return preview.length&&selected.every(id=>preview.includes(id))?preview:selected;
}

export function mockupCoverageComplete(images:DraftMockupImage[],variantIds:number[]){
  const pictured=new Set(images.flatMap(image=>image.variant_ids||[]));
  return variantIds.every(id=>pictured.has(id));
}

export function restoredVariants(variants:DraftVariant[],selectedVariantIds:number[]){
  const selected=new Set(selectedVariantIds);
  return variants.map(variant=>({id:variant.id,is_enabled:selected.has(variant.id)}));
}
