import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { publicSupportReference, recordDiagnostic } from "../diagnostics";
import { createProductWithImageRetries } from "../product-creation";
import { readPrintSide, artworkPlacement } from "../../../placement-math.ts";
import { printAreasForArtworkAssignments, printAreasWithOnlyCurrentArtwork, type ArtworkAssignment } from "../product-payload";
import { planFor } from "@/app/plan-limits";
import { decryptPrintifyToken } from "../token-crypto";
import { recommendedPrice } from "@/app/pricing";
import { isOwner } from "@/app/mastermind/access";
import { actualCostReview } from "@/app/draft-pricing";
import { creationVariantIds, expandPrintAreasForPreview, mergeMockupImages, restoredVariants } from "@/app/draft-preview-variants";
import { signedArtworkUrl } from "../staged-url";

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
      /* D613 - src is Printify's own URL for the placeholder image, which is how
         a label's artwork is re-uploaded to obtain an ID valid for this request. */
      images?: Array<{ id?: string; src?: string; x?: number; y?: number; scale?: number; angle?: number }>;
    }>;
    background?: string;
  }>;
};
type PrintAreaImage = { x?: number; y?: number; scale?: number; angle?: number; width?: number; height?: number };
type PrintAreaPlaceholder = { position?: string; images?: PrintAreaImage[] };
type CreatedProduct = {
  id: string; title?: string;
  images?: Array<{ src?: string; is_default?: boolean; variant_ids?:number[]; position?:string }>;
  variants?:Array<{id:number;title?:string;cost?:number;price?:number;is_enabled?:boolean}>;
  /* D591 - the created product carries where the design ACTUALLY went. */
  print_areas?: Array<{ placeholders?: PrintAreaPlaceholder[] }>;
};

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
        signal: AbortSignal.timeout(30000),
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

async function handleGET(request: Request) {
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
  const age=Date.now()-new Date(`${row.updated_at.replace(" ","T")}Z`).getTime();
  if(row.status==="running"&&age>90_000){
    await db.prepare("UPDATE printify_draft_results SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE request_key=? AND user_id=? AND status='running'").bind(key,user.userId).run();
    return NextResponse.json({status:"failed",error:"This draft attempt stopped responding. Retry it; the previous attempt will not be repeated."});
  }
  return NextResponse.json({ status: row.status, draft: row.status === "succeeded" && row.response_json ? JSON.parse(row.response_json) : undefined, updatedAt: row.updated_at });
}

