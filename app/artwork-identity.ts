/**
 * ONE ARTWORK, ONE IDENTITY.
 *
 * Design intelligence is cached per member per artwork, so the artwork's
 * identity IS the cache key — and two pieces of code computing it differently
 * means one design analysed and paid for twice.
 *
 * That is exactly what happened. The member route hashed the image bytes; the
 * canary measurement route used the hash the artwork-capture pipeline had
 * stored in `artwork_provenance`. Both were reasonable, neither was wrong, and
 * together they meant a design already understood by one path looked unknown
 * to the other. Measured: a "cold" run that made no call, because the warm
 * entry was sitting under the other key.
 *
 * The bytes are the artwork. A provenance row is a record ABOUT the artwork
 * and can exist in more than one form for the same image, so the content hash
 * is the one that cannot disagree with itself.
 *
 * The version prefix is what allows this to ever change again without silently
 * reusing entries computed a different way.
 */
export const ARTWORK_HASH_VERSION = 1;

export async function artworkHashOfBytes(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view as unknown as BufferSource);
  return `a${ARTWORK_HASH_VERSION}-` + [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The same identity, from the data URL the interface actually sends. */
export async function artworkHashOfDataUrl(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  return artworkHashOfBytes(bytes);
}
