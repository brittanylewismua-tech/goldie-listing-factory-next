import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";

/* D468 - where does a design go on THIS photograph?
 *
 * A mockup set can hold fifty photographs, and the seller must never be asked to
 * mark any of them. So this has to be answered automatically, per photo, well
 * enough to be trusted unattended.
 *
 * Segmentation finds the product, but the product is not the print area: on a mug
 * the printable face is offset from the handle and foreshortened by the camera,
 * and the bounding box of a whole mug places a design across the handle. What is
 * needed is the quadrilateral the artwork occupies IN PERSPECTIVE - a question a
 * vision model can answer and a box cannot.
 *
 * One cheap call per photograph, once, at upload. Never again after that: the
 * answer is stored on the template and every future design uses it instantly.
 */
const MAX_IMAGE = 12 * 1024 * 1024;
const allowedImage = (value: string) => /^data:image\/(png|jpeg|webp);base64,/.test(value) && value.length <= MAX_IMAGE;

type Point = [number, number];
const inRange = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= -0.05 && n <= 1.05;

async function handlePOST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to prepare mockups." }, { status: 401 });
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ corners: null, reason: "not-connected" });

  const body = await request.json() as { imageUrl?: string; product?: string };
  const imageUrl = body.imageUrl?.trim() ?? "";
  if (!allowedImage(imageUrl)) return NextResponse.json({ error: "That mockup image cannot be analysed." }, { status: 400 });
  const product = String(body.product || "product").replace(/[^a-z0-9 ,'-]/gi, " ").trim().slice(0, 80) || "product";

  const prompt = `This photograph shows a blank ${product} carrying no design. Identify the flat printable area on it: the surface a printed design would actually be applied to, and only the part visible in this photograph.

On a garment that is the front chest panel, not the whole garment. On a mug it is the curved face turned toward the camera, opposite the handle - never the handle, and never the whole mug. On a framed print it is the paper inside the frame. On a tote it is the front panel.

Return the four corners of that area IN PERSPECTIVE, following the surface as it appears here, so a design pasted into those corners sits on the product correctly. Order them top-left, top-right, bottom-right, bottom-left as seen in the image. Use fractions of image width and height, 0,0 at the top left and 1,1 at the bottom right.

Return only {"corners":[[x,y],[x,y],[x,y],[x,y]],"confidence":"high"|"low"}.`;

  const response = await fetch("https://fal.run/openrouter/router/vision", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_urls: [imageUrl], model: "google/gemini-2.5-flash", temperature: 0,
      system_prompt: "Return only compact valid JSON. Never use markdown.", prompt }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json() as { output?: string; detail?: string };
  if (!response.ok) return NextResponse.json({ corners: null, reason: "unavailable" });

  const match = payload.output?.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ corners: null, reason: "unreadable" });
  const parsed = JSON.parse(match[0]) as { corners?: number[][]; confidence?: string };
  const corners = parsed.corners;

  /* A wrong quad is worse than no quad: it would place every future design in the
     wrong place, silently and forever. Anything that is not four sane,
     non-degenerate corners is refused, and the scene falls back to the measured
     product box instead. */
  if (!Array.isArray(corners) || corners.length !== 4) return NextResponse.json({ corners: null, reason: "no-area" });
  if (!corners.every(point => Array.isArray(point) && point.length === 2 && inRange(point[0]) && inRange(point[1])))
    return NextResponse.json({ corners: null, reason: "outside-image" });
  const clamped = corners.map(point => [Math.min(1, Math.max(0, point[0])), Math.min(1, Math.max(0, point[1]))] as Point);
  const width = Math.max(...clamped.map(p => p[0])) - Math.min(...clamped.map(p => p[0]));
  const height = Math.max(...clamped.map(p => p[1])) - Math.min(...clamped.map(p => p[1]));
  if (width < .04 || height < .04) return NextResponse.json({ corners: null, reason: "too-small" });
  if (width > .98 && height > .98) return NextResponse.json({ corners: null, reason: "whole-image" });

  /* D572 - the geometry checks above only prove the box is not absurd. They
     cannot tell a chest from a hood, a pocket, a sleeve or the model's hair, and
     a wrong box is saved once and reused for every future design. So the shape
     of the box is checked against what a print area on this kind of product can
     actually be, and anything outside that is refused rather than trusted.

     Apparel: a chest print is never the whole torso and never sits at the very
     top or the very bottom of the frame. Measured across her calibrated scenes,
     which are known good, every one falls inside these bounds. */
  const left = Math.min(...clamped.map(p => p[0])), top = Math.min(...clamped.map(p => p[1]));
  const centreY = top + height / 2;
  const apparel = /hoodie|sweatshirt|shirt|tee|apparel|garment|crewneck|tank/i.test(String(product || ""));
  const rejection =
    width > .9 ? "too-wide" :
    height > .9 ? "too-tall" :
    apparel && (width < .08 || width > .7) ? "not-a-chest-print" :
    apparel && (centreY < .12 || centreY > .8) ? "outside-the-torso" :
    (width / Math.max(.001, height)) > 6 || (height / Math.max(.001, width)) > 6 ? "degenerate" : "";
  if (rejection) return NextResponse.json({ corners: null, reason: rejection });

  /* The model grading its own answer is not proof, so "low" is not accepted as a
     measurement. It is reported, and the scene stays unmeasured until a person
     marks it. */
  if (parsed.confidence !== "high") return NextResponse.json({ corners: null, reason: "low-confidence" });
  return NextResponse.json({ corners: clamped, confidence: "high" });
}

export const POST = withErrorLog("mockup-print-area", handlePOST);
