import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { publicSupportReference, recordDiagnostic } from "../diagnostics";
import { createProductWithImageRetries } from "../product-creation";
import { printifyUploadPayload } from "../upload-payload";
import { printAreasWithOnlyCurrentArtwork } from "../product-payload";

const PRINTIFY_API = "https://api.printify.com/v1";
type Shop = { id: number; title: string };
type UploadedImage = { id: string; width?: number; height?: number; mime_type?: string };
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

type ArtworkObject = { arrayBuffer(): Promise<ArrayBuffer> };
type ArtworkBucket = { get(key: string): Promise<ArtworkObject | null>; delete(key: string): Promise<void> };
function runtimeEnv() { return env as unknown as { DB?: D1Database; ARTWORK?: ArtworkBucket; PRINTIFY_TOKEN_KEY?: string }; }

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

async function api<T>(path: string, token: string, init?: RequestInit, onRetry?: (attempt: number, status?: number) => Promise<void>): Promise<T> {
  const waits = [2000, 5000, 10000];
  for (let attempt = 0; attempt <= waits.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${PRINTIFY_API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory", "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
    } catch {
      if (attempt < waits.length) { await onRetry?.(attempt + 1); await new Promise((resolve) => setTimeout(resolve, waits[attempt])); continue; }
      throw new Error("The connection to Printify was interrupted after three automatic retries.");
    }
    if (response.ok) return response.json() as Promise<T>;
    if ((response.status === 429 || response.status >= 500) && attempt < waits.length) {
      await onRetry?.(attempt + 1, response.status);
      const requestedWait = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt];
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    const detail = await response.text().catch(() => "");
    if (response.status >= 500) throw new Error("Printify remained temporarily unavailable after three automatic retries.");
    if (response.status === 401 || response.status === 403) throw new Error(`Printify rejected the saved connection (HTTP ${response.status}). Reconnect with a new token that has all scopes enabled.`);
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
  let stagedIdForCleanup = "";
  let supportReference = "";
  let diagnosticStage = "request_validation";
  try {
    const body = (await request.json()) as { productUrl?: string; description?: string; fileName?: string; stagedId?: string; supportReference?: string; clientId?: string };
    stagedIdForCleanup = body.stagedId ?? "";
    supportReference = body.supportReference?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40) ?? "";
    if (!body.productUrl || !body.fileName || !body.stagedId) return NextResponse.json({ error: "The template and design file are required." }, { status: 400 });
    const productId = productIdFromUrl(body.productUrl);
    if (!productId) return NextResponse.json({ error: "That is not a recognized Printify editor link." }, { status: 400 });
    const token = await tokenFor(user.userId);
    diagnosticStage = "template_lookup";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", templateProductId: productId });
    const shops = await api<Shop[]>("/shops.json", token, undefined, (attempt, status) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "retry", attempt, httpStatus: status ?? null }));

    let shop: Shop | undefined;
    let template: TemplateProduct | undefined;
    for (const candidate of shops) {
      const response = await fetch(`${PRINTIFY_API}/shops/${candidate.id}/products/${productId}.json`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" } });
      if (response.ok) { shop = candidate; template = (await response.json()) as TemplateProduct; break; }
    }
    if (!shop || !template) throw new Error("The template product was not found in the connected Printify account.");
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", templateProductId: productId, shopId: shop.id });

    const templateImageCount = template.print_areas
      .flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images ?? [])).length;
    if (!templateImageCount) throw new Error("Add one placeholder design to the Printify template before using it for a batch.");

    diagnosticStage = "printify_upload";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", shopId: shop.id });
    const stagedArtwork = await runtimeEnv().ARTWORK?.get(body.stagedId);
    if (!stagedArtwork) throw new Error("Goldie could not retrieve the staged artwork.");
    const artworkBytes = new Uint8Array(await stagedArtwork.arrayBuffer());
    const uploadArtwork = () => api<UploadedImage>("/uploads/images.json", token, {
        method: "POST",
        body: JSON.stringify(printifyUploadPayload(body.fileName!, artworkBytes)),
      }, (attempt, status) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: "printify_upload", event: "retry", attempt, httpStatus: status ?? null, shopId: shop!.id }));
    let upload = await uploadArtwork();
    if (!upload.id) throw new Error("Printify accepted the artwork request but did not return an image ID.");
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", shopId: shop.id });
    // The upload POST is authoritative for acceptance. Do not gate draft
    // creation on GET /uploads/{id}: live Printify accounts can return 404 from
    // that lookup even though the uploaded image ID is valid. Draft creation
    // below is the authoritative registration check and retries only when
    // Printify itself returns image-not-ready error 8253.
    const title = body.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const productBody = () => JSON.stringify({
        title: title || "Untitled design",
        description: body.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, is_enabled }) => ({ id, price, is_enabled })),
        // Never carry media-library IDs from the template into a different
        // product request. Only the image uploaded in this request is valid.
        print_areas: printAreasWithOnlyCurrentArtwork(template.print_areas, upload.id),
    });
    diagnosticStage = "draft_creation";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", shopId: shop.id });
    const created = await createProductWithImageRetries<{ id: string }>({
      path: `/shops/${shop.id}/products.json`, token, body: productBody,
      onRetry: (attempt, status, detail) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "retry", attempt, httpStatus: status, message: detail, shopId: shop!.id }),
      onImageNotReady: async () => {
        // Waiting on the same rejected ID cannot repair it. Replace it with a
        // fresh direct upload and let the next product request use that ID.
        upload = await uploadArtwork();
        if (!upload.id) throw new Error("Printify did not return a replacement image ID.");
      },
    });
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", shopId: shop.id });
    return NextResponse.json({ draft: { id: created.id, clientId: body.clientId ?? body.fileName, name: body.fileName, shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The draft could not be created.";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "failed", message });
    return NextResponse.json({ error: `${message}${publicSupportReference(supportReference)}` }, { status: 500 });
  } finally {
    if (stagedIdForCleanup) await runtimeEnv().ARTWORK?.delete(stagedIdForCleanup).catch(() => undefined);
  }
}
