import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupRenderUsage } from "@/db/schema";
import { rendererFor, rendererInput, type ProductKind } from "@/app/mockups/product-renderers";
import { ensureMockupStorage } from "@/app/api/mockups/storage";
import { monthKey, planFor } from "@/app/plan-limits";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

const MAX_DATA_URL_LENGTH=18*1024*1024;
const valid=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<=MAX_DATA_URL_LENGTH;
type RequestedProductKind=ProductKind|"t-shirt"|"sweatshirt"|"hoodie"|"other-apparel"|"apparel";
type Job={id:string;user_id:string;request_id:string;model:string;status:string;usage_key:string;object_key?:string;content_type?:string;last_error?:string};
const requestedKinds=new Set<RequestedProductKind>(["apparel","t-shirt","sweatshirt","hoodie","other-apparel","soft-goods","curved","irregular"]);
const rendererKind=(kind:RequestedProductKind):ProductKind=>["apparel","t-shirt","sweatshirt","hoodie","other-apparel"].includes(kind)?"apparel":kind as ProductKind;

async function imageData(bytes:ArrayBuffer,contentType:string){const data=new Uint8Array(bytes);let binary="";for(let offset=0;offset<data.length;offset+=32768)binary+=String.fromCharCode(...data.subarray(offset,offset+32768));return`data:${contentType};base64,${btoa(binary)}`}
async function releaseUsage(job:Job,message:string){if(job.status==="failed"||job.status==="completed")return;await env.DB.batch([env.DB.prepare("UPDATE mockup_render_jobs SET status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('failed','completed')").bind(message,job.id),env.DB.prepare("UPDATE mockup_render_usage SET count=MAX(0,count-1),updated_at=CURRENT_TIMESTAMP WHERE user_day=?").bind(job.usage_key)])}