async function handlePOST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  const stagedIdsForCleanup: string[] = [];
  let supportReference = "";
  let diagnosticStage = "request_validation";
  let idempotencyKey = "";
  try {
    const body = (await request.json()) as { batchId?: string; title?: string; tags?: string[]; description?: string; visibleBounds?:{left:number;top:number;right:number;bottom:number}; maxPlacementScale?:number; fileName?: string; stagedId?: string; artworks?:Array<{key:string;fileName:string;stagedId:string;bounds?:{left:number;top:number;right:number;bottom:number};maxPlacementScale?:number}>; artworkAssignments?:ArtworkAssignment[]; supportReference?: string; clientId?: string; variantPrices?:Record<string,number>; selectedVariantIds?:number[]; mockupVariantIds?:number[]; mockupVariantSources?:Record<string,number>; etsyBuyerShipping?:number; shippingTemplateId?:number; pricing?: { targetProfit?: number; etsyFeePercent?: number; fixedFee?: number; listingFee?: number; shippingCost?: number; shippingCharged?: number } };
    stagedIdsForCleanup.push(...(body.artworks?.map((artwork) => artwork.stagedId) ?? []), ...(body.stagedId ? [body.stagedId] : []));
    supportReference = body.supportReference?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40) ?? "";
    const requestedArtworks = body.artworks?.length
      ? body.artworks
      : body.fileName && body.stagedId
        ? [{ key: "primary", fileName: body.fileName, stagedId: body.stagedId, bounds: body.visibleBounds, maxPlacementScale: body.maxPlacementScale }]
        : [];
    if (!body.batchId || !requestedArtworks.length) return NextResponse.json({ error: "The prepared batch and design file are required." }, { status: 400 });
    if (new Set(requestedArtworks.map((artwork) => artwork.key)).size !== requestedArtworks.length) return NextResponse.json({ error: "Each artwork version needs a unique identifier." }, { status: 400 });
    const db = runtimeEnv().DB;
    if (!db) throw new Error("Secure batch storage is unavailable.");
    idempotencyKey = await requestKey(body.batchId, body.clientId ?? body.fileName ?? requestedArtworks[0].fileName);
    const prior = await db.prepare("SELECT status, response_json, updated_at FROM printify_draft_results WHERE request_key = ? AND user_id = ?")
      .bind(idempotencyKey, user.userId).first<{ status: string; response_json: string | null; updated_at: string }>();
    if (prior?.status === "succeeded" && prior.response_json) return NextResponse.json({ draft: JSON.parse(prior.response_json) });
    if (prior?.status === "running" && Date.now() - new Date(`${prior.updated_at.replace(" ", "T")}Z`).getTime() < 90_000) {
      return NextResponse.json({ error: "Goldie is still completing this exact draft. It will be checked again automatically." }, { status: 409 });
    }
    await db.prepare("INSERT INTO printify_draft_results (request_key, user_id, batch_id, client_id, status, updated_at) VALUES (?, ?, ?, ?, 'running', CURRENT_TIMESTAMP) ON CONFLICT(request_key) DO UPDATE SET status = 'running', response_json = NULL, updated_at = CURRENT_TIMESTAMP")
      .bind(idempotencyKey, user.userId, body.batchId, body.clientId ?? body.fileName ?? requestedArtworks[0].fileName).run();
    const planRow = await db.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(user.userId).first<{plan_key:string}>();
    const plan = planFor(planRow?.plan_key, isOwner(user));
    const reserved = await db.prepare("SELECT COUNT(*) count FROM printify_draft_results WHERE user_id=? AND ((status='succeeded' AND updated_at>=datetime('now','start of month')) OR (status='running' AND updated_at>=datetime('now','-90 seconds')))").bind(user.userId).first<{count:number}>();
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
    const artworkSources = new Map<string, { fileName: string; url: string }>();
    const artworkSecret = runtimeEnv().PRINTIFY_TOKEN_KEY;
    if (!artworkSecret) throw new Error("Secure artwork delivery is not configured.");
    const requestOrigin = new URL(request.url).origin;
    for (const artwork of requestedArtworks) {
      const stagedArtwork = await runtimeEnv().ARTWORK?.get(artwork.stagedId);
      if (!stagedArtwork) throw new Error(`Goldie could not retrieve ${artwork.fileName}.`);
      if (stagedArtwork.customMetadata?.owner !== user.userId) throw new Error("This staged artwork does not belong to the signed-in account.");
      if (Number(stagedArtwork.customMetadata?.expires ?? 0) <= Date.now()) throw new Error(`${artwork.fileName} expired before Printify could retrieve it.`);
      artworkSources.set(artwork.key, {
        fileName: artwork.fileName,
        url: await signedArtworkUrl(requestOrigin, artwork.stagedId, artworkSecret),
      });
    }
    const uploadedImageIds: Record<string, string> = {};
    const uploadAllArtwork = async () => {
      for (const artwork of requestedArtworks) {
        const source = artworkSources.get(artwork.key)!;
        const upload = await api<UploadedImage>("/uploads/images.json", token, {
          method: "POST",
          /* Printify explicitly recommends URL uploads above 5 MB.  The URL is
             HMAC-signed, expires quickly, and serves only this private R2
             object, avoiding a 33% base64 expansion inside the Worker. */
          body: JSON.stringify({ file_name: source.fileName, url: source.url }),
        }, (attempt, status) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: "printify_upload", event: "retry", attempt, httpStatus: status ?? null, shopId: shop.id }));
        if (!upload.id) throw new Error(`Printify accepted ${source.fileName} but did not return an image ID.`);
        uploadedImageIds[artwork.key] = upload.id;
      }
    };
    await uploadAllArtwork();
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", shopId: shop.id });
    // The private app sends the staged bytes directly to Printify. Large opaque
    // artwork is optimized in the browser first so this request stays reliable.
    // creation on GET /uploads/{id}: live Printify accounts can return 404 from
    // that lookup even though the uploaded image ID is valid. Draft creation
    // below is the authoritative registration check and retries only when
    // Printify itself returns image-not-ready error 8253.
    const title = body.title?.trim().slice(0, 255) || requestedArtworks[0].fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const selectedShippingTemplateId=Number(body.shippingTemplateId)>0?String(Math.trunc(Number(body.shippingTemplateId))):template.shippingTemplateId;
    if(!selectedShippingTemplateId)throw new Error("Choose the shipping profile for this batch before creating drafts.");
    const finalVariantIds=(body.selectedVariantIds||[]).filter(id=>template.variants.some(variant=>variant.id===id));
    const previewVariantIds=(body.mockupVariantIds||[]).filter(id=>template.variants.some(variant=>variant.id===id));
    /* The real product is created only with the seller's saved choices. Broad
       colour coverage belongs exclusively to the disposable preview helpers;
       widening the real draft crowds its normal camera angles out of the
       listing-photo response. */
    /* Generate colour previews on the real private draft. The previous route
       created one or more disposable products and waited for every helper's
       asynchronous mockups before it returned. A measured two-design run left
       one request stranded and held the successful request open for 78s. */
    const enabledForCreation=creationVariantIds(finalVariantIds,previewVariantIds);
    const creationPrintAreas=expandPrintAreasForPreview(template.print_areas,body.mockupVariantSources||{});
    const productBody = (variantIds=enabledForCreation,previewOnly=false) => JSON.stringify({
        title: previewOnly?`Preview — ${title || "Untitled design"}`:(title || "Untitled design"),
        description: body.description ?? template.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, cost, is_enabled }) => {const approved=Number(body.variantPrices?.[String(id)]);const calculated=recommendedPrice(cost ?? price,body.pricing);const finalPrice=Number.isInteger(approved)&&approved>=Number(cost??price)&&approved<=1000000?approved:calculated;const selected=variantIds.length?variantIds.includes(id):is_enabled;return { id, price:finalPrice, is_enabled:selected }}),
        tags: (body.tags ?? []).map(tag => String(tag).trim()).filter(Boolean).slice(0, 13),
        external:{shipping_template_id:selectedShippingTemplateId},
        sales_channel_properties:{free_shipping:Boolean(template.freeShipping)},
        // Never carry media-library IDs from the template into a different
        // product request. Only the image uploaded in this request is valid.
        print_areas: body.artworkAssignments?.length
          ? printAreasForArtworkAssignments(creationPrintAreas, body.artworkAssignments, uploadedImageIds)
          : printAreasWithOnlyCurrentArtwork(creationPrintAreas, uploadedImageIds.primary, body.visibleBounds, body.maxPlacementScale),
    });
    diagnosticStage = "draft_creation";
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "started", shopId: shop.id });
    const created = await createProductWithImageRetries<CreatedProduct>({
      path: `/shops/${shop.id}/products.json`, token, body: productBody,
      onRetry: (attempt, status, detail) => recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "retry", attempt, httpStatus: status, message: detail, shopId: shop.id }),
      onImageNotReady: async (imageErrors) => {
        /* D613 - one controlled re-upload, on the FIRST image error rather than
           the third. If the replacement is rejected too, the ladder stops. */
        if (imageErrors === 1) {
          await uploadAllArtwork();
        }
      },
    });
    let resolvedProduct=created;
    /* Printify only generates mockups for enabled variants. Create with one
       representative size across every available colour, wait for those real
       images, then restore the seller's exact choices before reporting success.
       The broad image set is retained in Goldie for the colour picker; the
       Printify draft itself never remains widened. */
    let colorPreviewImages=resolvedProduct.images||[];
    const widened=previewVariantIds.some(id=>!finalVariantIds.includes(id));
    if(widened){
      try{
        /* Never hold the creation screen open waiting for asynchronously
           generated mockups. The colour panel refreshes the real product when
           the seller opens it; draft creation only restores their choices. */
        const restored=restoredVariants(resolvedProduct.variants||template.variants,finalVariantIds).map(variant=>{
          const source=(resolvedProduct.variants||template.variants).find(item=>item.id===variant.id);
          return {...variant,price:Number(source?.price||template.variants.find(item=>item.id===variant.id)?.price||0)};
        });
        const restoredProduct=await api<CreatedProduct>(`/shops/${shop.id}/products/${created.id}.json`,token,{method:"PUT",body:JSON.stringify({variants:restored})});
        resolvedProduct={...resolvedProduct,...restoredProduct,variants:(restoredProduct.variants||resolvedProduct.variants||[]).map(variant=>({...variant,is_enabled:finalVariantIds.includes(variant.id)}))};
      }catch(error){
        /* The draft exists. A late mockup refresh must never turn that success
           into a failed listing. Best-effort restore keeps the saved choices. */
        const restored=restoredVariants(resolvedProduct.variants||template.variants,finalVariantIds);
        await api<CreatedProduct>(`/shops/${shop.id}/products/${created.id}.json`,token,{method:"PUT",body:JSON.stringify({variants:restored})}).catch(()=>undefined);
      }
    }
    /* Keep every camera view returned while the temporarily widened real draft
       was generating, then restore the seller's exact enabled variants. */
    let productImages = mergeMockupImages(resolvedProduct.images ?? created.images ?? [],colorPreviewImages);
    let previewUrl = productImages.find((image) => image.is_default)?.src || productImages[0]?.src;
    if (!previewUrl) {
      try { const loaded = await api<CreatedProduct>(`/shops/${shop.id}/products/${created.id}.json`, token); productImages = loaded.images ?? []; previewUrl = productImages.find((image) => image.is_default)?.src || productImages[0]?.src; } catch { /* Preview can appear moments later. */ }
    }
    // The exact placement this draft used, so the lifestyle mockup can mirror it
    // rather than guessing at a scale of its own.
    /* D573 - this used to reduce to the single largest image across every
       placeholder and drop `position` entirely, so a back print and a chest
       print produced the same placement and the lifestyle mockup put both on
       the chest. The side is now carried through with the placement. */
    /* D591 - and it was reading them off the WRONG PRODUCT.

       `template` is the blank saved product, before any design exists on it, so
       its placeholders carry no images at all. dominantTemplatePlacement was
       therefore always undefined, and artworkPlacement(undefined, ...) returns
       its no-information default: dead centre at full scale. Confirmed on the
       live site - every render logged placement {x:.5,y:.5,scale:1} with no
       side, which is why designs came out enormous, centred and nothing like the
       Printify preview.

       `created` is the product Printify just made WITH the artwork on it, and it
       carries the real x, y, scale, angle and position. That is the source of
       truth, and this reads it. The blank template is kept only as a last
       resort so an older draft still produces something. */
    let placedAreas = created.print_areas ?? [];
    if(resolvedProduct.print_areas?.length)placedAreas=resolvedProduct.print_areas;
    if (!placedAreas.some((area) => area.placeholders?.some((p) => p.images?.length))) {
      try {
        const loaded = await api<CreatedProduct>(`/shops/${shop.id}/products/${created.id}.json`, token);
        if (loaded.print_areas?.length) placedAreas = loaded.print_areas;
      } catch { /* fall through to the template below */ }
    }
    const areas = placedAreas.some((area) => area.placeholders?.some((p) => p.images?.length))
      ? placedAreas
      : (template.print_areas ?? []) as Array<{ placeholders?: PrintAreaPlaceholder[] }>;
    /* D593 - choosing the placeholder by "largest scale" was wrong, and the
       diagnostic proved it. A real draft came back with:

         positions:   ["front", "back", "neck"]
         imageCounts: [1, 0, 2]

       scale is relative to each placeholder's OWN print area, so a neck label
       filling its little strip at scale 1.0 beats a chest print occupying 0.6 of
       a 12x16 area. The neck won every time, which is why placement arrived as
       side "other" at {x:.5, y:.5, scale:1} - not a default at all, but the neck
       label's real values faithfully carried through.

       The main design is chosen by PRINT SIDE instead. Labels and inner prints
       can never be the listing's artwork, so they are excluded outright, and the
       remaining sides are ranked. Physical artwork size breaks a tie. */
    const isLabelPosition = (position?: string) =>
      /neck|label|collar|inner|tag|sleeve[_ -]?label/i.test(String(position || ""));
    const sideRank = (position?: string) => {
      const value = String(position || "").toLowerCase();
      if (/front|chest/.test(value)) return 0;
      if (/back/.test(value)) return 1;
      if (/sleeve|arm|cuff/.test(value)) return 2;
      return 3;
    };
    const dominantPlaceholder = areas
      .flatMap((area) => area.placeholders ?? [])
      .filter((placeholder) => placeholder.images?.length && !isLabelPosition(placeholder.position))
      .sort((a, b) => {
        const rank = sideRank(a.position) - sideRank(b.position);
        if (rank !== 0) return rank;
        const areaOf = (p: PrintAreaPlaceholder) =>
          Number(p.images?.[0]?.width ?? 0) * Number(p.images?.[0]?.height ?? 0);
        return areaOf(b) - areaOf(a);
      })[0];
    const dominantTemplatePlacement = dominantPlaceholder?.images?.[0];
    /* D592 - D591 is running (the side field now appears) but the placement is
       still the default, so dominantPlaceholder is still coming back undefined.
       Rather than guess at Printify's response shape a second time, record what
       was actually received so it can be read off a real draft. */
    const placementDebug = {
      createdAreas: (created.print_areas ?? []).length,
      usedAreas: areas.length,
      placeholders: areas.flatMap((area) => area.placeholders ?? []).length,
      positions: areas.flatMap((area) => (area.placeholders ?? []).map((p) => p.position ?? "?")).slice(0, 6),
      chosen: dominantPlaceholder?.position ?? "none",
      imageCounts: areas.flatMap((area) => (area.placeholders ?? []).map((p) => p.images?.length ?? 0)).slice(0, 6),
      firstImageKeys: Object.keys(areas.flatMap((area) => area.placeholders ?? [])[0]?.images?.[0] ?? {}).slice(0, 12),
      createdTopKeys: Object.keys(created as Record<string, unknown>).slice(0, 14),
    };
    const placement = { ...artworkPlacement(dominantTemplatePlacement, body.visibleBounds, body.maxPlacementScale), side: readPrintSide(dominantPlaceholder?.position) };
    const selectedVariants=(resolvedProduct.variants||[]).filter(variant=>variant.is_enabled!==false&&(!body.selectedVariantIds?.length||body.selectedVariantIds.includes(variant.id)));
    const costVariants=selectedVariants.map(variant=>({id:variant.id,title:variant.title,cost:Number(variant.cost),price:Number(variant.price),isEnabled:variant.is_enabled!==false}));
    /* Prices are provisional until the finished product reports its own costs.
       This is required for every new draft, not only back prints, so a future
       Printify surcharge or provider change cannot bypass the same safeguard. */
    const costReview=actualCostReview(costVariants);
    const draft = { id: created.id, placement, placementDebug, batchId:body.batchId, clientId: body.clientId ?? body.fileName, name: body.fileName, title, tags: body.tags ?? [], description:body.description??template.description??"", selectedVariantIds:finalVariantIds, previewUrl, printifyImages: productImages.map((image) => image.src).filter(Boolean), printifyImageDetails:productImages.filter(image=>image.src).map(image=>({src:image.src!,variantIds:image.variant_ids||[],position:image.position||""})), colorPreviewImageDetails:colorPreviewImages.filter(image=>image.src).map(image=>({src:image.src!,variantIds:image.variant_ids||[],position:image.position||""})), shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created",costReview };
    await db.prepare("UPDATE printify_draft_results SET status = 'succeeded', response_json = ?, updated_at = CURRENT_TIMESTAMP WHERE request_key = ?").bind(JSON.stringify(draft), idempotencyKey).run();
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: "response_ready", event: "succeeded", shopId: shop.id });
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The draft could not be created.";
    if (idempotencyKey) await runtimeEnv().DB?.prepare("UPDATE printify_draft_results SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE request_key = ? AND status != 'succeeded'").bind(idempotencyKey).run().catch(() => undefined);
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "failed", message });
    return NextResponse.json({ error: `${message}${publicSupportReference(supportReference)}` }, { status: 500 });
  } finally {
    await Promise.all([...new Set(stagedIdsForCleanup)].map((stagedId) => runtimeEnv().ARTWORK?.delete(stagedId).catch(() => undefined)));
  }
}

export const GET = withErrorLog("printify-drafts", handleGET);

export const POST = withErrorLog("printify-drafts", handlePOST);
