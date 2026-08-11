import { env } from "cloudflare:workers";

type ArtworkObject = { body: ReadableStream; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
type ArtworkBucket = { get(key: string): Promise<ArtworkObject | null>; delete(key: string): Promise<void> };
function runtimeEnv() { return env as unknown as { ARTWORK?: ArtworkBucket; PRINTIFY_TOKEN_KEY?: string }; }

function decodeSignature(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function validSignature(id: string, expires: string, signature: string) {
  const secret = runtimeEnv().PRINTIFY_TOKEN_KEY;
  if (!secret || !/^\d+$/.test(expires) || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const keyBytes = Uint8Array.from(secret.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, decodeSignature(signature), new TextEncoder().encode(`${id}.${expires}`));
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
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store" },
  });
}
