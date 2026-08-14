import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { keywordLists } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load keyword banks." }, { status: 401 });
  const rows = await getDb().select().from(keywordLists).where(eq(keywordLists.userId, user.userId)).orderBy(desc(keywordLists.updatedAt));
  return NextResponse.json({ lists: rows.map((r) => ({ id: r.id, name: r.name, keywords: JSON.parse(r.keywordsJson) })) });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save keyword banks." }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string; keywords?: string[] };
  const name = String(body.name || "").trim().slice(0, 80);
  const keywords = [...new Set((body.keywords || []).map((v) => String(v).trim()).filter(Boolean))].slice(0, 500);
  if (!name || !keywords.length) return NextResponse.json({ error: "Name the bank and add at least one keyword." }, { status: 400 });
  if (!body.id) {
    const existing = await getDb().select().from(keywordLists).where(eq(keywordLists.userId, user.userId));
    if (existing.some((row) => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return NextResponse.json({ error: `A keyword bank named “${name}” already exists. Open that bank to update it instead.` }, { status: 409 });
  }
  const id = body.id || crypto.randomUUID();
  await getDb().insert(keywordLists).values({ id, userId: user.userId, name, keywordsJson: JSON.stringify(keywords) }).onConflictDoUpdate({ target: keywordLists.id, set: { name, keywordsJson: JSON.stringify(keywords), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id });
}
export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete keyword banks." }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  await getDb().delete(keywordLists).where(and(eq(keywordLists.id, String(id || "")), eq(keywordLists.userId, user.userId)));
  return NextResponse.json({ ok: true });
}
