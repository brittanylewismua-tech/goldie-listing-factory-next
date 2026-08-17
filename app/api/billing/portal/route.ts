import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingRuntime, ensureBillingTables, siteOrigin, stripeRequest } from "@/app/billing";

export async function POST(request:Request) {
  const user = await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to manage billing."},{status:401});
  const db=billingRuntime().DB;
  await ensureBillingTables(db);
  const row=await db.prepare("SELECT stripe_customer_id customerId FROM billing_customers WHERE user_id=?").bind(user.userId).first<{customerId:string}>();
  if(!row?.customerId)return NextResponse.json({error:"No Stripe billing account was found."},{status:404});
  const portal=await stripeRequest<{url:string}>("billing_portal/sessions",{method:"POST",body:new URLSearchParams({customer:row.customerId,return_url:`${siteOrigin(request)}/usage`})});
  return NextResponse.json({url:portal.url});
}
