import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { classifyBlueprint, validateMapping, APPAREL_ONLY } from "@/app/blueprint-registry";
import { productFactsFor } from "@/app/product-facts";
import { productFamily } from "@/app/product-type-utils";
import { planBatch, type BatchItem } from "@/app/listing-call-plan";
import { familyCopyKey, fallbackCopy, COPY_PROMPT_VERSION, COPY_MODEL_VERSION }
  from "@/app/family-copy";
import { readDesignIntelligence, EXTRACTION_SCHEMA_VERSION, DESIGN_MODEL_VERSION,
  DESIGN_PROMPT_VERSION } from "@/app/design-intelligence";
import { check, withRegister, type RegisterMatch } from "@/app/trademark-check";
import { lookup, normalize, registerSize } from "@/app/trademark-register";
import { canaryFor } from "@/app/listing-flow-canary";

/**
 * THE WHOLE LISTING FACTORY, UP TO THE ETSY WRITE.
 *
 * Every stage a real batch runs — the blueprint gate, the call plan, the
 * deterministic title and tags, the taxonomy node, the required properties,
 * the trademark screen, the finished Etsy payload — executed for real and
 * then STOPPED. Nothing here creates a listing, a draft, or a Printify
 * product, and there is no code path in this file that could: it builds the
 * payload and returns it.
 *
 * It exists because planner arithmetic and unit tests kept saying the pipeline
 * was fine while nobody had run it end to end against the seven blueprints
 * this shop actually sells.
 */
export const maxDuration = 300;

/* The seven verified blueprints, by the ids Printify uses. */
const BLUEPRINTS: Array<{ id: number; title: string }> = [
  { id: 6, title: "Unisex Heavy Cotton Tee" },
  { id: 706, title: "Unisex Garment-Dyed T-shirt" },
  { id: 77, title: "Unisex Heavy Blend Hooded Sweatshirt" },
  { id: 269, title: "Tough Phone Cases" },
  { id: 68, title: "Mug 11oz" },
  { id: 49, title: "Unisex Heavy Blend Crewneck Sweatshirt" },
  { id: 400, title: "Kiss-Cut Stickers" },
];

const UNKNOWN = { id: 99_999, title: "Holographic Lawn Flamingo" };

/* Titles and tags are composed from stored intelligence, never generated. */
function composeTitle(
  wording: string[], noun: string, audience: string[],
): string {
  const phrase = wording.filter(Boolean).slice(0, 2).join(" ");
  const who = audience.filter(Boolean)[0] ?? "";
  const parts = [phrase, noun ? `${noun[0].toUpperCase()}${noun.slice(1)}` : "",
    who ? `Gift for ${who}` : ""].filter(Boolean);
  return parts.join(", ").slice(0, 140);
}

function composeTags(
  wording: string[], family: string, occasions: string[], recipients: string[],
): string[] {
  const raw = [...wording, family, ...occasions, ...recipients]
    .map(value => String(value ?? "").toLowerCase().trim())
    .filter(value => value.length > 1 && value.length <= 20);
  /* Etsy allows thirteen, each at most twenty characters. */
  return [...new Set(raw)].slice(0, 13);
}

