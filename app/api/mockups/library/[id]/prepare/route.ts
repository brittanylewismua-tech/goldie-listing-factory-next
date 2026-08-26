import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupTemplates } from "@/db/schema";
import { productSurfaceFamily } from "@/app/mockup-compatibility";
import { ensureMockupStorage } from "@/app/api/mockups/storage";
import {
  normalizeSceneAnalysis,
  computedPreparation,
  preparationMatchesProduct,
  SCENE_PREPARATION_VERSION,
  sceneAnalysisPrompt,
  type ScenePreparation,
} from "@/app/mockups/prepared-scene";
import { withErrorLog } from "@/app/error-log";

const MAX_ATTEMPTS = 3;

function dataUrl(bytes: ArrayBuffer, contentType: string) {
  const binary = new Uint8Array(bytes);
  let value = "";
  for (let index = 0; index < binary.length; index += 0x8000) value += String.fromCharCode(...binary.subarray(index, index + 0x8000));
  return `data:${contentType};base64,${btoa(value)}`;
}

/* The middle-70% box every scene is created with. Anything else was measured. */
function isPlaceholderCorners(cornersJson: string) {
  try {
    const corners = JSON.parse(cornersJson) as number[][];
    const placeholder = [[.15, .12], [.85, .12], [.85, .88], [.15, .88]];
    return corners.length === 4 && corners.every((point, index) =>
      Math.abs(point[0] - placeholder[index][0]) < .001 && Math.abs(point[1] - placeholder[index][1]) < .001);
  } catch { return true; }
}