export async function POST(request:NextRequest){
  let reservedKey="";
  try{
    const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to create product mockups."},{status:401});
    const launchBlock=await customerLaunchBlock(user);if(launchBlock)return NextResponse.json({error:launchBlock},{status:403});
    await ensureMockupStorage();
    const body=await request.json() as {kind?:RequestedProductKind;scene?:string;design?:string;reference?:string};
    if(!body.kind||!requestedKinds.has(body.kind)||!valid(body.scene)||!valid(body.design)||body.reference&&!valid(body.reference))return NextResponse.json({error:"The mockup files could not be read safely."},{status:400});
    if(!body.reference)return NextResponse.json({error:"Add one placement reference for this product so Goldie can match the print size and position."},{status:400});
    const day=monthKey(),userDay=`${user.userId}:${day}`,db=getDb();
    const planRow=await db.all<{plan_key:string}>(sql`SELECT plan_key FROM account_plans WHERE user_id=${user.userId} LIMIT 1`),plan=planFor(planRow[0]?.plan_key);
    await db.insert(mockupRenderUsage).values({userDay,userId:user.userId,day,count:1}).onConflictDoUpdate({target:mockupRenderUsage.userDay,set:{count:sql`${mockupRenderUsage.count}+1`,updatedAt:new Date().toISOString()}});reservedKey=userDay;
    const [usage]=await db.select().from(mockupRenderUsage).where(eq(mockupRenderUsage.userDay,userDay)).limit(1);
    if(Number(usage?.count||0)>plan.aiMockups){await db.update(mockupRenderUsage).set({count:sql`MAX(0,${mockupRenderUsage.count}-1)`}).where(eq(mockupRenderUsage.userDay,userDay));reservedKey="";return NextResponse.json({error:`You have used all ${plan.aiMockups} AI-rendered mockups in your ${plan.name} plan. Your allowance resets next month.`},{status:429})}
    const key=process.env.FAL_KEY;if(!key)throw new Error("Product rendering is temporarily unavailable.");
    const kind=rendererKind(body.kind),model=rendererFor(kind),queued=await fetch(`https://queue.fal.run/${model}`,{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify(rendererInput(kind,[body.scene,body.design,body.reference]))});
    const payload=await queued.json() as {request_id?:string;detail?:string;error?:string};if(!queued.ok||!payload.request_id)throw new Error(payload.detail||payload.error||"Goldie could not start this mockup render.");
    const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO mockup_render_jobs (id,user_id,request_id,model,status,usage_key) VALUES (?,?,?,?,'queued',?)").bind(id,user.userId,payload.request_id,model,userDay).run();reservedKey="";
    return NextResponse.json({jobId:id,status:"queued"},{status:202});
  }catch(error){if(reservedKey)await getDb().update(mockupRenderUsage).set({count:sql`MAX(0,${mockupRenderUsage.count}-1)`}).where(eq(mockupRenderUsage.userDay,reservedKey)).catch(()=>undefined);return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not start this mockup."},{status:500})}
}

export async function GET(request:NextRequest){
  try{
    const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue this mockup."},{status:401});
    await ensureMockupStorage();const id=request.nextUrl.searchParams.get("jobId")||"";if(!id)return NextResponse.json({error:"This mockup job could not be found."},{status:400});
    const job=await env.DB.prepare("SELECT * FROM mockup_render_jobs WHERE id=? AND user_id=?").bind(id,user.userId).first<Job>();if(!job)return NextResponse.json({error:"This mockup job could not be found."},{status:404});
    if(job.status==="failed")return NextResponse.json({status:"failed",error:job.last_error||"This mockup needs another automatic attempt."},{status:409});
    if(job.status==="completed"&&job.object_key){const stored=await env.ARTWORK.get(job.object_key);if(!stored)return NextResponse.json({status:"processing"},{status:202});return NextResponse.json({status:"completed",image:await imageData(await stored.arrayBuffer(),job.content_type||"image/png")})}
    const key=process.env.FAL_KEY;if(!key)throw new Error("Product rendering is temporarily unavailable.");
    const statusResponse=await fetch(`https://queue.fal.run/${job.model}/requests/${job.request_id}/status`,{headers:{Authorization:`Key ${key}`}}),statusPayload=await statusResponse.json() as {status?:string;detail?:string;error?:string};
    if(!statusResponse.ok){const message=statusPayload.detail||statusPayload.error||"Goldie could not check this mockup yet.";if(statusResponse.status>=500)return NextResponse.json({status:"processing"},{status:202});await releaseUsage(job,message);return NextResponse.json({status:"failed",error:message},{status:409})}
    if(statusPayload.status!=="COMPLETED")return NextResponse.json({status:statusPayload.status==="IN_QUEUE"?"queued":"processing"},{status:202});
    const resultResponse=await fetch(`https://queue.fal.run/${job.model}/requests/${job.request_id}`,{headers:{Authorization:`Key ${key}`}}),result=await resultResponse.json() as {images?:Array<{url?:string}>;detail?:string;error?:string},imageUrl=result.images?.find(image=>image.url)?.url;
    if(!resultResponse.ok||!imageUrl){const message=result.detail||result.error||"Goldie could not retrieve the finished mockup.";await releaseUsage(job,message);return NextResponse.json({status:"failed",error:message},{status:409})}
    const rendered=await fetch(imageUrl);if(!rendered.ok)return NextResponse.json({status:"processing"},{status:202});const bytes=await rendered.arrayBuffer(),contentType=rendered.headers.get("content-type")||"image/png",objectKey=`mockup-renders/${user.userId}/${job.id}`;
    await env.ARTWORK.put(objectKey,bytes,{httpMetadata:{contentType}});await env.DB.prepare("UPDATE mockup_render_jobs SET status='completed',object_key=?,content_type=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(objectKey,contentType,job.id).run();
    return NextResponse.json({status:"completed",image:await imageData(bytes,contentType)});
  }catch(error){return NextResponse.json({status:"processing",warning:error instanceof Error?error.message:undefined},{status:202})}
}
