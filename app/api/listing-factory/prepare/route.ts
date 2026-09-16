import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canaryFor } from "@/app/listing-flow-canary";
import { classifyBlueprint, validateMapping } from "@/app/blueprint-registry";
import { productFactsFor } from "@/app/product-facts";
import { productFamily } from "@/app/product-type-utils";
import { planBatch, routeUnmapped, type BatchItem } from "@/app/listing-call-plan";
import { composeTitle, composeTags } from "@/app/listing-composition";
import { ensureDesign, ensureFamilyCopy, DESIGN_VERSION } from "@/app/listing-flow";
import { POD_LISTING_FIELDS, LISTING_FIELD_FOR_PROPERTY } from "@/app/pod-listing-fields";
import { check, withRegister } from "@/app/trademark-check";
import { lookup, registerSize } from "@/app/trademark-register";
import { env } from "cloudflare:workers";
import { isOwner } from "@/app/mastermind/access";
import { decryptEtsy, etsyFetch } from "@/app/api/etsy/client";

/**
 * THE LAYERED FLOW, IN PRODUCTION, UP TO THE ETSY WRITE.
 *
 * The dry run proved the arithmetic. This is the path that actually spends
 * money: it hashes the artwork, reads design intelligence at the current
 * versions, leases and pays for what is missing, asks for every missing
 * product family in one text-only call, and composes everything else from
 * tables and the design's own transcribed wording.
 *
 * WHAT IT DOES NOT DO. It does not write to Etsy, create a draft, or create a
 * Printify product. It returns the payload the final review screen shows, and
 * the publish step that follows is the existing one. `validateOnly` stops
 * even earlier, before any provider is contacted.
 *
 * Canary-gated: a member not on the allowlist is told to use the existing
 * path rather than silently served a different pipeline.
 */
type Body = {
  artworkHash?: string;
  imageUrl?: string;
  blueprints?: { id: number; title: string }[];
  audience?: string[];
  occasions?: string[];
  recipients?: string[];
  validateOnly?: boolean;
};

