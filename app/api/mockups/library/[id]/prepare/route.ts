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
  const surface = await falJson("fal-ai/sam-3/image", key, {
    image_url: imageUrl, prompt: surfacePrompt, apply_mask: true,
    return_multiple_masks: false, max_masks: 1, include_scores: true, include_boxes: true, output_format: "png",
  });
  const surfaceMaskUrl = (surface.masks as Array<{ url?: string }> | undefined)?.[0]?.url;
  if (!surfaceMaskUrl) throw new Error("The printable product surface was not isolated.");

  const depth = await falJson("fal-ai/image-preprocessors/depth-anything/v2", key, { image_url: imageUrl });
  const depthUrl = (depth.image as { url?: string } | undefined)?.url;
  if (!depthUrl) throw new Error("The product surface depth was not measured.");

  let occlusionUrl: string | undefined;
  if (geometry.occluded) {
    const occlusion = await falJson("fal-ai/sam-3/image", key, {
      image_url: imageUrl,
      prompt: "hood, hair, hand, arm, strap, flap or foreground object crossing in front of the printable product surface",
      apply_mask: true, return_multiple_masks: true, max_masks: 3, include_scores: true, output_format: "png",
    });
    occlusionUrl = (occlusion.masks as Array<{ url?: string }> | undefined)?.[0]?.url;
    if (!occlusionUrl) throw new Error("The foreground crossing the print surface was not isolated.");
  }

  const [surfaceMaskKey, depthKey, occlusionKey] = await Promise.all([
    storeRemoteAsset(surfaceMaskUrl, `${objectPrefix}/surface.png`),
    storeRemoteAsset(depthUrl, `${objectPrefix}/depth.png`),
    storeRemoteAsset(occlusionUrl, `${objectPrefix}/occlusion.png`),
  ]);
  return { ...geometry, surfaceMaskKey, depthKey, occlusionKey };
}

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to prepare your mockups." }, { status: 401 });
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ error: "Automatic mockup preparation is not connected." }, { status: 503 });
  await ensureMockupStorage();
  const { id } = await context.params;
  const body = await request.json() as { productName?: string };
  const productName = String(body.productName || "print-on-demand product").replace(/[^a-z0-9 ,&'()-]/gi, " ").trim().slice(0, 120) || "print-on-demand product";
  const [row] = await getDb().select().from(mockupTemplates).where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId))).limit(1);
  if (!row) return NextResponse.json({ error: "That mockup scene was not found." }, { status: 404 });

  const existing = row.preparationJson ? JSON.parse(row.preparationJson) as ScenePreparation : null;
  if (preparationMatchesProduct(existing, productName)) return NextResponse.json({ preparation: existing, cached: true });

  await getDb().update(mockupTemplates).set({ preparationStatus: "preparing", preparationError: "", updatedAt: new Date().toISOString() })
    .where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));

  const source = await env.ARTWORK.get(row.objectKey);
  if (!source) return NextResponse.json({ error: "The original mockup photograph is missing." }, { status: 410 });
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
      await getDb().update(mockupTemplates).set({
        cornersJson: JSON.stringify(preparation.corners), printSide: preparation.printSide, quadMeans: "print-area",
        occlusionKey: preparation.occlusionKey || null, occlusionConfirmed: 1,
        preparationStatus: "ready", preparationJson: JSON.stringify(preparation), preparationError: "",
        preparationAttempts: attempt, updatedAt: new Date().toISOString(),
      }).where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));
      return NextResponse.json({ preparation, cached: false });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  await getDb().update(mockupTemplates).set({
    preparationStatus: "queued", preparationError: lastError, preparationAttempts: (row.preparationAttempts || 0) + MAX_ATTEMPTS,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(mockupTemplates.id, id), eq(mockupTemplates.userId, user.userId)));
  return NextResponse.json({ error: "Goldie is still preparing this scene and will retry automatically." }, { status: 503 });
}

export const POST = withErrorLog("mockup-scene-prepare", handlePOST);
