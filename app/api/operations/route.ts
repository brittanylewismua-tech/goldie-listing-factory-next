import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";

/* D476 - there was no way to see why a publish failed without adding code and
   deploying. Owner-only: recent publish jobs and every item's exact error. */
export async function GET(){
  const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  const db=runtime().DB;if(!db)return NextResponse.json({error:"The Listing Factory operations database is unavailable."},{status:503});
  const jobs=await db.prepare("SELECT id,user_id,batch_id,status,total,completed,failed,last_error,created_at,updated_at FROM etsy_publish_jobs ORDER BY updated_at DESC LIMIT 10").all();
  const items=await db.prepare("SELECT job_id,product_id,status,attempts,last_error,available_at,updated_at FROM etsy_publish_items ORDER BY updated_at DESC LIMIT 40").all();
  return NextResponse.json({ok:true,jobs:jobs.results,items:items.results});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  const body=await request.json() as {action?:string;to?:string},db=runtime().DB;if(!db)return NextResponse.json({error:"The Listing Factory operations database is unavailable."},{status:503});
  if(["pause","resume","retry_failed","run_now"].includes(body.action||""))return NextResponse.json({error:"The legacy Etsy publishing queue is retired. Use Save to Etsy Drafts in the batch’s final step."},{status:410});
  /* D845 · The email test went with the emailer; errors are read at /mastermind-admin. */
  return NextResponse.json({error:"Unknown operation."},{status:400});
}
