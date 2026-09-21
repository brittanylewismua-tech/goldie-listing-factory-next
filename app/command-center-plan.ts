export const PLAN_FEATURES = ['marketWatch','shopMap','designScanner','trademarkStandalone'] as const;
export type PlanFeature = typeof PLAN_FEATURES[number];
export type SellerPlan = {id:string;title:string;notes:string;outcome:string;status:'planned'|'testing'|'finished';updatedAt:number};
export function validPlan(value:unknown) {
  const v=value as Record<string,unknown>|null;
  if(!v||typeof v.title!=='string'||!v.title.trim()||v.title.length>180
    ||typeof v.notes!=='string'||v.notes.length>6000||typeof v.outcome!=='string'||v.outcome.length>3000
    ||!['planned','testing','finished'].includes(String(v.status))) return null;
  return {title:v.title.trim(),notes:v.notes,outcome:v.outcome,status:v.status as SellerPlan['status']};
}
