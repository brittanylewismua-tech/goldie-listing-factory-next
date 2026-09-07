import type {DraftSnapshot} from './draft-engine';
export type CategoryProperty={property_id:number;display_name?:string;name?:string;is_required?:boolean;supports_variations?:boolean};
/** Check the current category definition, rather than trusting an old required flag. */
export function checkCategoryRequirements(snapshot:DraftSnapshot,properties:CategoryProperty[]){
 for(const property of properties){
  if(property.is_required&&!property.supports_variations&&!snapshot.properties.some(p=>p.property_id===property.property_id&&p.values.some(v=>v.trim())))throw Error(`Choose ${property.display_name||property.name||'the required Etsy attribute'} in Etsy details before creating this draft.`);
 }
 for(const selected of snapshot.properties)if(!properties.some(p=>p.property_id===selected.property_id))throw Error('An attribute no longer belongs to this Etsy category. Reopen Etsy details and save the current choices.');
}
export function inventoryPrerequisite(offerings:{is_enabled:boolean;quantity?:number;readiness_state_id?:number|null}[]){
 const enabled=offerings.filter(o=>o.is_enabled);
 if(enabled.some(o=>o.quantity!==undefined&&(!Number.isFinite(o.quantity)||o.quantity<=0)))return 'An enabled variant has no stock quantity in Etsy. Correct its quantity before publishing.';
 if(enabled.some(o=>'readiness_state_id' in o&&(!Number.isSafeInteger(o.readiness_state_id)||Number(o.readiness_state_id)<=0)))return 'An Etsy variant is missing its processing profile. Set its processing time in Etsy before publishing, then verify this draft again.';
 return null;
}
