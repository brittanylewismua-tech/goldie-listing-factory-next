import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { publicSupportReference, recordDiagnostic } from "../diagnostics";
import { createProductWithImageRetries } from "../product-creation";
import { printAreasWithOnlyCurrentArtwork } from "../product-payload";
import { planFor } from "@/app/plan-limits";
import { decryptPrintifyToken } from "../token-crypto";
import { recommendedPrice } from "@/app/pricing";

const PRINTIFY_API = "https://api.printify.com/v1";
type UploadedImage = { id: string; width?: number; height?: number; mime_type?: string };
type TemplateProduct = {
  id: string;
  blueprint_id: number;
  print_provider_id: number;
  description?:string;
  shippingByVariant?:Record<number,number>;
  shippingTemplateId:string;
  freeShipping?:boolean;
  variants: Array<{ id: number; price: number; cost?: number; is_enabled: boolean }>;
  print_areas: Array<{
    variant_ids: number[];
    placeholders: Array<{
      position: string;
      images?: Array<{ id?: string; x?: number; y?: number; scale?: number; angle?: number }>;
    }>;
    background?: string;
  }>;
};
type CreatedProduct = { id: string; title?: string; images?: Array<{ src?: string; is_default?: boolean }> };

type ArtworkObject = { body?: ReadableStream; customMetadata?: Record<string, string> };
type ArtworkBucket = { get(key: string): Promise<ArtworkObject | null>; delete(key: string): Promise<void> };
type BatchSession = { shop_id: number; product_id: string; template_json: string };
function runtimeEnv() { return env as unknown as { DB?: D1Database; ARTWORK?: ArtworkBucket; PRINTIFY_TOKEN_KEY?: string }; }

