/**
 * FETCHING AN IMAGE SOMEBODY ELSE IS HOSTING.
 *
 * The listing-photo delivery path already did this properly — protocol, host,
 * a redirect loop that re-validates every hop, a timeout, an expected content
 * type, and a streaming size cap that aborts mid-download rather than
 * buffering something enormous first. Seventeen other fetches of
 * provider-supplied URLs did none of it.
 *
 * None of them were member-controlled, which is why this is hardening rather
 * than a breach: the URLs come from Etsy and Printify API responses. But
 * "the provider would not do that" is a fact about the provider, not a
 * property of this code, and a provider response is exactly the kind of thing
 * that gets compromised or mistaken.
 *
 * The host list is two names, both published and stable, and both already
 * carrying production traffic on the delivery path — so this is not a brittle
 * CDN list invented here. An unknown host is refused rather than silently
 * fetched, because a silent fallback would make the allowlist decorative.
 */
export const IMAGE_HOSTS = {
  printify: ["images.printify.com"],
  etsy: ["i.etsystatic.com"],
  any: ["images.printify.com", "i.etsystatic.com"],
} as const;

export type ImageHost = keyof typeof IMAGE_HOSTS | "same-host";

/*
  "same-host" is for provider URLs whose hostname we cannot pin.

  Printify serves print artwork from storage hosts that are not the published
  image CDN, and inventing a list of them would break artwork capture the
  first time one changed — the brittle-allowlist failure. So instead of
  guessing WHICH host, this pins the one property that actually matters for a
  redirect chain: it must not leave the host it started on.

  That still refuses http, credentials in the URL, and a redirect to anywhere
  else, which is the part a compromised or mistaken provider response would
  use. It does not pretend to be the stronger check.
*/

export class UntrustedImageUrl extends Error {}

/*
  Its own type because "too large" and "could not be read" are different
  facts, and a caller that reports them identically loses the one the member
  can act on. A provenance record saying "unreachable" about a 60MB file
  would send somebody looking at their network.
*/
export class ImageTooLarge extends UntrustedImageUrl {
  /* Declared and assigned rather than a parameter property: the test runner
     strips types rather than compiling them, and a parameter property is
     syntax it cannot strip. */
  bytes: number;
  constructor(bytes: number) {
    super(`That image is larger than we read (${bytes} bytes).`);
    this.bytes = bytes;
  }
}

/** https only, a known host, and no credentials smuggled into the URL. */
export function trustedImageUrl(
  value: string, host: ImageHost = "any", mustMatch?: string,
): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new UntrustedImageUrl("That image address could not be read."); }
  if (url.protocol !== "https:")
    throw new UntrustedImageUrl("Images are only read over https.");
  /* user:pass@host would send credentials we never intended to send. */
  if (url.username || url.password)
    throw new UntrustedImageUrl("That image address carries credentials.");
  if (host === "same-host") {
    if (mustMatch && url.hostname !== mustMatch)
      throw new UntrustedImageUrl("That image redirected to another host.");
    return url.toString();
  }
  if (!(IMAGE_HOSTS[host] as readonly string[]).includes(url.hostname))
    throw new UntrustedImageUrl("That image is not hosted where it should be.");
  return url.toString();
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Read the body with a ceiling, aborting the stream rather than buffering
 * first. A response that lies about its length cannot spend our memory.
 */
export async function limitedImageBody(
  response: Response, maxBytes = 20 * 1024 * 1024,
): Promise<{ bytes: Uint8Array; type: string }> {
  const type = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED_TYPES.includes(type))
    throw new UntrustedImageUrl(`That file is not an image we read (${type || "unknown"}).`);
  if (!response.body) throw new UntrustedImageUrl("That image was empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageTooLarge(size);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return { bytes, type };
}

/**
 * The whole thing: validate, follow redirects by hand re-validating each one,
 * and read the body with a ceiling.
 *
 * Redirects are followed manually because `redirect: "follow"` would let the
 * first response send us anywhere — the allowlist would only ever have
 * checked the address we already trusted.
 */
export async function fetchTrustedImage(
  src: string,
  { host = "any" as ImageHost, maxBytes = 20 * 1024 * 1024,
    timeoutMs = 20_000, maxRedirects = 3 } = {},
): Promise<{ bytes: Uint8Array; type: string }> {
  let current = trustedImageUrl(src, host);
  const origin = new URL(current).hostname;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetch(current, {
      signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      if (hop === maxRedirects)
        throw new UntrustedImageUrl("That image redirected too many times.");
      current = trustedImageUrl(
        new URL(location, current).toString(), host,
        host === "same-host" ? origin : undefined);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new UntrustedImageUrl(`That image could not be read (${response.status}).`);
    }
    return limitedImageBody(response, maxBytes);
  }
  throw new UntrustedImageUrl("That image redirected too many times.");
}
