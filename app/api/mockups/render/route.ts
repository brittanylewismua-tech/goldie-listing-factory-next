import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupRenderUsage } from "@/db/schema";
import { rendererFor, rendererInput, type ProductKind } from "@/app/mockups/product-renderers";
import { ensureMockupStorage } from "@/app/api/mockups/storage";
import { monthKey, planFor } from "@/app/plan-limits";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

const MAX_DATA_URL_LENGTH=18*1024*1024;
const valid=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<=MAX_DATA_URL_LENGTH;

async function renderProduct(key:string,kind:ProductKind,scene:string,design:string,reference:string){
  let lastError="";
  for(let attempt=0;attempt<2;attempt++){
    try{
      const input=rendererInput(kind,[scene,design,reference]) as Record<string,unknown>;
      const response=await fetch(`https://fal.run/${rendererFor(kind)}`,{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(120_000)});
      const result=await response.json() as {images?:Array<{url?:string}>;detail?:string;error?:string};
      const candidates=(result.images||[]).map(image=>image.url).filter((url):url is string=>Boolean(url));
      if(!response.ok||!candidates.length){lastError=result.detail||result.error||"Goldie could not finish this mockup.";continue}
      return {image:candidates[0],warning:attempt?"Goldie recovered after the first render took too long. Review the finished placement before publishing.":undefined};
    }catch(error){lastError=error instanceof Error?error.message:"Goldie could not finish this mockup."}
  }
  throw new Error(lastError||"Goldie could not finish this mockup after its automatic recovery attempt.");
}

export async function POST(request:NextRequest){
  let reservedKey="";
  try{
    const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to create product mockups."},{status:401});
    const launchBlock=await customerLaunchBlock(user);if(launchBlock)return NextResponse.json({error:launchBlock},{status:403});
    await ensureMockupStorage();
    const body=await request.json() as {kind?:ProductKind;scene?:string;design?:string;reference?:string};
    if(!body.kind||!["apparel","soft-goods","curved","irregular"].includes(body.kind)||!valid(body.scene)||!valid(body.design)||body.reference&&!valid(body.reference))return NextResponse.json({error:"The mockup files could not be read safely."},{status:400});
    if(!body.reference)return NextResponse.json({error:"Add one placement reference for this product so Goldie can match the print size and position."},{status:400});
    const day=monthKey(),userDay=`${user.userId}:${day}`,db=getDb();
    const planRow=await db.all<{plan_key:string}>(sql`SELECT plan_key FROM account_plans WHERE user_id=${user.userId} LIMIT 1`); const plan=planFor(planRow[0]?.plan_key);
    await db.insert(mockupRenderUsage).values({userDay,userId:user.userId,day,count:1}).onConflictDoUpdate({target:mockupRenderUsage.userDay,set:{count:sql`${mockupRenderUsage.count}+1`,updatedAt:new Date().toISOString()}});reservedKey=userDay;
    const [usage]=await db.select().from(mockupRenderUsage).where(eq(mockupRenderUsage.userDay,userDay)).limit(1);
    if(Number(usage?.count||0)>plan.aiMockups){await db.update(mockupRenderUsage).set({count:sql`MAX(0,${mockupRenderUsage.count}-1)`}).where(eq(mockupRenderUsage.userDay,userDay));reservedKey="";return NextResponse.json({error:`You have used all ${plan.aiMockups} AI-rendered mockups in your ${plan.name} plan. Your allowance resets next month.`},{status:429});}
    const key=process.env.FAL_KEY;if(!key)throw new Error("Product rendering is temporarily unavailable.");
    const result=await renderProduct(key,body.kind,body.scene,body.design,body.reference);
    const rendered=await fetch(result.image,{signal:AbortSignal.timeout(20_000)});if(!rendered.ok)throw new Error("Goldie created the mockup but could not deliver the finished file.");
    const bytes=new Uint8Array(await rendered.arrayBuffer());let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    reservedKey="";
    return NextResponse.json({image:`data:${rendered.headers.get("content-type")||"image/png"};base64,${btoa(binary)}`,warning:result.warning});
  }catch(error){if(reservedKey)await getDb().update(mockupRenderUsage).set({count:sql`MAX(0,${mockupRenderUsage.count}-1)`}).where(eq(mockupRenderUsage.userDay,reservedKey)).catch(()=>undefined);return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not finish this mockup."},{status:500});}
}
