import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerLaunchBlock } from "@/app/customer-launch-gate";

type ArtworkBucket = {
  put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
};

function bucket() { return (env as unknown as { ARTWORK?: ArtworkBucket }).ARTWORK; }

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const launchBlock = await customerLaunchBlock(user);
  if (launchBlock) return NextResponse.json({ error: launchBlock }, { status: 503 });
  const artwork = bucket();
  if (!artwork) return NextResponse.json({ error: "Secure artwork delivery is unavailable." }, { status: 503 });
  const fileName = new URL(request.url).searchParams.get("fileName")?.slice(0, 240) || "design.png";
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  if (!/^image\/(png|jpeg)$/i.test(contentType)) return NextResponse.json({ error: "Choose a valid PNG or JPG file." }, { status: 400 });
  const stagedId = `${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await artwork.put(stagedId, request.body ?? await request.arrayBuffer(), {
    httpMetadata: { contentType },
    customMetadata: { owner: user.userId, expires: String(Date.now() + 15 * 60 * 1000) },
  });
  return NextResponse.json({ stagedId });
}
