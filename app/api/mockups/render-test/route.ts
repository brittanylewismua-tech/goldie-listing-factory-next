import { NextRequest, NextResponse } from "next/server";
import { rendererFor, rendererInput, type ProductKind } from "@/app/mockups/product-renderers";

const MAX_DATA_URL_LENGTH = 18 * 1024 * 1024;
const supportedDataUrl = (value: unknown): value is string => typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(value) && value.length <= MAX_DATA_URL_LENGTH;

function equalSecret(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function POST(request: NextRequest) {
  try {
    const expected = process.env.MOCKUP_RENDER_TEST_SECRET ?? "";
    const supplied = request.headers.get("x-goldie-render-test") ?? "";
    if (!expected || !equalSecret(supplied, expected)) return NextResponse.json({ error: "Not available." }, { status: 404 });
    const key = process.env.FAL_KEY;
    if (!key) return NextResponse.json({ error: "Product rendering is not connected." }, { status: 503 });
    const body = await request.json() as { kind?: ProductKind; scene?: string; design?: string; reference?: string };
    const kind = body.kind;
    if (!kind || !["apparel", "soft-goods", "curved", "irregular"].includes(kind)) return NextResponse.json({ error: "Choose a supported product type." }, { status: 400 });
    if (!supportedDataUrl(body.scene) || !supportedDataUrl(body.design)) return NextResponse.json({ error: "Add a valid scene and finished design." }, { status: 400 });
    if (body.reference && !supportedDataUrl(body.reference)) return NextResponse.json({ error: "The placement reference could not be read." }, { status: 400 });
    const response = await fetch(`https://fal.run/${rendererFor(kind)}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(rendererInput(kind,[body.scene,body.design,...(body.reference?[body.reference]:[])])),
    });
    const result = await response.json() as { images?:Array<{url?:string;width?:number;height?:number}>;detail?:string;error?:string };
    if (!response.ok) return NextResponse.json({ error:result.detail||result.error||"The product renderer could not finish this mockup." },{status:502});
    const image=result.images?.[0]; if(!image?.url)return NextResponse.json({error:"The product renderer returned no finished mockup."},{status:502});
    return NextResponse.json({image,kind,reference_used:Boolean(body.reference)});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"The product renderer could not finish this mockup."},{status:500});
  }
}
