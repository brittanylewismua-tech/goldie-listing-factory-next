import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to update your mockup library."},{status:401});
  await ensureMockupStorage();
  const {id}=await context.params,body=await request.json() as {corners?:unknown;printSide?:string;quadMeans?:string;confirmed?:boolean};
  /* D573 - the side and the meaning of the quad can be set on their own, without
     re-marking the corners, so a seller can label a photograph as a back view. */
  const sides=new Set(["front","back","left-sleeve","right-sleeve","wrap","other"]);
  if(body.corners===undefined&&(body.printSide||body.quadMeans)){
    const patch:Record<string,unknown>={updatedAt:new Date().toISOString()};
    if(body.printSide&&sides.has(body.printSide))patch.printSide=body.printSide;
    if(body.quadMeans==="print-area"||body.quadMeans==="garment")patch.quadMeans=body.quadMeans;
    await getDb().update(mockupTemplates).set(patch).where(and(eq(mockupTemplates.id,id),eq(mockupTemplates.userId,user.userId)));
    return NextResponse.json({ok:true});
  }
  if(!Array.isArray(body.corners)||body.corners.length!==4)return NextResponse.json({error:"The product area is incomplete."},{status:400});
  /* D573 - corners marked or confirmed by hand in the library are a real print
     area, so Printify's exact scale and position can be mapped into them. Corners
     written by the detector without confirmation stay "garment" and keep the
     empirical constants, because nobody has checked them against the product. */
  await getDb().update(mockupTemplates).set({cornersJson:JSON.stringify(body.corners),updatedAt:new Date().toISOString(),
    ...(body.confirmed?{quadMeans:"print-area" as const}:{}),
    ...(body.printSide&&sides.has(body.printSide)?{printSide:body.printSide}:{})}).where(and(eq(mockupTemplates.id,id),eq(mockupTemplates.userId,user.userId)));
  return NextResponse.json({ok:true});
}
