import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";

const kinds = new Set(["rigid-flat", "apparel", "soft-goods", "curved", "irregular"]);
const MAX_FILE = 25 * 1024 * 1024;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load your mockup library." }, { status: 401 });
  await ensureMockupStorage();
  const rows = await getDb().select().from(mockupTemplates).where(eq(mockupTemplates.userId, user.userId));
  return NextResponse.json({ templates: rows.map(row => ({
    id: row.id, theme: row.theme, name: row.name, surfaceKind: row.surfaceKind,
    corners: JSON.parse(row.cornersJson), custom: true, normalized: true,
    src: `/api/mockups/library/${encodeURIComponent(row.id)}/image`,
  })) });
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
  const id = crypto.randomUUID(), objectKey = `mockup-library/${user.userId}/${id}`;
  await env.ARTWORK.put(objectKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } });
  await getDb().insert(mockupTemplates).values({ id, userId:user.userId, theme, name, surfaceKind, cornersJson:JSON.stringify([[.15,.12],[.85,.12],[.85,.88],[.15,.88]]), objectKey, contentType:image.type });
  return NextResponse.json({ template:{ id,theme,name,surfaceKind,corners:[[.15,.12],[.85,.12],[.85,.88],[.15,.88]],custom:true,normalized:true,src:`/api/mockups/library/${encodeURIComponent(id)}/image` } });
}
