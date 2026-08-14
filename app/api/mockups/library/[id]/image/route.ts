import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return new NextResponse(null,{status:404});
  await ensureMockupStorage();
  const {id}=await context.params;
  const [row]=await getDb().select().from(mockupTemplates).where(and(eq(mockupTemplates.id,id),eq(mockupTemplates.userId,user.userId))).limit(1);
  if(!row)return new NextResponse(null,{status:404});
  const object=await env.ARTWORK.get(row.objectKey); if(!object)return new NextResponse(null,{status:404});
  return new NextResponse(object.body,{headers:{"Content-Type":row.contentType,"Cache-Control":"private, max-age=3600"}});
}
