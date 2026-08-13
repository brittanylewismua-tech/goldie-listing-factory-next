function keyBytes(secret: string) {
  const bytes = Uint8Array.from(secret.match(/.{1,2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (bytes.length !== 32) throw new Error("Secure artwork delivery is not configured correctly.");
  return bytes;
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string, usage: KeyUsage[]) {
  const derived = await crypto.subtle.digest("SHA-256", new Uint8Array([...new TextEncoder().encode("goldie-artwork-url-v1:"), ...keyBytes(secret)]));
  return crypto.subtle.importKey("raw", derived, { name:"HMAC", hash:"SHA-256" }, false, usage);
}

export async function signedArtworkUrl(origin: string, id: string, secret: string, lifetimeSeconds = 20 * 60) {
  const expires = String(Math.floor(Date.now() / 1000) + lifetimeSeconds);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), new TextEncoder().encode(`${id}.${expires}`)));
  const url = new URL(`/api/printify/staged/${encodeURIComponent(id)}`, origin);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", base64Url(signature));
  return url.toString();
}

export async function verifyArtworkSignature(id: string, expires: string, signature: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!/^\d+$/.test(expires) || Number(expires) < nowSeconds || Number(expires) > nowSeconds + 30 * 60) return false;
  try {
    return crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), decodeBase64Url(signature), new TextEncoder().encode(`${id}.${expires}`));
  } catch { return false; }
}