async function falJson(path: string, key: string, body: unknown, timeout = 45_000) {
  const response = await fetch(`https://fal.run/${path}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.detail || payload.error || "Scene preparation provider was unavailable."));
  return payload;
}

async function storeRemoteAsset(url: string | undefined, key: string) {
  if (!url) return undefined;
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error("A prepared scene layer could not be saved.");
  const contentType = response.headers.get("content-type") || "image/png";
  await env.ARTWORK.put(key, await response.arrayBuffer(), { httpMetadata: { contentType } });
  return key;
}

async function analyzeGeometry(imageUrl: string, productName: string, key: string) {
  const payload = await falJson("openrouter/router/vision", key, {
    image_urls: [imageUrl],
    model: "google/gemini-2.5-flash",
    temperature: 0,
    system_prompt: "Return only compact valid JSON. Never use markdown.",
    prompt: sceneAnalysisPrompt(productName),
  });
  const match = String(payload.output || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return normalizeSceneAnalysis(JSON.parse(match[0]), productName); } catch { return null; }
}

async function prepareOnce(imageUrl: string, productName: string, key: string, objectPrefix: string) {
  const geometry = await analyzeGeometry(imageUrl, productName, key);
  if (!geometry) throw new Error("Scene geometry did not pass automatic validation.");

  const surfacePrompt = productSurfaceFamily(productName) === "apparel"
    ? "the visible garment fabric panel where printing can occur"
    : "the visible printable product surface, excluding handles, frames and background";
  /* D580 - the geometry above is the only thing this function must produce. It
     is what becomes the print area, and it is validated before it is accepted.
     Everything below is enrichment, and none of it may cost us a good reading.

     Measured live on her freshly uploaded sets: 16 of 19 scenes analysed
     successfully and were then thrown away here, because these calls threw and
     the caller treated any throw as "preparation failed". That is what drove
     the 100% fallback rate. The surface mask and the depth map are stored and
     then never read by the renderer at all - rigid() uses the corners and, if
     present, the occlusion layer. Discarding a validated print area because an
     unread asset did not arrive is indefensible. */
  const optional = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    try { return await task(); } catch { return undefined; }
  };

  const surface = await optional(() => falJson("fal-ai/sam-3/image", key, {
    image_url: imageUrl, prompt: surfacePrompt, apply_mask: true,
    return_multiple_masks: false, max_masks: 1, include_scores: true, include_boxes: true, output_format: "png",
  }));
  const surfaceMaskUrl = (surface?.masks as Array<{ url?: string }> | undefined)?.[0]?.url;

  const depth = await optional(() => falJson("fal-ai/image-preprocessors/depth-anything/v2", key, { image_url: imageUrl }));
  const depthUrl = (depth?.image as { url?: string } | undefined)?.url;

  let occlusionUrl: string | undefined;
  if (geometry.occluded) {
    /* Also optional. A scene where the foreground could not be isolated is a
       scene whose print is not tucked behind a hood - not a scene that has to
       lose its measured print area as well. */
    const occlusion = await optional(() => falJson("fal-ai/sam-3/image", key, {
      image_url: imageUrl,
      prompt: "hood, hair, hand, arm, strap, flap or foreground object crossing in front of the printable product surface",
      apply_mask: true, return_multiple_masks: true, max_masks: 3, include_scores: true, output_format: "png",
    }));
    occlusionUrl = (occlusion?.masks as Array<{ url?: string }> | undefined)?.[0]?.url;
  }

  /* D580 - saving these cannot cost the reading either. storeRemoteAsset throws
     when a layer will not download, and that throw used to unwind the whole
     preparation and discard the validated geometry with it. */
  const [surfaceMaskKey, depthKey, occlusionKey] = await Promise.all([
    optional(() => storeRemoteAsset(surfaceMaskUrl, `${objectPrefix}/surface.png`)),
    optional(() => storeRemoteAsset(depthUrl, `${objectPrefix}/depth.png`)),
    optional(() => storeRemoteAsset(occlusionUrl, `${objectPrefix}/occlusion.png`)),
  ]);
  return { ...geometry, surfaceMaskKey, depthKey, occlusionKey };
}

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to prepare your mockups." }, { status: 401 });
  const key = process.env.FAL_KEY;
  await ensureMockupStorage();
  const { id } = await context.params;
  const body = await request.json() as { productName?: string };
  const productName = String(body.productName || "print-on-demand product").replace(/[^a-z0-9 ,&'()-]/gi, " ").trim().slice(0, 120) || "print-on-demand product";
  const [row] = await getDb().select().from(mockupTemplates).where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId))).limit(1);
  if (!row) return NextResponse.json({ error: "That mockup scene was not found." }, { status: 404 });


/* D577 - one way out of this function: a ready scene. Both the measured path and
   the computed path go through here, so neither can leave a scene half-written. */
  const store = async (preparation: ScenePreparation, attempt: number, reason = "") => {
    /* D578 - a derived preparation must never overwrite corners that were
       actually measured from this photograph. Verified live: all three of her
       sets fell back to derived, and because this wrote cornersJson
       unconditionally it replaced real marked areas - BACH TEES went from a
       measured 43.5% x 48.5% region of the garment to a blind 35.3% x 33.6%
       default. A failed reading is not new information about the photograph and
       must not be treated as if it were. */
    const measuredAlready = !isPlaceholderCorners(row.cornersJson);
    const keepCorners = Boolean(preparation.derived) && measuredAlready;
    await getDb().update(mockupTemplates).set({
      ...(keepCorners ? {} : { cornersJson: JSON.stringify(preparation.corners) }),
      printSide: preparation.printSide, quadMeans: "print-area",
      occlusionKey: preparation.occlusionKey || null, occlusionConfirmed: 1,
      preparationStatus: "ready", preparationJson: JSON.stringify(preparation), preparationError: reason,
      preparationAttempts: attempt, updatedAt: new Date().toISOString(),
    }).where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));
    const kept = keepCorners
      ? { ...preparation, corners: JSON.parse(row.cornersJson) as ScenePreparation["corners"], keptExisting: true }
      : preparation;
    return NextResponse.json({ preparation: kept, cached: false });
  };

  const existing = row.preparationJson ? JSON.parse(row.preparationJson) as ScenePreparation : null;
  if (preparationMatchesProduct(existing, productName)) return NextResponse.json({ preparation: existing, cached: true });

  await getDb().update(mockupTemplates).set({ preparationStatus: "preparing", preparationError: "", updatedAt: new Date().toISOString() })
    .where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));

  /* D577 - with no analyser available the scene is still prepared, from the
     product's own geometry. Printify continues to place the artwork inside it,
     so the seller gets a working mockup rather than an outage. */
  if (!key) return store(computedPreparation(productName, null), 0, "no-analyser-configured");
  const source = await env.ARTWORK.get(row.objectKey);
  if (!source) return store(computedPreparation(productName, null), 0, "source-photograph-missing");
  const sourceUrl = dataUrl(await source.arrayBuffer(), row.contentType);
  let lastError = "Scene preparation did not finish.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const objectPrefix = `mockup-library/${user.userId}/${id}/prepared-v${SCENE_PREPARATION_VERSION}`;
      const result = await prepareOnce(sourceUrl, productName, key, objectPrefix);
      const preparation: ScenePreparation = {
        version: SCENE_PREPARATION_VERSION, status: "ready", productFamily: productSurfaceFamily(productName),
        geometry: result.geometry, printSide: result.side, corners: result.corners, occluded: result.occluded,
        surfaceMaskKey: result.surfaceMaskKey, depthKey: result.depthKey, occlusionKey: result.occlusionKey,
        preparedAt: new Date().toISOString(),
      };
      return store(preparation, attempt);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  /* D577 - retries are exhausted, and the scene is still prepared. Reading the
     photograph is how Goldie fits the surface precisely; failing to read it is
     not a reason to hand back nothing. The reason is recorded for diagnosis, the
     seller gets a usable scene, and Printify still owns the placement inside it. */
  return store(computedPreparation(productName, null), (row.preparationAttempts || 0) + MAX_ATTEMPTS, lastError);
}

export const POST = withErrorLog("mockup-scene-prepare", handlePOST);
