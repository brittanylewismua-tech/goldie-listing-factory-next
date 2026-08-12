import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { uploadedImageIsReady, type UploadedImage } from "../upload-readiness";

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
      images?: Array<{ id?: string; x?: number; y?: number; scale?: number; angle?: number }>;
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
    let response: Response;
    try {
      response = await fetch(`${PRINTIFY_API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
    } catch {
      if (attempt < waits.length) { await new Promise((resolve) => setTimeout(resolve, waits[attempt])); continue; }
      throw new Error("The connection to Printify was interrupted after three automatic retries.");
    }
    if (response.ok) return response.json() as Promise<T>;
    if ((response.status === 429 || response.status >= 500) && attempt < waits.length) {
      const requestedWait = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt];
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    const detail = await response.text().catch(() => "");
    if (response.status >= 500) throw new Error("Printify remained temporarily unavailable after three automatic retries.");
    if (response.status === 401 || response.status === 403) throw new Error("Printify rejected the saved connection. Reconnect with a new token that has all scopes enabled.");
    throw new Error(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new Error("Printify could not complete this request.");
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForUploadedImage(imageId: string, token: string) {
  const waits = [1000, 2000, 4000, 7000, 10000, 15000, 20000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetch(`${PRINTIFY_API}/uploads/${encodeURIComponent(imageId)}.json`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
      });
    } catch {
      // A transient lookup failure is handled by the same bounded wait below.
    }
    if (response?.ok) {
      const image = await response.json().catch(() => null) as UploadedImage | null;
      if (uploadedImageIsReady(image)) return image;
    }
    if (response && response.status !== 404 && response.status !== 409 && response.status !== 429 && response.status < 500) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Printify could not verify the uploaded image${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
    if (attempt < waits.length) await pause(waits[attempt]);
  }
  throw new Error("Printify did not finish processing this image within one minute.");
}

function isImageNotReady(status: number, detail: string) {
  return status === 400 && (/Provided images do not exist/i.test(detail) || /[\"']?code[\"']?\s*:\s*8253/i.test(detail));
}

async function createProductAfterImageIsReady<T>(path: string, token: string, body: string): Promise<T> {
  const waits = [2000, 4000, 7000, 10000, 15000, 20000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${PRINTIFY_API}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json" },
        body,
      });
    } catch {
      if (attempt < waits.length) { await pause(waits[attempt]); continue; }
      throw new Error("The connection to Printify was interrupted after Goldie retried automatically.");
    }
    if (response.ok) return response.json() as Promise<T>;
    const detail = await response.text().catch(() => "");
    const retryable = isImageNotReady(response.status, detail) || response.status === 429 || response.status >= 500;
    if (retryable && attempt < waits.length) {
      const requestedWait = Number(response.headers.get("retry-after"));
      await pause(Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt]);
      continue;
    }
    if (isImageNotReady(response.status, detail)) throw new Error("Printify did not finish registering this image within one minute. Retry this design when the batch finishes.");
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    if (response.status >= 500) throw new Error("Printify remained temporarily unavailable after Goldie retried automatically.");
    if (response.status === 401 || response.status === 403) throw new Error("Printify rejected the saved connection. Reconnect with a new token that has all scopes enabled.");
    throw new Error(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new Error("Printify could not create this draft.");
}

function productIdFromUrl(value: string) {
  return (value.match(/\/editor\/([a-zA-Z0-9]+)/) || value.match(/\/products\/([a-zA-Z0-9]+)/))?.[1] ?? "";
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  let stagedIdForCleanup = "";
  try {
    const body = (await request.json()) as { productUrl?: string; description?: string; fileName?: string; stagedId?: string; clientId?: string };
    stagedIdForCleanup = body.stagedId ?? "";
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

    const primaryTemplateImageId = template.print_areas
      .flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images ?? []))
      .find((image) => image.id)?.id;
    if (!primaryTemplateImageId) throw new Error("Add one placeholder design to the Printify template before using it for a batch.");

    const artworkUrl = await signedArtworkUrl(request, body.stagedId);
    const upload = await api<UploadedImage>("/uploads/images.json", token, {
      method: "POST",
      body: JSON.stringify({ file_name: body.fileName, url: artworkUrl }),
    });
    // Printify's documented upload response is the completed image resource.
    // Only poll when Printify returns an accepted-but-incomplete resource. A
    // second GET can briefly return 404 even after a completed POST, so polling
    // an already-complete upload creates a false failure.
    if (!uploadedImageIsReady(upload)) await waitForUploadedImage(upload.id, token);
    const title = body.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const printAreas = template.print_areas.map((area) => ({
      variant_ids: area.variant_ids,
      placeholders: area.placeholders.filter((placeholder) => (placeholder.images?.length ?? 0) > 0).map((placeholder) => {
        const images = (placeholder.images ?? []).map((image) => image.id === primaryTemplateImageId
          ? { id: upload.id, x: image.x ?? 0.5, y: image.y ?? 0.5, scale: image.scale ?? 1, angle: image.angle ?? 0 }
          : image);
        return { position: placeholder.position, images };
      }),
      ...(area.background ? { background: area.background } : {}),
    })).filter((area) => area.placeholders.length > 0);
    const productBody = JSON.stringify({
        title: title || "Untitled design",
        description: body.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, is_enabled }) => ({ id, price, is_enabled })),
        print_areas: printAreas,
    });
    const created = await createProductAfterImageIsReady<{ id: string }>(`/shops/${shop.id}/products.json`, token, productBody);
    return NextResponse.json({ draft: { id: created.id, clientId: body.clientId ?? body.fileName, name: body.fileName, shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The draft could not be created." }, { status: 500 });
  } finally {
    if (stagedIdForCleanup) await runtimeEnv().ARTWORK?.delete(stagedIdForCleanup).catch(() => undefined);
  }
}
