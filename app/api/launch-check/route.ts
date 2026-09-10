import { boundedVisionFetch } from "@/app/paid-vision";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { scheduleTrialReminder, cancelTrialReminder } from "@/app/trial-reminder";
import { billingRuntime } from "@/app/billing";
import { logError } from "@/app/error-log";
import {cleanupLaunchListings,inspectLaunchListing} from './listing';
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:'Not authorized.'},{status:403});
 const productId=new URL(request.url).searchParams.get('productId')||'';
 if(!/^[a-f0-9]{24}$/.test(productId))return NextResponse.json({error:'Choose a valid existing The Listing Factory product.'},{status:400});
 try{return NextResponse.json(await inspectLaunchListing(user.userId,productId),{headers:{'Cache-Control':'no-store'}})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'The listing could not be checked.'},{status:502})}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin."},{status:403});
  const body=await request.json() as {action?:string;id?:string;batchIds?:string[]};
  try{
    if(body.action==="cleanup-qa")return NextResponse.json(await cleanupLaunchListings(user.userId,Array.isArray(body.batchIds)?body.batchIds:[]));
    if(body.action==="busy"){
      let accepted=0;
      await Promise.all(Array.from({length:20},async()=>{let attempts=0;const response=await boundedVisionFetch("https://fal.run/openrouter/router/vision",{method:"POST",body:'{"prompt":"local-simulation"}'},async()=>{attempts++;if(attempts===1)return new Response("busy",{status:429,headers:{"Retry-After":"0"}});accepted++;return Response.json({output:"ok"});});if(response.status!==200||attempts!==2)throw Error("Busy recovery failed.");}));
      return NextResponse.json({simulation:true,externalCalls:0,concurrentChecks:20,accepted,message:"Live worker recovered all 20 simulated busy requests. No provider calls or charges."});
    }
    if(body.action==="cancel"&&body.id){
      const row=await billingRuntime().DB.prepare("SELECT id FROM error_log WHERE id=? AND area='launch/email-test' AND user_id=?").bind(body.id,user.userId).first();
      if(!row)return NextResponse.json({error:"Unknown test email."},{status:400});
      await cancelTrialReminder(body.id);return NextResponse.json({canceled:true});
    }
    if(body.action!=="send")return NextResponse.json({error:"Choose a check."},{status:400});
    // Only the signed-in owner receives a labelled test. No arbitrary recipients.
    const id=await scheduleTrialReminder({email:user.email,plan:"goldie",trialEnd:Math.floor(Date.now()/1000)+86400+90,test:true});
    if(id)await billingRuntime().DB.prepare("INSERT INTO error_log (id,area,severity,user_id,message) VALUES (?,'launch/email-test','warning',?,'Owner-requested labelled email delivery check')").bind(id,user.userId).run();
    return NextResponse.json({id,scheduled:true,message:"Labelled test scheduled to your signed-in email for about 90 seconds from now."});
  }catch(error){const message=error instanceof Error?error.message:String(error);await logError({area:"launch/email-check",message,userId:user.userId});return NextResponse.json({error:message},{status:502});}
}
