export type EtsyProductionPartner={production_partner_id?:number;partner_name?:string;location?:string};
type PartnerPayload={results?:EtsyProductionPartner[]};
const cache=new Map<number,{id:number;expires:number}>(),inFlight=new Map<number,Promise<number>>();

/** Printify only auto-attaches its production partner when the Etsy shop has a
 * saved partner whose real name is Printify. Resolve that shop-owned ID once,
 * then carry it in the immutable draft snapshot so every listing can be
 * assigned and verified before completion. Missing setup is never cached. */
export function printifyPartnerId(payload:PartnerPayload){
 const matches=(payload.results||[]).filter(partner=>partner.partner_name?.trim().toLowerCase()==='printify'&&Number.isSafeInteger(partner.production_partner_id)&&Number(partner.production_partner_id)>0);
 if(!matches.length)throw Error('Add Printify as a production partner in Etsy before saving drafts. In Etsy Shop Manager, open Settings → Partners you work with, add Printify, then try again.');
 if(matches.length>1)throw Error('Etsy has more than one production partner named Printify. Keep the correct Printify partner in Etsy, then try again.');
 return Number(matches[0].production_partner_id);
}

export async function requiredPrintifyPartner(shopId:number,load:()=>Promise<PartnerPayload>,now=Date.now()){
 const saved=cache.get(shopId);if(saved&&saved.expires>now)return saved.id;
 const active=inFlight.get(shopId);if(active)return active;
 const request=load().then(payload=>{const id=printifyPartnerId(payload);cache.set(shopId,{id,expires:now+5*60_000});return id}).finally(()=>inFlight.delete(shopId));
 inFlight.set(shopId,request);return request;
}
