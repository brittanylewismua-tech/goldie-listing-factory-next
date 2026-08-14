import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

const kinds = new Set(["rigid-flat", "apparel", "soft-goods", "curved", "irregular"]);
const MAX_FILE = 25 * 1024 * 1024;
const MAX_MOCKUPS_PER_SET = 50;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load your mockup library." }, { status: 401 });
  await ensureMockupStorage();
  const rows = await getDb().select().from(mockupTemplates).where(eq(mockupTemplates.userId, user.userId));
  const preferences=await env.DB.prepare(`SELECT source_theme,display_name,hidden FROM mockup_set_preferences WHERE user_id=?`).bind(user.userId).all<{source_theme:string;display_name:string;hidden:number}>();
  return NextResponse.json({ templates: rows.map(row => ({
    id: row.id, theme: row.theme, name: row.name, surfaceKind: row.surfaceKind,
    corners: JSON.parse(row.cornersJson), custom: true, normalized: true,
    src: `/api/mockups/library/${encodeURIComponent(row.id)}/image`,
  })),preferences:preferences.results.map(row=>({sourceTheme:row.source_theme,displayName:row.display_name,hidden:Boolean(row.hidden)})) });
}

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your mockup library." }, { status: 401 });
  await ensureMockupStorage();
  const form = await request.formData();
  const image = form.get("image"), theme = String(form.get("theme") || "").trim().slice(0, 80);
  const name = String(form.get("name") || "").trim().slice(0, 120), surfaceKind = String(form.get("surfaceKind") || "");
  if (!(image instanceof File) || !/^image\/(png|jpeg|webp)$/.test(image.type) || image.size > MAX_FILE) return NextResponse.json({ error: "Choose a PNG, JPG, or WEBP mockup under 25 MB." }, { status: 400 });
  if (!theme || !name || !kinds.has(surfaceKind)) return NextResponse.json({ error: "The mockup set details are incomplete." }, { status: 400 });
  const existing = await getDb().select({ id:mockupTemplates.id }).from(mockupTemplates).where(and(eq(mockupTemplates.userId,user.userId),eq(mockupTemplates.theme,theme)));
  if(existing.length>=MAX_MOCKUPS_PER_SET)return NextResponse.json({error:"This mockup set already contains 50 mockups. Create another themed set to add more."},{status:409});
  const id = crypto.randomUUID(), objectKey = `mockup-library/${user.userId}/${id}`;
  await env.ARTWORK.put(objectKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
  await getDb().insert(mockupTemplates).values({ id, userId:user.userId, theme, name, surfaceKind, cornersJson:JSON.stringify([[.15,.12],[.85,.12],[.85,.88],[.15,.88]]), objectKey, contentType:image.type });
  return NextResponse.json({ template:{ id,theme,name,surfaceKind,corners:[[.15,.12],[.85,.12],[.85,.88],[.15,.88]],custom:true,normalized:true,src:`/api/mockups/library/${encodeURIComponent(id)}/image` } });
}

export async function PATCH(request:NextRequest){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to update your mockup library."},{status:401});
  await ensureMockupStorage();
  const body=await request.json() as {oldTheme?:string;newTheme?:string;sourceTheme?:string},oldTheme=String(body.oldTheme||"").trim(),newTheme=String(body.newTheme||"").trim().slice(0,80),sourceTheme=String(body.sourceTheme||"").trim();
  if(!oldTheme||!newTheme)return NextResponse.json({error:"Enter a name for this mockup set."},{status:400});
  if(sourceTheme){await env.DB.prepare(`INSERT INTO mockup_set_preferences (user_id,source_theme,display_name,hidden,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_theme) DO UPDATE SET display_name=excluded.display_name,hidden=0,updated_at=CURRENT_TIMESTAMP`).bind(user.userId,sourceTheme,newTheme,0).run();return NextResponse.json({ok:true});}
  const conflict=await getDb().select({id:mockupTemplates.id}).from(mockupTemplates).where(and(eq(mockupTemplates.userId,user.userId),eq(mockupTemplates.theme,newTheme)));
  if(oldTheme!==newTheme&&conflict.length)return NextResponse.json({error:"You already have a mockup set with that name."},{status:409});
  await getDb().update(mockupTemplates).set({theme:newTheme,updatedAt:new Date().toISOString()}).where(and(eq(mockupTemplates.userId,user.userId),eq(mockupTemplates.theme,oldTheme)));
  return NextResponse.json({ok:true});
}

export async function DELETE(request:NextRequest){
  const user=await getChatGPTUser(); if(!user)return NextResponse.json({error:"Sign in to update your mockup library."},{status:401});
  await ensureMockupStorage();
  const body=await request.json() as {theme?:string;sourceTheme?:string},theme=String(body.theme||"").trim(),sourceTheme=String(body.sourceTheme||"").trim();
  if(!theme)return NextResponse.json({error:"Choose a mockup set to delete."},{status:400});
  if(sourceTheme){await env.DB.prepare(`INSERT INTO mockup_set_preferences (user_id,source_theme,display_name,hidden,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,source_theme) DO UPDATE SET hidden=1,updated_at=CURRENT_TIMESTAMP`).bind(user.userId,sourceTheme,theme,1).run();return NextResponse.json({ok:true,deleted:0});}
  const rows=await getDb().select().from(mockupTemplates).where(and(eq(mockupTemplates.userId,user.userId),eq(mockupTemplates.theme,theme)));
  await Promise.all(rows.map(row=>env.ARTWORK.delete(row.objectKey)));
  await getDb().delete(mockupTemplates).where(and(eq(mockupTemplates.userId,user.userId),eq(mockupTemplates.theme,theme)));
  return NextResponse.json({ok:true,deleted:rows.length});
}
