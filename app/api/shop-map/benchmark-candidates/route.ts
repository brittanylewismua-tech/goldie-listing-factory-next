import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";
import { decodeTinyPng, fingerprint, plausibility, type Fingerprint } from "@/app/artwork-fingerprint";

/**
 * NARROWING, NOT DECIDING.
 *
 * Thirty-three captured print files against every current listing image in the
 * shop is a few thousand possible pairs, and looking at all of them with a
 * vision model would cost real money to mostly confirm that a hoodie is not a
 * mug. This ranks them on free deterministic signals so the paid pass only
 * looks at what is worth looking at.
 *
 * NOTHING IS REJECTED HERE. A print file on transparency and a photograph of
 * a garment under a light disagree on almost every cheap measure, so a weak
 * score means "not first in the queue", never "the artwork is absent". Every
 * artwork keeps its best candidates whatever they scored.
 *
 * TECHNICAL VALIDATION ONLY. Nothing this produces is a sales relationship,
 * and nothing is written to artwork_provenance.
 */
const IMAGE_SIZE = 32;

export const GET = withErrorLog("shop-map-benchmark-candidates", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const keepPerArtwork = Math.min(8, Math.max(1, Number(parameters.get("keep")) || 3));
  const maxListings = Math.min(200, Math.max(1, Number(parameters.get("listings")) || 60));

  const db = (env as unknown as { DB: D1Database }).DB;
  const bucket = (env as unknown as { ARTWORK: R2Bucket }).ARTWORK;
  const images = (env as unknown as { IMAGES: ImagesBinding }).IMAGES;
  const connection = await etsyConnection(user.userId);

  /* Shrink anything to a fixed tiny square so two very different pictures can
     be compared at all. Cloudflare does the decoding; we only read pixels. */
  const shrink = async (bytes: ArrayBuffer): Promise<{ print: Fingerprint } | { failed: string }> => {
    let small: ArrayBuffer;
    try {
      const response = await images
        .input(new Blob([bytes]).stream())
        .transform({ width: IMAGE_SIZE, height: IMAGE_SIZE, fit: "contain", background: "#ffffff" })
        .output({ format: "image/png" });
      small = await new Response(response.image()).arrayBuffer();
    } catch (error) {
      return { failed: `resize failed: ${error instanceof Error ? error.message : "unknown"}` };
    }
    const decoded = await decodeTinyPng(small);
    /* The exact reason, never a generic decode failure. */
    if (!decoded.ok) return { failed: decoded.reason };
    return { print: fingerprint(decoded.image) };
  };

  /* ------------------------------------------------ the captured artworks */
  const captured = await db.prepare(
    `SELECT DISTINCT artwork_hash, artwork_key, printify_product_id
       FROM artwork_provenance WHERE user_id = ? AND artwork_key <> ''`)
    .bind(user.userId)
    .all<{ artwork_hash: string; artwork_key: string; printify_product_id: string }>();
  const artworkRows = captured.results ?? [];

  const artworks: Array<{ hash: string; productId: string; print: Fingerprint }> = [];
  const artworkFailures: string[] = [];
  for (const row of artworkRows) {
    const object = await bucket.get(row.artwork_key);
    if (!object) { artworkFailures.push(`${row.artwork_hash}: not in storage`); continue; }
    const result = await shrink(await object.arrayBuffer());
    if ("failed" in result) { artworkFailures.push(`${row.artwork_hash}: ${result.failed}`); continue; }
    artworks.push({ hash: row.artwork_hash, productId: row.printify_product_id, print: result.print });
  }

  /* ------------------------------------------- current listings and images */
  const etsy = async (path: string) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      headers: { "x-api-key": etsyApiCredential(), authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(20_000),
    });
    await recordEtsyCall(response, "qa");
    return response.ok ? await response.json() as unknown : null;
  };

  type Listing = { listing_id?: number; title?: string; taxonomy_id?: number };
  const listings: Listing[] = [];
  for (let offset = 0; offset < maxListings; offset += 100) {
    const page = await etsy(
      `/shops/${connection.shopId}/listings/active?limit=100&offset=${offset}`) as
      { results?: Listing[] } | null;
    if (!page?.results?.length) break;
    listings.push(...page.results);
    if (page.results.length < 100) break;
  }

  const mockups: Array<{
    listingId: number; title: string; imageId: number; look: Fingerprint;
  }> = [];
  let imagesSeen = 0;
  const mockupFailures: string[] = [];
  for (const listing of listings.slice(0, maxListings)) {
    const listingId = Number(listing.listing_id ?? 0);
    if (!listingId) continue;
    const page = await etsy(`/listings/${listingId}/images`) as
      { results?: Array<{ listing_image_id?: number; url_570xN?: string }> } | null;
    /* The primary image only. A listing's other photos are the same design
       from other angles, and they multiply the comparison count without
       adding a new design to find. */
    const primary = (page?.results ?? [])[0];
    if (!primary?.url_570xN) continue;
    imagesSeen += 1;
    const bytes = await fetch(primary.url_570xN).then(response => response.arrayBuffer()).catch(() => null);
    if (!bytes) { mockupFailures.push(`${listingId}: image unreachable`); continue; }
    const looked = await shrink(bytes);
    if ("failed" in looked) { mockupFailures.push(`${listingId}: ${looked.failed}`); continue; }
    const look = looked.print;
    mockups.push({
      listingId, title: String(listing.title ?? ""),
      imageId: Number(primary.listing_image_id ?? 0), look,
    });
  }

  /* ------------------------------------------------------------- ranking */
  const ranked = artworks.map(artwork => {
    const scored = mockups.map(mockup => {
      const measure = plausibility(artwork.print, mockup.look);
      return {
        listingId: mockup.listingId,
        listingImageId: mockup.imageId,
        title: mockup.title.slice(0, 70),
        ...measure,
      };
    }).sort((left, right) => right.score - left.score);

    return {
      artworkHash: artwork.hash,
      printifyProductId: artwork.productId,
      /* Kept whatever they scored: a weak best candidate is still this
         artwork's best candidate, and discarding it would be the permanent
         rejection this pass is forbidden to make. */
      candidates: scored.slice(0, keepPerArtwork),
      bestScore: scored[0]?.score ?? null,
    };
  });

  const scores = ranked.map(row => row.bestScore ?? 0).sort((a, b) => b - a);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
  /* "Plausible" is relative to this run, not an absolute threshold nobody can
     justify — and it only decides queue order. */
  const plausible = ranked.filter(row => (row.bestScore ?? 0) >= median);

  return NextResponse.json({
    datasets: {
      capturedArtworks: artworkRows.length,
      artworksFingerprinted: artworks.length,
      currentListingsSearched: listings.length,
      listingImagesFingerprinted: mockups.length,
      listingImagesSeen: imagesSeen,
    },
    comparisons: {
      possiblePairs: artworks.length * mockups.length,
      keptPerArtwork: keepPerArtwork,
      visionComparisonsRemaining: ranked.length * keepPerArtwork,
    },
    signals: {
      used: ["dHash structure", "aHash tone", "coarse palette", "edge density", "ink share"],
      /* Named so a weak result can be attributed rather than guessed at. */
      notUsedYet: ["ORB features", "print-region crops", "title hints", "product type"],
    },
    scoreSpread: {
      best: scores[0] ?? null,
      median,
      worst: scores[scores.length - 1] ?? null,
      artworksAtOrAboveMedian: plausible.length,
    },
    artworksWithNoCandidate: ranked.filter(row => !row.candidates.length).length,
    failures: { artwork: artworkFailures.slice(0, 5), mockup: mockupFailures.slice(0, 5) },
    ranked: ranked.slice(0, 40),
    reminder: "Ranking only. No pair here is a relationship, and nothing was written.",
  });
});
