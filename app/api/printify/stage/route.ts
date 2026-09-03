import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";
import { recordDiagnostic, startDiagnostic } from "../diagnostics";

type ArtworkBucket = {
  put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  list(options?: { prefix?: string; limit?: number; include?: string[] }): Promise<{ objects: Array<{ key: string; customMetadata?: Record<string, string> }> }>;
  delete(key: string): Promise<void>;
};

function runtimeEnv() { return env as unknown as { ARTWORK?: ArtworkBucket; DB?: D1Database }; }

function imageType(fileName: string, supplied: string) {
  if (/image\/png/i.test(supplied) || /\.png$/i.test(fileName)) return "image/png";
  if (/image\/jpeg/i.test(supplied) || /\.jpe?g$/i.test(fileName)) return "image/jpeg";
  return "";
}

async function validateImageHeader(stream: ReadableStream, contentType: string) {
  const reader = stream.getReader();
  const header: number[] = [];
  const chunks: Uint8Array[] = [];
  while (header.length < 16) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    header.push(...next.value.slice(0, 16 - header.length));
  }
  const bytes = Uint8Array.from(header);
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((contentType === "image/png" && !png) || (contentType === "image/jpeg" && !jpeg)) {
    await reader.cancel();
    throw new Error("The file contents do not match a valid PNG or JPG image.");
  }
  /* Return the bytes already inspected followed by the untouched remainder.
     `ReadableStream.tee()` let the storage branch buffer a full 20–100 MB PNG
     while the validation branch read only sixteen bytes, needlessly doubling
     memory at the worker boundary.  A single reconstructed stream validates
     the same header without copying the upload. */
  let index=0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if(index<chunks.length){controller.enqueue(chunks[index++]);return;}
      const next=await reader.read();
      if(next.done)controller.close();else controller.enqueue(next.value);
    },
    cancel(reason){return reader.cancel(reason);},
  });
}

async function removeExpiredArtwork(bucket: ArtworkBucket) {
  try {
    const listed = await bucket.list({ prefix: "stage_", limit: 100, include: ["customMetadata"] });
    const now = Date.now();
    await Promise.all(listed.objects.filter((item) => Number(item.customMetadata?.expires ?? 0) < now).map((item) => bucket.delete(item.key)));
  } catch { /* Cleanup is opportunistic and must not interrupt a new upload. */ }
}

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
  const contentType = imageType(fileName, request.headers.get("content-type") || "");
  if (!contentType) return NextResponse.json({ error: "Choose a valid PNG or JPG file." }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) return NextResponse.json({ error: "This image is larger than Printify can receive." }, { status: 413 });
  const expires = Date.now() + 30 * 60 * 1000;
  const stagedId = `stage_${expires}_${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    if (!request.body) throw new Error("The uploaded file was empty.");
    const storageStream = await validateImageHeader(request.body, contentType);
    await removeExpiredArtwork(artwork);
    await artwork.put(stagedId, storageStream, {
      httpMetadata: { contentType },
      customMetadata: { owner: user.userId, expires: String(expires), fileName },
    });
    await recordDiagnostic(runtimeEnv().DB, reference, { stage: "artwork_staging", event: "succeeded" });
    return NextResponse.json({ stagedId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artwork staging failed.";
    await recordDiagnostic(runtimeEnv().DB, reference, { stage: "artwork_staging", event: "failed", message });
    const invalidFile = /file contents do not match|uploaded file was empty/i.test(message);
    return NextResponse.json({ error: `${invalidFile ? message : "The design could not be staged."} Support reference: ${reference}.` }, { status: invalidFile ? 400 : 500 });
  }
}
