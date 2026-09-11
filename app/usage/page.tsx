"use client";
import { useEffect, useState } from "react";
import "../pricing-profile.css";
import FactoryShell from "../factory-shell";
import { PLANS, type BillingInterval } from "../plan-limits";
type PlanKey="trial"|"goldie"|"pro"|"scale"|"mastermind_beta"|"owner_test";
type Data={plan:{key:PlanKey;name:string;price:number;drafts:number;dailyListings:number;mockupSets:number;mockupsPerSet:number};resetAt:string|null;usage:{drafts:number;mockupSets:number;publishedToday:number;publishing:number};streak?:{count:number;target:number;window:number;days:string[];listedToday:boolean;hit:boolean;message:string};billing?:{active:boolean;terms?:{amount:number;currency:string;interval:string;intervalCount:number}|null;subscription?:{status:string;currentPeriodEnd:number|null;cancelAtPeriodEnd:number}|null}};
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

function Meter({label,used,limit,period="month"}:{label:string;used:number;limit:number;period?:"month"|"24 hours"|"total"}){const pct=Math.min(100,Math.round(used/limit*100));const warning=pct>=100?"Limit reached":pct>=95?"Almost at your limit":pct>=80?"You’re getting close":`${limit-used} remaining`;return <article className="usage-card"><div><h2>{label}</h2><b>{used.toLocaleString()} <span>of {limit.toLocaleString()} {period==="total"?"saved":`per ${period}`}</span></b></div><div className="usage-track"><i style={{width:`${pct}%`}} /></div><p className={pct>=80?"usage-warning":""}>{warning}</p></article>}
export default function UsagePage(){
  const [interval, setInterval] = useState<BillingInterval>("month");
  const[data,setData]=useState<Data|null>(null),[loadError,setLoadError]=useState(""),[fees,setFees]=useState<Fees>({etsyFeePercent:9.5,fixedFee:.25,listingFee:.20}),[goal,setGoal]=useState<Goal>({enabled:true,period:"week",target:20}),[goalMessage,setGoalMessage]=useState(""),[feeMessage,setFeeMessage]=useState(""),[billingMessage,setBillingMessage]=useState(""),[checkoutPlan,setCheckoutPlan]=useState<"goldie"|"pro"|"scale"|null>(null);
  useEffect(()=>{fetch("/api/usage").then(async response=>{const result=await response.json() as Partial<Data>&{error?:string};if(!response.ok||!result.plan||!result.usage||!result.resetAt)throw new Error(result.error||"Your usage could not be loaded.");setData(result as Data)}).catch(error=>setLoadError(error instanceof Error?error.message:"Your usage could not be loaded."));fetch("/api/seller-preferences").then(r=>r.json() as Promise<{pricing?:Partial<Fees>;listingGoal?:Goal}>).then(r=>{if(r.pricing)setFees(current=>({...current,...r.pricing}));if(r.listingGoal)setGoal(r.listingGoal)}).catch(()=>undefined)},[]);
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
  async function choosePlan(plan:"goldie"|"pro"|"scale"){if(data?.billing?.active){await manageBilling();return}setCheckoutPlan(plan);setBillingMessage("");try{const response=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan,interval})}),result=await response.json() as {url?:string;error?:string};if(response.ok&&result.url){window.location.href=result.url;return}setBillingMessage(result.error||"Secure checkout could not be opened.")}catch{setBillingMessage("Checkout could not be opened. Please try again.")}finally{setCheckoutPlan(null)}}
  const billingTerms = data?.billing?.terms;
  const currentPrice = billingTerms ? `${new Intl.NumberFormat("en-US",{style:"currency",currency:billingTerms.currency}).format(billingTerms.amount/100)} / ${billingTerms.intervalCount > 1 ? `${billingTerms.intervalCount} ` : ""}${billingTerms.interval}` : "Renewal details in Manage billing";
  return <FactoryShell active="usage" title="Usage + Plan"><div className="usage-page interior-page">
    
    <header><p className="mini-label">USAGE + PLAN</p><h1>Your Listing Factory plan</h1><p>Successful listing creations use your allowance. Failed attempts do not.</p></header>
    {loadError?<section className="usage-load-error" role="alert"><h2>Sign in to view your plan and usage</h2><p>{loadError}</p><a href="/listing-factory">Return to Listing Factory</a></section>:!data?<p>Loading your usage…</p>:<>
      <section className="plan-banner"><div><span>CURRENT PLAN</span><h2>{data.plan.name}</h2><p>{data.plan.key==="owner_test"?"Testing access":data.plan.price?currentPrice:data.plan.key==="mastermind_beta"?"Private beta":"Free trial"}</p></div><div><p>{data.plan.key==="mastermind_beta"?"Access stays open until Brittany closes testing. No automatic credit reset.":data.plan.key==="trial"&&data.billing?.subscription?.status==="trialing"&&data.billing.subscription.currentPeriodEnd?`Trial ends ${new Date(data.billing.subscription.currentPeriodEnd*1000).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`:`Monthly credits reset ${new Date(data.resetAt!).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`}</p>{data.billing?.active&&<button onClick={()=>void manageBilling()}>Manage billing</button>}{billingMessage&&<small role="status">{billingMessage}</small>}</div></section>
      <section className="usage-grid"><Meter label={data.plan.key==="mastermind_beta"?"Beta listing creations":"Monthly listing creations"} used={data.usage.drafts} limit={data.plan.drafts}/></section>
      <p className="usage-note">A credit is used only after The Listing Factory successfully creates a unique unpublished Printify draft. Failed attempts and retries do not count again.</p>
      {data.streak&&<section className="listing-streak" aria-label="Your listing week">
        {/* Days, not listings. The goal below counts how much; this counts how
            often, and twenty listings dumped on one Sunday hits the goal while
            missing the habit. A star is a day something actually published —
            there is no button, so there is nothing to tap instead of working. */}
        <p className="mini-label">YOUR WEEK</p>
        <div className="streak-stars" role="img" aria-label={data.streak.message}>
          {Array.from({length:data.streak.target},(_,i)=>
            <span key={i} className={i<data.streak!.count?"star on":"star"} aria-hidden>★</span>)}
          {data.streak.count>data.streak.target&&<span className="star extra" aria-hidden>+{data.streak.count-data.streak.target}</span>}
        </div>
        <p className="streak-message">{data.streak.message}</p>
        {/* Never a scold, and never a countdown to failure. Below target it
            says what is unlocked by carrying on; at target it says well done
            and points at the reward rather than at the next obligation. */}
        <p className="streak-reward">{data.streak.hit
          ?<>All 30 per category are open, with what moved overnight. <a href="/drop">See today&apos;s drop</a></>
          :<>Five listing days in any seven opens all 30 per category and what moved overnight. <a href="/drop">See today&apos;s preview</a></>}</p>
      </section>}
      <section id="listing-goal" className="listing-goal-settings">
      <p className="mini-label">YOUR TARGET</p>
      <h2>Listing goal</h2>
      <p className="listing-goal-intro">Your default target for listings prepared as Printify drafts is 20 per week. Change it here, or hide your goal any time.</p>
      <label className="listing-goal-switch">
        <input type="checkbox" checked={goal.enabled} onChange={event=>void saveGoal({...goal,enabled:event.target.checked})}/>
        <span>Show my listing goal</span>
      </label>
      {goal.enabled&&<div className="listing-goal-fields">
        <label>I want to prepare
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
      {goal.enabled&&<a className="listing-goal-history-link" href="/goals">See your listing history ↗</a>}
      {goalMessage&&<p className="listing-goal-message" role="status">{goalMessage}</p>}
    </section>
    <section className="pricing-profile"><div><p className="mini-label">SAVED ONCE · USED IN EVERY LISTING SETUP</p><h2>Etsy fee profile</h2><p>The US defaults are 6.5% Etsy transaction + 3% Etsy Payments, $0.25 payment processing, and $0.20 listing/renewal. If your bank is outside the US, enter Etsy’s rates for your country once here.</p></div><div className="pricing-profile-grid"><label>Combined percentage fee<DecimalField value={fees.etsyFeePercent} min={0} max={40} step="0.1" label="Etsy fee percent" onCommit={next=>setFees({...fees,etsyFeePercent:next})}/><small>Transaction + payment processing + any regulatory fee</small></label><label>Fixed payment fee<DecimalField value={fees.fixedFee} min={0} step="0.01" label="Fixed fee" onCommit={next=>setFees({...fees,fixedFee:next})}/></label><label>Listing / renewal fee<DecimalField value={fees.listingFee} min={0} step="0.01" label="Listing fee" onCommit={next=>setFees({...fees,listingFee:next})}/></label></div><button onClick={()=>void saveFees()}>Save pricing profile</button>{feeMessage&&<span role="status">{feeMessage}</span>}<small className="pricing-caveat">The Listing Factory calculates item prices from each variant’s live Printify product cost and this Etsy fee profile. Shipping is configured and charged separately, so it is not deducted from the item-profit figures shown on the pricing page.</small></section>
      <section className="usage-plan-chooser" aria-labelledby="usage-plan-heading">
        <div className="usage-plan-heading"><p className="mini-label">PLANS + BILLING</p><h2 id="usage-plan-heading">Choose the plan that fits your listing volume</h2><p>Upgrade, downgrade, or manage your subscription whenever you need to.</p></div>
        <div className="usage-billing-frequency" role="group" aria-label="Billing frequency"><button type="button" aria-pressed={interval === "month"} onClick={()=>setInterval("month")}>Monthly</button><button type="button" aria-pressed={interval === "year"} onClick={()=>setInterval("year")}>Yearly · Save 17%</button></div>
        <div className="usage-plan-grid">
          {Object.values(PLANS).map(plan=><article key={plan.key} className={data.plan.key===plan.key?"current":plan.key==="goldie"?"recommended":""}><div><p>{plan.name}</p>{data.plan.key===plan.key?<span>CURRENT PLAN</span>:plan.key==="goldie"?<span>Best for most shops</span>:null}</div><h3>${interval==="year"?plan.annualPrice:plan.price} <small>/{interval}</small></h3><ul><li>{plan.drafts} listing creations each month</li><li>Upload your own listing photos</li><li>{interval==="year"?"Billed yearly":"Billed monthly"} · No rollover</li></ul><button disabled={Boolean(checkoutPlan)} onClick={()=>void choosePlan(plan.key)}>{checkoutPlan===plan.key?"Opening secure checkout…":data.billing?.active?"Manage billing":`Choose ${plan.name}`}</button></article>)}
        </div>
        <p className="usage-plan-fineprint">Each unique unpublished Printify draft successfully created by The Listing Factory uses one listing creation. A product bundle uses one creation for each distinct draft it generates. The Listing Factory never publishes to Etsy; Etsy charges its listing fee only when you publish the draft in Etsy.</p>
        {billingMessage&&<p className="usage-billing-message" role="status">{billingMessage}</p>}
      </section>
    </>}
  </div></FactoryShell>
}
