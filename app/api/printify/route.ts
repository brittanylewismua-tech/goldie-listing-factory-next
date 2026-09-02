import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { verifyShopPairing, shopMismatch } from "./shop-match";
import { cachedJson, provenPairing, rememberPairing, forgetPairings } from "../static-cache";
import { templateHasLabelArtwork } from "./product-payload";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { isOwner } from "@/app/mastermind/access";
import { decryptPrintifyToken, encryptPrintifyToken } from "./token-crypto";
import { etsyConnection, etsyFetch } from "../etsy/client";
import { canonicalProductColorIds, groupProductColors } from "@/app/product-color-options";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type Product = {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  description?: string;
  external?: { id?: string; shipping_template_id?: string };
  sales_channel_properties?: { free_shipping?: boolean };
  images?: Array<{ src?: string; is_default?: boolean; is_selected_for_publishing?: boolean }>;
  options?: Array<{ name?: string; type?: string; values?: Array<{ id: number; title?: string; colors?: string[] }> }>;
  variants?: Array<{ id: number; title?: string; options?: number[]; price: number; cost?: number; is_enabled?: boolean }>;
  print_areas?: Array<{
    variant_ids: number[];
    background?: string;
    placeholders?: Array<{ position?: string; images?: Array<{ id?: string; x?: number; y?: number; scale?: number; angle?: number }> }>;
  }>;
};
type Blueprint={id:number;title?:string;description?:string;brand?:string;model?:string;images?:string[]};
type CatalogVariant = { id: number; placeholders?: Array<{ position?: string; width?: number; height?: number }> };
type Shipping={profiles?:Array<{variant_ids?:number[];first_item?:{cost?:number;currency?:string};countries?:string[]}>};
type EtsyShippingProfile={shipping_profile_id:number;is_deleted?:boolean};
class PrintifyApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function runtimeEnv() {
  return env as unknown as { DB?: D1Database; PRINTIFY_TOKEN_KEY?: string };
}

async function encryptToken(token: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure token storage is not configured.");
  return encryptPrintifyToken(token, secret);
}

async function decryptToken(value: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure token storage is not configured.");
  return decryptPrintifyToken(value, secret);
}

async function storedToken(userId: string) {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("Secure token storage is unavailable.");
  const row = await db.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id = ?").bind(userId).first<{ encrypted_token: string }>();
  return row ? decryptToken(row.encrypted_token) : null;
}

async function saveToken(userId: string, token: string) {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("Secure token storage is unavailable.");
  const encrypted = await encryptToken(token);
  await db.prepare("INSERT INTO printify_connections (user_id, encrypted_token, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET encrypted_token = excluded.encrypted_token, updated_at = CURRENT_TIMESTAMP").bind(userId, encrypted).run();
}

async function printify<T>(path: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PRINTIFY_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
  } catch { throw new PrintifyApiError(0, "Printify could not be reached. Your saved connection has not been changed."); }
  if (!response.ok) throw new PrintifyApiError(response.status, response.status === 401 || response.status === 403 ? "Printify did not accept that token." : `Printify returned ${response.status}. Your saved connection has not been changed.`);
  return response.json() as Promise<T>;
}

/* D655 · Four of the calls on this path read Printify's CATALOGUE: blueprint
   metadata, print providers, variants and shipping rates. None of it is the
   seller's data - the Comfort Colors 1566 catalogue is the same bytes for every
   Goldie user and changes on Printify's release schedule, not theirs. Fetching
   it fresh on every product load spent four sequential round trips re-reading
   values that had not moved.

   Cached at the edge for a day, keyed on the path alone. The token still has to
   be valid to reach this code, and no seller-specific data passes through
   here - which is exactly why it is safe to share. */
const CATALOG_TTL_SECONDS=86400;

/* D656 · Shares one cache with Etsy's taxonomy - the two are the same problem:
   data that belongs to the platform, not to the seller, fetched again on every
   request that needed it. */
function printifyCatalog<T>(path: string, token: string, seen?: { fetched: number }): Promise<T> {
  return cachedJson<T>("printify-catalog", path, CATALOG_TTL_SECONDS, () => { if(seen)seen.fetched+=1; return printify<T>(path, token); });
}

/* D655 · Every Etsy read on this path is already written so that a failure
   falls through to a message that stays accurate without it. etsyFetch retries
   a 429 or a 5xx five times, backing off as far as eight seconds each, so each
   of those "optional" lookups could cost forty seconds of a seller's wait to
   arrive at the fallback it was going to take anyway. Bound them: an answer
   Goldie cannot get quickly is an answer it does not have. */
