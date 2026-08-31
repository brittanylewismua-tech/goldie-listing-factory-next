"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../pricing-profile.css";
import FactoryShell from "../factory-shell";
type PlanKey="trial"|"goldie"|"pro"|"scale"|"mastermind_beta"|"owner_test";
type Data={plan:{key:PlanKey;name:string;price:number;drafts:number;dailyListings:number;aiMockups:number;mockupSets:number;mockupsPerSet:number};resetAt:string;usage:{drafts:number;aiMockups:number;mockupSets:number;publishedToday:number;publishing:number};billing?:{active:boolean;subscription?:{status:string;currentPeriodEnd:number|null;cancelAtPeriodEnd:number}|null}};
type Fees={etsyFeePercent:number;fixedFee:number;listingFee:number};
type Goal={enabled:boolean;period:"week"|"month";target:number};
/* D422 · Bound straight to the number, so clearing the box made Number("") = 0,
   React wrote the 0 back, and everything typed after it landed behind the zero.
   These three set the fees every price in the app is calculated from, so a
   silently mistyped value is worse here than anywhere. While the box has focus
   it holds exactly what was typed; the number is committed only when it parses. */
function DecimalField({value,min,max,step,label,onCommit}:{value:number;min:number;max?:number;step:string;label:string;onCommit:(next:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  return <input type="number" min={min} max={max} step={step} aria-label={label} value={draft??String(value)}
    onChange={event=>{const raw=event.target.value;setDraft(raw);const parsed=Number(raw);
      if(raw!==""&&Number.isFinite(parsed))onCommit(Math.max(min,max===undefined?parsed:Math.min(max,parsed)))}}
    onBlur={()=>setDraft(null)}/>;
}

function Meter({label,used,limit,period="month"}:{label:string;used:number;limit:number;period?:"month"|"24 hours"|"total"}){const pct=Math.min(100,Math.round(used/limit*100));const warning=pct>=100?"Limit reached":pct>=95?"Almost at your limit":pct>=80?"You’re getting close":`${limit-used} remaining`;return <article className="usage-card"><div><h2>{label}</h2><b>{used} <span>of {limit} {period==="total"?"saved":`per ${period}`}</span></b></div><div className="usage-track"><i style={{width:`${pct}%`}} /></div><p className={pct>=80?"usage-warning":""}>{warning}</p></article>}
export default function UsagePage(){
  const[data,setData]=useState<Data|null>(null),[loadError,setLoadError]=useState(""),[fees,setFees]=useState<Fees>({etsyFeePercent:9.5,fixedFee:.25,listingFee:.20}),[goal,setGoal]=useState<Goal>({enabled:false,period:"week",target:20}),[goalMessage,setGoalMessage]=useState(""),[feeMessage,setFeeMessage]=useState(""),[billingMessage,setBillingMessage]=useState(""),[checkoutPlan,setCheckoutPlan]=useState<"goldie"|"pro"|"scale"|null>(null);
  useEffect(()=>{fetch("/api/usage").then(async response=>{const result=await response.json() as Partial<Data>&{error?:string};if(!response.ok||!result.plan||!result.usage||!result.resetAt)throw new Error(result.error||"Your usage could not be loaded.");setData(result as Data)}).catch(error=>setLoadError(error instanceof Error?error.message:"Your usage could not be loaded."));fetch("/api/seller-preferences").then(r=>r.json()).then(r=>{if(r.pricing)setFees(current=>({...current,...r.pricing}));if(r.listingGoal)setGoal(r.listingGoal)}).catch(()=>undefined)},[]);
  /* D341 · One switch. The sidebar bar and the receipt line are the same
     feature seen twice, so they cannot be turned on independently — half a
     progress display is more confusing than none. */
  async function saveGoal(next:Goal){
    setGoal(next);setGoalMessage("Saving…");
    const response=await fetch("/api/seller-preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({listingGoal:next})});
    setGoalMessage(response.ok?"Saved":"Could not save your goal.");
    window.setTimeout(()=>setGoalMessage(current=>current==="Saved"?"":current),2200);
  }
  async function saveFees(){setFeeMessage("Saving…");const response=await fetch("/api/seller-preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pricing:fees})});setFeeMessage(response.ok?"Pricing profile saved for every future batch.":"Pricing profile could not be saved.")}
  async function manageBilling(){setBillingMessage("Opening secure billing…");const response=await fetch("/api/billing/portal",{method:"POST"}),result=await response.json() as {url?:string;error?:string};if(response.ok&&result.url){window.location.href=result.url;return}setBillingMessage(result.error||"Billing could not be opened.")}
  async function choosePlan(plan:"goldie"|"pro"|"scale"){if(data?.billing?.active){await manageBilling();return}setCheckoutPlan(plan);setBillingMessage("");const response=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})}),result=await response.json() as {url?:string;error?:string};if(response.ok&&result.url){window.location.href=result.url;return}setBillingMessage(result.error||"Secure checkout could not be opened.");setCheckoutPlan(null)}
  return <FactoryShell active="usage" title="Usage + Plan"><div className="usage-page interior-page">
    
    <header><p className="mini-label">USAGE + PLAN</p><h1>Your Listing Factory plan</h1><p>Your included credits reset automatically each month. Failed listing attempts and failed AI renders never use your allowance.</p></header>
    {loadError?<section className="usage-load-error" role="alert"><h2>Sign in to view your plan and usage</h2><p>{loadError}</p><Link href="/listing-factory">Return to Listing Factory</Link></section>:!data?<p>Loading your usage…</p>:<>
      <section className="plan-banner"><div><span>CURRENT PLAN</span><h2>{data.plan.name}</h2><p>{data.plan.key==="owner_test"?"Testing access":data.plan.price?`$${data.plan.price}/month`:"Free trial"}</p></div><div><p>{data.plan.key==="trial"&&data.billing?.subscription?.status==="trialing"&&data.billing.subscription.currentPeriodEnd?`Trial ends ${new Date(data.billing.subscription.currentPeriodEnd*1000).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`:`Monthly credits reset ${new Date(data.resetAt).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`}</p>{data.billing?.active&&<button onClick={()=>void manageBilling()}>Manage billing</button>}{billingMessage&&<small role="status">{billingMessage}</small>}</div></section>
      <section className="usage-grid"><Meter label="Monthly listing creations" used={data.usage.drafts} limit={data.plan.drafts}/><Meter label="24-hour publishing safety limit" used={data.usage.publishedToday+data.usage.publishing} limit={data.plan.dailyListings} period="24 hours"/></section>
      <p className="usage-note">A credit is used only after Goldie successfully creates a unique listing. Failed attempts and retries do not count again.</p>
      <section className="listing-goal-settings">
      <p className="mini-label">OPTIONAL</p>
      <h2>Listing goal</h2>
      <p className="listing-goal-intro">Set a target and Goldie shows your progress in the sidebar and on your publish receipt. Off by default, and you can turn it off again any time.</p>
      <label className="listing-goal-switch">
        <input type="checkbox" checked={goal.enabled} onChange={event=>void saveGoal({...goal,enabled:event.target.checked})}/>
        <span>Show my listing goal</span>
      </label>
      {goal.enabled&&<div className="listing-goal-fields">
        <label>I want to publish
          <span className="goal-number"><input type="text" inputMode="numeric" aria-label="Listing goal target" value={String(goal.target)}
            onChange={event=>{const digits=event.target.value.replace(/[^0-9]/g,"");setGoal(current=>({...current,target:Number(digits||0)}))}}
            onBlur={()=>void saveGoal({...goal,target:Math.max(1,goal.target||1)})}/></span>
          listings
        </label>
        <div className="goal-period" role="group" aria-label="Goal period">
          {(["week","month"] as const).map(period=><button type="button" key={period}
            className={goal.period===period?"active":""}
            onClick={()=>void saveGoal({...goal,period})}>per {period}</button>)}
        </div>
      </div>}
      {goal.enabled&&<Link className="listing-goal-history-link" href="/goals">See your listing history ↗</Link>}
      {goalMessage&&<p className="listing-goal-message" role="status">{goalMessage}</p>}
    </section>
    <section className="pricing-profile"><div><p className="mini-label">SAVED ONCE · USED IN EVERY LISTING SETUP</p><h2>Etsy fee profile</h2><p>The US defaults are 6.5% Etsy transaction + 3% Etsy Payments, $0.25 payment processing, and $0.20 listing/renewal. If your bank is outside the US, enter Etsy’s rates for your country once here.</p></div><div className="pricing-profile-grid"><label>Combined percentage fee<DecimalField value={fees.etsyFeePercent} min={0} max={40} step="0.1" label="Etsy fee percent" onCommit={next=>setFees({...fees,etsyFeePercent:next})}/><small>Transaction + payment processing + any regulatory fee</small></label><label>Fixed payment fee<DecimalField value={fees.fixedFee} min={0} step="0.01" label="Fixed fee" onCommit={next=>setFees({...fees,fixedFee:next})}/></label><label>Listing / renewal fee<DecimalField value={fees.listingFee} min={0} step="0.01" label="Listing fee" onCommit={next=>setFees({...fees,listingFee:next})}/></label></div><button onClick={()=>void saveFees()}>Save pricing profile</button>{feeMessage&&<span role="status">{feeMessage}</span>}<small className="pricing-caveat">Goldie AI calculates item prices from each variant’s live Printify product cost and this Etsy fee profile. Shipping is configured and charged separately, so it is not deducted from the item-profit figures shown on the pricing page.</small></section>
      <section className="usage-plan-chooser" aria-labelledby="usage-plan-heading">
        <div className="usage-plan-heading"><p className="mini-label">PLANS + BILLING</p><h2 id="usage-plan-heading">Choose the plan that fits your listing volume</h2><p>Upgrade, downgrade, or manage your subscription whenever you need to.</p></div>
        <div className="usage-plan-grid">
          <article className={data.plan.key==="trial"?"current":""}><div><p>Free Trial</p>{data.plan.key==="trial"&&<span>CURRENT PLAN</span>}</div><h3>$0 <small>for 3 days</small></h3><ul><li>10 listing creations</li><li>Upload your own listing photos</li><li>Then $29/month</li></ul>{data.plan.key==="trial"?<button disabled>Current plan</button>:<button disabled>Available to new customers</button>}</article>
          <article className={data.plan.key==="goldie"?"current":""}><div><p>Starter</p>{data.plan.key==="goldie"&&<span>CURRENT PLAN</span>}</div><h3>$29 <small>/month</small></h3><ul><li>100 listing creations each month</li><li>Upload your own listing photos</li></ul>{data.plan.key==="goldie"?<button onClick={()=>void manageBilling()}>Manage current plan</button>:<button disabled={Boolean(checkoutPlan)} onClick={()=>void choosePlan("goldie")}>{checkoutPlan==="goldie"?"Opening secure checkout…":data.billing?.active?"Switch to Starter":"Choose Starter"}</button>}</article>
          <article className={data.plan.key==="pro"?"current recommended":"recommended"}><div><p>Pro</p>{data.plan.key==="pro"?<span>CURRENT PLAN</span>:<span>MOST POPULAR</span>}</div><h3>$59 <small>/month</small></h3><ul><li>300 listing creations each month</li><li>Upload your own listing photos</li></ul>{data.plan.key==="pro"?<button onClick={()=>void manageBilling()}>Manage current plan</button>:<button disabled={Boolean(checkoutPlan)} onClick={()=>void choosePlan("pro")}>{checkoutPlan==="pro"?"Opening secure checkout…":data.billing?.active?"Switch to Pro":"Choose Pro"}</button>}</article>
          <article className={data.plan.key==="scale"?"current":""}><div><p>Scale</p>{data.plan.key==="scale"&&<span>CURRENT PLAN</span>}</div><h3>$99 <small>/month</small></h3><ul><li>750 listing creations each month</li><li>Upload your own listing photos</li></ul>{data.plan.key==="scale"?<button onClick={()=>void manageBilling()}>Manage current plan</button>:<button disabled={Boolean(checkoutPlan)} onClick={()=>void choosePlan("scale")}>{checkoutPlan==="scale"?"Opening secure checkout…":data.billing?.active?"Switch to Scale":"Choose Scale"}</button>}</article>
        </div>
        <p className="usage-plan-fineprint">One unique Etsy listing successfully created by Goldie uses one listing creation. A product bundle uses one creation for each listing it generates. Etsy’s standard $0.20 USD listing fee is charged separately by Etsy.</p>
        {billingMessage&&<p className="usage-billing-message" role="status">{billingMessage}</p>}
      </section>
    </>}
  </div></FactoryShell>
}
