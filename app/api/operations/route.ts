import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import { drainGlobalPublishQueue } from "@/app/api/printify/drafts/publish/queue";

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user||!isOwner(user))return NextResponse.json({error:"Not authorized."},{status:403});
  const body=await request.json() as {action?:string},db=runtime().DB;if(!db)return NextResponse.json({error:"Goldie’s operations database is unavailable."},{status:503});
  if(body.action==="pause"){await db.prepare("UPDATE etsy_queue_state SET manually_paused=1,last_worker_status='manually_paused',updated_at=CURRENT_TIMESTAMP WHERE id=1").run();return NextResponse.json({ok:true,message:"Publishing queue paused."})}
  if(body.action==="resume"){await db.prepare("UPDATE etsy_queue_state SET manually_paused=0,paused_until=0,last_worker_status='ready',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();return NextResponse.json({ok:true,message:"Publishing queue resumed."})}
  if(body.action==="retry_failed"){const now=Math.floor(Date.now()/1000),result=await db.prepare("UPDATE etsy_publish_items SET status='queued',attempts=0,available_at=?,locked_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='failed'").bind(now).run();await db.prepare("UPDATE etsy_publish_jobs SET status='processing',failed=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT DISTINCT job_id FROM etsy_publish_items WHERE status='queued')").run();return NextResponse.json({ok:true,message:`${result.meta.changes} failed ${result.meta.changes===1?"listing":"listings"} returned to the queue.`})}
  if(body.action==="run_now"){const result=await drainGlobalPublishQueue();return NextResponse.json({ok:true,message:`Worker finished. ${result.processed} ${result.processed===1?"listing":"listings"} processed.`})}
  return NextResponse.json({error:"Unknown operation."},{status:400});
}
