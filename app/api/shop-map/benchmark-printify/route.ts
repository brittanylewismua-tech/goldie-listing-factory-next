import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { decodeTinyPng } from "@/app/artwork-fingerprint";
import { printRegion, compareRegions, type Region } from "@/app/artwork-region";

/**
 * A BENCHMARK WITH A KNOWN ANSWER.
 *
 * The previous pass compared captured print files against Etsy listing images
 * and had no way to say whether any given pair was right, so its output could
 * only be ranked, never scored. This pairs each captured print file with the
 * mockups of the Printify product it was captured from. Those pairs are
 * correct by construction — same product id, same print file, same mockup
 * renderer — so no visual guessing and no Etsy linkage is involved, and every
 * number below is measured against a ground truth rather than assumed.
 *
 * Negatives are mockups of other products. Easy negatives are a different
 * blueprint entirely; hard negatives are the same blueprint, which means the
 * same blank garment in the same studio setup, differing only in the design.
 * A method that cannot separate hard negatives is measuring the garment.
 *
 * TECHNICAL VALIDATION ONLY. Nothing here is a sales relationship, nothing is
 * written, and no member other than the caller is read.
 */

/* D1415, kept exactly as measured. The point of this route is the comparison,
   and a baseline that moves when the method changes is not a baseline. */
const FAILED_BASELINE = {
  pass: "D1415 whole-image fingerprint against Etsy listing images",
  artworksFingerprinted: "20 of 33",
  mockupsFingerprinted: "50 of 60",
  scoreBest: 0.743,
  scoreMedian: 0.721,
  scoreWorst: 0.664,
  spread: 0.079,
  verdict: "Identical candidate lists in identical order. Measured the garment, not the design.",
};

const DECODE_SIZE = 128;
const REGION_SIZE = 48;

type Mockup = {
  productId: string; blueprintId: number; position: string;
  src: string; region: Region;
};

