import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type TemplateProduct = {
  id: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: Array<{ id: number; price: number; is_enabled: boolean }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images?: Array<{ x?: number; y?: number; scale?: number; angle?: number }>;
    }>;
    background?: string;
  }>;
};

type ArtworkBucket = { delete(key: string): Promise<void> };
function runtimeEnv() { return env as unknown as { DB?: D1Database; ARTWORK?: ArtworkBucket; PRINTIFY_TOKEN_KEY?: string }; }

async function signedArtworkUrl(request: Request, stagedId: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure artwork delivery is not configured.");
  const expires = Math.floor(Date.now() / 1000) + 10 * 60;
  const keyBytes = Uint8Array.from(secret.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${stagedId}.${expires}`)));
  const signature = btoa(String.fromCharCode(...signed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${new URL(request.url).origin}/api/printify/staged/${encodeURIComponent(stagedId)}?expires=${expires}&signature=${signature}`;
}

async function decryptToken(value: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure token storage is not configured.");
  const keyBytes = Uint8Array.from(secret.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const [ivValue, encryptedValue] = value.split(".");
  const iv = Uint8Array.from(atob(ivValue), (character) => character.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedValue), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted));
}

async function tokenFor(userId: string) {
  const db = runtimeEnv().DB;
  if (!db) throw new Error("Secure token storage is unavailable.");
  const row = await db.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id = ?").bind(userId).first<{ encrypted_token: string }>();
  if (!row) throw new Error("Connect Printify before creating drafts.");
  return decryptToken(row.encrypted_token);
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const waits = [2000, 5000, 10000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    const response = await fetch(`${PRINTIFY_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (response.ok) return response.json() as Promise<T>;
    if (response.status === 429 && attempt < waits.length) {
      const requestedWait = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt];
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    const detail = await response.text().catch(() => "");
    throw new Error(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new Error("Printify could not complete this request.");
}

function productIdFromUrl(value: string) {
  return (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1] ?? "";
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  try {
    const body = (await request.json()) as { productUrl?: string; description?: string; fileName?: string; stagedId?: string };
    if (!body.productUrl || !body.fileName || !body.stagedId) return NextResponse.json({ error: "The template and design file are required." }, { status: 400 });
    const productId = productIdFromUrl(body.productUrl);
    if (!productId) return NextResponse.json({ error: "That is not a recognized Printify editor link." }, { status: 400 });
    const token = await tokenFor(user.userId);
    const shops = await api<Shop[]>("/shops.json", token);

    let shop: Shop | undefined;
    let template: TemplateProduct | undefined;
    for (const candidate of shops) {
      const response = await fetch(`${PRINTIFY_API}/shops/${candidate.id}/products/${productId}.json`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" } });
      if (response.ok) { shop = candidate; template = (await response.json()) as TemplateProduct; break; }
    }
    if (!shop || !template) return NextResponse.json({ error: "The template product was not found in the connected Printify account." }, { status: 404 });

    const artworkUrl = await signedArtworkUrl(request, body.stagedId);
    let upload: { id: string };
    try {
      upload = await api<{ id: string }>("/uploads/images.json", token, {
        method: "POST",
        body: JSON.stringify({ file_name: body.fileName, url: artworkUrl }),
      });
    } finally {
      await runtimeEnv().ARTWORK?.delete(body.stagedId).catch(() => undefined);
    }
    const title = body.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const printAreas = template.print_areas.map((area) => ({
      variant_ids: area.variant_ids,
      placeholders: area.placeholders.map((placeholder) => {
        const placement = placeholder.images?.[0];
        return { position: placeholder.position, images: [{ id: upload.id, x: placement?.x ?? 0.5, y: placement?.y ?? 0.5, scale: placement?.scale ?? 1, angle: placement?.angle ?? 0 }] };
      }),
      ...(area.background ? { background: area.background } : {}),
    }));
    const created = await api<{ id: string }>(`/shops/${shop.id}/products.json`, token, {
      method: "POST",
      body: JSON.stringify({
        title: title || "Untitled design",
        description: body.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, is_enabled }) => ({ id, price, is_enabled })),
        print_areas: printAreas,
      }),
    });
    return NextResponse.json({ draft: { id: created.id, name: body.fileName, shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The draft could not be created." }, { status: 500 });
  }
}
