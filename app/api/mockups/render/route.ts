import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupRenderUsage } from "@/db/schema";
import { rendererFor, rendererInput, type ProductKind } from "@/app/mockups/product-renderers";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

const MAX_DATA_URL_LENGTH=18*1024*1024,DAILY_LIMIT=50;
const valid=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(value)&&value.length<=MAX_DATA_URL_LENGTH;

export async function POST(request:NextRequest){
  try{
    const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to create product mockups."},{status:401});
    await ensureMockupStorage();
    const body=await request.json() as {kind?:ProductKind;scene?:string;design?:string;reference?:string};
    if(!body.kind||!["apparel","soft-goods","curved","irregular"].includes(body.kind)||!valid(body.scene)||!valid(body.design)||body.reference&&!valid(body.reference))return NextResponse.json({error:"The mockup files could not be read safely."},{status:400});
    if(!body.reference)return NextResponse.json({error:"Add one placement reference for this product so Goldie can match the print size and position."},{status:400});
    const day=new Date().toISOString().slice(0,10),userDay=`${user.userId}:${day}`,db=getDb();
    await db.insert(mockupRenderUsage).values({userDay,userId:user.userId,day,count:1}).onConflictDoUpdate({target:mockupRenderUsage.userDay,set:{count:sql`${mockupRenderUsage.count}+1`,updatedAt:new Date().toISOString()}});
    const [usage]=await db.select().from(mockupRenderUsage).where(eq(mockupRenderUsage.userDay,userDay)).limit(1);
    if(!usage||usage.count>DAILY_LIMIT)return NextResponse.json({error:"Your daily mockup rendering limit has been reached."},{status:429});
    const key=process.env.FAL_KEY;if(!key)return NextResponse.json({error:"Product rendering is temporarily unavailable."},{status:503});
    const response=await fetch(`https://fal.run/${rendererFor(body.kind)}`,{method:"POST",headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},body:JSON.stringify(rendererInput(body.kind,[body.scene,body.design,...(body.reference?[body.reference]:[])]))});
    const result=await response.json() as {images?:Array<{url?:string}>;detail?:string;error?:string};
    const image=result.images?.[0]?.url;if(!response.ok||!image)return NextResponse.json({error:result.detail||result.error||"Goldie could not finish this mockup."},{status:502});
    const rendered=await fetch(image);if(!rendered.ok)return NextResponse.json({error:"Goldie created the mockup but could not deliver the finished file."},{status:502});
    const bytes=new Uint8Array(await rendered.arrayBuffer());let binary="";for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    return NextResponse.json({image:`data:${rendered.headers.get("content-type")||"image/png"};base64,${btoa(binary)}`});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Goldie could not finish this mockup."},{status:500});}
}