const ETSY_LOOKUP_MS=4000;

/* D661 · The caches.default memo that used to live here never stored anything
   this deployment could read back - D657's counter reported "miss" on six
   consecutive identical loads. Replaced by a D1 row keyed on the two stable
   shop ids; see app/api/static-cache.ts. */

function boundedEtsy<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Etsy lookup timed out")), ETSY_LOOKUP_MS))]);
}

/* Which Printify links work.
 *
 * Both the design-editor page and the product page carry the product id, so
 * both are accepted — a seller who copies the URL while writing the product
 * description should not be turned away. A bare id is accepted too, because
 * people copy it out of the address bar on its own.
 *
 * What genuinely cannot work: the My Products list, the catalogue/blueprint
 * pages and the orders page. None of them identify a single saved product. */
function productIdFromUrl(value: string) {
  const fromPath = (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1];
  if (fromPath) return fromPath;
  const bare = value.trim();
  return /^[a-f0-9]{20,32}$/i.test(bare) ? bare : "";
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const token = await storedToken(user.userId);
    if (!token) return NextResponse.json({ connected: false, owner: isOwner(user) });
    await printify<Shop[]>("/shops.json", token);
    return NextResponse.json({ connected: true, owner: isOwner(user) });
  } catch (error) {
    if (error instanceof PrintifyApiError && (error.status === 401 || error.status === 403)) {
      const db = runtimeEnv().DB;
      await db?.prepare("DELETE FROM printify_connections WHERE user_id = ?").bind(user.userId).run().catch(() => undefined);
      return NextResponse.json({ connected: false, owner: isOwner(user), reason: "Your saved Printify token expired or was revoked. Connect a new token." });
    }
    if (error instanceof Error && /decrypt|encrypted|token storage/i.test(error.message)) {
      return NextResponse.json({ connected: false, owner: isOwner(user), reason: "Your saved Printify connection could not be read safely. Disconnect it and connect a new token." });
    }
    return NextResponse.json({ connected: true, owner: isOwner(user), warning: error instanceof Error ? error.message : "Printify is temporarily unavailable." });
  }
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const db = runtimeEnv().DB;
  if (!db) return NextResponse.json({ error: "Secure token storage is unavailable." }, { status: 500 });
  await db.prepare("DELETE FROM printify_connections WHERE user_id = ?").bind(user.userId).run();
  /* D661 · A proof is about one pair of shops. Disconnecting invalidates it. */
  await forgetPairings(user.userId);
  return NextResponse.json({ connected: false });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  try {
    /* D657 · Every timing I took of this route was measured in a browser tab
       Chrome had backgrounded, where timers and promise continuations are
       frozen - so the numbers described the tab, not the server. The route
       reports its own phases now: it cannot be fooled by tab state, and it says
       plainly which reads were served from cache. */
    const started=Date.now();
    const timings:Record<string,number>={};
    const cacheReport:Record<string,"hit"|"miss"|"skipped">={};
    const phase=async <T,>(name:string,work:()=>Promise<T>):Promise<T>=>{const at=Date.now();try{return await work()}finally{timings[name]=Date.now()-at}};
    const body = (await request.json()) as { token?: string; productUrl?: string;savedShippingProfileId?:number };
    const token = body.token?.trim() || await storedToken(user.userId);
    if (!token) return NextResponse.json({ error: "Connect your Printify account first." }, { status: 400 });
    const shops = await phase("shops",()=>printify<Shop[]>("/shops.json", token));
    if (!body.productUrl) { await saveToken(user.userId, token); /* D661 · A new token can be a different Printify account, so every proof it backed is void. */ await forgetPairings(user.userId); return NextResponse.json({ connected: true }); }

    const productId = productIdFromUrl(body.productUrl.trim());
    if (!productId) return NextResponse.json({ error: "Goldie could not find a product in that link.", issues:["Open the product in Printify and copy the address bar. Either the design-editor page or the product page works.","The My Products list, the catalogue and the orders page do not identify a single product, so their links cannot be used."] }, { status: 400 });
    /* D654 - this asked each shop in turn. With four stores that is four round
       trips before the product is even identified, on the one request a seller
       waits on. They do not depend on each other, so ask them together. */
    const attempts = await phase("findProduct",()=>Promise.all(shops.map(async shop => {
      try{
        const response = await fetch(`${PRINTIFY_API}/shops/${shop.id}/products/${productId}.json`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
        if (response.ok) return { shop, product: (await response.json()) as Product };
        /* A 404 is "not this shop". Anything else is Printify having a bad
           moment, and must not be reported to the seller as a wrong shop. */
        return response.status===404?undefined:{ shop, unavailable:true as const };
      }catch{ return { shop, unavailable:true as const } }
    })));
    const found = attempts.find((attempt): attempt is { shop: Shop; product: Product } => Boolean(attempt && "product" in attempt));
    if (!found) {
      /* D654 - every failure here said "use a product from the Printify shop
         connected to Goldie", which sent a seller to check their connection
         when the usual cause is a mistyped link or a product they deleted. */
      const unreachable = attempts.some(attempt => attempt && "unavailable" in attempt);
      return NextResponse.json({ error: "Goldie could not open that Printify product.", issues: unreachable
        ? ["Printify did not answer for one of your stores just now. Wait a moment and submit the same link again."]
        : [`Goldie looked in ${shops.length===1?"your Printify store":`all ${shops.length} of your Printify stores`} and no product with that id is in any of them.`,"Check the link you pasted, or open the product in Printify and copy the address bar again.","If you deleted this product in Printify, choose a different one."] }, { status: 404 });
    }
    /* D639 - the earliest point at which Goldie knows both shops. Refusing here
       stops a whole batch being built against a storefront its Etsy connection
       cannot publish to. */
    /* D641 - proven, not guessed. Only a denial from Etsy blocks. */
    try{
      const etsyLink=await etsyConnection(user.userId);
      const memo=await provenPairing(user.userId,found.shop.id,etsyLink.shopId);
      cacheReport.shopPairing=memo?"hit":"miss";
      if(!memo){
      const pairing=await phase("shopPairing",()=>verifyShopPairing({printifyToken:token,printifyShopId:found.shop.id,etsyShopId:etsyLink.shopId,etsyToken:etsyLink.token,etsyFetch}));
      if(pairing.result==="matched")await rememberPairing(user.userId,found.shop.id,etsyLink.shopId,pairing.listingId||0);
      if(pairing.result==="mismatched")return NextResponse.json({...shopMismatch(found.shop.title,etsyLink.shopName||"your connected Etsy shop"),shop:{id:found.shop.id,title:found.shop.title,count:shops.length}},{status:409});
      }
    }catch{/* Etsy not connected, or the check could not run. Not evidence. */}
    /* D330 · This variable must contain an ETSY shipping_profile_id only.
       Printify's external.shipping_template_id is a different id system. If it
       seeds this value, an inactive Etsy listing lookup can fail while the
       nonempty Printify id prevents the remembered Etsy profile fallback from
       running — invalidating a saved product that was already verified. */
    let shippingTemplateId="";
    // Printify's shipping_template_id and Etsy's shipping_profile_id are not the
    // same identifier. The linked Etsy listing is authoritative whenever it is
    // available.
    const externalListingId=Number(found.product.external?.id);
    if(externalListingId>0){
      try{
        const connection=await etsyConnection(user.userId);
        const listing=await boundedEtsy(etsyFetch<{shipping_profile_id?:number}>(`/listings/${externalListingId}`,connection.token));
        if(Number(listing.shipping_profile_id)>0)shippingTemplateId=String(listing.shipping_profile_id);
      }catch{/* The normal validation message below remains accurate if Etsy is disconnected. */}
    }
    // A saved product remembers the Etsy profile Goldie already verified. Etsy
    // can temporarily stop returning the linked listing after deactivation, so
    // validate the remembered profile against this connected shop instead of
    // incorrectly invalidating the Printify template.
    const rememberedProfileId=Number(body.savedShippingProfileId);
    if(!shippingTemplateId&&Number.isInteger(rememberedProfileId)&&rememberedProfileId>0){
      try{
        const connection=await etsyConnection(user.userId);
        const profile=await boundedEtsy(etsyFetch<EtsyShippingProfile>(`/shops/${connection.shopId}/shipping-profiles/${rememberedProfileId}`,connection.token));
        if(Number(profile.shipping_profile_id)===rememberedProfileId&&!profile.is_deleted)shippingTemplateId=String(rememberedProfileId);
      }catch{/* A missing, deleted, or foreign profile must not bypass template validation. */}
    }
    const enabledVariants = found.product.variants?.filter((variant) => variant.is_enabled) ?? [];
    const colorOption=found.product.options?.find(option=>/color|colour/i.test(`${option.type||""} ${option.name||""}`));
    const colorIds=new Set((colorOption?.values||[]).map(value=>value.id));
    const templateColorIds=new Set(enabledVariants.flatMap(variant=>(variant.options||[]).filter(id=>colorIds.has(id))));
    /* Size is a selectable axis in Goldie, exactly like colour, so a seller sets
       their size range here instead of remembering to set it in Printify. It is
       detected the same way colour is. If no size option can be identified, sizeIds
       stays empty and every expression below collapses to the previous
       colour-only behaviour, so an unusual blueprint is never made worse. */
    const sizeOption=found.product.options?.find(option=>/size/i.test(`${option.type||""} ${option.name||""}`));
    const sizeIds=new Set((sizeOption?.values||[]).map(value=>value.id));
    const templateSizeIds=new Set(enabledVariants.flatMap(variant=>(variant.options||[]).filter(id=>sizeIds.has(id))));
    /* Axes that are neither colour nor size (style, paper, cut, ...) stay gated to
       what the template enabled — those are not selectable in Goldie, so offering
       combinations for them would produce variants the seller cannot price. */
    const enabledOtherIds=new Set(enabledVariants.flatMap(variant=>(variant.options||[]).filter(id=>!colorIds.has(id)&&!sizeIds.has(id))));
    const selectableVariants=(found.product.variants||[]).filter(variant=>{
      if(!colorIds.size&&!sizeIds.size)return Boolean(variant.is_enabled);
      const others=(variant.options||[]).filter(id=>!colorIds.has(id)&&!sizeIds.has(id));
      return others.every(id=>enabledOtherIds.has(id));
    });
    const availableColorIds=new Set(selectableVariants.flatMap(variant=>(variant.options||[]).filter(id=>colorIds.has(id))));
    const availableSizeIds=new Set(selectableVariants.flatMap(variant=>(variant.options||[]).filter(id=>sizeIds.has(id))));
    const configuredPlacements = found.product.print_areas?.flatMap((area) => area.placeholders ?? []).filter((placeholder) => placeholder.images?.[0]) ?? [];
    const shippingProfileNeedsSelection=!shippingTemplateId&&externalListingId>0;
    const issues:string[]=[];
    if(!shippingTemplateId&&!shippingProfileNeedsSelection)issues.push("Publish this product to Etsy once with the shipping profile you want Goldie to copy.");
    if(enabledVariants.length===0)issues.push("Enable at least one size or color and save the product.");
    if(configuredPlacements.length===0)issues.push("Place one design in every print area Goldie should copy, then save the product.");
    if(issues.length)return NextResponse.json({error:"This Printify product cannot be used yet.",issues},{status:400});
    let provider = `Provider ${found.product.print_provider_id}`;
    let blueprint:Blueprint={id:found.product.blueprint_id};
    /* D655 · These four catalogue reads ran one after another. Every one of them
       is keyed on blueprint_id and print_provider_id, both already known from
       the product above, so not one of them was waiting on any of the others -
       they were sequential only because they were written in a row. Four round
       trips became one. */
    const blueprintId=found.product.blueprint_id, providerId=found.product.print_provider_id;
    /* D657 · Counts the catalogue reads that actually left the worker, so a
       cold load and a warm one are told apart by evidence rather than by how
       long they felt. */
    const catalogFetches={fetched:0};
    const [blueprintResult,providersResult,variantsResult,shippingResult]=await phase("catalog",()=>Promise.allSettled([
      printifyCatalog<Blueprint>(`/catalog/blueprints/${blueprintId}.json`,token,catalogFetches),
      printifyCatalog<Array<{ id: number; title: string }>>(`/catalog/blueprints/${blueprintId}/print_providers.json`, token, catalogFetches),
      printifyCatalog<CatalogVariant[] | { variants?: CatalogVariant[] }>(`/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json?show-out-of-stock=1`, token, catalogFetches),
      printifyCatalog<Shipping>(`/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`,token, catalogFetches),
    ]));
    /* Each one stays independently optional, exactly as it was when each had its
       own try/catch: a catalogue read that fails degrades one detail, never the
       product load. */
    if(blueprintResult.status==="fulfilled")blueprint=blueprintResult.value;
    if(providersResult.status==="fulfilled")provider=providersResult.value.find((item) => item.id === providerId)?.title ?? provider;
    let maxPrintWidth: number | null = null;
    let maxPrintHeight: number | null = null;
    let standardShipping:number|null=null,shippingCurrency="USD";const shippingByVariant:Record<number,number>={};
    if(variantsResult.status==="fulfilled") {
      const catalogResponse = variantsResult.value;
      const catalogVariants = Array.isArray(catalogResponse) ? catalogResponse : catalogResponse.variants ?? [];
      const enabledIds = new Set(found.product.variants?.filter((variant) => variant.is_enabled).map((variant) => variant.id) ?? []);
      const usedPositions = new Set(found.product.print_areas?.flatMap((area) => area.placeholders?.map((placeholder) => placeholder.position).filter(Boolean) ?? []) ?? []);
      const candidates = catalogVariants
        .filter((variant) => enabledIds.size === 0 || enabledIds.has(variant.id))
        .flatMap((variant) => variant.placeholders ?? [])
        .filter((placeholder) => !placeholder.position || usedPositions.size === 0 || usedPositions.has(placeholder.position))
        .filter((placeholder) => Number(placeholder.width) > 0 && Number(placeholder.height) > 0)
        .sort((left, right) => Number(right.width) * Number(right.height) - Number(left.width) * Number(left.height));
      if (candidates[0]) { maxPrintWidth = Number(candidates[0].width); maxPrintHeight = Number(candidates[0].height); }
    }
    if(shippingResult.status==="fulfilled") { const shipping=shippingResult.value,enabledIds=new Set(enabledVariants.map(variant=>variant.id)),domestic=(shipping.profiles||[]).filter(profile=>profile.countries?.includes("US")&&(profile.variant_ids||[]).some(id=>enabledIds.has(id))),rates=domestic.map(profile=>Number(profile.first_item?.cost||0)).filter(cost=>cost>0);for(const profile of domestic){const amount=Number(profile.first_item?.cost||0)/100;for(const id of profile.variant_ids||[])if(enabledIds.has(id)&&amount>0)shippingByVariant[id]=amount}if(rates.length){standardShipping=Math.max(...rates)/100;shippingCurrency=domestic.find(profile=>profile.first_item?.currency)?.first_item?.currency||"USD"} }
    const db = runtimeEnv().DB;
    if (!db) return NextResponse.json({ error: "Secure batch storage is unavailable." }, { status: 503 });
    const batchId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
    const safeTemplate = {
      id: found.product.id,
      blueprint_id: found.product.blueprint_id,
      print_provider_id: found.product.print_provider_id,
      variants: found.product.variants ?? [],
      print_areas: found.product.print_areas ?? [],
      description: found.product.description ?? "",
      shippingByVariant,
      shippingTemplateId,
      shippingProfileNeedsSelection,
      freeShipping:Boolean(found.product.sales_channel_properties?.free_shipping),
    };
    await db.batch([
      db.prepare("DELETE FROM printify_batch_sessions WHERE expires_at <= unixepoch()"),
      db.prepare("DELETE FROM printify_draft_results WHERE updated_at < datetime('now', '-30 days')"),
      db.prepare("INSERT INTO printify_batch_sessions (id, user_id, shop_id, product_id, template_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(batchId, user.userId, found.shop.id, found.product.id, JSON.stringify(safeTemplate), expiresAt),
    ]);
    // Repair older saved products the next time their linked Etsy listing can
    // be read, so future deactivation does not break them again.
    try{
      const saved=await db.prepare("SELECT id, pricing_json FROM product_recipes WHERE user_id = ? AND template_url = ?").bind(user.userId,body.productUrl.trim()).all<{id:string;pricing_json:string}>();
      if(shippingTemplateId)for(const row of saved.results||[]){const pricing=JSON.parse(row.pricing_json||"{}");if(Number(pricing.etsyShippingProfileId)===Number(shippingTemplateId))continue;pricing.etsyShippingProfileId=Number(shippingTemplateId);await db.prepare("UPDATE product_recipes SET pricing_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(JSON.stringify(pricing),row.id,user.userId).run()}
    }catch{/* Recipe repair is best-effort and must never block a valid template. */}
    const printPositions=[...new Set(configuredPlacements.map((placeholder)=>String(placeholder.position||"").trim()).filter((position)=>position&&!/neck|label|collar|inner|tag/i.test(position)))];
    const placementScale = Math.max(...configuredPlacements.map((placeholder) => Number(placeholder.images?.[0]?.scale || 1)));
    // The dominant print area defines the placement the lifestyle mockup has to
    // mirror: the same x, y, scale and angle Goldie sends back to Printify.
    const dominantPlacement = configuredPlacements
      .map((placeholder) => placeholder.images?.[0])
      .reduce<{x?:number;y?:number;scale?:number;angle?:number}|undefined>((best, image) => (Number(image?.scale ?? 0) > Number(best?.scale ?? 0) ? image : best), undefined);
    const placement = Number.isFinite(placementScale) ? {
      x: Number(dominantPlacement?.x ?? 0.5),
      y: Number(dominantPlacement?.y ?? 0.5),
      scale: Number(dominantPlacement?.scale ?? placementScale ?? 1),
      angle: Number(dominantPlacement?.angle ?? 0),
    } : null;
    /* D649 - the saved product card could not say which Printify store a product
       belongs to, so a seller with more than one store only found out by clicking
       and being refused. The shop is known right here. */
    /* D650 - the store label only earns its place when there is more than one store
       to confuse. Almost nobody has two, and a label naming the only shop you own
       is noise on every card. The count travels with the shop so the client can
       decide, rather than guessing from a single name. */
    cacheReport.catalog=catalogFetches.fetched===0?"hit":catalogFetches.fetched===4?"miss":"skipped";
    timings.catalogFetches=catalogFetches.fetched;
    timings.total=Date.now()-started;
    /* The saved-product card must show this saved Printify product, including
       its actual artwork and print side. Blueprint images are generic catalogue
       photography; using them here is what turned a linked tee into a fabric
       close-up and could make a back-print product look blank. */
    const productMockups=(found.product.images||[]).slice().sort((a,b)=>Number(Boolean(b.is_default))-Number(Boolean(a.is_default))).map(image=>String(image.src||"")).filter(Boolean).slice(0,12);
    /* Printify can expose the same seller-facing colour more than once under
       different internal option ids (Ash is a real example). Goldie must show
       one choice without throwing away either set of variants, so the visible
       option carries every underlying id and the picker toggles them together. */
    const groupedColors=groupProductColors(colorOption?.values||[],availableColorIds,templateColorIds);
    const canonicalColorIds=canonicalProductColorIds(groupedColors);
    return NextResponse.json({ timings, cache: cacheReport, shop: { id: found.shop.id, title: found.shop.title, count: shops.length }, product: { id: found.product.id, batchId, title: found.product.title, description:found.product.description??"", blueprintId:found.product.blueprint_id, blueprintTitle:blueprint.title||found.product.title, brand:blueprint.brand||"", model:blueprint.model||"", provider, previewImage:productMockups[0]||"", previewImages:productMockups, enabledVariants: enabledVariants.length, colorOptions:groupedColors, sizeOptions:(sizeOption?.values||[]).map(value=>({id:value.id,title:value.title||`Size ${value.id}`,available:availableSizeIds.has(value.id),templateEnabled:templateSizeIds.has(value.id)})), variants:selectableVariants.map(variant=>{const rawColorId=(variant.options||[]).find(id=>colorIds.has(id))||null;return {id:variant.id,title:variant.title||`Variant ${variant.id}`,cost:Number(variant.cost??variant.price),templatePrice:Number(variant.price),shipping:shippingByVariant[variant.id]??standardShipping,options:variant.options||[],colorId:rawColorId==null?null:canonicalColorIds.get(rawColorId)??rawColorId,sizeId:(variant.options||[]).find(id=>sizeIds.has(id))||null,templateEnabled:Boolean(variant.is_enabled)}}),printPositions, shop: found.shop.title, standardShipping,shippingCurrency,shippingTemplateId,shippingProfileNeedsSelection,freeShipping:Boolean(found.product.sales_channel_properties?.free_shipping),maxPrintWidth, maxPrintHeight, placementScale, placement,
      /* D614 - the saved product carries artwork in an internal label placeholder.
         Those are left out of new products, and the seller is told so plainly
         rather than finding out from a Printify preview. */
      hasLabelArtwork: templateHasLabelArtwork(found.product.print_areas as Parameters<typeof templateHasLabelArtwork>[0]) } });
  } catch (error) {
    const status = error instanceof PrintifyApiError && [400, 401, 403, 404, 429].includes(error.status) ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Printify could not be reached." }, { status });
  }
}