export const POST = withErrorLog("listing-factory-prepare", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to prepare listings." }, { status: 401 });

  const canary = await canaryFor(user.userId);
  if (!canary.useNewFlow)
    return NextResponse.json({ error: "Not available on this account.", because: canary.because },
      { status: 404 });

  const body = await request.json() as Body;
  const artworkHash = String(body.artworkHash ?? "").trim();
  const imageUrl = String(body.imageUrl ?? "").trim();
  const blueprints = (body.blueprints ?? []).filter(entry => entry && entry.title);
  if (!artworkHash || !blueprints.length)
    return NextResponse.json({ error: "An artwork and at least one product are required." },
      { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;

  /* Step 7 (and the stop): every blueprint classified before anything is paid
     for, so an unsupported product is known before the provider is touched. */
  const classified = blueprints.map(blueprint => {
    const family = productFamily(blueprint.title) || "";
    const classification = classifyBlueprint(blueprint.title);
    const usable = validateMapping({ ...classification, productFamily: family });
    return { blueprint, family, classification, usable };
  });
  const unmapped = classified.filter(entry => !entry.usable.usable || !entry.family);
  const supported = classified.filter(entry => entry.usable.usable && entry.family);

  const items: BatchItem[] = supported.map(entry =>
    ({ artworkHash, blueprintTitle: entry.blueprint.title }));
  const plan = planBatch(items);

  if (body.validateOnly)
    return NextResponse.json({
      validateOnly: true, wroteToEtsy: false, createdDraft: false,
      contactedProvider: false,
      supported: supported.map(entry => entry.blueprint.id),
      stopped: unmapped.map(entry => ({ id: entry.blueprint.id,
        because: routeUnmapped(canary, entry.blueprint.title).publish
          ? "handled by the existing path"
          : entry.classification.ambiguity || entry.usable.problems.join("; ") })),
      plan: { designCalls: plan.designCalls.length, familyCopyCalls: plan.familyCopyCalls.length,
        categoryCalls: plan.productCategorizationCalls, totalPaidCalls: plan.totalPaidCalls,
        legacyPaidCalls: plan.legacyPaidCalls },
    });

  if (!supported.length)
    return NextResponse.json({ error: "No supported product in this batch.",
      stopped: unmapped.map(entry => entry.blueprint.title) }, { status: 422 });

  /* Steps 1-6. */
  const design = await ensureDesign(user.userId, artworkHash, imageUrl);
  if (!design.ok)
    return NextResponse.json({ error: design.memberMessage, because: design.because,
      calls: design.calls, billed: design.billed, wroteToEtsy: false }, { status: 503 });

  /* Steps 7-9. */
  const families = [...new Set(supported.map(entry => entry.family))];
  const nounFor = (family: string) => {
    const match = supported.find(entry => entry.family === family);
    return match?.classification.productNoun || family;
  };
  const copy = await ensureFamilyCopy(user.userId, artworkHash, design.design, families, nounFor);

  /* The trademark screen runs on the design's own wording, once per batch. */
  const phrase = design.design.wording.join(" ").slice(0, 200);
  let trademark: unknown = { verdict: check(phrase) };
  try {
    const [size, hits] = await Promise.all([registerSize(db), lookup(db, phrase)]);
    trademark = withRegister(check(phrase), hits, size);
  } catch { /* the verdict without the register is still a verdict */ }

  /* Steps 10-12: composed, not generated. */
  const listings = supported.map(entry => {
    const facts = productFactsFor(entry.blueprint.title);
    const values: Record<string, string> = {};
    for (const property of entry.classification.requiredProperties) {
      if (LISTING_FIELD_FOR_PROPERTY[property]) continue;
      const fromFacts = (facts.mapped ? facts.attributes : {})[property];
      const allowed = entry.classification.allowedValues[property];
      if (fromFacts) values[property] = fromFacts;
      else if (allowed?.length) values[property] = allowed[0];
    }
    const familyCopy = copy.copy[entry.family];
    return {
      blueprintId: entry.blueprint.id,
      blueprintTitle: entry.blueprint.title,
      family: entry.family,
      taxonomyId: entry.classification.etsyTaxonomyNodeId,
      category: entry.classification.category,
      title: composeTitle(design.design.wording, entry.classification.productNoun,
        body.audience ?? design.design.audienceCues),
      tags: composeTags(design.design.wording, entry.family,
        body.occasions ?? design.design.occasionCues,
        body.recipients ?? design.design.recipientCues),
      description: familyCopy?.blurb ?? "",
      attributes: values,
      ...POD_LISTING_FIELDS,
      isPersonalizable: Boolean(design.design.personalizationStructure),
    };
  });

  return NextResponse.json({
    /* Proof this stopped where it said it would. */
    wroteToEtsy: false, createdDraft: false, createdPrintifyProduct: false,
    artworkHash, designVersion: DESIGN_VERSION,
    design: { source: design.source, calls: design.calls, billed: design.billed },
    copy: { calls: copy.calls, billed: copy.billed, fromCache: copy.fromCache,
      fromProvider: copy.fromProvider, fellBack: copy.fellBack, because: copy.because },
    measured: {
      paidCalls: design.calls + copy.calls,
      billed: Number((design.billed + copy.billed).toFixed(6)),
      categoryCalls: 0,
      legacyWouldHaveBeen: plan.legacyPaidCalls,
    },
    trademark,
    stopped: unmapped.map(entry => ({ id: entry.blueprint.id, title: entry.blueprint.title,
      because: entry.classification.ambiguity || entry.usable.problems.join("; ") })),
    listings,
  });
});


/**
 * ONE OF THE MEMBER'S OWN DESIGNS, TO MEASURE THE FLOW AGAINST.
 *
 * The canary run needs a real image: a synthetic swatch produces design
 * intelligence that means nothing, and a competitor's listing image is
 * somebody else's artwork and has no business being analyzed as the member's.
 * So it is one of her own published listings, read-only, owner-gated, and
 * used for nothing but exercising the path she is about to use.
 */
export const GET = withErrorLog("listing-factory-prepare-sample", async () => {
  try { return await sample(); } catch (error) {
    /* The real message, to the owner. This endpoint has no member audience and
       a generic wrapper turns a five-minute fix into an afternoon of guessing. */
    return NextResponse.json({
      error: error instanceof Error ? error.message : "sample failed",
      stack: error instanceof Error ? String(error.stack ?? "").slice(0, 600) : "",
    }, { status: 500 });
  }
});

async function sample() {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const connection = await db.prepare(
    `SELECT encrypted_access_token AS token, shop_id AS shopId
       FROM etsy_connections WHERE user_id = ? AND is_active = 1`)
    .bind(user.userId).first<{ token: string; shopId: number }>();
  if (!connection) return NextResponse.json({ error: "No active Etsy connection." }, { status: 409 });

  const token = await decryptEtsy(connection.token);
  const listings = await etsyFetch<{ results?: { listing_id: number; title: string }[] }>(
    `/shops/${connection.shopId}/listings/active?limit=3`, token);
  const first = listings.results?.[0];
  if (!first) return NextResponse.json({ error: "No active listing to sample." }, { status: 409 });

  const images = await etsyFetch<{ results?: { url_fullxfull?: string; listing_image_id?: number }[] }>(
    `/shops/${connection.shopId}/listings/${first.listing_id}/images`, token);
  const image = images.results?.[0];
  return NextResponse.json({
    listingId: first.listing_id, title: first.title,
    imageUrl: image?.url_fullxfull ?? "",
    /* The hash identifies the artwork in the cache. It is the member's own
       listing image identity, not a content hash of the bytes. */
    artworkHash: `own-listing-${first.listing_id}-${image?.listing_image_id ?? 0}`,
    readOnly: "No listing was created, edited or published.",
  });
}
