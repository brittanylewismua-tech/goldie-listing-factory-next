import { NextRequest, NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function allowedImageUrl(value: string) {
  if (value.startsWith("data:image/png;base64,") || value.startsWith("data:image/jpeg;base64,") || value.startsWith("data:image/webp;base64,")) return value.length <= MAX_IMAGE_BYTES * 1.4;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "goldie-listing-factory.brittanylewismua.chatgpt.site" || url.hostname.endsWith(".chatgpt.site"));
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.FAL_KEY;
    if (!key) return NextResponse.json({ error: "Smart scene analysis is not connected." }, { status: 503 });
    const body = await request.json() as { imageUrl?: string; prompt?: string };
    const imageUrl = body.imageUrl?.trim() ?? "";
    if (!allowedImageUrl(imageUrl)) return NextResponse.json({ error: "That mockup image cannot be analyzed securely." }, { status: 400 });
    const prompt = (body.prompt?.trim() || "person, arms, hands, hair, plants, furniture and foreground objects overlapping the product").slice(0, 500);
    const response = await fetch("https://fal.run/fal-ai/sam-3/image", {
      method: "POST",
      headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, prompt, apply_mask: true, return_multiple_masks: true, max_masks: 8, include_scores: true, include_boxes: true, output_format: "png", sync_mode: true }),
    });
    const result = await response.json() as { masks?: Array<{ url?: string }>; scores?: number[]; boxes?: number[][]; detail?: string; error?: string };
    if (!response.ok) return NextResponse.json({ error: result.detail || result.error || "The scene could not be analyzed." }, { status: 502 });
    const masks = (result.masks ?? []).map((mask, index) => ({ url: mask.url, score: result.scores?.[index] ?? null, box: result.boxes?.[index] ?? null })).filter(mask => Boolean(mask.url));
    if (!masks.length) return NextResponse.json({ error: "Goldie did not find a dependable foreground layer in this scene." }, { status: 422 });
    return NextResponse.json({ masks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The scene could not be analyzed." }, { status: 500 });
  }
}
