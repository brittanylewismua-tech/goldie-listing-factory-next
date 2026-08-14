import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to update your mockup library."},{status:401});
  await ensureMockupStorage();
  const {id}=await context.params,body=await request.json() as {corners?:unknown};
  if(!Array.isArray(body.corners)||body.corners.length!==4)return NextResponse.json({error:"The product area is incomplete."},{status:400});
  await getDb().update(mockupTemplates).set({cornersJson:JSON.stringify(body.corners),updatedAt:new Date().toISOString()}).where(and(eq(mockupTemplates.id,id),eq(mockupTemplates.userId,user.userId)));
  return NextResponse.json({ok:true});
}
