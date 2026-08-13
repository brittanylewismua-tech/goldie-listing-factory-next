import { env } from "cloudflare:workers";
import { verifyArtworkSignature } from "../../staged-url";

type ArtworkObject = { body: ReadableStream; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
type ArtworkBucket = { get(key: string): Promise<ArtworkObject | null>; delete(key: string): Promise<void> };
function runtimeEnv() { return env as unknown as { ARTWORK?: ArtworkBucket; PRINTIFY_TOKEN_KEY?: string }; }

async function validSignature(id: string, expires: string, signature: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  return Boolean(secret) && verifyArtworkSignature(id, expires, signature, secret!);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  if (!await validSignature(id, query.get("expires") ?? "", query.get("signature") ?? "")) return new Response("Not found", { status: 404 });
  const artwork = runtimeEnv().ARTWORK;
  const object = await artwork?.get(id);
  if (!object) return new Response("Not found", { status: 404 });
  if (Number(object.customMetadata?.expires ?? 0) < Date.now()) {
    await artwork?.delete(id);
    return new Response("Not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
