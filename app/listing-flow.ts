import { env } from "cloudflare:workers";
import { readDesignIntelligence, writeDesignIntelligence, EXTRACTION_SCHEMA_VERSION,
  DESIGN_PROMPT_VERSION, DESIGN_MODEL_VERSION, type DesignIntelligence }
  from "./design-intelligence.ts";
import { readFamilyCopy, writeFamilyCopy } from "./family-copy-store.ts";
import { missingFamilies, fallbackCopy, parseFamilyCopy, COPY_PROMPT_VERSION,
  COPY_MODEL_VERSION, type FamilyCopy } from "./family-copy.ts";
import { acquireLease, releaseLease, stillHolds, LEASE_WAIT_MS, LEASE_POLL_MS }
  from "./work-lease.ts";
import { reserveSpend, settleSpend, failSpend } from "./spend-guard.ts";
import { recordFalUsage } from "./fal-usage.ts";
import { isRealValue, realValues } from "./listing-composition.ts";

/**
 * THE LAYERED FLOW, CONNECTED TO THINGS THAT ACTUALLY COST MONEY.
 *
 * Until now this architecture existed as a planner and a dry run: the plan
 * said two calls where the legacy path made fourteen, and nothing in the
 * product performed either of them. That made the saving a claim about an
 * arithmetic function rather than a fact about production.
 *
 * The shape, once per batch rather than once per listing:
 *
 *   design     one image call per member artwork, ever, at these versions
 *   copy       one text-only call covering every family still missing
 *   category   a table lookup; no model, no call, zero by construction
 *   title/tags composed from the design's own transcribed wording
 *
 * Every paid call goes through the spend guard and is leased first, so two
 * requests for one design produce one charge. Nothing here writes to Etsy.
 */
export const DESIGN_VERSION =
  `${EXTRACTION_SCHEMA_VERSION}:${DESIGN_PROMPT_VERSION}:${DESIGN_MODEL_VERSION}`;

export type Billing = { workload: string; reservationId: string; billed: number };

export type DesignOutcome =
  | { ok: true; design: DesignIntelligence; source: "cache" | "provider" | "waited";
      calls: number; billed: number }
  | { ok: false; because: string; memberMessage: string; calls: number; billed: number };

const key = () => (env as unknown as { FAL_KEY?: string }).FAL_KEY?.trim() || "";

const DESIGN_PROMPT =
  `Inspect this design. Return only compact valid JSON, never markdown, with exactly `
  + `these keys: {"wording":["exact visible line"],"typography":["short description"],`
  + `"illustrationCategory":"short phrase","audienceCues":["short phrase"],`
  + `"recipientCues":["short phrase"],"occasionCues":["short phrase"],"tone":"short phrase",`
  + `"personalizationStructure":"","textToArtRatio":0.5,"composition":"short phrase",`
  + `"dominantColors":["colour name"],"optionalFieldEvidence":{}}. `
  + `Transcribe wording exactly as it appears. Describe only what is actually in the `
  + `artwork: never infer a product, a garment, a category or a department from it. `
  + `If the design carries no text, return an empty wording array rather than `
  + `inventing a line. personalizationStructure is a short description ONLY when the `
  + `design visibly leaves a blank for a name, date or number; otherwise "".`;

/** Only the shape is trusted; a missing field becomes an honest empty. */
function readDesign(text: string): DesignIntelligence | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; }
  catch { return null; }
  /*
    ABSENCE IS FILTERED WHERE THE ANSWER ARRIVES, NOT WHERE IT IS PRINTED.

    "Gift for none" was fixed in the title composer, which fixed the title and
    left the word "none" sitting in stored design intelligence — ready to be
    used by the description, the tags, the bank ranking and anything added
    later. A model's refusal is not data, so it is dropped at the door.
  */
  const list = (value: unknown) => Array.isArray(value)
    ? realValues(value.map(entry => String(entry))).slice(0, 16) : [];
  const line = (value: unknown) => typeof value === "string" && isRealValue(value)
    ? value.trim().slice(0, 200) : "";
  const ratio = Number(raw.textToArtRatio);
  return {
    wording: list(raw.wording),
    typography: list(raw.typography),
    illustrationCategory: line(raw.illustrationCategory),
    audienceCues: list(raw.audienceCues),
    recipientCues: list(raw.recipientCues),
    occasionCues: list(raw.occasionCues),
    tone: line(raw.tone),
    personalizationStructure: line(raw.personalizationStructure),
    textToArtRatio: Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0,
    composition: line(raw.composition),
    dominantColors: list(raw.dominantColors),
    optionalFieldEvidence: raw.optionalFieldEvidence
      && typeof raw.optionalFieldEvidence === "object"
      ? Object.fromEntries(Object.entries(raw.optionalFieldEvidence as Record<string, unknown>)
        .filter(([, value]) => isRealValue(String(value)))
        .map(([name, value]) => [name, String(value).slice(0, 200)]).slice(0, 12))
      : {},
  };
}

