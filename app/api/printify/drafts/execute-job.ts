import { publicSupportReference, recordDiagnostic } from "../diagnostics";
import {retryAfterMilliseconds,waitForDraftRetry} from "../retry-after";
import { createProductWithImageRetries, UncertainProductCreation, RejectedProductCreation } from "../product-creation";
import { completeCreatedProduct } from "../created-product-details";
import { readPrintSide, artworkPlacement } from "../../../placement-math.ts";
import { printAreasForArtworkAssignments, printAreasWithOnlyCurrentArtwork, type ArtworkAssignment } from "../product-payload";
import { recommendedPrice } from "@/app/pricing";
import { actualCostReview } from "@/app/draft-pricing";
import { mergeMockupImages } from "@/app/draft-preview-variants";
import { signedArtworkUrl } from "../staged-url";
import { packDraftMedia,unpackDraftMedia,type MediaBucket } from "@/app/draft-media-storage";
import {printifyVariantLimitMessage} from "@/app/printify-variant-limit";

const PRINTIFY_API = "https://api.printify.com/v1";
type UploadedImage = { id: string; width?: number; height?: number; mime_type?: string; preview_url?:string };
export type TemplateProduct = {
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
type PrintAreaImage = { src?:string; x?: number; y?: number; scale?: number; angle?: number; width?: number; height?: number };
type PrintAreaPlaceholder = { position?: string; images?: PrintAreaImage[] };
export type CreatedProduct = {
  id: string; title?: string;
  images?: Array<{ src?: string; is_default?: boolean; variant_ids?:number[]; position?:string }>;
  variants?:Array<{id:number;title?:string;cost?:number;price?:number;is_enabled?:boolean}>;
  /* D591 - the created product carries where the design ACTUALLY went. */
  print_areas?: Array<{ placeholders?: PrintAreaPlaceholder[] }>;
};


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
      await waitForDraftRetry(retryAfterMilliseconds(response.headers.get("retry-after"),waits[attempt]));
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



import {draftVariantSku} from "../draft-identity";
import {reconcileDraftJob} from "../reconcile-draft-job";
import {readJobObject,writeJobObject,type PendingDraftJob,type JobBucket} from "../draft-job-store";
import {decryptPrintifyToken} from "../token-crypto";
export type DraftRequestBody={ batchId?: string; title?: string; tags?: string[]; description?: string; visibleBounds?:{left:number;top:number;right:number;bottom:number}; maxPlacementScale?:number; fileName?: string; stagedId?: string; artworks?:Array<{key:string;fileName:string;stagedId:string;bounds?:{left:number;top:number;right:number;bottom:number};maxPlacementScale?:number}>; artworkAssignments?:ArtworkAssignment[]; supportReference?: string; clientId?: string; variantPrices?:Record<string,number>; variantCosts?:Record<string,number>; selectedVariantIds?:number[]; mockupVariantIds?:number[]; mockupVariantSources?:Record<string,number>; etsyBuyerShipping?:number; shippingTemplateId?:number; pricing?: { targetProfit?: number; etsyFeePercent?: number; fixedFee?: number; listingFee?: number; shippingCost?: number; shippingCharged?: number } };
export type DraftJobInput={userId:string;requestUrl:string;body:DraftRequestBody;session:{shop_id:number;product_id:string;template_json:string}};
export type DraftJobBindings={DB:D1Database;ARTWORK:JobBucket&MediaBucket&{get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>;body?:ReadableStream;customMetadata?:Record<string,string>}|null>};PRINTIFY_TOKEN_KEY:string};
export async function executeDraftJob(input:DraftJobInput,idempotencyKey:string,checkpoint:PendingDraftJob,bindings:DraftJobBindings){
  const runtimeEnv=()=>bindings,user={userId:input.userId},body=input.body,session=input.session,db=bindings.DB;
  const variantLimitError=printifyVariantLimitMessage(new Set(body.selectedVariantIds||[]).size);
  if(variantLimitError)throw Error(variantLimitError);
  const request=new Request(input.requestUrl),requestStartedAt=performance.now();
  const supportReference=body.supportReference?.replace(/[^A-Z0-9-]/gi,"").slice(0,40)||"";
  let diagnosticStage="request_validation";
  const row=await db.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>();
  if(!row)throw Error("The saved Printify connection is unavailable.");
  const token=await decryptPrintifyToken(row.encrypted_token,bindings.PRINTIFY_TOKEN_KEY);
  const requestedArtworks=body.artworks?.length?body.artworks:body.fileName&&body.stagedId?[{key:"primary",fileName:body.fileName,stagedId:body.stagedId,bounds:body.visibleBounds,maxPlacementScale:body.maxPlacementScale}]:[];
  const savedUploads=checkpoint.uploadKey?await readJobObject<{ids:Record<string,string>;previews:Record<string,string>}>(bindings.ARTWORK,user.userId,checkpoint.workflowId,checkpoint.uploadKey):null;
  async function saveCheckpoint(change:Partial<PendingDraftJob>){
    checkpoint={...checkpoint,...change};
    const result=await db.prepare("UPDATE printify_draft_results SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_key=? AND user_id=? AND status IN ('running','uncertain') AND json_extract(response_json,'$.workflowId')=? RETURNING request_key").bind(JSON.stringify(checkpoint),idempotencyKey,user.userId,checkpoint.workflowId).first();
    if(!result)throw Error("This draft job no longer owns its reservation.");
  }
  async function saveUploads(){const uploadKey=await writeJobObject(bindings.ARTWORK,user.userId,checkpoint.workflowId,"uploads.json",{ids:uploadedImageIds,previews:uploadedArtworkPreviewUrls});await saveCheckpoint({phase:"uploaded",uploadKey});}

    const productId = session.product_id;
    const shop = { id: session.shop_id };
    const template = JSON.parse(session.template_json) as TemplateProduct;
    await db.prepare("UPDATE printify_batch_sessions SET expires_at = unixepoch() + 21600 WHERE id = ? AND user_id = ?").bind(body.batchId, user.userId).run();

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
    if(!savedUploads)for (const artwork of requestedArtworks) {
      const stagedArtwork = await runtimeEnv().ARTWORK?.get(artwork.stagedId);
      if (!stagedArtwork) throw new Error(`Goldie could not retrieve ${artwork.fileName}.`);
      if (stagedArtwork.customMetadata?.owner !== user.userId) throw new Error("This staged artwork does not belong to the signed-in account.");
      if (Number(stagedArtwork.customMetadata?.expires ?? 0) <= Date.now()) throw new Error(`${artwork.fileName} expired before Printify could retrieve it.`);
      artworkSources.set(artwork.key, {
        fileName: artwork.fileName,
        url: await signedArtworkUrl(requestOrigin, artwork.stagedId, artworkSecret),
      });
    }
    const uploadedImageIds: Record<string, string> = {...savedUploads?.ids};
    const uploadedArtworkPreviewUrls: Record<string,string> = {...savedUploads?.previews};
    const uploadAllArtwork = async () => {
      /* Front/back and color-specific artwork are independent uploads. Sending
         them serially made one listing pay the full upload latency once per
         file. Printify accepts these independently, so upload them together and
         preserve the keyed result map used by the product payload. */
      await Promise.all(requestedArtworks.map(async (artwork) => {
        if(!artworkSources.has(artwork.key)){const staged=await runtimeEnv().ARTWORK.get(artwork.stagedId);if(!staged||staged.customMetadata?.owner!==user.userId)throw Error("Protected artwork is unavailable.");artworkSources.set(artwork.key,{fileName:artwork.fileName,url:await signedArtworkUrl(requestOrigin,artwork.stagedId,artworkSecret)});}
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
        if(upload.preview_url)uploadedArtworkPreviewUrls[artwork.key]=upload.preview_url;
      }));
    };
    if(!savedUploads){await uploadAllArtwork();await saveUploads();}
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "succeeded", message:`elapsed_ms=${Math.round(performance.now()-requestStartedAt)}`, shopId: shop.id });
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
    /* Create the real product once, with exactly the seller's saved choices.
       Colour and camera previews are now derived from Printify's blueprint
       metadata when the editor opens, so widening and then restoring every
       draft only added a second serial Printify request. */
    const enabledForCreation=finalVariantIds;
    const creationPrintAreas=template.print_areas;
    const productBody = (variantIds=enabledForCreation,previewOnly=false) => JSON.stringify({
        title: previewOnly?`Preview — ${title || "Untitled design"}`:(title || "Untitled design"),
        description: body.description ?? template.description ?? "",
        blueprint_id: template.blueprint_id,
        print_provider_id: template.print_provider_id,
        variants: template.variants.map(({ id, price, cost, is_enabled }) => {const approved=Number(body.variantPrices?.[String(id)]);const calculated=recommendedPrice(cost ?? price,body.pricing);const finalPrice=Number.isInteger(approved)&&approved>=Number(cost??price)&&approved<=1000000?approved:calculated;const selected=variantIds.length?variantIds.includes(id):is_enabled;return { id, sku:draftVariantSku(idempotencyKey,id), price:finalPrice, is_enabled:selected }}),
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
    let created:CreatedProduct;
    if(checkpoint.productKey){created=await readJobObject<CreatedProduct>(bindings.ARTWORK,user.userId,checkpoint.workflowId,checkpoint.productKey);}
    else if(checkpoint.phase==="creating"){
      const recovered=await reconcileDraftJob<CreatedProduct>({key:idempotencyKey,shopId:shop.id,blueprintId:template.blueprint_id,providerId:template.print_provider_id,variantIds:template.variants.map(v=>v.id)},token);
      if(!recovered)throw new UncertainProductCreation();created=recovered;
    }else{
    await saveCheckpoint({phase:"creating"});
    created = await createProductWithImageRetries<CreatedProduct>({
      sleeper:waitForDraftRetry,
      path: `/shops/${shop.id}/products.json`, token, body: productBody,
      onRetry: async(attempt, status, detail) => {await saveCheckpoint({phase:"uploaded"});await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: diagnosticStage, event: "retry", attempt, httpStatus: status, message: detail, shopId: shop.id });},
      onBeforeCreate:()=>saveCheckpoint({phase:"creating"}),
      onImageNotReady: async (imageErrors) => {
        /* D613 - one controlled re-upload, on the FIRST image error rather than
           the third. If the replacement is rejected too, the ladder stops. */
        if (imageErrors === 1) {
          await uploadAllArtwork();await saveUploads();
        }
      },
    });
    }
    if(!checkpoint.productKey){const productKey=await writeJobObject(bindings.ARTWORK,user.userId,checkpoint.workflowId,"product.json",created);await saveCheckpoint({phase:"created",productKey});}
    const resolvedProduct=await completeCreatedProduct(created, shop.id, token);
    const colorPreviewImages=resolvedProduct.images||[];
    /* Keep every image Printify returned immediately. Further camera angles
       and colour thumbnails are populated lazily without delaying creation. */
    let productImages = mergeMockupImages(resolvedProduct.images ?? created.images ?? [],colorPreviewImages);
    let previewUrl = productImages.find((image) => image.is_default)?.src || productImages[0]?.src;
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
    if(!uploadedArtworkPreviewUrls.primary&&dominantTemplatePlacement?.src)uploadedArtworkPreviewUrls.primary=dominantTemplatePlacement.src;
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
    const costReview=actualCostReview(costVariants,body.variantCosts,body.variantPrices);
    const draft = { id: created.id, placement, placementDebug, batchId:body.batchId, sourceTemplateId:session.product_id, blueprintId:template.blueprint_id, providerId:template.print_provider_id, clientId: body.clientId ?? body.fileName, name: body.fileName, title, tags: body.tags ?? [], description:body.description??template.description??"", selectedVariantIds:finalVariantIds, previewUrl, artworkPreviewUrls:uploadedArtworkPreviewUrls, printifyImages: productImages.map((image) => image.src).filter(Boolean), printifyImageDetails:productImages.filter(image=>image.src).map(image=>({src:image.src!,variantIds:image.variant_ids||[],position:image.position||""})), colorPreviewImageDetails:colorPreviewImages.filter(image=>image.src).map(image=>({src:image.src!,variantIds:image.variant_ids||[],position:image.position||""})), shopId: shop.id, editorUrl: `https://printify.com/app/editor/${created.id}`, status: "Created",costReview };
    // A successfully created product must still be recorded if optional media
    // compaction is temporarily unavailable. A later edit can compact it.
    const packedDraft=await packDraftMedia(draft,user.userId,runtimeEnv().ARTWORK!).catch(()=>draft);
    const saved=await db.prepare("UPDATE printify_draft_results SET status = 'succeeded', response_json = ?, updated_at = CURRENT_TIMESTAMP WHERE request_key = ? AND user_id=? AND status IN ('running','uncertain') AND json_extract(response_json,'$.workflowId')=? RETURNING request_key").bind(JSON.stringify(packedDraft), idempotencyKey,user.userId,checkpoint.workflowId).first();
    if(!saved)throw Error("This draft's saved state changed while creation finished.");
    const totalMs=Math.round(performance.now()-requestStartedAt);
    await recordDiagnostic(runtimeEnv().DB, supportReference, { stage: "response_ready", event: "succeeded", message:`total_ms=${totalMs}`, shopId: shop.id });
    return draft;

}
