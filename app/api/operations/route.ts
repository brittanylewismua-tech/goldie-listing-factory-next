import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import { drainGlobalPublishQueue } from "@/app/api/printify/drafts/publish/queue";

/* D476 - there was no way to see why a publish failed without adding code and
   deploying. Owner-only: recent publish jobs and every item's exact error. */
export async function GET(){
  const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  const db=runtime().DB;if(!db)return NextResponse.json({error:"Goldie\u2019s operations database is unavailable."},{status:503});
  const jobs=await db.prepare("SELECT id,user_id,batch_id,status,total,completed,failed,last_error,created_at,updated_at FROM etsy_publish_jobs ORDER BY updated_at DESC LIMIT 10").all();
  const items=await db.prepare("SELECT job_id,product_id,status,attempts,last_error,available_at,updated_at FROM etsy_publish_items ORDER BY updated_at DESC LIMIT 40").all();
  return NextResponse.json({ok:true,jobs:jobs.results,items:items.results});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  const body=await request.json() as {action?:string;to?:string},db=runtime().DB;if(!db)return NextResponse.json({error:"Goldie’s operations database is unavailable."},{status:503});
  if(["resume","retry_failed","run_now"].includes(body.action||""))return NextResponse.json({error:"Goldie Etsy publishing is retired. Publish from Printify My Products."},{status:410});
  if(body.action==="pause"){await db.prepare("UPDATE etsy_queue_state SET manually_paused=1,last_worker_status='manually_paused',updated_at=CURRENT_TIMESTAMP WHERE id=1").run();return NextResponse.json({ok:true,message:"Publishing queue paused."})}
  if(body.action==="resume"){await db.prepare("UPDATE etsy_queue_state SET manually_paused=0,paused_until=0,last_worker_status='ready',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();return NextResponse.json({ok:true,message:"Publishing queue resumed."})}
  if(body.action==="retry_failed"){const now=Math.floor(Date.now()/1000),result=await db.prepare("UPDATE etsy_publish_items SET status='queued',attempts=0,available_at=?,locked_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='failed'").bind(now).run();await db.prepare("UPDATE etsy_publish_jobs SET status='processing',failed=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT DISTINCT job_id FROM etsy_publish_items WHERE status='queued')").run();return NextResponse.json({ok:true,message:`${result.meta.changes} failed ${result.meta.changes===1?"listing":"listings"} returned to the queue.`})}
  if(body.action==="run_now"){const result=await drainGlobalPublishQueue();return NextResponse.json({ok:true,message:`Worker finished. ${result.processed} ${result.processed===1?"listing":"listings"} processed.`})}
  /* D845 · The email test went with the emailer; errors are read at /mastermind-admin. */
  return NextResponse.json({error:"Unknown operation."},{status:400});
}