/**
 * What the provider actually billed for this call.
 *
 * Read from the response rather than assumed, because the difference between
 * a reserved estimate and a real charge is the whole point of settling.
 */
type Usage = { cost: number; inputTokens: number; outputTokens: number };
function usageFrom(payload: unknown): Usage {
  const usage = (payload as { usage?: Record<string, unknown> })?.usage ?? {};
  const number = (value: unknown) =>
    Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    cost: number(usage.cost ?? usage.total_cost),
    inputTokens: number(usage.prompt_tokens ?? usage.input_tokens),
    outputTokens: number(usage.completion_tokens ?? usage.output_tokens),
  };
}

/**
 * Step 1-6: the design layer.
 *
 * A cached design costs nothing. A missing one is leased before the provider
 * is contacted, so simultaneous requests produce one call; the losers watch
 * for the winner's row rather than paying for their own, and take over only
 * if the winner never lands.
 */
export async function ensureDesign(
  userId: string, artworkHash: string, imageUrl: string, fault = "",
): Promise<DesignOutcome> {
  const held = await readDesignIntelligence(userId, artworkHash).catch(() => null);
  if (held) return { ok: true, design: held.design, source: "cache", calls: 0, billed: 0 };

  const lease = await acquireLease("design-intelligence", `${userId}|${artworkHash}`);
  if (!lease.held) {
    /* Somebody else is paying. Watch for their result rather than buying a
       second copy of it. */
    const until = Date.now() + LEASE_WAIT_MS;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, LEASE_POLL_MS));
      const landed = await readDesignIntelligence(userId, artworkHash).catch(() => null);
      if (landed)
        return { ok: true, design: landed.design, source: "waited", calls: 0, billed: 0 };
    }
    /* The winner never landed. Rather than fail, fall through and take the
       lease ourselves on the next attempt — the expiry makes that possible. */
    const second = await acquireLease("design-intelligence", `${userId}|${artworkHash}`);
    if (!second.held)
      return { ok: false, because: "a lease was held throughout the wait",
        memberMessage: "This design is still being analyzed. Try again in a moment.",
        calls: 0, billed: 0 };
    return runDesign(userId, artworkHash, imageUrl, second.token, fault);
  }
  return runDesign(userId, artworkHash, imageUrl, lease.token, fault);
}

