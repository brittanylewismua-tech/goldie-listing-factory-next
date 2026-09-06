import { logError } from "@/app/error-log";
import { NextResponse } from "next/server";
import { billingRuntime, ensureBillingTables, planForPrice } from "@/app/billing";
import { cancelTrialReminder, scheduleTrialReminder } from "@/app/trial-reminder";

type StripeObject={id:string;customer?:string;subscription?:string;status?:string;client_reference_id?:string;metadata?:Record<string,string>;current_period_end?:number;trial_end?:number;cancel_at_period_end?:boolean;cancel_at?:number|null;items?:{data?:Array<{current_period_end?:number;price?:{id?:string}}>}};
type StripeEvent={id:string;type:string;data:{object:StripeObject}};

function bytesToHex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("")}
function safeEqual(left:string,right:string){if(left.length!==right.length)return false;let mismatch=0;for(let index=0;index<left.length;index++)mismatch|=left.charCodeAt(index)^right.charCodeAt(index);return mismatch===0}
async function validSignature(payload:string,signature:string,secret:string){const parts=Object.fromEntries(signature.split(",").map(part=>part.split("=",2) as [string,string])),timestamp=parts.t,provided=parts.v1;if(!timestamp||!provided||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));return safeEqual(bytesToHex(digest),provided)}

export async function POST(request:Request){
  const runtime=billingRuntime(),secret=runtime.STRIPE_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature"),payload=await request.text();
  if(!secret||!signature||!await validSignature(payload,signature,secret))return NextResponse.json({error:"Invalid Stripe signature."},{status:400});
  const event=JSON.parse(payload) as StripeEvent,object=event.data.object,db=runtime.DB;
  await ensureBillingTables(db);
  const recorded=await db.prepare("SELECT event_id FROM stripe_events WHERE event_id=?").bind(event.id).first();
  if(recorded)return NextResponse.json({received:true,duplicate:true});
  const changes:D1PreparedStatement[]=[];
  if(event.type==="checkout.session.completed"){
    const userId=object.client_reference_id||object.metadata?.user_id,customer=object.customer;
    if(userId&&customer)changes.push(db.prepare("INSERT INTO billing_customers (user_id,email,stripe_customer_id) VALUES (?, '', ?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,updated_at=CURRENT_TIMESTAMP").bind(userId,customer));
    // Subscription events own access and allowance. Checkout can arrive after
    // trial activation and must not overwrite the trial's limited allowance.
  }
  const userId=object.metadata?.user_id,customer=object.customer,priceId=object.items?.data?.[0]?.price?.id;
  const plan=(object.metadata?.plan_key as "goldie"|"pro"|"scale"|undefined)||planForPrice(priceId);
  const subscriptionEvent=event.type.startsWith("customer.subscription.")&&userId&&customer&&plan;
  const cancellationScheduled=!!(object.cancel_at_period_end||object.cancel_at);
  const periodEnd=object.current_period_end||object.items?.data?.[0]?.current_period_end||object.trial_end||null;
  if(subscriptionEvent){
    changes.push(db.prepare("INSERT INTO billing_subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,plan_key,current_period_end,cancel_at_period_end) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,plan_key=excluded.plan_key,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=CURRENT_TIMESTAMP")
      .bind(userId,customer,object.id,object.status||"incomplete",plan,periodEnd,cancellationScheduled?1:0));
    if(object.status==="trialing"){
      changes.push(db.prepare("INSERT OR IGNORE INTO billing_trials (user_id) VALUES (?)").bind(userId));
      changes.push(db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,'trial') ON CONFLICT(user_id) DO UPDATE SET plan_key='trial',updated_at=CURRENT_TIMESTAMP").bind(userId));
    }else if(["active","past_due"].includes(object.status||""))changes.push(db.prepare("INSERT INTO account_plans (user_id,plan_key) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET plan_key=excluded.plan_key,updated_at=CURRENT_TIMESTAMP").bind(userId,plan));
  }
  // D1 batch is transactional: an event is acknowledged only when all access
  // changes commit. A failed write rolls back its receipt, allowing Stripe's retry.
  changes.push(db.prepare("INSERT OR IGNORE INTO stripe_events (event_id,event_type) VALUES (?,?)").bind(event.id,event.type));
  await db.batch(changes);
  if(subscriptionEvent){
    if(object.status==="trialing"&&object.trial_end&&!cancellationScheduled){
      const existing=await db.prepare("SELECT resend_email_id FROM trial_reminder_emails WHERE user_id=? AND canceled_at IS NULL").bind(userId).first<{resend_email_id:string}>();
      if(!existing){
        const customerRecord=await db.prepare("SELECT email FROM billing_customers WHERE user_id=?").bind(userId).first<{email:string}>();
        try{
          const reminderId=await scheduleTrialReminder({email:customerRecord?.email||"",plan,trialEnd:object.trial_end});
          if(reminderId)await db.prepare("INSERT INTO trial_reminder_emails (user_id,subscription_id,resend_email_id,scheduled_for) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET subscription_id=excluded.subscription_id,resend_email_id=excluded.resend_email_id,scheduled_for=excluded.scheduled_for,canceled_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(userId,object.id,reminderId,object.trial_end-86400).run();
        }catch(error){await logError({area:"billing/trial-reminder",message:error instanceof Error?error.message:String(error),userId});}
      }
    }
    if(object.status==="canceled"||cancellationScheduled){
      const reminder=await db.prepare("SELECT resend_email_id FROM trial_reminder_emails WHERE user_id=? AND canceled_at IS NULL").bind(userId).first<{resend_email_id:string}>();
      if(reminder){
        try{
          await cancelTrialReminder(reminder.resend_email_id);
          await db.prepare("UPDATE trial_reminder_emails SET canceled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(userId).run();
        }catch(error){await logError({area:"billing/trial-reminder-cancel",message:error instanceof Error?error.message:String(error),userId});}
      }
    }
  }
  return NextResponse.json({received:true});
}
