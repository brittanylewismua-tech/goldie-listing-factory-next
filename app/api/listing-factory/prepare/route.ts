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
import { artworkHashOfBytes, artworkHashOfDataUrl } from "@/app/artwork-identity";
import { check, withRegister } from "@/app/trademark-check";
import { lookup, registerSize } from "@/app/trademark-register";
import { env } from "cloudflare:workers";
import { isOwner } from "@/app/mastermind/access";

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
  /* Either a public URL or a data URL. The member's artwork lives in R2, not
     at a public address, so a data URL is the ordinary case rather than the
     exception. */
  imageUrl?: string;
  imageDataUrl?: string;
  blueprints?: { id: number; title: string }[];
  audience?: string[];
  occasions?: string[];
  recipients?: string[];
  validateOnly?: boolean;
  /* Owner-only. See the note at its use. */
  faultInjection?: "" | "billed" | "unbilled";
};

export const POST = withErrorLog("listing-factory-prepare", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to prepare listings." }, { status: 401 });

  const canary = await canaryFor(user.userId);
  if (!canary.useNewFlow)
    return NextResponse.json({ error: "Not available on this account.", because: canary.because },
      { status: 404 });

  const body = await request.json() as Body;

  /*
    FAULT INJECTION, OWNER ONLY, CANARY ONLY.

    "A billed failure" and "an unbilled failure" are the two paths where the
    member's allowance and the dollar ledger are supposed to part company, and
    they cannot be observed by waiting for a provider to misbehave. So they can
    be asked for — by the owner, on an account already on the layered-flow
    allowlist, and never by a member: `isOwner` is checked on every request and
    the field is ignored entirely without it.

    `unbilled` fails before the provider answers, so nothing is charged and the
    reservation is released. `billed` lets the call complete and bills for it,
    then refuses the reply — which is what a model returning unparseable JSON
    actually does: it read the image, wrote a response, and the provider
    charged for both.
  */
  const fault = isOwner(user) ? (body.faultInjection ?? "") : "";
  /*
    THE ARTWORK'S IDENTITY IS THE BYTES, WHEREVER IT IS ASKED FOR.

    This took the hash from the caller, which for the canary was the one stored
    in `artwork_provenance`. The member route hashes the image itself. Same
    design, two keys, two paid analyses — and a "cold" run that made no call
    because the warm entry was under the other one. Derived from the image
    whenever there is an image, so the two paths cannot disagree.
  */
  const supplied = String(body.artworkHash ?? "").trim();
  const imageForHash = String(body.imageDataUrl ?? "").trim();
  const artworkHash = imageForHash
    ? await artworkHashOfDataUrl(imageForHash) : supplied;
  const imageUrl = String(body.imageDataUrl ?? body.imageUrl ?? "").trim();
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
  const design = await ensureDesign(user.userId, artworkHash, imageUrl, fault);
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
 *
 * THE ARTWORK IS ALREADY HERE. A first version asked Etsy for one of her
 * published listing images, which was a round trip to fetch something the
 * artwork-capture pipeline has been storing in R2 all along — the actual
 * print file she uploaded, not a mockup of it. It is also what the real flow
 * will analyze, so measuring against anything else would measure the wrong
 * thing.
 */
export const GET = withErrorLog("listing-factory-prepare-sample", async (request: Request) => {
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("probe") === "1") return await probe();
    if (params.get("reset")) return await reset(params.get("reset") ?? "");
    return await sample(new URL(request.url).searchParams.get("n") ?? "0");
  } catch (error) {
    /* The real message, to the owner. This endpoint has no member audience and
       a generic wrapper turns a five-minute fix into an afternoon of guessing. */
    return NextResponse.json({
      error: error instanceof Error ? error.message : "sample failed",
      stack: error instanceof Error ? String(error.stack ?? "").slice(0, 600) : "",
    }, { status: 500 });
  }
});

