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

async function judgeApparel(key:string,scene:string,candidates:string[]){
  const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify({
    image_urls:[scene,...candidates],model:"google/gemini-2.5-flash",temperature:0,
    system_prompt:"Return only compact valid JSON. Do not use markdown.",
    prompt:`Image 1 is the original blank apparel mockup. Images 2 through ${candidates.length+1} are generated candidates. Inspect the entire person and scene, not only the printed design. Reject any candidate with malformed or fused hands, fingers, arms, legs, torso, face, clothing, furniture, or background; any invented object; any black blob or unexplained shape; any changed pose or composition; or any obviously distorted garment. Choose the cleanest candidate that preserves the original scene and has a natural shirt. Always return the best candidate number starting at 1, even when none is fully acceptable. Return {"acceptable":true,"best":1} or {"acceptable":false,"best":1}.`
  })});
  if(!response.ok)throw new Error("Goldie could not complete the mockup quality check.");
  const payload=await response.json() as {output?:string};const match=payload.output?.match(/\{[\s\S]*\}/);if(!match)throw new Error("Goldie could not read the mockup quality check.");
  const verdict=JSON.parse(match[0]) as {acceptable?:boolean;best?:number};
  const best=Number.isInteger(verdict.best)&&verdict.best!>0&&verdict.best!<=candidates.length?candidates[verdict.best!-1]:candidates[0];
  return {approved:Boolean(verdict.acceptable),best};
}

async function renderProduct(key:string,kind:ProductKind,scene:string,design:string,reference:string){
  let fallback="",lastError="";
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(`https://fal.run/${rendererFor(kind)}`,{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify(rendererInput(kind,[scene,design,reference]))});
      const result=await response.json() as {images?:Array<{url?:string}>;detail?:string;error?:string};
      const candidates=(result.images||[]).map(image=>image.url).filter((url):url is string=>Boolean(url));
      if(!response.ok||!candidates.length){lastError=result.detail||result.error||"Goldie could not finish this mockup.";continue}
      if(kind!=="apparel")return {image:candidates[0]};
      const verdict=await judgeApparel(key,scene,candidates);fallback=verdict.best||fallback;if(verdict.approved)return {image:verdict.best};
    }catch(error){lastError=error instanceof Error?error.message:"Goldie could not finish this mockup."}
  }
  if(fallback)return {image:fallback,warning:"Goldie created the best available version after automatic retries. Review it closely before publishing."};
  throw new Error(lastError||"Goldie could not finish this mockup after automatic retries.");
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
    const rendered=await fetch(result.image);if(!rendered.ok)throw new Error("Goldie created the mockup but could not deliver the finished file.");
    const bytes=new Uint8Array(await rendered.arrayBuffer());let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    reservedKey="";
    return NextResponse.json({image:`data:${rendered.headers.get("content-type")||"image/png"};base64,${btoa(binary)}`,warning:result.warning});
  }catch(error){if(reservedKey)await getDb().update(mockupRenderUsage).set({count:sql`MAX(0,${mockupRenderUsage.count}-1)`}).where(eq(mockupRenderUsage.userDay,reservedKey)).catch(()=>undefined);return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not finish this mockup."},{status:500});}
}
