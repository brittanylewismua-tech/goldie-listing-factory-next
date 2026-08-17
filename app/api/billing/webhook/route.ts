import { NextResponse } from "next/server";
import { billingRuntime, ensureBillingTables, planForPrice } from "@/app/billing";

type StripeObject={id:string;customer?:string;subscription?:string;status?:string;client_reference_id?:string;metadata?:Record<string,string>;current_period_end?:number;cancel_at_period_end?:boolean;items?:{data?:Array<{price?:{id?:string}}>}};
type StripeEvent={id:string;type:string;data:{object:StripeObject}};

function bytesToHex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("")}
function safeEqual(left:string,right:string){if(left.length!==right.length)return false;let mismatch=0;for(let index=0;index<left.length;index++)mismatch|=left.charCodeAt(index)^right.charCodeAt(index);return mismatch===0}
async function validSignature(payload:string,signature:string,secret:string){const parts=Object.fromEntries(signature.split(",").map(part=>part.split("=",2) as [string,string])),timestamp=parts.t,provided=parts.v1;if(!timestamp||!provided||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));return safeEqual(bytesToHex(digest),provided)}

export async function POST(request:Request){
  const runtime=billingRuntime(),secret=runtime.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature"),payload=await request.text();
  if(!secret||!signature||!await validSignature(payload,signature,secret))return NextResponse.json({error:"Invalid Stripe signature."},{status:400});
  const event=JSON.parse(payload) as StripeEvent,object=event.data.object,db=runtime.DB;
  await ensureBillingTables(db);
  const recorded=await db.prepare("INSERT OR IGNORE INTO stripe_events (event_id,event_type) VALUES (?,?)").bind(event.id,event.type).run();
  if(!recorded.meta.changes)return NextResponse.json({received:true,duplicate:true});
  if(event.type==="checkout.session.completed"){
    const userId=object.client_reference_id||object.metadata?.user_id,customer=object.customer,subscription=object.subscription;
    if(userId&&customer)await db.prepare("INSERT INTO billing_customers (user_id,email,stripe_customer_id) VALUES (?, '', ?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,updated_at=CURRENT_TIMESTAMP").bind(userId,customer).run();
    if(userId&&subscription){const plan=(object.metadata?.plan_key||"goldie");await db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,updated_at=CURRENT_TIMESTAMP").bind(userId,plan).run();}
  }
  if(event.type.startsWith("customer.subscription.")){
    const userId=object.metadata?.user_id,customer=object.customer,priceId=object.items?.data?.[0]?.price?.id,plan=(object.metadata?.plan_key as "goldie"|"scale"|undefined)||planForPrice(priceId);
    if(userId&&customer&&plan){
      await db.prepare("INSERT INTO billing_subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,plan_key,current_period_end,cancel_at_period_end) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,plan_key=excluded.plan_key,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=CURRENT_TIMESTAMP")
        .bind(userId,customer,object.id,object.status||"incomplete",plan,object.current_period_end||null,object.cancel_at_period_end?1:0).run();
      if(object.status==="trialing"){
        await db.prepare("INSERT OR IGNORE INTO billing_trials (user_id) VALUES (?)").bind(userId).run();
        await db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,'trial') ON CONFLICT(user_id) DO UPDATE SET plan_key='trial',updated_at=CURRENT_TIMESTAMP").bind(userId).run();
      }else if(["active","past_due"].includes(object.status||""))await db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,updated_at=CURRENT_TIMESTAMP").bind(userId,plan).run();
    }
  }
  return NextResponse.json({received:true});
}
