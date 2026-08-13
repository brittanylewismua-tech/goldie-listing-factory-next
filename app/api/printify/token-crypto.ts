function keyBytes(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Secure token storage is not configured correctly.");
  return Uint8Array.from(secret.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

async function encryptionKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey("raw", keyBytes(secret), "AES-GCM", false, usage);
}

export async function encryptPrintifyToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret, ["encrypt"]), new TextEncoder().encode(token)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

export async function decryptPrintifyToken(value: string, secret: string) {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("The saved Printify connection is invalid.");
  try {
    const iv = Uint8Array.from(atob(parts[0]), (character) => character.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(parts[1]), (character) => character.charCodeAt(0));
    if (iv.length !== 12 || encrypted.length < 17) throw new Error("invalid encrypted token");
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(secret, ["decrypt"]), encrypted);
    return new TextDecoder().decode(clear);
  } catch {
    throw new Error("The saved Printify connection could not be decrypted safely.");
  }
}
