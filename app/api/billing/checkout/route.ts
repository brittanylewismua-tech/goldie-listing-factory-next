import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState, customerFor, priceForPlan, siteOrigin, stripeRequest, trialAvailable } from "@/app/billing";
import { PLANS, type PlanKey } from "@/app/plan-limits";

export async function POST(request:Request) {
  try {
    const user = await getChatGPTUser();
    if(!user)return NextResponse.json({error:"Sign in before choosing a Listing Factory plan."},{status:401});
    const body = await request.json().catch(()=>({})) as {plan?:string};
    if (!body.plan || !(body.plan in PLANS)) return NextResponse.json({error:"Choose a Listing Factory plan."},{status:400});
    const plan = body.plan as PlanKey;
    const current = await billingState(user);
    if (current.active) return NextResponse.json({error:"You already have an active Listing Factory subscription. Manage it from Usage + Plan."},{status:409});
    const customer = await customerFor(user), origin = siteOrigin(request), includeTrial=await trialAvailable(user);
    const priceId = priceForPlan(plan), planDetails = PLANS[plan];
    const params = new URLSearchParams({
      mode:"subscription", customer, client_reference_id:user.userId,
      integration_identifier:`goldie_${crypto.randomUUID().replace(/-/g,"").slice(0,8)}`,
      "line_items[0][quantity]":"1",
      success_url:`${origin}/signup?checkout=success`, cancel_url:`${origin}/signup?checkout=canceled`,
      allow_promotion_codes:"true", billing_address_collection:"auto",
      payment_method_collection:"always",
      "subscription_data[metadata][user_id]":user.userId,
      "subscription_data[metadata][plan_key]":plan,
      "metadata[user_id]":user.userId, "metadata[plan_key]":plan,
    });
    if (priceId) params.set("line_items[0][price]", priceId);
    else {
      params.set("line_items[0][price_data][currency]", "usd");
      params.set("line_items[0][price_data][unit_amount]", String(planDetails.price * 100));
      params.set("line_items[0][price_data][recurring][interval]", "month");
      params.set("line_items[0][price_data][product_data][name]", `The Goldie Listing Factory — ${planDetails.name}`);
      params.set("line_items[0][price_data][product_data][metadata][plan_key]", plan);
    }
    if(includeTrial)params.set("subscription_data[trial_period_days]","3");
    const session = await stripeRequest<{url:string}>("checkout/sessions",{method:"POST",body:params,idempotencyKey:`goldie-checkout-${user.userId}-${plan}-${new Date().toISOString().slice(0,10)}`});
    return NextResponse.json({url:session.url});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Secure checkout could not be opened."},{status:502});
  }
}
