export const PRINTIFY_MAX_ENABLED_VARIANTS=100;

export function printifyVariantLimitMessage(count:number){
  if(count<=PRINTIFY_MAX_ENABLED_VARIANTS)return "";
  return `Printify allows up to ${PRINTIFY_MAX_ENABLED_VARIANTS} color and size combinations on one product. You selected ${count}. Remove one color or size to continue.`;
}
