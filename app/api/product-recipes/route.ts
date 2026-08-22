import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productRecipes } from "@/db/schema";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load product recipes." }, { status: 401 });
  const recipes = await getDb().select().from(productRecipes).where(eq(productRecipes.userId, user.userId)).orderBy(desc(productRecipes.updatedAt));
  return NextResponse.json({ recipes: recipes.map((r) => {const saved=JSON.parse(r.pricingJson||"{}");return {...r,etsyShippingProfileId:Number(saved.etsyShippingProfileId)||0,defaultColorIds:Array.isArray(saved.defaultColorIds)?saved.defaultColorIds.filter(Number.isInteger):[],defaultSizeIds:Array.isArray(saved.defaultSizeIds)?saved.defaultSizeIds.filter(Number.isInteger):[],defaultProfitTarget:Number(saved.defaultProfitTarget)||10,etsyDefaults:saved.etsyDefaults&&typeof saved.etsyDefaults==="object"?saved.etsyDefaults:{},mockupIds:Array.isArray(saved.mockupIds)?saved.mockupIds.filter((id:unknown)=>typeof id==="string").slice(0,8):undefined,setupComplete:saved.setupComplete!==false,printifyImageIndices:JSON.parse(r.printifyImageIndicesJson||"[]")}}) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save product recipes." }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string; templateUrl?: string; description?:string; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean;etsyShippingProfileId?:number;defaultColorIds?:number[];defaultSizeIds?:number[];etsyDefaults?:Record<string,unknown>;defaultMockupTheme?:string;mockupIds?:string[];setupComplete?:boolean;defaultProfitTarget?:number };
  const name = String(body.name || "").trim().slice(0, 80), templateUrl = String(body.templateUrl || "").trim();
  if (!name || !templateUrl) return NextResponse.json({ error: "Name the recipe and add its Printify template." }, { status: 400 });
  const id = body.id || crypto.randomUUID();
  let existingSaved: Record<string, unknown> = {};
  if (body.id) {
    const [owned] = await getDb().select({ id: productRecipes.id, pricingJson: productRecipes.pricingJson }).from(productRecipes).where(and(eq(productRecipes.id, id), eq(productRecipes.userId, user.userId))).limit(1);
    if (!owned) return NextResponse.json({ error: "That product recipe could not be found." }, { status: 404 });
    try { existingSaved = JSON.parse(owned.pricingJson || "{}") as Record<string, unknown>; } catch { existingSaved = {}; }
  }
  const etsyDefaults=Object.fromEntries(Object.entries(body.etsyDefaults&&typeof body.etsyDefaults==="object"?body.etsyDefaults:{}).map(([key,value])=>[String(key).trim().slice(0,60),String(value??"").trim().slice(0,120)]).filter(([key,value])=>key&&value));
  const description=String(body.description||"").trim().slice(0,12000),defaultMockupTheme=String(body.defaultMockupTheme||"").trim().slice(0,80);
  /* pricingJson is a blob, and it used to be rebuilt from scratch on every POST.
     Any caller that did not resend a field wiped it — renaming a product through
     the saved-products form would have dropped defaultSizeIds the same way it
     could already drop a defaultProfitTarget. Merge instead: a key is only
     written when the caller actually sent it, so partial saves are safe and
     sending an explicit [] still clears a list. */
  const patch: Record<string, unknown> = {};
  if (body.etsyShippingProfileId !== undefined) patch.etsyShippingProfileId = Number(body.etsyShippingProfileId) || 0;
  if (body.defaultColorIds !== undefined) patch.defaultColorIds = (body.defaultColorIds || []).filter(Number.isInteger);
  if (body.defaultSizeIds !== undefined) patch.defaultSizeIds = (body.defaultSizeIds || []).filter(Number.isInteger);
  if (body.defaultProfitTarget !== undefined) patch.defaultProfitTarget = Math.max(0, Math.min(500, Number(body.defaultProfitTarget) || 10));
  if (body.etsyDefaults !== undefined) patch.etsyDefaults = etsyDefaults;
  if (body.mockupIds !== undefined) patch.mockupIds = Array.isArray(body.mockupIds) ? body.mockupIds.map(id=>String(id).trim()).filter(Boolean).slice(0,8) : undefined;
  if (body.setupComplete !== undefined) patch.setupComplete = body.setupComplete !== false;
  const merged = { etsyShippingProfileId: 0, defaultColorIds: [], defaultSizeIds: [], defaultProfitTarget: 10, etsyDefaults: {}, setupComplete: true, ...existingSaved, ...patch };
  const extras={keywordListId:String(body.keywordListId||""),printifyImageIndicesJson:JSON.stringify((body.printifyImageIndices||[]).filter(Number.isInteger).slice(0,20)),normalizePadding:body.normalizePadding!==false,pricingJson:JSON.stringify(merged)};
  await getDb().insert(productRecipes).values({ id, userId: user.userId, name, templateUrl, description,defaultTitle:"",defaultMockupTheme,...extras }).onConflictDoUpdate({ target: productRecipes.id, set: { name, templateUrl,description,defaultTitle:"",defaultMockupTheme,...extras,updatedAt:new Date().toISOString() } });
  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete product recipes." }, { status: 401 });
  const { id } = await request.json() as { id?: string };
  await getDb().delete(productRecipes).where(and(eq(productRecipes.id, String(id || "")), eq(productRecipes.userId, user.userId)));
  return NextResponse.json({ ok: true });
}
