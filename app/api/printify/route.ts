import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { isOwner } from "@/app/mastermind/access";
import { decryptPrintifyToken, encryptPrintifyToken } from "./token-crypto";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type Product = {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  description?: string;
  variants?: Array<{ id: number; price: number; cost?: number; is_enabled?: boolean }>;
  print_areas?: Array<{
    variant_ids: number[];
    background?: string;
    placeholders?: Array<{ position?: string; images?: Array<{ id?: string; x?: number; y?: number; scale?: number; angle?: number }> }>;
  }>;
};
type Blueprint={id:number;title?:string;description?:string;brand?:string;model?:string};
type CatalogVariant = { id: number; placeholders?: Array<{ position?: string; width?: number; height?: number }> };
type Shipping={profiles?:Array<{variant_ids?:number[];first_item?:{cost?:number;currency?:string};countries?:string[]}>};
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

function productIdFromUrl(value: string) {
  return (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1] ?? "";
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
  return NextResponse.json({ connected: false });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  try {
    const body = (await request.json()) as { token?: string; productUrl?: string };
    const token = body.token?.trim() || await storedToken(user.userId);
    if (!token) return NextResponse.json({ error: "Connect your Printify account first." }, { status: 400 });
    const shops = await printify<Shop[]>("/shops.json", token);
    if (!body.productUrl) { await saveToken(user.userId, token); return NextResponse.json({ connected: true }); }

    const productId = productIdFromUrl(body.productUrl.trim());
    if (!productId) return NextResponse.json({ error: "That is not a recognized Printify product-editor link." }, { status: 400 });
    let found: { shop: Shop; product: Product } | undefined;
    for (const shop of shops) {
      const response = await fetch(`${PRINTIFY_API}/shops/${shop.id}/products/${productId}.json`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
      if (response.ok) { found = { shop, product: (await response.json()) as Product }; break; }
    }
    if (!found) return NextResponse.json({ error: "This product was not found in any shop connected to that Printify account." }, { status: 404 });
    const enabledVariants = found.product.variants?.filter((variant) => variant.is_enabled) ?? [];
    if (enabledVariants.length === 0) return NextResponse.json({ error: "This Printify template has no enabled sizes or colors. Enable at least one variant, save it, and load it again." }, { status: 400 });
    const configuredPlacements = found.product.print_areas?.flatMap((area) => area.placeholders ?? []).filter((placeholder) => placeholder.images?.[0]) ?? [];
    if (configuredPlacements.length === 0) return NextResponse.json({ error: "Add one placeholder design to every print area you want Goldie to use, save the Printify template, and load it again." }, { status: 400 });
    let provider = `Provider ${found.product.print_provider_id}`;
    let blueprint:Blueprint={id:found.product.blueprint_id};
    try { blueprint=await printify<Blueprint>(`/catalog/blueprints/${found.product.blueprint_id}.json`,token); } catch { /* Product data remains sufficient if catalog metadata is unavailable. */ }
    try {
      const providers = await printify<Array<{ id: number; title: string }>>(`/catalog/blueprints/${found.product.blueprint_id}/print_providers.json`, token);
      provider = providers.find((item) => item.id === found!.product.print_provider_id)?.title ?? provider;
    } catch { /* Provider names are optional; the numeric provider remains usable. */ }
    let maxPrintWidth: number | null = null;
    let maxPrintHeight: number | null = null;
    let standardShipping:number|null=null,shippingCurrency="USD",shippingByVariant:Record<number,number>={};
    try {
      const catalogResponse = await printify<CatalogVariant[] | { variants?: CatalogVariant[] }>(`/catalog/blueprints/${found.product.blueprint_id}/print_providers/${found.product.print_provider_id}/variants.json?show-out-of-stock=1`, token);
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
    } catch { /* Print dimensions are an optimization; draft creation can continue without them. */ }
    try { const shipping=await printify<Shipping>(`/catalog/blueprints/${found.product.blueprint_id}/print_providers/${found.product.print_provider_id}/shipping.json`,token),enabledIds=new Set(enabledVariants.map(variant=>variant.id)),domestic=(shipping.profiles||[]).filter(profile=>profile.countries?.includes("US")&&(profile.variant_ids||[]).some(id=>enabledIds.has(id))),rates=domestic.map(profile=>Number(profile.first_item?.cost||0)).filter(cost=>cost>0);for(const profile of domestic){const amount=Number(profile.first_item?.cost||0)/100;for(const id of profile.variant_ids||[])if(enabledIds.has(id)&&amount>0)shippingByVariant[id]=amount}if(rates.length){standardShipping=Math.max(...rates)/100;shippingCurrency=domestic.find(profile=>profile.first_item?.currency)?.first_item?.currency||"USD"} } catch { /* Pricing can continue without shipping metadata. */ }
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
    };
    await db.batch([
      db.prepare("DELETE FROM printify_batch_sessions WHERE expires_at <= unixepoch()"),
      db.prepare("DELETE FROM printify_draft_results WHERE updated_at < datetime('now', '-30 days')"),
      db.prepare("INSERT INTO printify_batch_sessions (id, user_id, shop_id, product_id, template_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(batchId, user.userId, found.shop.id, found.product.id, JSON.stringify(safeTemplate), expiresAt),
    ]);
    const placementScale = Math.max(...configuredPlacements.map((placeholder) => Number(placeholder.images?.[0]?.scale || 1)));
    return NextResponse.json({ product: { id: found.product.id, batchId, title: found.product.title, description:found.product.description??"", blueprintId:found.product.blueprint_id, blueprintTitle:blueprint.title||found.product.title, brand:blueprint.brand||"", model:blueprint.model||"", provider, enabledVariants: enabledVariants.length, shop: found.shop.title, standardShipping,shippingCurrency,maxPrintWidth, maxPrintHeight, placementScale } });
  } catch (error) {
    const status = error instanceof PrintifyApiError && [400, 401, 403, 404, 429].includes(error.status) ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Printify could not be reached." }, { status });
  }
}
