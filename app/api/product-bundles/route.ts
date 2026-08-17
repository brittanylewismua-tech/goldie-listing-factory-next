import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productBundles, productRecipes } from "@/db/schema";

function cleanIds(value:unknown){return [...new Set((Array.isArray(value)?value:[]).map(String).filter(Boolean))]}
function storedIds(value:string){try{return cleanIds(JSON.parse(value||"[]")).slice(0,4)}catch{return[]}}

export async function GET(){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to load product bundles."},{status:401});
  const bundles=await getDb().select().from(productBundles).where(eq(productBundles.userId,user.userId)).orderBy(desc(productBundles.updatedAt));
  return NextResponse.json({bundles:bundles.map(bundle=>({...bundle,recipeIds:storedIds(bundle.recipeIdsJson)}))});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to save product bundles."},{status:401});
  const body=await request.json() as {id?:string;name?:string;recipeIds?:string[]};
  const name=String(body.name||"").trim().slice(0,80),recipeIds=cleanIds(body.recipeIds);
  if(!name)return NextResponse.json({error:"Name this product bundle."},{status:400});
  if(recipeIds.length<2)return NextResponse.json({error:"Choose at least two saved products."},{status:400});
  if(recipeIds.length>4)return NextResponse.json({error:"A product bundle can include up to four products."},{status:400});
  const owned=await getDb().select({id:productRecipes.id}).from(productRecipes).where(and(eq(productRecipes.userId,user.userId),inArray(productRecipes.id,recipeIds)));
  if(owned.length!==recipeIds.length)return NextResponse.json({error:"One of those saved products is no longer available."},{status:400});
  const id=body.id||crypto.randomUUID();
  if(body.id){const [bundle]=await getDb().select({id:productBundles.id}).from(productBundles).where(and(eq(productBundles.id,id),eq(productBundles.userId,user.userId))).limit(1);if(!bundle)return NextResponse.json({error:"That product bundle could not be found."},{status:404})}
  await getDb().insert(productBundles).values({id,userId:user.userId,name,recipeIdsJson:JSON.stringify(recipeIds)}).onConflictDoUpdate({target:productBundles.id,set:{name,recipeIdsJson:JSON.stringify(recipeIds),updatedAt:new Date().toISOString()}});
  return NextResponse.json({id});
}

export async function DELETE(request:Request){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to delete product bundles."},{status:401});
  const {id}=await request.json() as {id?:string};
  await getDb().delete(productBundles).where(and(eq(productBundles.id,String(id||"")),eq(productBundles.userId,user.userId)));
  return NextResponse.json({ok:true});
}
