export type EtsyProductionPartner={production_partner_id?:number;partner_name?:string;location?:string};
type PartnerPayload={results?:EtsyProductionPartner[]};
const cache=new Map<string,{id:number;expires:number}>(),inFlight=new Map<string,Promise<number>>();

export function validProductionPartners(payload:PartnerPayload){
 return (payload.results||[]).filter(partner=>Number.isSafeInteger(partner.production_partner_id)&&Number(partner.production_partner_id)>0);
}

/** Etsy may return a seller's public partner label instead of the private name
 * shown in Shop Manager. Prefer an explicit Printify match, but when the shop
 * has exactly one valid partner that partner is unambiguous and safe to use.
 * Resolve the shop-owned ID once, then carry it in the immutable draft snapshot
 * so every listing can be assigned and verified before completion. */
export function printifyPartnerId(payload:PartnerPayload,selectedId?:number){
 const partners=validProductionPartners(payload);
 if(Number.isSafeInteger(selectedId)&&Number(selectedId)>0){const selected=partners.find(partner=>Number(partner.production_partner_id)===Number(selectedId));if(!selected)throw Error('The saved production partner is no longer available in this Etsy shop. Choose the production partner again.');return Number(selected.production_partner_id)}
 const matches=partners.filter(partner=>partner.partner_name?.trim().toLowerCase()==='printify');
 if(!matches.length&&partners.length===1)return Number(partners[0].production_partner_id);
 if(!matches.length&&!partners.length)throw Error('Add Printify as a production partner in Etsy before saving drafts. In Etsy Shop Manager, open Settings → Partners you work with, add Printify, then try again.');
 if(!matches.length)throw Error('Etsy returned more than one saved production partner without identifying which one is Printify. Review Partners you work with in Etsy, then try again.');
 if(matches.length>1)throw Error('Etsy has more than one production partner named Printify. Keep the correct Printify partner in Etsy, then try again.');
 return Number(matches[0].production_partner_id);
}

export async function requiredPrintifyPartner(shopId:number,load:()=>Promise<PartnerPayload>,now=Date.now(),selectedId?:number){
 const key=`${shopId}:${Number(selectedId)||'auto'}`,saved=cache.get(key);if(saved&&saved.expires>now)return saved.id;
 const active=inFlight.get(key);if(active)return active;
 const request=load().then(payload=>{const id=printifyPartnerId(payload,selectedId);cache.set(key,{id,expires:now+5*60_000});return id}).finally(()=>inFlight.delete(key));
 inFlight.set(key,request);return request;
}