export const GET = withErrorLog("shop-map-benchmark-printify", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;
  const shopId = Number(parameters.get("printify")) || 1374648;
  const maxProducts = Math.min(40, Math.max(1, Number(parameters.get("products")) || 20));
  const maxMockups = Math.min(6, Math.max(1, Number(parameters.get("mockups")) || 3));

  const db = (env as unknown as { DB: D1Database }).DB;
  const bucket = (env as unknown as { ARTWORK: R2Bucket }).ARTWORK;
  const images = (env as unknown as { IMAGES: ImagesBinding }).IMAGES;

  const stored = await db
    .prepare(`SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!stored) return NextResponse.json({ error: "No Printify connection." }, { status: 400 });
  const token = await decryptPrintifyToken(
    stored.encrypted_token, (env as unknown as { PRINTIFY_TOKEN_KEY: string }).PRINTIFY_TOKEN_KEY);

  const decodeFailures: Array<{ what: string; reason: string }> = [];

  /*
    Normalisation. Every derived copy becomes an 8-bit sRGB PNG of a fixed
    size before anything reads a pixel, so palette, 16-bit, greyscale and
    alpha images all reach the comparison in the same form.

    THE ORIGINAL BYTES IN R2 ARE NEVER TOUCHED. This is a separate analysis
    copy, held in memory for the length of one request and reproducible from
    the original at any time.
  */
  const normalise = async (bytes: ArrayBuffer, what: string): Promise<Region | null> => {
    let small: ArrayBuffer;
    try {
      const response = await images
        .input(new Blob([bytes]).stream())
        .transform({ width: DECODE_SIZE, height: DECODE_SIZE, fit: "contain", background: "#ffffff" })
        .output({ format: "image/png" });
      small = await new Response(response.image()).arrayBuffer();
    } catch (error) {
      decodeFailures.push({ what, reason: `resize failed: ${error instanceof Error ? error.message : "unknown"}` });
      return null;
    }
    const decoded = await decodeTinyPng(small);
    if (!decoded.ok) { decodeFailures.push({ what, reason: decoded.reason }); return null; }
    return printRegion(decoded.image, { size: REGION_SIZE });
  };

  /* ------------------------------------------------------- captured prints */
  const captured = await db.prepare(
    `SELECT artwork_hash, artwork_key, printify_product_id
       FROM artwork_provenance
      WHERE user_id = ? AND artwork_key <> ''
      GROUP BY artwork_hash
      LIMIT ?`)
    .bind(user.userId, maxProducts)
    .all<{ artwork_hash: string; artwork_key: string; printify_product_id: string }>();
  const rows = captured.results ?? [];

  const designs: Array<{ hash: string; productId: string; region: Region }> = [];
  let artworksMissing = 0;
  for (const row of rows) {
    const object = await bucket.get(row.artwork_key);
    if (!object) { artworksMissing += 1; continue; }
    const region = await normalise(await object.arrayBuffer(), `artwork ${row.artwork_hash.slice(0, 12)}`);
    if (region) designs.push({ hash: row.artwork_hash, productId: row.printify_product_id, region });
  }

  /* ------------------------------------- the mockups of those same products */
  const mockups: Mockup[] = [];
  const productTypes = new Map<string, number>();
  let productsUnavailable = 0;
  for (const design of designs) {
    const response = await fetch(
      `https://api.printify.com/v1/shops/${shopId}/products/${design.productId}.json`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" },
        signal: AbortSignal.timeout(20_000) });
    if (!response.ok) { productsUnavailable += 1; continue; }
    const product = await response.json() as {
      blueprint_id?: number;
      images?: Array<{ src?: string; position?: string; is_default?: boolean }>;
    };
    const blueprintId = Number(product.blueprint_id ?? 0);
    productTypes.set(design.productId, blueprintId);
    for (const image of (product.images ?? []).slice(0, maxMockups)) {
      if (!image.src) continue;
      const bytes = await fetch(image.src, { signal: AbortSignal.timeout(30_000) })
        .then(reply => reply.ok ? reply.arrayBuffer() : null).catch(() => null);
      if (!bytes) { decodeFailures.push({ what: `mockup ${image.src}`, reason: "unreachable" }); continue; }
      const region = await normalise(bytes, `mockup ${design.productId} ${image.position ?? ""}`);
      if (region) mockups.push({
        productId: design.productId, blueprintId,
        position: String(image.position ?? "unknown"), src: image.src, region });
    }
  }

  /* --------------------------------------------------------- every pairing */
  type Scored = {
    designHash: string; designProduct: string;
    mockupProduct: string; position: string;
    kind: "positive" | "hard-negative" | "easy-negative";
    score: number; parts: Record<string, number>;
  };
  const scored: Scored[] = [];
  for (const design of designs) {
    const designType = productTypes.get(design.productId) ?? -1;
    for (const mockup of mockups) {
      const positive = mockup.productId === design.productId;
      /* Same blueprint means the same blank in the same studio setup — the
         only thing left to tell them apart is the print. */
      const hard = !positive && mockup.blueprintId === designType && designType > 0;
      const comparison = compareRegions(design.region, mockup.region);
      scored.push({
        designHash: design.hash.slice(0, 12), designProduct: design.productId,
        mockupProduct: mockup.productId, position: mockup.position,
        kind: positive ? "positive" : hard ? "hard-negative" : "easy-negative",
        score: Number(comparison.score.toFixed(4)),
        parts: Object.fromEntries(
          Object.entries(comparison.parts).map(([key, value]) => [key, Number(value.toFixed(4))])),
      });
    }
  }

  /* ------------------------------------------------------------ the result */
  const byKind = (kind: Scored["kind"]) => scored.filter(pair => pair.kind === kind).map(pair => pair.score);
  const summarise = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: sorted.length,
      worst: sorted[0],
      median: sorted[Math.floor(sorted.length / 2)],
      best: sorted[sorted.length - 1],
      mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(4)),
    };
  };

  /* Where the right answer landed for each design, which is the only number
     that says whether this could be used to find artwork. */
  const ranking = designs.map(design => {
    const forDesign = scored
      .filter(pair => pair.designHash === design.hash.slice(0, 12))
      .sort((a, b) => b.score - a.score);
    const truthAt = forDesign.findIndex(pair => pair.kind === "positive");
    const positives = forDesign.filter(pair => pair.kind === "positive");
    const negatives = forDesign.filter(pair => pair.kind !== "positive");
    return {
      designHash: design.hash.slice(0, 12),
      printRegionFound: design.region.found,
      printCoverage: Number(design.region.coverage.toFixed(3)),
      candidates: forDesign.length,
      positives: positives.length,
      truthRank: truthAt < 0 ? null : truthAt + 1,
      bestPositive: positives.length ? Math.max(...positives.map(pair => pair.score)) : null,
      bestNegative: negatives.length ? Math.max(...negatives.map(pair => pair.score)) : null,
    };
  });

  const withTruth = ranking.filter(row => row.truthRank !== null);
  const top1 = withTruth.filter(row => row.truthRank === 1).length;
  const top3 = withTruth.filter(row => (row.truthRank ?? 99) <= 3).length;
  /* A negative scoring above the true pair is the failure that matters: it is
     the case where a confident answer would be the wrong answer. */
  const falseConfidence = withTruth.filter(row =>
    row.bestNegative !== null && row.bestPositive !== null && row.bestNegative > row.bestPositive);

  const positives = byKind("positive");
  const hard = byKind("hard-negative");
  const positiveSummary = summarise(positives);
  const hardSummary = summarise(hard);

  return NextResponse.json({
    what: "Printify mockup benchmark. Pairs are known by product identity, not by guessing.",
    failedBaseline: FAILED_BASELINE,
    corpus: {
      designsRequested: rows.length,
      designsUsable: designs.length,
      artworksMissingFromStorage: artworksMissing,
      productsUnavailable,
      mockupsUsable: mockups.length,
      pairs: scored.length,
      positivePairs: positives.length,
      hardNegativePairs: hard.length,
      easyNegativePairs: byKind("easy-negative").length,
      decodeFailures: decodeFailures.length,
      decodeFailureReasons: decodeFailures.slice(0, 40),
    },
    separation: {
      positive: positiveSummary,
      hardNegative: hardSummary,
      easyNegative: summarise(byKind("easy-negative")),
      /* The whole question in one number: does the right pair outscore the
         most convincing wrong one? */
      medianGapOverHardNegatives: positiveSummary && hardSummary
        ? Number((positiveSummary.median - hardSummary.median).toFixed(4)) : null,
      previousSpread: FAILED_BASELINE.spread,
    },
    accuracy: {
      designsWithATruePair: withTruth.length,
      top1, top3,
      top1Rate: withTruth.length ? Number((top1 / withTruth.length).toFixed(3)) : null,
      top3Rate: withTruth.length ? Number((top3 / withTruth.length).toFixed(3)) : null,
      falseConfidenceCases: falseConfidence.length,
      falseConfidenceDesigns: falseConfidence.map(row => row.designHash),
    },
    byMockupPosition: Object.entries(
      scored.filter(pair => pair.kind === "positive").reduce((into, pair) => {
        (into[pair.position] ??= []).push(pair.score);
        return into;
      }, {} as Record<string, number[]>))
      .map(([position, values]) => ({ position, ...summarise(values)! })),
    ranking,
    reminder: "Technical validation only. No pair here is a sales relationship, and nothing was written.",
  });
});