export const GET = withErrorLog("listing-factory-dry-run", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const url = new URL(request.url);
  const warm = url.searchParams.get("warm") === "1";
  const includeUnknown = url.searchParams.get("unknown") === "1";

  /* A design this member already owns. No upload, no new artwork. */
  const artwork = await db.prepare(
    `SELECT artwork_hash AS hash FROM artwork_provenance
      WHERE user_id = ? AND artwork_hash <> '' ORDER BY id DESC LIMIT 1`)
    .bind(user.userId).first<{ hash: string }>().catch(() => null);
  const artworkHash = artwork?.hash ?? "";
  if (!artworkHash)
    return NextResponse.json({ error: "No captured artwork to dry-run with." }, { status: 404 });

  const canary = await canaryFor(user.userId);

  /* What the batch would be. */
  const blueprints = includeUnknown ? [...BLUEPRINTS, UNKNOWN] : BLUEPRINTS;
  const items: BatchItem[] = blueprints.map(blueprint =>
    ({ artworkHash, blueprintTitle: blueprint.title }));

  /* Cache state, read rather than assumed. */
  const held = await readDesignIntelligence(user.userId, artworkHash).catch(() => null);
  /*
    THE FAMILY-COPY CACHE, IF THERE IS ONE.

    There is no `listing_family_copy` table in production. Querying it would
    throw, the catch would return empty, and the dry run would report "nothing
    cached" — indistinguishable from a real cold cache. That is the exact
    failure this project has shipped a dozen times, so the absence is reported
    as absence.
  */
  const copyTable = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'listing_family_copy'`)
    .first<{ name: string }>().catch(() => null);
  const cachedCopy = new Set<string>();
  if (copyTable) {
    const copyRows = await db.prepare(
      `SELECT family FROM listing_family_copy WHERE user_id = ? AND artwork_hash = ?`)
      .bind(user.userId, artworkHash).all<{ family: string }>();
    for (const row of copyRows.results ?? [])
      cachedCopy.add(`${artworkHash}:${row.family}`);
  }

  /* `warm=1` asks what a repeat costs given what is genuinely cached. A cold
     plan is the same question with the caches treated as empty. */
  const plan = planBatch(items, {
    alreadyExtracted: warm && held ? new Set([artworkHash]) : new Set(),
    cachedCopy: warm ? cachedCopy : new Set(),
  });

  const design = held?.design;
  const wording = design?.wording ?? [];
  const audience = design?.audienceCues ?? [];
  const occasions = design?.occasionCues ?? [];
  const recipients = design?.recipientCues ?? [];

  /* The trademark screen runs on the DESIGN'S OWN wording, once per batch. */
  const phrase = wording.join(" ").slice(0, 200);
  const verdict = check(phrase);
  let trademark: unknown;
  try {
    const [size, hits] = await Promise.all([registerSize(db), lookup(db, phrase)]);
    const ready = size.marks > 0
      && !size.files.some(file => file.state === "waiting" || file.state === "partial");
    const normalized = normalize(phrase);
    const matches: RegisterMatch[] = hits.map(hit => ({
      mark: hit.mark, owner: hit.owner, registration: hit.registration,
      classes: hit.classes, registered: hit.registered,
      exact: normalize(hit.mark) === normalized,
    }));
    trademark = withRegister(verdict, matches, ready);
  } catch { trademark = withRegister(verdict, [], false); }

  const perBlueprint = blueprints.map(blueprint => {
    const classification = classifyBlueprint(blueprint.title);
    const family = productFamily(blueprint.title) ?? "";
    const facts = productFactsFor(blueprint.title);
    const usable = validateMapping({ ...classification, productFamily: family });

    if (classification.status === "unsupported" || !usable.usable)
      return {
        blueprintId: blueprint.id, blueprintTitle: blueprint.title,
        family: family || null,
        /* STOPPED BEFORE ANY PROVIDER OR ETSY ACCESS. */
        stopped: true,
        because: classification.ambiguity || usable.problems.join("; "),
        payloadValid: false,
      };

    /* One allowed value per required property, from the table. */
    const values: Record<string, string> = {};
    for (const property of classification.requiredProperties) {
      const allowed = classification.allowedValues[property];
      if (allowed?.length) values[property] = allowed[0];
    }
    const missing = classification.requiredProperties
      .filter(property => !values[property]);
    /* The leak that turns a mug into apparel. */
    const apparelLeak = !["tee", "hoodie", "crewneck", "tank", "longSleeve"].includes(family)
      ? APPAREL_ONLY.filter(property => classification.allowedValues[property])
      : [];

    const copy = fallbackCopy(family, classification.productNoun, wording);
    const title = composeTitle(wording, classification.productNoun, audience);
    const tags = composeTags(wording, family, occasions, recipients);

    const payload = {
      quantity: 1,
      title,
      description: copy.blurb,
      taxonomy_id: classification.etsyTaxonomyNodeId,
      tags,
      who_made: "i_did", when_made: "made_to_order", is_supply: false,
      should_auto_renew: true,
      is_personalizable: Boolean(design?.personalizationStructure),
      property_values: Object.entries(values)
        .map(([property, value]) => ({ property_name: property, values: [value] })),
    };

    const problems: string[] = [];
    if (!payload.title) problems.push("no title");
    if (payload.title.length > 140) problems.push("title over 140 characters");
    if (!payload.taxonomy_id) problems.push("no taxonomy node");
    if (!payload.tags.length) problems.push("no tags");
    if (payload.tags.length > 13) problems.push("more than 13 tags");
    if (payload.tags.some(tag => tag.length > 20)) problems.push("a tag over 20 characters");
    if (!payload.description) problems.push("no description");
    if (missing.length) problems.push(`no value for ${missing.join(", ")}`);
    if (apparelLeak.length) problems.push(`apparel property on ${family}: ${apparelLeak.join(", ")}`);

    return {
      blueprintId: blueprint.id, blueprintTitle: blueprint.title,
      family,
      etsyTaxonomyNodeId: classification.etsyTaxonomyNodeId,
      requiredProperties: classification.requiredProperties,
      values,
      title, tagCount: tags.length, tags,
      description: copy.blurb.slice(0, 160),
      stopped: false,
      payloadValid: problems.length === 0,
      problems,
      /* Categories come from the table; no model call is involved. */
      categoryModelCalls: 0,
      copyCached: cachedCopy.has(`${artworkHash}:${family}`),
      payload,
    };
  });

  return NextResponse.json({
    /* Proof this never wrote anything. */
    wroteToEtsy: false, createdDraft: false, createdPrintifyProduct: false,
    artworkHash,
    canary,
    designIntelligence: {
      cached: Boolean(held),
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      modelVersion: DESIGN_MODEL_VERSION,
      promptVersion: DESIGN_PROMPT_VERSION,
      wordingTranscribed: wording.length,
    },
    familyCopy: {
      promptVersion: COPY_PROMPT_VERSION, modelVersion: COPY_MODEL_VERSION,
      /* Null, not empty: there is no cache table, which is a different fact
         from a cache that happens to be cold. */
      cacheTablePresent: Boolean(copyTable),
      cachedFamilies: copyTable ? [...cachedCopy].map(key => key.split(":")[1]) : null,
      sampleKey: familyCopyKey(user.userId, artworkHash, ["tee"]),
    },
    plan: {
      mode: warm ? "warm" : "cold",
      designCalls: plan.designCalls.length,
      familyCopyCalls: plan.familyCopyCalls.length,
      familyCopyCoversFamilies: plan.familyCopyCalls.flatMap(call => call.families),
      categoryCalls: plan.productCategorizationCalls,
      totalPaidCalls: plan.totalPaidCalls,
      legacyPaidCalls: plan.legacyPaidCalls,
      unmappedBlueprints: plan.unmappedBlueprints,
    },
    trademark,
    blueprints: perBlueprint,
    allValid: perBlueprint.filter(row => !row.stopped).every(row => row.payloadValid),
    stoppedCount: perBlueprint.filter(row => row.stopped).length,
  });
});
