/**
 * WHAT A FILE IS, RATHER THAN WHAT IT SAYS IT IS.
 *
 * Every upload path here checked `file.type` — the MIME the BROWSER declared.
 * A member can set that to anything; it is a label on the envelope, not the
 * contents. One path checked nothing at all and wrote whatever arrived as
 * image/png.
 *
 * So this reads the first bytes, which is the only claim the file makes about
 * itself that the sender cannot simply rewrite, and then reads the width and
 * height out of the header — because a 40KB PNG can declare 50,000 x 50,000
 * and only becomes dangerous when something tries to decode it. A size cap in
 * bytes does not catch that; a pixel cap does.
 */
import { imageDimensions } from "./mockups/product-mask.ts";

export type SniffedType =
  | "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  | "image/svg+xml" | null;

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) =>
  signature.every((byte, index) => bytes[at + index] === byte);

/** The type a file actually is, from its first bytes. */
export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  /*
    SVG is XML, so it has no signature — and it is the one image format that
    can carry script. It is detected here only so it can be REFUSED by name
    rather than falling through as "unrecognised", which would make the
    refusal accidental.
  */
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "image/svg+xml";
  return null;
}

/*
  Dimensions come from the parser already in app/mockups/product-mask.ts,
  which the mockup pipeline has been using. Writing a second one here would
  mean two readers that could disagree about the same file — and the one that
  disagreed would be the one deciding whether to accept it.

  It is given the SNIFFED type, never the declared one, so its content-type
  hint cannot be steered by the uploader.
*/
export { imageDimensions as readDimensions } from "./mockups/product-mask.ts";

export class UploadRefused extends Error {}

export const UPLOAD_LIMITS = {
  /* A 40KB file can claim 50,000 x 50,000 — 2.5 billion pixels, which is
     10GB decoded. The byte cap never sees it. */
  maxPixels: 50_000_000,
  maxEdge: 20_000,
};

/**
 * Decide whether to keep a file, BEFORE it reaches storage or a provider.
 *
 * Returns the type the file actually is, which is what should be recorded —
 * storing the declared type would preserve the lie.
 */
export function checkImageUpload(
  bytes: Uint8Array,
  { allow = ["image/png", "image/jpeg", "image/webp"] as SniffedType[],
    maxBytes = 20 * 1024 * 1024,
    maxPixels = UPLOAD_LIMITS.maxPixels,
    maxEdge = UPLOAD_LIMITS.maxEdge } = {},
): { type: Exclude<SniffedType, null>; width: number; height: number } {
  if (!bytes.length) throw new UploadRefused("That file is empty.");
  if (bytes.length > maxBytes)
    throw new UploadRefused(`That file is larger than ${Math.round(maxBytes / 1_048_576)} MB.`);

  const type = sniffImageType(bytes);
  if (type === "image/svg+xml")
    throw new UploadRefused("SVG files are not accepted. Save it as a PNG or JPG.");
  if (!type)
    throw new UploadRefused("That file is not an image we recognise.");
  if (!allow.includes(type))
    throw new UploadRefused(`That is a ${type.replace("image/", "").toUpperCase()} file. Choose PNG, JPG or WEBP.`);

  const size = imageDimensions(bytes, type);
  if (!size || !size.width || !size.height)
    throw new UploadRefused("That image is damaged or incomplete.");
  if (size.width > maxEdge || size.height > maxEdge)
    throw new UploadRefused(`That image is ${size.width}x${size.height}. Each side must be under ${maxEdge} pixels.`);
  if (size.width * size.height > maxPixels)
    throw new UploadRefused(`That image is ${size.width}x${size.height}, which is too many pixels to process.`);

  return { type, width: size.width, height: size.height };
}

/**
 * An image the member sent inline, as a data: URL.
 *
 * The design scanner forwards this value to the vision provider as an image
 * URL. Checking only that it is present means any *other* kind of URL is
 * forwarded too, and the provider — not this worker — performs the fetch.
 * That puts a member-controlled address in front of a fetcher on the far side
 * of our own SSRF guard, and returns whatever comes back as analysis.
 *
 * So the scheme is required to be `data:`, and the bytes inside are held to
 * the same standard as an uploaded file.
 */
export function decodeImageDataUrl(
  value: string, options?: Parameters<typeof checkImageUpload>[1],
): { bytes: Uint8Array; type: string; width: number; height: number } {
  if (!/^data:image\/[a-z+]+;base64,/i.test(value.slice(0, 64)))
    throw new UploadRefused("Send the design as an uploaded image.");

  let bytes: Uint8Array;
  try {
    const encoded = value.slice(value.indexOf(",") + 1);
    const binary = atob(encoded);
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { throw new UploadRefused("That image could not be read."); }

  const checked = checkImageUpload(bytes, options);
  return { bytes, ...checked };
}