async function decryptToken(value: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Secure token storage is not configured.");
  return decryptPrintifyToken(value, secret);
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
    const detail = await response.text().catch(() => "");
    const remoteDownloadInterrupted = response.status === 400 && (/\b10300\b|image download|could not resolve host|failed to download/i.test(detail));
    if ((response.status === 429 || response.status >= 500 || remoteDownloadInterrupted) && attempt < waits.length) {
      await onRetry?.(attempt + 1, response.status);
      const requestedWait = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(requestedWait) && requestedWait > 0 ? Math.min(requestedWait * 1000, 20000) : waits[attempt];
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (response.status === 429) throw new Error("Printify is taking longer than expected. Retry this design when the batch finishes.");
    if (remoteDownloadInterrupted) throw new Error("Printify could not retrieve the protected artwork after three automatic retries.");
    if (response.status >= 500) throw new Error("Printify remained temporarily unavailable after three automatic retries.");
    if (response.status === 401 || response.status === 403) throw new Error(`Printify rejected the saved connection (HTTP ${response.status}). Reconnect with a new token that has all scopes enabled.`);
    throw new Error(`Printify returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  throw new Error("Printify could not complete this request.");
}

async function requestKey(batchId: string, clientId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${batchId}:${clientId}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function artworkContents(stream?: ReadableStream) {
  if (!stream) throw new Error("Goldie could not read the staged artwork.");
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId") ?? "";
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!batchId || !clientId) return NextResponse.json({ error: "Batch and design identifiers are required." }, { status: 400 });
  const db = runtimeEnv().DB;
  if (!db) return NextResponse.json({ error: "Secure batch storage is unavailable." }, { status: 503 });
  const key = await requestKey(batchId, clientId);
  const row = await db.prepare("SELECT status, response_json, updated_at FROM printify_draft_results WHERE request_key = ? AND user_id = ?")
    .bind(key, user.userId).first<{ status: string; response_json: string | null; updated_at: string }>();
  if (!row) return NextResponse.json({ status: "not_found" }, { status: 404 });
  return NextResponse.json({ status: row.status, draft: row.status === "succeeded" && row.response_json ? JSON.parse(row.response_json) : undefined, updatedAt: row.updated_at });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  let stagedIdForCleanup = "";
  let supportReference = "";
  let diagnosticStage = "request_validation";
  let idempotencyKey = "";
  try {
    const body = (await request.json()) as { batchId?: string; title?: string; tags?: string[]; description?: string; visibleBounds?:{left:number;top:number;right:number;bottom:number}; maxPlacementScale?:number; fileName?: string; stagedId?: string; supportReference?: string; clientId?: string; variantPrices?:Record<string,number>; etsyBuyerShipping?:number; pricing?: { targetProfit?: number; etsyFeePercent?: number; fixedFee?: number; listingFee?: number; shippingCost?: number; shippingCharged?: number } };
    stagedIdForCleanup = body.stagedId ?? "";
    supportReference = body.supportReference?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40) ?? "";
    if (!body.batchId || !body.fileName || !body.stagedId) return NextResponse.json({ error: "The prepared batch and design file are required." }, { status: 400 });
    const db = runtimeEnv().DB;
    if (!db) throw new Error("Secure batch storage is unavailable.");
    idempotencyKey = await requestKey(body.batchId, body.clientId ?? body.fileName);
    const prior = await db.prepare("SELECT status, response_json, updated_at FROM printify_draft_results WHERE request_key = ? AND user_id = ?")
      .bind(idempotencyKey, user.userId).first<{ status: string; response_json: string | null; updated_at: string }>();
    if (prior?.status === "succeeded" && prior.response_json) return NextResponse.json({ draft: JSON.parse(prior.response_json) });
    if (prior?.status === "running" && Date.now() - new Date(`${prior.updated_at.replace(" ", "T")}Z`).getTime() < 10 * 60 * 1000) {
      return NextResponse.json({ error: "Goldie is still completing this exact draft. It will be checked again automatically." }, { status: 409 });
    }
    await db.prepare("INSERT INTO printify_draft_results (request_key, user_id, batch_id, client_id, status, updated_at) VALUES (?, ?, ?, ?, 'running', CURRENT_TIMESTAMP) ON CONFLICT(request_key) DO UPDATE SET status = 'running', response_json = NULL, updated_at = CURRENT_TIMESTAMP")
      .bind(idempotencyKey, user.userId, body.batchId, body.clientId ?? body.fileName).run();
    const planRow = await db.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(user.userId).first<{plan_key:string}>();
    const plan = planFor(planRow?.plan_key);
    const reserved = await db.prepare("SELECT COUNT(*) count FROM printify_draft_results WHERE user_id=? AND ((status='succeeded' AND updated_at>=datetime('now','start of month')) OR (status='running' AND updated_at>=datetime('now','-10 minutes')))").bind(user.userId).first<{count:number}>();
    if (Number(reserved?.count || 0) > plan.drafts) {
      await db.prepare("UPDATE printify_draft_results SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE request_key=?").bind(idempotencyKey).run();
      return NextResponse.json({ error: `You have used all ${plan.drafts} successful drafts in your ${plan.name} plan. Your allowance resets next month.` }, { status: 429 });
    }
    const session = await db.prepare("SELECT shop_id, product_id, template_json FROM printify_batch_sessions WHERE id = ? AND user_id = ? AND expires_at > unixepoch()")
      .bind(body.batchId, user.userId).first<BatchSession>();
    if (!session) throw new Error("This batch session expired. Load the Printify template again; your selected files will remain on this page.");
    const productId = session.product_id;
    const shop = { id: session.shop_id };
    const template = JSON.parse(session.template_json) as TemplateProduct;
    await db.prepare("UPDATE printify_batch_sessions SET expires_at = unixepoch() + 21600 WHERE id = ? AND user_id = ?").bind(body.batchId, user.userId).run();
    const token = await tokenFor(user.userId);
    diagnosticStage = "template_lookup";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", templateProductId: productId });
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", templateProductId: productId, shopId: shop.id });

    const templateImageCount = template.print_areas
      .flatMap((area) => area.placeholders.flatMap((placeholder) => placeholder.images ?? [])).length;
    if (!templateImageCount) throw new Error("Add one placeholder design to the Printify template before using it for a batch.");

    diagnosticStage = "printify_upload";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", shopId: shop.id });
    const stagedArtwork = await runtimeEnv().ARTWORK?.get(body.stagedId);
    if (!stagedArtwork) throw new Error("Goldie could not retrieve the staged artwork.");
    if (stagedArtwork.customMetadata?.owner !== user.userId) throw new Error("This staged artwork does not belong to the signed-in account.");
    if (Number(stagedArtwork.customMetadata?.expires ?? 0) <= Date.now()) throw new Error("The staged artwork expired before Printify could retrieve it.");
    const contents = await artworkContents(stagedArtwork.body);
    const uploadArtwork = () => api<UploadedImage>("/uploads/images.json", token, {
        method: "POST",
        body: JSON.stringify({ file_name: body.fileName!, contents }),
      }, (attempt, status) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: "printify_upload", event: "retry", attempt, httpStatus: status ?? null, shopId: shop.id }));
    let upload = await uploadArtwork();
    if (!upload.id) throw new Error("Printify accepted the artwork request but did not return an image ID.");
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", shopId: shop.id });
    // The private app sends the staged bytes directly to Printify. Large opaque
    // artwork is optimized in the browser first so this request stays reliable.
    // creation on GET /uploads/{id}: live Printify accounts can return 404 from
    // that lookup even though the uploaded image ID is valid. Draft creation
    // below is the authoritative registration check and retries only when
    // Printify itself returns image-not-ready error 8253.
    const title = body.title?.trim().slice(0, 255) || body.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const productBody = () => JSON.stringify({
        title: title || "Untitled design",
        description: body.description ?? template.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, cost, is_enabled }) => {const shipping=template.shippingByVariant?.[id],buyerCharge=Math.max(0,Number(body.etsyBuyerShipping)||0),rules=shipping==null?body.pricing:{...body.pricing,shippingCost:shipping,shippingCharged:buyerCharge};const approved=Number(body.variantPrices?.[String(id)]);const calculated=recommendedPrice(cost ?? price,rules);const finalPrice=Number.isInteger(approved)&&approved>=Number(cost??price)&&approved<=1000000?approved:calculated;return { id, price:finalPrice, is_enabled }}),
        tags: (body.tags ?? []).map(tag => String(tag).trim()).filter(Boolean).slice(0, 13),
        external:{shipping_template_id:template.shippingTemplateId},
        sales_channel_properties:{free_shipping:Boolean(template.freeShipping)},
        // Never carry media-library IDs from the template into a different
        // product request. Only the image uploaded in this request is valid.
        print_areas: printAreasWithOnlyCurrentArtwork(template.print_areas, upload.id, body.visibleBounds, body.maxPlacementScale),
    });
    diagnosticStage = "draft_creation";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", shopId: shop.id });
    const created = await createProductWithImageRetries<CreatedProduct>({
      path: `/shops/${shop.id}/products.json`, token, body: productBody,
      onRetry: (attempt, status, detail) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "retry", attempt, httpStatus: status, message: detail, shopId: shop.id }),
      onImageNotReady: async (attempt) => {
        // Printify can briefly return 8253 while a valid upload is propagating.
        // Give the same ID three product attempts; only then replace it once.
        if (attempt === 3) {
          upload = await uploadArtwork();
          if (!upload.id) throw new Error("Printify did not return a replacement image ID.");
        }
      },
    });
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", shopId: shop.id });
    let productImages = created.images ?? [];
    let previewUrl = productImages.find((image) => image.is_default)?.src || productImages[0]?.src;
    if (!previewUrl) {
      try { const loaded = await api<CreatedProduct>(`/shops/${shop.id}/products/${created.id}.json`, token); productImages = loaded.images ?? []; previewUrl = productImages.find((image) => image.is_default)?.src || productImages[0]?.src; } catch { /* Preview can appear moments later. */ }
    }
    const draft = { id: created.id, batchId:body.batchId, clientId: body.clientId ?? body.fileName, name: body.fileName, title, tags: body.tags ?? [], description:body.description??template.description??"", previewUrl, printifyImages: productImages.map((image) => image.src).filter(Boolean), shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created" };
    await db.prepare("UPDATE printify_draft_results SET status = 'succeeded', response_json = ?, updated_at = CURRENT_TIMESTAMP WHERE request_key = ?").bind(JSON.stringify(draft), idempotencyKey).run();
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The draft could not be created.";
    if (idempotencyKey) await runtimeEnv().DB?.prepare("UPDATE printify_draft_results SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE request_key = ? AND status != 'succeeded'").bind(idempotencyKey).run().catch(() => undefined);
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "failed", message });
    return NextResponse.json({ error: `${message}${publicSupportReference(supportReference)}` }, { status: 500 });
  } finally {
    if (stagedIdForCleanup) await runtimeEnv().ARTWORK?.delete(stagedIdForCleanup).catch(() => undefined);
  }
}
