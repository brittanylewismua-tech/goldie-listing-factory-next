import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { desc, eq, and } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { productRecipes } from "@/db/schema";
import { reachResolver, type Proof } from "./reach";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load product recipes." }, { status: 401 });
  const recipes = await getDb().select().from(productRecipes).where(eq(productRecipes.userId, user.userId)).orderBy(desc(productRecipes.updatedAt));
  /* D835 · The bank is scoped to the Etsy shop the seller is working in.
     A product can only be built into a listing if its Printify store publishes
     to the active Etsy shop, and shop_pairing_proofs is where that verdict
     already lives. Three states, and the difference matters:

       paired here   a proof says this Printify store publishes to the active
                     shop. Offer it.
       unproven      no verdict yet for this store. Offer it - hiding a product
                     on no evidence is how a seller loses work they can do.
       paired away   a proof says it publishes to one of their OTHER connected
                     shops. Hide it behind a count and a way to switch, because
                     choosing it here can only end in a 409.

     Measured on her account: with godisagirlapparel connected, three of four
     products loaded; connecting She's A Wolf Clothing inverted it to one of
     four. That is the whole reason for this.

     D857 · "unproven means offer it" was wrong, and it is why she was still
     looking at four GODISAGIRLAPPAREL products in a She's A Wolf Clothing
     portal. Measured live:

       active Etsy shop   16538900  shesawolfclothing
       Gildan Tee         1374648   She's A Wolf Clothing   here
       four others        20191756  GODISAGIRLAPPAREL       unproven

     A Printify store publishes to exactly one Etsy shop. So the moment ONE
     store is proven to be the one that pairs with the active shop, every other
     store is proven not to be - there is nothing left to prove about 20191756,
     and offering its products can only ever end in the 409 those three
     actually returned.

     The generous reading of "unproven" is still right, but only while nothing
     is known: with no proof for the active shop, every store is a candidate
     and all of them are offered. One proof settles the question. */
  const active = await env.DB.prepare("SELECT shop_id, shop_name FROM etsy_connections WHERE user_id=? AND is_active=1")
    .bind(user.userId).first<{ shop_id: number; shop_name: string }>();
  const proofs = await env.DB.prepare("SELECT printify_shop_id, etsy_shop_id FROM shop_pairing_proofs WHERE user_id=?")
    .bind(user.userId).all<Proof>();
  const reach = reachResolver(active?.shop_id || 0, proofs.results || []);

  return NextResponse.json({ activeEtsyShop: active ? { shopId: active.shop_id, shopName: active.shop_name } : null, recipes: recipes.map((r) => {const saved=JSON.parse(r.pricingJson||"{}");return {...r,etsyShippingProfileId:Number(saved.etsyShippingProfileId)||0,defaultColorIds:Array.isArray(saved.defaultColorIds)?saved.defaultColorIds.filter(Number.isInteger):[],defaultSizeIds:Array.isArray(saved.defaultSizeIds)?saved.defaultSizeIds.filter(Number.isInteger):[],defaultProfitTarget:Number(saved.defaultProfitTarget)||10,wholeNumberPricing:saved.wholeNumberPricing===true,variantPrices:saved.variantPrices&&typeof saved.variantPrices==="object"?saved.variantPrices as Record<string,number>:{},etsyDefaults:saved.etsyDefaults&&typeof saved.etsyDefaults==="object"?saved.etsyDefaults:{},previewImage:typeof saved.previewImage==="string"?saved.previewImage:"",printifyShopTitle:typeof saved.printifyShopTitle==="string"?saved.printifyShopTitle:"",printifyShopId:Number(saved.printifyShopId)||0,mockupIds:Array.isArray(saved.mockupIds)?saved.mockupIds.filter((id:unknown)=>typeof id==="string").slice(0,8):undefined,setupComplete:saved.setupComplete!==false,reach:reach(Number(saved.printifyShopId)||0),printifyImageIndices:JSON.parse(r.printifyImageIndicesJson||"[]")}}) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save product recipes." }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string; templateUrl?: string; description?:string; keywordListId?:string; printifyImageIndices?:number[]; normalizePadding?:boolean;previewImage?:string;printifyShopTitle?:string;printifyShopId?:number;etsyShippingProfileId?:number;defaultColorIds?:number[];defaultSizeIds?:number[];etsyDefaults?:Record<string,unknown>;defaultMockupTheme?:string;mockupIds?:string[];setupComplete?:boolean;defaultProfitTarget?:number;wholeNumberPricing?:boolean;variantPrices?:Record<string,number> };
  const name = String(body.name || "").trim().slice(0, 80), templateUrl = String(body.templateUrl || "").trim();
  if (!name || !templateUrl) return NextResponse.json({ error: "Name the recipe and add its Printify template." }, { status: 400 });
  const id = body.id || crypto.randomUUID();
  let existingSaved: Record<string, unknown> = {};
  /* D305 · pricingJson merges (see below), but these top-level COLUMNS were
     written unconditionally, so any caller that omitted one wiped it — a
     partial save would silently clear the description, the keyword bank, the
     mockup set or the saved photo choices. Every caller happens to send the
     whole recipe today, which is why nothing has broken; that is caller
     discipline, not a guarantee. Keep the stored value when a key is absent. */
  let existingRow: { description?: string|null; defaultMockupTheme?: string|null; keywordListId?: string|null; printifyImageIndicesJson?: string|null } | null = null;
  if (body.id) {
    const [owned] = await getDb().select({ id: productRecipes.id, pricingJson: productRecipes.pricingJson, description: productRecipes.description, defaultMockupTheme: productRecipes.defaultMockupTheme, keywordListId: productRecipes.keywordListId, printifyImageIndicesJson: productRecipes.printifyImageIndicesJson }).from(productRecipes).where(and(eq(productRecipes.id, id), eq(productRecipes.userId, user.userId))).limit(1);
    if (!owned) return NextResponse.json({ error: "That product recipe could not be found." }, { status: 404 });
    try { existingSaved = JSON.parse(owned.pricingJson || "{}") as Record<string, unknown>; } catch { existingSaved = {}; }
    existingRow = owned;
  }
  const etsyDefaults=Object.fromEntries(Object.entries(body.etsyDefaults&&typeof body.etsyDefaults==="object"?body.etsyDefaults:{}).map(([key,value])=>[String(key).trim().slice(0,60),String(value??"").trim().slice(0,120)]).filter(([key,value])=>key&&value));
  const description=body.description!==undefined?String(body.description||"").trim().slice(0,12000):String(existingRow?.description||"");
  const defaultMockupTheme=body.defaultMockupTheme!==undefined?String(body.defaultMockupTheme||"").trim().slice(0,80):String(existingRow?.defaultMockupTheme||"");
  /* pricingJson is a blob, and it used to be rebuilt from scratch on every POST.
     Any caller that did not resend a field wiped it — renaming a product through
     the saved-products form would have dropped defaultSizeIds the same way it
     could already drop a defaultProfitTarget. Merge instead: a key is only
     written when the caller actually sent it, so partial saves are safe and
     sending an explicit [] still clears a list. */
  const patch: Record<string, unknown> = {};
  if (body.etsyShippingProfileId !== undefined) patch.etsyShippingProfileId = Number(body.etsyShippingProfileId) || 0;
  /* D649 - which Printify store this product lives in, so the saved-product card
     can say it. Recorded when the product is loaded; absent on older recipes. */
  /* D842 · The product's own Printify flatlay, remembered on the recipe so the
     saved-product tiles can show the garment instead of a grey placeholder.
     Fetching it per tile would be one Printify round trip per card. */
  if (body.previewImage !== undefined) patch.previewImage = String(body.previewImage || "").slice(0, 300);
  if (body.printifyShopTitle !== undefined) patch.printifyShopTitle = String(body.printifyShopTitle || "").slice(0, 80);
  if (body.printifyShopId !== undefined) patch.printifyShopId = Number(body.printifyShopId) || 0;
  if (body.defaultColorIds !== undefined) patch.defaultColorIds = (body.defaultColorIds || []).filter(Number.isInteger);
  if (body.defaultSizeIds !== undefined) patch.defaultSizeIds = (body.defaultSizeIds || []).filter(Number.isInteger);
  if (body.defaultProfitTarget !== undefined) patch.defaultProfitTarget = Math.max(0, Math.min(500, Number(body.defaultProfitTarget) || 10));
  if (body.etsyDefaults !== undefined) patch.etsyDefaults = etsyDefaults;
  if (body.mockupIds !== undefined) patch.mockupIds = Array.isArray(body.mockupIds) ? body.mockupIds.map(id=>String(id).trim()).filter(Boolean).slice(0,8) : undefined;
  if (body.setupComplete !== undefined) patch.setupComplete = body.setupComplete !== false;
  /* D659 · Measured live: the 1566 crewneck saved as setupComplete with three
     colours and ZERO sizes, because the client's auto-save fires as soon as
     colours settle. The step-2 gate still refused to continue, so the flag and
     the truth disagreed - and the flag is what the bundle picker trusts when it
     decides whether a product may be added.

     A product is not set up until it has at least one colour AND at least one
     size, and the server is where that is settled: the client writes the flag
     from several places and only this one sees the values being stored beside
     it. Applied against the merged record, so a patch that touches only one
     axis still cannot leave the pair inconsistent. */
  /* D404 - Whole-number pricing and the per-variant prices lived only in React
     state and the batch snapshot, and the batch snapshot is not written until a
     batch has designs or drafts. So on the product step they were never saved
     anywhere: set the profit goal, tick whole-number pricing, refresh, and both
     were gone. They belong to the saved product, like the profit target beside
     them. */
  if (body.wholeNumberPricing !== undefined) patch.wholeNumberPricing = body.wholeNumberPricing === true;
  if (body.variantPrices !== undefined) {
    const prices: Record<string, number> = {};
    for (const [variantId, cents] of Object.entries(body.variantPrices || {})) {
      const amount = Number(cents);
      if (Number.isFinite(amount) && amount > 0) prices[String(variantId)] = Math.round(amount);
    }
    patch.variantPrices = prices;
  }
  const merged = { etsyShippingProfileId: 0, defaultColorIds: [], defaultSizeIds: [], defaultProfitTarget: 10, etsyDefaults: {}, setupComplete: true, wholeNumberPricing: false, variantPrices: {}, ...existingSaved, ...patch };
  /* D659 · Measured live: the 1566 crewneck saved as setupComplete with three
     colours and ZERO sizes, because the client's auto-save fires as soon as
     colours settle. The step gate still refused to continue, so the flag and
     the truth disagreed - and the flag is what the bundle picker trusts when it
     decides whether a product may be added at all.

     Settled here rather than at the call site: the client writes this flag from
     several places, and only the merged record sees the flag together with the
     values stored beside it. So a patch that touches one axis, or none, still
     cannot leave the pair inconsistent. */
  if (merged.setupComplete && (!(merged.defaultColorIds || []).length || !(merged.defaultSizeIds || []).length)) merged.setupComplete = false;
  const extras={keywordListId:body.keywordListId!==undefined?String(body.keywordListId||""):String(existingRow?.keywordListId||""),printifyImageIndicesJson:body.printifyImageIndices!==undefined?JSON.stringify((body.printifyImageIndices||[]).filter(Number.isInteger).slice(0,20)):String(existingRow?.printifyImageIndicesJson||"[]"),normalizePadding:body.normalizePadding!==false,pricingJson:JSON.stringify(merged)};
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
