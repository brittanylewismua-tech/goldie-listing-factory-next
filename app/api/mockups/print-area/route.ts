import { printAreaBounds } from "@/app/mockup-compatibility";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { boundedVisionFetch as fetch } from "@/app/paid-vision";

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
  const blocked = await customerLaunchBlock(user);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const key = process.env.FAL_KEY;
  if (!key) return NextResponse.json({ corners: null, reason: "not-connected" });

  const body = await request.json() as { imageUrl?: string; product?: string };
  const imageUrl = body.imageUrl?.trim() ?? "";
  if (!allowedImage(imageUrl)) return NextResponse.json({ error: "That mockup image cannot be analysed." }, { status: 400 });
  const product = String(body.product || "product").replace(/[^a-z0-9 ,'-]/gi, " ").trim().slice(0, 80) || "product";

  const prompt = `This photograph shows a blank ${product} carrying no design. Identify the flat printable area on it: the surface a printed design would actually be applied to, and only the part visible in this photograph.

On a garment, if the person or garment is facing away from the camera this is the BACK panel; otherwise it is the front chest panel. Either way it is the print panel, not the whole garment. On a mug, tumbler or bottle it is the curved face turned toward the camera, opposite the handle - never the handle, and never the whole mug.

On a poster, framed print or canvas it is the printed sheet itself, inside any frame or mount.

On a shower curtain, blanket, throw, tapestry, flag or beach towel the design covers nearly the whole face of the item, so the printable area is the full visible panel, edge to edge - not a small patch in the middle.

On a notebook, journal, phone case, mouse pad, coaster, magnet or puzzle it is the whole printed face of the object.

On a tote, bag or apron it is the front panel. On a pillow or cushion it is the visible printed face.

If the item is folded, draped, hanging or lying at an angle, follow it: give the corners of the printable face as it actually appears, in perspective.

Return the four corners of that area IN PERSPECTIVE, following the surface as it appears here, so a design pasted into those corners sits on the product correctly. Order them top-left, top-right, bottom-right, bottom-left as seen in the image. Use fractions of image width and height, 0,0 at the top left and 1,1 at the bottom right.

Also say which side of the product this photograph shows, so a back print is never placed on a front view: "front", "back", "left-sleeve", "right-sleeve", "wrap" for a mug seen side-on, or "other". Say "front" for a flat item like a framed print or a tote seen from the front.

Also say whether anything in the photograph crosses in front of that printable area - a hood, hair, an arm, a strap, a hand.

Return only {"corners":[[x,y],[x,y],[x,y],[x,y]],"confidence":"high"|"low","side":"front","occluded":true|false}.`;

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
  const parsed = JSON.parse(match[0]) as { corners?: number[][]; confidence?: string; side?: string; occluded?: boolean };
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
  /* D575 - Goldie has to work for posters, mugs, shower curtains and notebooks,
     not only garments. The flat 0.9 ceiling above was a garment rule applied to
     everything, and it would have refused exactly those products: a poster or a
     shower curtain IS printed almost edge to edge, so a print area covering most
     of the photograph is the correct answer there. The bounds come from
     printAreaBounds, beside the family classifier, so there is one rule. */
  const bounds = printAreaBounds(String(product || ""));
  const rejection =
    width < bounds.minWidth || width > bounds.maxWidth ? "wrong-width-for-this-product" :
    height < bounds.minHeight || height > bounds.maxHeight ? "wrong-height-for-this-product" :
    centreY < bounds.minCentreY || centreY > bounds.maxCentreY ? "not-on-the-product" :
    (width / Math.max(.001, height)) > bounds.maxRatio || (height / Math.max(.001, width)) > bounds.maxRatio ? "degenerate" : "";
  if (rejection) return NextResponse.json({ corners: null, reason: rejection });

  /* The model grading its own answer is not proof, so "low" is not accepted as a
     measurement. It is reported, and the scene stays unmeasured until a person
     marks it. */
  if (parsed.confidence !== "high") return NextResponse.json({ corners: null, reason: "low-confidence" });
  /* D575 - the side travels with the box. Without it every uploaded scene
     defaulted to "front", so a seller's back-view photographs were silently never
     offered for a back print: no wrong mockup, but no mockup either. */
  const sides = new Set(["front", "back", "left-sleeve", "right-sleeve", "wrap", "other"]);
  const side = sides.has(String(parsed.side)) ? String(parsed.side) : "front";
  return NextResponse.json({ corners: clamped, confidence: "high", side, occluded: Boolean(parsed.occluded) });
}

export const POST = withErrorLog("mockup-print-area", handlePOST);