async function sample(index: string) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const bucket = (env as unknown as { ARTWORK: R2Bucket }).ARTWORK;
  const rows = await db.prepare(
    `SELECT DISTINCT artwork_hash AS hash, artwork_key AS objectKey
       FROM artwork_provenance WHERE user_id = ? AND artwork_key <> ''
      ORDER BY artwork_hash LIMIT 12`)
    .bind(user.userId).all<{ hash: string; objectKey: string }>();

  /* A cold run needs an artwork whose design has never been extracted, so the
     canary can ask for the second or third rather than always the first. */
  const wanted = Number(index) || 0;
  for (const row of (rows.results ?? []).slice(wanted)) {
    const object = await bucket.get(row.objectKey);
    if (!object) continue;
    const bytes = await object.arrayBuffer();
    /* fal takes a data URL — the design scanner has been sending one all
       along — so the artwork never needs a public address to be analyzed. */
    const binary = new Uint8Array(bytes);
    let text = "";
    for (let index = 0; index < binary.length; index += 0x8000)
      text += String.fromCharCode(...binary.subarray(index, index + 0x8000));
    const type = object.httpMetadata?.contentType || "image/png";
    return NextResponse.json({
      /* The identity the flow will actually use: the bytes, not the
         provenance row's own hash. Both are returned so a mismatch is
         visible rather than mysterious. */
      artworkHash: await artworkHashOfBytes(bytes),
      provenanceHash: row.hash,
      bytes: binary.length,
      contentType: type,
      imageDataUrl: `data:${type};base64,${btoa(text)}`,
      readOnly: "Read from the member's own stored artwork. Nothing was created or changed.",
    });
  }
  return NextResponse.json({ error: "No captured artwork to sample.",
    candidates: (rows.results ?? []).length }, { status: 409 });
}


/**
 * WHICH TEXT-ONLY ENDPOINT ACTUALLY ANSWERS.
 *
 * The family-copy call is text-only — it carries no image, because everything
 * it knows about the artwork is already in the stored design intelligence.
 * The first attempt guessed `openrouter/router/chat` and production answered
 * "Path /chat not found": the batch fell back to deterministic copy exactly as
 * designed, so nothing broke, but the call that proves the saving never
 * happened.
 *
 * Only `openrouter/router/vision` is proven in this codebase. Rather than
 * guess a second time and spend another deploy cycle finding out, this asks
 * each candidate once, with a trivial prompt, and reports what came back.
 */
async function probe() {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const key = (env as unknown as { FAL_KEY?: string }).FAL_KEY?.trim() || "";
  if (!key) return NextResponse.json({ error: "No provider key." }, { status: 503 });

  const candidates = [
    "https://fal.run/openrouter/router",
    "https://fal.run/openrouter/router/vision",
    "https://fal.run/fal-ai/any-llm",
  ];
  const tried: unknown[] = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { method: "POST",
        headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", temperature: 0,
          prompt: 'Return only {"ok":true}' }) });
      const text = (await response.text()).slice(0, 220);
      tried.push({ url, status: response.status, body: text });
    } catch (error) {
      tried.push({ url, failed: error instanceof Error ? error.message : "threw" });
    }
  }
  return NextResponse.json({ probe: true, tried });
}


/**
 * Put the canary artwork back to cold.
 *
 * "Two calls cold, zero warm" is only measurable if cold can be reached more
 * than once. This clears the stored design intelligence and family copy for
 * ONE artwork hash belonging to the caller — never another member's, never
 * anything else — so the same measurement can be taken again.
 */
async function reset(artworkHash: string) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const db = (env as unknown as { DB: D1Database }).DB;
  const design = await db.prepare(
    `DELETE FROM design_intelligence WHERE user_id = ? AND artwork_hash = ?`)
    .bind(user.userId, artworkHash).run();
  const copy = await db.prepare(
    `DELETE FROM listing_family_copy WHERE user_id = ? AND artwork_hash = ?`)
    .bind(user.userId, artworkHash).run();
  const leases = await db.prepare(
    `DELETE FROM work_leases WHERE lease_key LIKE ?`)
    .bind(`${user.userId}|${artworkHash}%`).run();
  return NextResponse.json({ reset: artworkHash,
    designRowsCleared: design.meta.changes, copyRowsCleared: copy.meta.changes,
    leasesCleared: leases.meta.changes,
    scope: "This member's own cached analysis only. No listing or shop data touched." });
}
