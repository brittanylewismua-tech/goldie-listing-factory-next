import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type Product = { id: string; title: string; blueprint_id: number; print_provider_id: number; variants?: Array<{ is_enabled?: boolean }> };

function runtimeEnv() {
  return env as unknown as { DB?: D1Database; PRINTIFY_TOKEN_KEY?: string };
}

async function encryptionKey() {
  const value = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!value) throw new Error("Secure token storage is not configured.");
  const bytes = Uint8Array.from(value.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (bytes.length !== 32) throw new Error("Secure token storage is not configured correctly.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(token)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

async function decryptToken(value: string) {
  const [ivValue, encryptedValue] = value.split(".");
  const iv = Uint8Array.from(atob(ivValue), (character) => character.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedValue), (character) => character.charCodeAt(0));
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), encrypted);
  return new TextDecoder().decode(clear);
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
  const response = await fetch(`${PRINTIFY_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "Printify did not accept that token." : `Printify returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function productIdFromUrl(value: string) {
  return (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1] ?? "";
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  try { return NextResponse.json({ connected: Boolean(await storedToken(user.userId)) }); }
  catch { return NextResponse.json({ connected: false }); }
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
    let provider = `Provider ${found.product.print_provider_id}`;
    try {
      const providers = await printify<Array<{ id: number; title: string }>>(`/catalog/blueprints/${found.product.blueprint_id}/print_providers.json`, token);
      provider = providers.find((item) => item.id === found!.product.print_provider_id)?.title ?? provider;
    } catch {}
    return NextResponse.json({ product: { id: found.product.id, title: found.product.title, provider, enabledVariants: found.product.variants?.filter((variant) => variant.is_enabled).length ?? 0, shop: found.shop.title } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Printify could not be reached." }, { status: 500 });
  }
}
