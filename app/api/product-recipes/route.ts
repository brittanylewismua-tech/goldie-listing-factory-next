import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productRecipes } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load product recipes." }, { status: 401 });
  const recipes = await getDb().select().from(productRecipes).where(eq(productRecipes.userId, user.userId)).orderBy(desc(productRecipes.updatedAt));
  return NextResponse.json({ recipes: recipes.map((r) => ({ ...r, pricing: JSON.parse(r.pricingJson || "{}"), printifyImageIndices: JSON.parse(r.printifyImageIndicesJson || "[]") })) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save product recipes." }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string; templateUrl?: string; description?: string; defaultTitle?: string; defaultMockupTheme?: string; pricing?: unknown; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean };
  const name = String(body.name || "").trim().slice(0, 80), templateUrl = String(body.templateUrl || "").trim();
  if (!name || !templateUrl) return NextResponse.json({ error: "Name the recipe and add its Printify template." }, { status: 400 });
  const id = body.id || crypto.randomUUID();
  if (body.id) {
    const [owned] = await getDb().select({ id: productRecipes.id }).from(productRecipes).where(and(eq(productRecipes.id, id), eq(productRecipes.userId, user.userId))).limit(1);
    if (!owned) return NextResponse.json({ error: "That product recipe could not be found." }, { status: 404 });
  }
  const extras={keywordListId:String(body.keywordListId||""),printifyImageIndicesJson:JSON.stringify((body.printifyImageIndices||[]).filter(Number.isInteger).slice(0,20)),normalizePadding:body.normalizePadding!==false};
  await getDb().insert(productRecipes).values({ id, userId: user.userId, name, templateUrl, description: String(body.description || ""), defaultTitle: String(body.defaultTitle || "").slice(0, 255), defaultMockupTheme: String(body.defaultMockupTheme || "").slice(0, 80), pricingJson: JSON.stringify(body.pricing || {}),...extras }).onConflictDoUpdate({ target: productRecipes.id, set: { name, templateUrl, description: String(body.description || ""), defaultTitle: String(body.defaultTitle || "").slice(0, 255), defaultMockupTheme: String(body.defaultMockupTheme || "").slice(0, 80), pricingJson: JSON.stringify(body.pricing || {}),...extras, updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete product recipes." }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  await getDb().delete(productRecipes).where(and(eq(productRecipes.id, String(id || "")), eq(productRecipes.userId, user.userId)));
  return NextResponse.json({ ok: true });
}
