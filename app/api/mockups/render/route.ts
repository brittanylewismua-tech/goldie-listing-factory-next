import { NextRequest, NextResponse } from "next/server";

type ProductKind = "apparel" | "curved" | "irregular";

const MAX_DATA_URL_LENGTH = 18 * 1024 * 1024;
const supportedDataUrl = (value: unknown): value is string => typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(value) && value.length <= MAX_DATA_URL_LENGTH;

function rendererFor(kind: ProductKind) {
  return kind === "apparel"
    ? "fal-ai/qwen-image-edit-plus-lora-gallery/shirt-design"
    : "fal-ai/qwen-image-edit-plus-lora-gallery/integrate-product";
}

function promptFor(kind: ProductKind, hasReference: boolean) {
  if (kind === "apparel") return [
    "Put the exact design from the second image onto the garment in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    "Make the print follow the garment fabric, folds, perspective, lighting, and shadows naturally.",
    "Keep the person, garment, pose, background, and image composition unchanged.",
    hasReference ? "Use the third image only as the placement reference. Match the design's relative width, height, center position, and scale on the garment." : "Place the design naturally in the centered chest print area.",
    "Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
  return [
    "Apply the exact design from the second image to the product in the first image.",
    "Preserve every word, letter, color, shape, spacing, and design detail exactly.",
    kind === "curved" ? "Wrap it naturally around the visible curved printable surface with correct perspective, lighting, highlights, and shadows." : "Conform it naturally to the visible product shape and printable surface with correct perspective, lighting, and shadows.",
    hasReference ? "Use the third image only as the placement reference. Match relative size, position, orientation, and visible coverage." : "Use a centered, commercially realistic placement.",
    "Keep the scene and product unchanged. Do not add, remove, rewrite, restyle, crop, or regenerate any part of the design.",
  ].join(" ");
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.FAL_KEY;
    if (!key) return NextResponse.json({ error: "Product rendering is not connected." }, { status: 503 });
    const body = await request.json() as { kind?: ProductKind; scene?: string; design?: string; reference?: string };
    const kind = body.kind;
    if (!kind || !["apparel", "curved", "irregular"].includes(kind)) return NextResponse.json({ error: "Choose a supported product type." }, { status: 400 });
    if (!supportedDataUrl(body.scene) || !supportedDataUrl(body.design)) return NextResponse.json({ error: "Add a valid scene and finished design." }, { status: 400 });
    if (body.reference && !supportedDataUrl(body.reference)) return NextResponse.json({ error: "The placement reference could not be read." }, { status: 400 });

    const imageUrls = [body.scene, body.design, ...(body.reference ? [body.reference] : [])];
    const response = await fetch(`https://fal.run/${rendererFor(kind)}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_urls: imageUrls,
        prompt: promptFor(kind, Boolean(body.reference)),
        guidance_scale: 1,
        num_inference_steps: 8,
        acceleration: "regular",
        negative_prompt: "altered text, misspelled words, changed artwork, extra graphics, warped letters, fake logo, changed person, changed background",
        enable_safety_checker: true,
        output_format: "png",
        num_images: 1,
        lora_scale: 1,
      }),
    });
    const result = await response.json() as { images?: Array<{ url?: string; width?: number; height?: number }>; detail?: string; error?: string };
    if (!response.ok) return NextResponse.json({ error: result.detail || result.error || "The product renderer could not finish this mockup." }, { status: 502 });
    const image = result.images?.[0];
    if (!image?.url) return NextResponse.json({ error: "The product renderer returned no finished mockup." }, { status: 502 });
    return NextResponse.json({ image, kind, reference_used: Boolean(body.reference) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The product renderer could not finish this mockup." }, { status: 500 });
  }
}
