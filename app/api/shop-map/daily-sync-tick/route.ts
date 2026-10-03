import {NextResponse} from "next/server";
import {env} from "cloudflare:workers";
import {withErrorLog} from "@/app/error-log";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {isOwner} from "@/app/mastermind/access";
import {runFinancialIngest} from "@/app/api/shop-map/financial/ingest/route";
import {syncVotesSignals} from "@/app/api/shop-map/votes-signals/route";

/*
  THE DAILY SHOP SYNC.

  Until now a shop's sales only refreshed when the member pressed Refresh in
  Your numbers or Connections, so Votes could read "Sales synced Sep 26" a
  week later. This runs on the twenty-minute clock and, for every connected
  shop whose receipts are more than twenty hours old, runs one incremental
  ingest slice and the Votes order sync. A few shops per firing keeps each
  firing short; every shop comes round within the day.

  Internal-only: the scheduled self-call carries no client address. The owner
  may also fire it by hand.
*/
const DAY_ISH=20*3600;

export const POST=withErrorLog("shop-map-daily-sync-tick",async(request:Request)=>{
  if(request.headers.get("cf-connecting-ip")!==null){
    const user=await getChatGPTUser();
    if(!user||!isOwner(user))return NextResponse.json({error:"Not found."},{status:404});
  }
  const db=(env as unknown as {DB:D1Database}).DB;
  const now=Math.floor(Date.now()/1000);
  const asked=Number(new URL(request.url).searchParams.get("shops"));
  const limit=Number.isFinite(asked)&&asked>0?Math.min(asked,12):4;
  const due=((await db.prepare(`SELECT c.user_id, c.shop_id, COALESCE(f.refreshed_at,0) AS refreshed_at
      FROM etsy_connections c
      LEFT JOIN finance_sources f ON f.user_id=c.user_id AND f.shop_id=c.shop_id AND f.source='receipts-complete'
     WHERE c.is_active=1 AND c.encrypted_access_token<>''
       AND c.scopes LIKE '%transactions_r%'
       AND COALESCE(f.refreshed_at,0) < ?
     ORDER BY COALESCE(f.refreshed_at,0) ASC LIMIT ?`).bind(now-DAY_ISH,limit)
    .all<{user_id:string;shop_id:number;refreshed_at:number}>().catch(()=>({results:[] as Array<{user_id:string;shop_id:number;refreshed_at:number}>}))).results??[]);
  const ran:Array<{shopId:number;sales:string;votes:string}>=[];
  for(const row of due){
    /* Only a shop that granted the sales scope is read, which is the grant
       Your Shop itself asks for; nothing here widens what a member allowed. */
    let sales="ok",votes="ok";
    try{const response=await runFinancialIngest({userId:row.user_id},new URLSearchParams({windows:"3",receipts:"6",orders:"3"}));
      if(!response.ok)sales=`failed: ${response.status}`}catch(error){sales=`failed: ${error instanceof Error?error.message:"error"}`}
    try{const result=await syncVotesSignals(row.user_id);if(!result.synced)votes=`skipped: ${result.reason??"not connected"}`}
    catch(error){votes=`failed: ${error instanceof Error?error.message:"error"}`}
    ran.push({shopId:Number(row.shop_id),sales,votes});
  }
  return NextResponse.json({due:due.length,ran});
});
