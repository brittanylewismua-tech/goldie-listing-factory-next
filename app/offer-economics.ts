/** Scenario arithmetic, never a prediction of sales or a claim about Etsy's fees. */
export type OfferInputs = { price:number; discount:number; shippingCharged:number;
  production:number; shippingCost:number; feePercent:number; fixedFees:number;
  adPercent:number; target:number };
export function offerEconomics(v:OfferInputs) {
  if(Object.values(v).some(n=>!Number.isFinite(n)||n<0)||v.discount>=100||v.feePercent+v.adPercent>=100) return null;
  const keep=1-(v.feePercent+v.adPercent)/100;
  const afterDiscount=v.price*(1-v.discount/100);
  const collected=afterDiscount+v.shippingCharged;
  const costs=v.production+v.shippingCost+v.fixedFees;
  const contribution=collected*keep-costs;
  const floor=Math.max(0,((costs+v.target)/keep-v.shippingCharged)/(1-v.discount/100));
  const maximumDiscount=v.price>0 ? 100*(1-((costs+v.target)/keep-v.shippingCharged)/v.price) : null;
  if (![afterDiscount,collected,contribution,floor].every(Number.isFinite)) return null;
  return {afterDiscount,collected,contribution,minimumPrice:Math.ceil(floor*100)/100,
    maximumDiscount:maximumDiscount===null?null:Math.max(0,Math.min(100,maximumDiscount)),
    targetMet:contribution+0.000001>=v.target};
}
export function comparablePrices(rows:Array<{priceCents:number|null;currency:string;displayFresh:boolean}>) {
  const fresh=rows.filter(r=>r.displayFresh&&r.priceCents!==null&&r.priceCents>0);
  const currencies=[...new Set(fresh.map(r=>r.currency))];
  if(currencies.length!==1||fresh.length<3)return null;
  const prices=fresh.map(r=>r.priceCents!).sort((a,b)=>a-b);
  const mid=Math.floor(prices.length/2);
  return {currency:currencies[0],count:prices.length,min:prices[0],max:prices.at(-1)!,
    median:prices.length%2?prices[mid]:(prices[mid-1]+prices[mid])/2};
}

/** Preserve overlapping catalog quotes; model the higher cost, never pick a cheap rate. */
export function shippingScenario(profiles:Array<{variant_ids:number[];countries:string[];first_item:{cost:number;currency:string}}>,variant:number,country:string){
  const matching=profiles.filter(p=>p.variant_ids.includes(variant));
  const exact=matching.filter(p=>p.countries.includes(country));
  const choices=(exact.length?exact:matching.filter(p=>p.countries.includes('REST_OF_THE_WORLD'))).map(p=>p.first_item);
  if(!choices.length||choices.some(q=>!q||!Number.isFinite(q.cost)||q.cost<0||!q.currency)||new Set(choices.map(q=>q.currency)).size!==1)return null;
  const costs=choices.map(q=>q.cost);
  return {cost:Math.max(...costs),minimum:Math.min(...costs),currency:choices[0].currency};
}
