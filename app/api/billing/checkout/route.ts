import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState, customerFor, priceForPlan, siteOrigin, stripeRequest, trialAvailable } from "@/app/billing";
import { PLANS, planAmount, type PlanKey, type BillingInterval } from "@/app/plan-limits";
import { checkoutRequestIdentity } from "@/app/checkout-request-identity";

export async function POST(request:Request) {
  try {
    const user = await getChatGPTUser();
    if(!user)return NextResponse.json({error:"Sign in before choosing a Listing Factory plan."},{status:401});
    const body = await request.json().catch(()=>({})) as {plan?:string; interval?:string};
    if (!body.plan || !Object.hasOwn(PLANS, body.plan)) return NextResponse.json({error:"Choose a Listing Factory plan."},{status:400});
    if (body.interval !== undefined && body.interval !== "month" && body.interval !== "year") return NextResponse.json({error:"Choose monthly or yearly billing."},{status:400});
    const plan = body.plan as PlanKey;
    const interval: BillingInterval = body.interval === "year" ? "year" : "month";
    const current = await billingState(user);
    if (current.active) return NextResponse.json({error:"You already have an active Listing Factory subscription. Manage it from Usage + Plan."},{status:409});
    const priceId = priceForPlan(plan, interval);
    if (!priceId) return NextResponse.json({error:"This billing option is not available yet. Please try again later."},{status:503});
    const price = await stripeRequest<{active:boolean;currency:string;unit_amount:number;recurring?:{interval:string;interval_count:number}}>(`prices/${encodeURIComponent(priceId)}`);
    if (!price.active || price.currency !== "usd" || price.unit_amount !== planAmount(plan, interval) || price.recurring?.interval !== interval || price.recurring.interval_count !== 1) {
      return NextResponse.json({error:"This billing option needs attention. No charge was made."},{status:503});
    }
    const customer = await customerFor(user), origin = siteOrigin(request), includeTrial=await trialAvailable(user);
    const params = new URLSearchParams({
      mode:"subscription", customer, client_reference_id:user.userId,
      "line_items[0][quantity]":"1",
      success_url:`${origin}/signup?checkout=success&interval=${interval}`, cancel_url:`${origin}/signup?checkout=canceled&interval=${interval}`,
      allow_promotion_codes:"true", billing_address_collection:"auto",
      payment_method_collection:"always",
      "subscription_data[metadata][user_id]":user.userId,
      "subscription_data[metadata][plan_key]":plan,
      "subscription_data[metadata][billing_interval]":interval,
      "subscription_data[metadata][pricing_version]":"2026-09",
      "metadata[user_id]":user.userId, "metadata[plan_key]":plan,
      "metadata[billing_interval]":interval,
    });
    params.set("line_items[0][price]", priceId);
    if(includeTrial)params.set("subscription_data[trial_period_days]","3");
    const identity = await checkoutRequestIdentity(params);
    params.set("integration_identifier", identity.integrationIdentifier);
    const session = await stripeRequest<{url:string}>("checkout/sessions",{method:"POST",body:params,idempotencyKey:identity.idempotencyKey});
    return NextResponse.json({url:session.url});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Secure checkout could not be opened."},{status:502});
  }
}
