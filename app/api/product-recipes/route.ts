import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productRecipes } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load product recipes." }, { status: 401 });
  const recipes = await getDb().select().from(productRecipes).where(eq(productRecipes.userId, user.userId)).orderBy(desc(productRecipes.updatedAt));
  return NextResponse.json({ recipes: recipes.map((r) => ({ ...r, pricing: JSON.parse(r.pricingJson || "{}") })) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save product recipes." }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string; templateUrl?: string; description?: string; defaultTitle?: string; defaultMockupTheme?: string; pricing?: unknown };
  const name = String(body.name || "").trim().slice(0, 80), templateUrl = String(body.templateUrl || "").trim();
  if (!name || !templateUrl) return NextResponse.json({ error: "Name the recipe and add its Printify template." }, { status: 400 });
  const id = body.id || crypto.randomUUID();
  await getDb().insert(productRecipes).values({ id, userId: user.userId, name, templateUrl, description: String(body.description || ""), defaultTitle: String(body.defaultTitle || "").slice(0, 255), defaultMockupTheme: String(body.defaultMockupTheme || "").slice(0, 80), pricingJson: JSON.stringify(body.pricing || {}) }).onConflictDoUpdate({ target: productRecipes.id, set: { name, templateUrl, description: String(body.description || ""), defaultTitle: String(body.defaultTitle || "").slice(0, 255), defaultMockupTheme: String(body.defaultMockupTheme || "").slice(0, 80), pricingJson: JSON.stringify(body.pricing || {}), updatedAt: new Date().toISOString() } });
  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete product recipes." }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  await getDb().delete(productRecipes).where(and(eq(productRecipes.id, String(id || "")), eq(productRecipes.userId, user.userId)));
  return NextResponse.json({ ok: true });
}
