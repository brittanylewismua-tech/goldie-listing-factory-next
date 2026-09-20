import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
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
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";
import { INTERNAL_VALIDATION_MARKER, isInternalValidationProduct } from "@/app/printify-validation-marker";
import { check, withRegister, registerIsReady, toMatches } from "@/app/trademark-check";
import { lookup, normalize, registerSize } from "@/app/trademark-register";
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

  /*
    D1716 · The two destructive diagnostics that used to live on the GET.
    Owner only, read from the query string so the existing call shape is
    unchanged apart from the method, and settled before the member workflow
    below is touched.
  */
  {
    const params = new URL(request.url).searchParams;
    const wantsReset = params.get("reset");
    const wantsDelete = params.get("printify") === "delete";
    if (wantsReset || wantsDelete) {
      if (!isOwner(user))
        return NextResponse.json({ error: "Not authorized." }, { status: 403 });
      if (crossSiteWrite(request))
        return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
      return wantsReset
        ? await reset(wantsReset)
        : await printifyProduct(params.get("shopId") ?? "",
            params.get("productId") ?? "", true);
    }
  }

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
    /* D1655 · `size` was passed where the readiness boolean belongs — always
       truthy — so this path claimed a complete register search throughout the
       backfill. And the raw hits went in unmapped, leaving `exact` undefined
       on every one, which downgraded an exact single-word registered mark
       from high risk to a minor mention. */
    trademark = withRegister(check(phrase), toMatches(hits, phrase, normalize),
      size);
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
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("probe") === "1") return await probe();
    /*
      D1716 · `reset` and `printify=delete` DELETE things, and they sat on a
      GET beside four reads. A GET must be safe to repeat and safe to follow;
      these are neither. They answer on POST now, and refuse here without
      doing anything.
    */
    if (params.get("reset") || params.get("printify") === "delete")
      return NextResponse.json(
        { error: "That action does work, so it is a POST now. Nothing was run." },
        { status: 405, headers: { Allow: "POST" } });
    if (params.get("printify") === "preflight") return await printifyPreflight();
    if (params.get("printify") === "find")
      return await findInternalTestProducts(params.get("shopId") ?? "");
    if (params.get("printify") === "read")
      return await printifyProduct(params.get("shopId") ?? "", params.get("productId") ?? "", false);
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


/**
 * CAN THIS TOKEN DELETE, BEFORE ANYTHING IS CREATED?
 *
 * Creating a product to find out whether it can be removed again is the wrong
 * order: a create that succeeds and a delete that is refused leaves a real
 * product in a real shop with no way to take it back from here.
 *
 * So the delete is exercised FIRST, against a syntactically valid product id
 * that cannot exist. Printify answers 404 when the caller is authorised and
 * the product is simply absent, and 401/403 when it is not authorised at all —
 * which is the whole question, answered without writing anything.
 */
async function printifyPreflight() {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const runtime = env as unknown as { DB: D1Database; PRINTIFY_TOKEN_KEY: string };
  const connection = await runtime.DB.prepare(
    `SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!connection) return NextResponse.json({ error: "Printify is not connected." }, { status: 409 });
  const token = await decryptPrintifyToken(connection.encrypted_token, runtime.PRINTIFY_TOKEN_KEY);
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };

  const shopsResponse = await fetch("https://api.printify.com/v1/shops.json",
    { headers, signal: AbortSignal.timeout(15_000) });
  const shops = shopsResponse.ok
    ? await shopsResponse.json() as Array<{ id: number; title: string; sales_channel?: string }> : [];
  const shop = shops[0];

  /* A valid-shaped id that cannot belong to anything. */
  const absent = "0".repeat(24);
  let deleteStatus = 0;
  if (shop) {
    const attempt = await fetch(
      `https://api.printify.com/v1/shops/${shop.id}/products/${absent}.json`,
      { method: "DELETE", headers, signal: AbortSignal.timeout(15_000) });
    deleteStatus = attempt.status;
  }

  return NextResponse.json({
    preflight: true,
    createdNothing: true,
    shopsReadable: shopsResponse.ok,
    shops: shops.map(entry => ({ id: entry.id, title: entry.title, channel: entry.sales_channel })),
    deleteProbe: {
      endpoint: "DELETE https://api.printify.com/v1/shops/{shopId}/products/{productId}.json",
      productId: absent,
      status: deleteStatus,
      /* 404: authorised, nothing there. 401/403: not authorised to delete. */
      authorisedToDelete: deleteStatus === 404 || deleteStatus === 200,
    },
  });
}


/**
 * READ OR REMOVE ONE INTERNAL TEST PRODUCT.
 *
 * The single authorised validation product has to be removable again, and the
 * ordinary cleanup path cannot reach it: `cleanupLaunchListings` selects on
 * `printify_draft_results.status = 'succeeded'`, and this product's row was
 * NOT recorded as succeeded even though Printify created it — which is the
 * defect the walkthrough found, and also the reason an orphan exists at all.
 *
 * THE GUARD IS THE TITLE, NOT A LIST OF IDS. The product is read first, and a
 * delete only proceeds when its title begins with "INTERNAL TEST". A customer
 * product cannot be removed by this route however the id is supplied, because
 * no customer product is titled that way.
 */
