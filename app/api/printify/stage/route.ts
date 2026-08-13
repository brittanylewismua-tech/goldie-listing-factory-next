import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { recordDiagnostic, startDiagnostic } from "../diagnostics";

type ArtworkBucket = {
  put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
};

function runtimeEnv() { return env as unknown as { ARTWORK?: ArtworkBucket; DB?: D1Database }; }

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  const artwork = runtimeEnv().ARTWORK;
  if (!artwork) return NextResponse.json({ error: "Secure artwork delivery is unavailable." }, { status: 503 });
  const fileName = new URL(request.url).searchParams.get("fileName")?.slice(0, 240) || "design.png";
  const reference = new URL(request.url).searchParams.get("reference")?.replace(/[^A-Z0-9-]/gi, "").slice(0, 40) || "";
  await startDiagnostic(runtimeEnv().DB, { reference, userId: user.userId, userEmail: user.email, fileName });
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  if (!/^image\/(png|jpeg)$/i.test(contentType)) return NextResponse.json({ error: "Choose a valid PNG or JPG file." }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) return NextResponse.json({ error: "This image is larger than Printify can receive." }, { status: 413 });
  const stagedId = `${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    await artwork.put(stagedId, request.body ?? await request.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: { owner: user.userId, expires: String(Date.now() + 30 * 60 * 1000) },
    });
    await recordDiagnostic(runtimeEnv().DB, reference, { stage: "artwork_staging", event: "succeeded" });
    return NextResponse.json({ stagedId });
  } catch (error) {
    await recordDiagnostic(runtimeEnv().DB, reference, { stage: "artwork_staging", event: "failed", message: error instanceof Error ? error.message : "Artwork staging failed." });
    return NextResponse.json({ error: `The design could not be staged. Support reference: ${reference}.` }, { status: 500 });
  }
}