async function runDesign(
  userId: string, artworkHash: string, imageUrl: string, token: string, fault = "",
): Promise<DesignOutcome> {
  const leaseKey = `${userId}|${artworkHash}`;
  const reservation = await reserveSpend({
    workloadKey: "listingIntelligenceVision", userId, fingerprint: artworkHash });
  if (!reservation.allowed) {
    await releaseLease("design-intelligence", leaseKey, token);
    return { ok: false, because: reservation.reason, memberMessage: reservation.message,
      calls: 0, billed: 0 };
  }

  let billed = 0;
  let reachedProvider = true;
  let usage: Usage = { cost: 0, inputTokens: 0, outputTokens: 0 };
  try {
    /* An unbilled failure never reaches the provider: nothing is charged and
       the reservation is released rather than settled. */
    if (fault === "unbilled") {
      reachedProvider = false;
      throw new Error("injected failure before the provider was called");
    }
    const response = await fetch("https://fal.run/openrouter/router/vision", {
      method: "POST",
      headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_urls: [imageUrl], model: DESIGN_MODEL_VERSION,
        temperature: 0, system_prompt: "Return only compact valid JSON. Never use markdown.",
        prompt: DESIGN_PROMPT }),
    });
    const payload = await response.json() as { output?: string; detail?: string };
    usage = usageFrom(payload);
    billed = usage.cost;
    if (!response.ok) throw new Error(payload.detail || "the provider refused the request");
    /* A billed failure lets the call complete and bills for it, then refuses
       the reply — what a model returning unparseable JSON actually does. */
    const design = fault === "billed" ? null : readDesign(payload.output ?? "");
    /* A reply that cannot be read still burned tokens: the member is refunded
       and the dollar ledger keeps the charge. */
    if (!design) throw new Error("the provider's reply could not be read");

    /*
      STALE WORKER CHECK, IMMEDIATELY BEFORE THE WRITE.

      If this lease expired and somebody else took it, their answer is newer
      than this one and overwriting it would undo live work. The call is
      already paid for either way, so it settles — the money was spent — but
      the result is dropped.
    */
    if (!await stillHolds("design-intelligence", leaseKey, token)) {
      await settleSpend(reservation.id, billed);
      await recordFalUsage({ workload: "listingIntelligenceVision",
        model: DESIGN_MODEL_VERSION, cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
      const landed = await readDesignIntelligence(userId, artworkHash).catch(() => null);
      if (landed)
        return { ok: true, design: landed.design, source: "waited", calls: 1, billed };
      return { ok: false, because: "this worker's lease was taken over mid-call",
        memberMessage: "This design is still being analyzed. Try again in a moment.",
        calls: 1, billed };
    }

    await writeDesignIntelligence(userId, artworkHash, design, billed);
    await settleSpend(reservation.id, billed);
    await recordFalUsage({ workload: "listingIntelligenceVision",
      model: DESIGN_MODEL_VERSION, cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
    return { ok: true, design, source: "provider", calls: 1, billed };
  } catch (error) {
    /* The member is refunded their allowance; billable usage still settles
       against the global dollar ceiling. */
    await failSpend(reservation.id, { billed });
    if (billed > 0) await recordFalUsage({ workload: "listingIntelligenceVision",
      model: DESIGN_MODEL_VERSION, cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
    return { ok: false,
      because: error instanceof Error ? error.message : "the analysis failed",
      memberMessage: "Goldie could not analyze this design just now. "
        + "Nothing was charged to your daily limit — try again in a moment.",
      /* A call that never reached the provider is not a call. Reporting it as
         one made the unbilled failure look identical to the billed one in
         everything but the money, which is the one place they must differ. */
      calls: reachedProvider ? 1 : 0, billed };
  } finally {
    await releaseLease("design-intelligence", leaseKey, token).catch(() => {});
  }
}

export type CopyOutcome = {
  copy: Record<string, FamilyCopy>;
  fromCache: string[];
  fromProvider: string[];
  fellBack: string[];
  calls: number;
  billed: number;
  because: string;
};

/**
 * Steps 7-9: the copy layer.
 *
 * Every family still missing is asked for in ONE text-only call — no image,
 * because everything the copy knows about the artwork is already in the
 * stored design intelligence. Each family is written on its own row, so a
 * later batch that adds one family pays for that family alone.
 */
export async function ensureFamilyCopy(
  userId: string, artworkHash: string, design: DesignIntelligence,
  families: string[], nounFor: (family: string) => string,
): Promise<CopyOutcome> {
  const wanted = [...new Set(families)].sort();
  const stored = await readFamilyCopy(userId, artworkHash, DESIGN_VERSION).catch(() => []);
  const copy: Record<string, FamilyCopy> = {};
  for (const entry of stored) if (wanted.includes(entry.family)) copy[entry.family] = entry.copy;

  const missing = missingFamilies(wanted, Object.keys(copy));
  const fallbackFor = (family: string) => fallbackCopy(family, nounFor(family), design.wording);
  if (!missing.length)
    return { copy, fromCache: Object.keys(copy), fromProvider: [], fellBack: [],
      calls: 0, billed: 0, because: "every family was already described" };

  const leaseKey = [userId, artworkHash, DESIGN_VERSION, missing.join("+"),
    `copy${COPY_PROMPT_VERSION}`, COPY_MODEL_VERSION].join("|");
  const lease = await acquireLease("family-copy", leaseKey);
  if (!lease.held) {
    const until = Date.now() + LEASE_WAIT_MS;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, LEASE_POLL_MS));
      const landed = await readFamilyCopy(userId, artworkHash, DESIGN_VERSION).catch(() => []);
      const have = new Set(landed.map(entry => entry.family));
      if (missing.every(family => have.has(family))) {
        for (const entry of landed) if (wanted.includes(entry.family)) copy[entry.family] = entry.copy;
        return { copy, fromCache: Object.keys(copy), fromProvider: [], fellBack: [],
          calls: 0, billed: 0, because: "another request paid for these families" };
      }
    }
    /* Nothing landed. Deterministic copy is correct and free; it is not worth
       a second charge or a failed batch. */
    for (const family of missing) copy[family] = fallbackFor(family);
    return { copy, fromCache: stored.map(entry => entry.family), fromProvider: [],
      fellBack: missing, calls: 0, billed: 0,
      because: "a lease was held throughout the wait; deterministic copy was used" };
  }

  const reservation = await reserveSpend({
    workloadKey: "listingFamilyCopy", userId, fingerprint: `${artworkHash}|${missing.join("+")}` });
  if (!reservation.allowed) {
    await releaseLease("family-copy", leaseKey, lease.token);
    for (const family of missing) copy[family] = fallbackFor(family);
    return { copy, fromCache: stored.map(entry => entry.family), fromProvider: [],
      fellBack: missing, calls: 0, billed: 0, because: reservation.message };
  }

  let billed = 0;
  let usage: Usage = { cost: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const prompt =
      `A seller has one design and needs listing copy for several product types.\n`
      + `The design: ${JSON.stringify({ wording: design.wording, tone: design.tone,
        illustrationCategory: design.illustrationCategory, audienceCues: design.audienceCues,
        occasionCues: design.occasionCues, recipientCues: design.recipientCues,
        composition: design.composition })}\n`
      + `Write copy for each of these product types: ${JSON.stringify(
        missing.map(family => ({ family, product: nounFor(family) })))}\n`
      + `Return only compact valid JSON, never markdown: `
      + `{"<family>":{"blurb":"2-3 sentence description","optionalFields":{}}}. `
      + `Describe the design and the product only. Never invent a material, a size, a `
      + `shipping time, a brand, or a claim about quality. Never mention a trademark, `
      + `a celebrity, or another shop.`;
    /*
      THE TEXT ENDPOINT, ESTABLISHED BY ASKING RATHER THAN GUESSING.

      A first version posted to `openrouter/router/chat`, which production
      answered with "Path /chat not found". The batch fell back to
      deterministic copy exactly as designed — nothing broke, and that is why
      it would have been easy to leave — but the call that proves the saving
      never happened.

      Probed against production: `openrouter/router` answers and reports
      `usage.cost`; `fal-ai/any-llm` answers and reports no usage at all,
      which would put an unbillable call on the ledger. So it is the router.
    */
    const response = await fetch("https://fal.run/openrouter/router", {
      method: "POST",
      headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: COPY_MODEL_VERSION, temperature: 0.4,
        system_prompt: "Return only compact valid JSON. Never use markdown.", prompt }),
    });
    const payload = await response.json() as { output?: string; detail?: string };
    usage = usageFrom(payload);
    billed = usage.cost;
    if (!response.ok) throw new Error(payload.detail || "the provider refused the request");

    const parsed = parseFamilyCopy(payload.output ?? "", missing, fallbackFor);
    if (!await stillHolds("family-copy", leaseKey, lease.token)) {
      await settleSpend(reservation.id, billed);
      await recordFalUsage({ workload: "listingFamilyCopy", model: COPY_MODEL_VERSION,
        cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
      for (const family of missing) copy[family] = parsed.copy[family] ?? fallbackFor(family);
      return { copy, fromCache: stored.map(entry => entry.family), fromProvider: missing,
        fellBack: parsed.fellBack, calls: 1, billed,
        because: "this worker's lease was taken over; the result was not stored" };
    }

    await writeFamilyCopy(userId, artworkHash, DESIGN_VERSION,
      missing.map(family => ({ family, copy: parsed.copy[family] ?? fallbackFor(family) })),
      billed);
    await settleSpend(reservation.id, billed);
    await recordFalUsage({ workload: "listingFamilyCopy", model: COPY_MODEL_VERSION,
      cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
    for (const family of missing) copy[family] = parsed.copy[family] ?? fallbackFor(family);
    return { copy, fromCache: stored.map(entry => entry.family), fromProvider: missing,
      fellBack: parsed.fellBack, calls: 1, billed,
      because: "one text-only call covered every missing family" };
  } catch (error) {
    await failSpend(reservation.id, { billed });
    if (billed > 0) await recordFalUsage({ workload: "listingFamilyCopy",
      model: COPY_MODEL_VERSION, cost: billed, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }).catch(() => {});
    for (const family of missing) copy[family] = fallbackFor(family);
    return { copy, fromCache: stored.map(entry => entry.family), fromProvider: [],
      fellBack: missing, calls: 1, billed,
      because: error instanceof Error ? error.message : "the copy call failed" };
  } finally {
    await releaseLease("family-copy", leaseKey, lease.token).catch(() => {});
  }
}