const INTERNAL_TEST_PREFIX = "INTERNAL TEST";

async function printifyProduct(shopId: string, productId: string, remove: boolean) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (!/^\d+$/.test(shopId) || !/^[a-f0-9]{24}$/.test(productId))
    return NextResponse.json({ error: "A numeric shop id and a 24-character product id are required." },
      { status: 400 });

  const runtime = env as unknown as { DB: D1Database; PRINTIFY_TOKEN_KEY: string };
  const connection = await runtime.DB.prepare(
    `SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!connection) return NextResponse.json({ error: "Printify is not connected." }, { status: 409 });
  const token = await decryptPrintifyToken(connection.encrypted_token, runtime.PRINTIFY_TOKEN_KEY);
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };
  const url = `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`;

  const readResponse = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (readResponse.status === 404)
    return NextResponse.json({ productId, exists: false,
      note: "Printify has no product with this id in this shop." });
  if (!readResponse.ok)
    return NextResponse.json({ error: `Printify answered ${readResponse.status}.` }, { status: 502 });
  const product = await readResponse.json() as
    { title?: string; visible?: boolean; is_locked?: boolean; external?: { id?: string } };

  if (!remove)
    return NextResponse.json({ productId, exists: true, title: product.title,
      visible: product.visible, locked: product.is_locked,
      linkedToSalesChannel: product.external?.id ?? null });

  /*
    THE MARKER, NOT THE PREFIX.

    "INTERNAL TEST" is a phrase a seller could plausibly type. The marker is an
    arbitrary token that nothing else can carry, so it — and only it — decides
    what this route is allowed to remove.
  */
  if (!isInternalValidationProduct(String(product.title ?? "")))
    return NextResponse.json({
      error: `Refused: this route only removes products carrying ${INTERNAL_VALIDATION_MARKER}.`,
      title: product.title }, { status: 409 });

  const deleteResponse = await fetch(url, { method: "DELETE", headers,
    signal: AbortSignal.timeout(15_000) });
  /* Confirm by reading again rather than trusting the delete's own answer. */
  const confirm = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  return NextResponse.json({ productId, title: product.title,
    deleteStatus: deleteResponse.status,
    confirmedGone: confirm.status === 404,
    confirmStatus: confirm.status });
}


/**
 * IS THERE AN ORPHAN, AND WHERE?
 *
 * The walkthrough's draft creation reported a failure while the batch row
 * claimed a draft count of one, so whether Printify actually holds a product
 * could not be answered from Goldie's own records. The id taken from the
 * batch thumbnail turned out to be the SOURCE TEMPLATE — a real product of
 * the member's, linked to a live Etsy listing — which is exactly the kind of
 * mistake the title guard on removal exists to stop.
 *
 * So the shop is asked directly, and only products whose title marks them as
 * internal tests are reported.
 */
async function findInternalTestProducts(shopId: string) {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (!/^\d+$/.test(shopId))
    return NextResponse.json({ error: "A numeric shop id is required." }, { status: 400 });

  const runtime = env as unknown as { DB: D1Database; PRINTIFY_TOKEN_KEY: string };
  const connection = await runtime.DB.prepare(
    `SELECT encrypted_token FROM printify_connections WHERE user_id = ?`)
    .bind(user.userId).first<{ encrypted_token: string }>();
  if (!connection) return NextResponse.json({ error: "Printify is not connected." }, { status: 409 });
  const token = await decryptPrintifyToken(connection.encrypted_token, runtime.PRINTIFY_TOKEN_KEY);
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" };

  const response = await fetch(
    `https://api.printify.com/v1/shops/${shopId}/products.json?limit=50`,
    { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok)
    return NextResponse.json({ error: `Printify answered ${response.status}.` }, { status: 502 });
  const page = await response.json() as
    { data?: Array<{ id: string; title: string; visible?: boolean; created_at?: string;
      external?: { id?: string } }> };
  const all = page.data ?? [];
  return NextResponse.json({
    shopId: Number(shopId),
    scanned: all.length,
    internalTests: all
      .filter(entry => isInternalValidationProduct(String(entry.title ?? ""))
        || String(entry.title ?? "").trim().toUpperCase().startsWith(INTERNAL_TEST_PREFIX))
      .map(entry => ({ id: entry.id, title: entry.title, visible: entry.visible,
        createdAt: entry.created_at, linkedToSalesChannel: entry.external?.id ?? null })),
    /* For orientation only — titles, never anything that could identify a buyer. */
    newestTitles: all.slice(0, 5).map(entry => ({ title: entry.title, createdAt: entry.created_at })),
  });
}
