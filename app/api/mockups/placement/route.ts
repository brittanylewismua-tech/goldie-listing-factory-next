import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { mockupSceneGeometry, mockupArtworkOverrides, mockupTemplates } from "@/db/schema";
import { ensureMockupStorage } from "@/app/api/mockups/storage";
import { withErrorLog } from "@/app/error-log";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";

/* Stage 1 persistence. Two records, two lifetimes, and they are never merged.

   Scene geometry is keyed by the SURFACE it was measured for, so a mug's
   geometry cannot be handed to a hoodie and a front geometry cannot be handed to
   a back print.

   An artwork override is keyed by listing AND design. Two designs on the same
   scene, same product and same print side still get different keys, because a
   correction made for one design means nothing for another. */
const geometryKey = (userId: string, body: {
  sceneId: string; productFamily: string; printSide: string;
  blueprintId?: number; printProviderId?: number;
}) => [userId, body.sceneId, body.productFamily, body.printSide,
  body.blueprintId ?? "any", body.printProviderId ?? "any"].join("|");

const overrideKey = (userId: string, listingId: string, designKey: string, sceneId: string) =>
  [userId, listingId, designKey, sceneId].join("|");

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};


/* D598 - identifiers are not trusted merely because the row would end up under
   the signed-in seller.

   The gap this closes, found by a live probe: a PUT naming listingId "forged",
   designKey "forged" and batchId "forged" returned 200 and created a real row.
   Nothing cross-seller - the body's userId was correctly ignored - but nothing
   checked that the named batch, listing, design and scene were real, owned, or
   related to one another. Stale or malformed identifiers silently created junk.

   Every relationship is now proved server-side against the database before a
   record is read or written, and anything that does not check out is a 404
   rather than a 403: an unreleased feature should not confirm what exists. */
type Relationship = { sceneId: string; batchId?: string; listingId?: string; designKey?: string; printSide?: string };

async function relationshipsHold(userId: string, want: Relationship) {
  const database = (env as unknown as { DB?: { prepare(q: string): { bind(...a: unknown[]): { first<T>(): Promise<T | null> } } } }).DB;
  if (!database) return false;

  /* The scene must be a mockup template this seller owns. */
  const [scene] = await getDb().select().from(mockupTemplates)
    .where(and(eq(mockupTemplates.id, want.sceneId), eq(mockupTemplates.userId, userId))).limit(1);
  if (!scene) return false;

  /* Print side, when one is named, must be the side this scene actually shows.
     A back-print record cannot be attached to a front-facing photograph. */
  if (want.printSide && (scene.printSide || "front") !== want.printSide) return false;

  /* Geometry-only reads stop here: they name no listing. */
  if (!want.batchId && !want.listingId && !want.designKey) return true;

  /* An override names all three, and all three must be present and consistent. */
  if (!want.batchId || !want.listingId || !want.designKey) return false;

  const batch = await database
    .prepare("SELECT id FROM listing_batches WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(want.batchId, userId).first<{ id: string }>();
  if (!batch) return false;

  /* The design must be a draft that belongs to THIS batch and THIS seller, and
     the listing id must be the draft that design actually produced. */
  const draft = await database
    .prepare("SELECT response_json FROM printify_draft_results WHERE user_id = ? AND batch_id = ? AND client_id = ? LIMIT 1")
    .bind(userId, want.batchId, want.designKey).first<{ response_json: string | null }>();
  if (!draft?.response_json) return false;
  try {
    const parsed = JSON.parse(draft.response_json) as { id?: string };
    if (!parsed.id || parsed.id !== want.listingId) return false;
  } catch { return false; }

  return true;
}

const notFound = () => NextResponse.json({ error: "Not available." }, { status: 404 });

async function handleGET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to load your mockups." }, { status: 401 });
  /* D589 - the placement editor is unreleased, so these endpoints are owner-only
     regardless of what the browser sends. The hidden button is a convenience;
     THIS is the access control. */
  if (!isOwner(user)) return NextResponse.json({ error: "Not available." }, { status: 404 });
  await ensureMockupStorage();
  const url = new URL(request.url);
  const sceneId = url.searchParams.get("sceneId") || "";
  const listingId = url.searchParams.get("listingId") || "";
  const designKey = url.searchParams.get("designKey") || "";
  const batchId = url.searchParams.get("batchId") || "";
  const productFamily = url.searchParams.get("productFamily") || "";
  const printSide = url.searchParams.get("printSide") || "front";
  const blueprintId = url.searchParams.get("blueprintId");
  const printProviderId = url.searchParams.get("printProviderId");
  if (!sceneId) return NextResponse.json({ error: "Which scene?" }, { status: 400 });

  /* D598 - prove the relationships before returning anything. */
  if (!await relationshipsHold(user.userId, { sceneId, printSide,
    ...(designKey ? { batchId, listingId, designKey } : {}) })) return notFound();

  const db = getDb();
  const [geometry] = await db.select().from(mockupSceneGeometry)
    .where(and(eq(mockupSceneGeometry.id, geometryKey(user.userId, {
      sceneId, productFamily, printSide,
      blueprintId: blueprintId ? Number(blueprintId) : undefined,
      printProviderId: printProviderId ? Number(printProviderId) : undefined,
    })), eq(mockupSceneGeometry.userId, user.userId))).limit(1);

  /* An override is only ever returned for the exact design it was made for.
     Same scene, same product, different design: nothing comes back. */
  const [override] = listingId && designKey ? await db.select().from(mockupArtworkOverrides)
    .where(and(eq(mockupArtworkOverrides.id, overrideKey(user.userId, listingId, designKey, sceneId)),
      eq(mockupArtworkOverrides.userId, user.userId))).limit(1) : [undefined];

  return NextResponse.json({
    geometry: geometry ? {
      sceneId: geometry.sceneId, productFamily: geometry.productFamily, printSide: geometry.printSide,
      blueprintId: geometry.blueprintId ?? undefined, printProviderId: geometry.printProviderId ?? undefined,
      renderingMode: geometry.renderingMode, surface: JSON.parse(geometry.surfaceJson),
      curvature: num(geometry.curvature), fabricStrength: num(geometry.fabricStrength),
      blendMode: geometry.blendMode, foregroundMaskKey: geometry.foregroundKey ?? undefined,
      preparationVersion: geometry.preparationVersion ?? undefined,
      sourceWidth: geometry.sourceWidth, sourceHeight: geometry.sourceHeight,
      origin: geometry.origin, updatedAt: geometry.updatedAt,
    } : null,
    override: override ? {
      sceneId: override.sceneId, listingId: override.listingId, batchId: override.batchId,
      offsetU: num(override.offsetU), offsetV: num(override.offsetV),
      scaleMultiplier: num(override.scaleMultiplier, 1), rotation: num(override.rotation),
      skewX: num(override.skewX), skewY: num(override.skewY),
      flipX: Boolean(override.flipX), flipY: Boolean(override.flipY),
      opacity: num(override.opacity, 1),
      cornerAdjust: override.cornerAdjustJson ? JSON.parse(override.cornerAdjustJson) : undefined,
      blendMode: override.blendMode ?? undefined,
      fabricStrength: override.fabricStrength === null ? undefined : num(override.fabricStrength),
      curvature: override.curvature === null ? undefined : num(override.curvature),
      updatedAt: override.updatedAt,
    } : null,
  });
}

async function handlePUT(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to save your mockups." }, { status: 401 });
  /* D589 - the placement editor is unreleased, so these endpoints are owner-only
     regardless of what the browser sends. The hidden button is a convenience;
     THIS is the access control. */
  if (!isOwner(user)) return NextResponse.json({ error: "Not available." }, { status: 404 });
  await ensureMockupStorage();
  const body = await request.json() as {
    geometry?: Record<string, unknown> & { sceneId?: string; origin?: string };
    override?: Record<string, unknown> & { sceneId?: string; listingId?: string; designKey?: string; batchId?: string };
  };
  const db = getDb(), now = new Date().toISOString();

  /* D598 - nothing is written unless every relationship checks out. Both records
     are validated before either is touched, so a bad override cannot leave a
     half-written geometry row behind. */
  if (body.geometry?.sceneId && !await relationshipsHold(user.userId, {
    sceneId: String(body.geometry.sceneId), printSide: body.geometry.printSide ? String(body.geometry.printSide) : undefined,
  })) return notFound();
  if (body.override?.sceneId && !await relationshipsHold(user.userId, {
    sceneId: String(body.override.sceneId),
    batchId: String(body.override.batchId || ""),
    listingId: String(body.override.listingId || ""),
    designKey: String(body.override.designKey || ""),
  })) return notFound();

  if (body.geometry?.sceneId) {
    const g = body.geometry as Record<string, unknown> & { sceneId: string };
    const id = geometryKey(user.userId, {
      sceneId: g.sceneId, productFamily: String(g.productFamily || ""), printSide: String(g.printSide || "front"),
      blueprintId: g.blueprintId === undefined ? undefined : Number(g.blueprintId),
      printProviderId: g.printProviderId === undefined ? undefined : Number(g.printProviderId),
    });
    /* Automatic preparation may fill an empty slot. It may not replace what a
       seller improved by hand. */
    const [existing] = await db.select().from(mockupSceneGeometry)
      .where(and(eq(mockupSceneGeometry.id, id), eq(mockupSceneGeometry.userId, user.userId))).limit(1);
    const incomingOrigin = g.origin === "seller-adjusted" ? "seller-adjusted" : "automatic";
    if (!(existing?.origin === "seller-adjusted" && incomingOrigin === "automatic")) {
      const row = {
        id, userId: user.userId, sceneId: g.sceneId,
        productFamily: String(g.productFamily || ""), printSide: String(g.printSide || "front"),
        blueprintId: g.blueprintId === undefined ? null : Number(g.blueprintId),
        printProviderId: g.printProviderId === undefined ? null : Number(g.printProviderId),
        renderingMode: String(g.renderingMode || "perspective"),
        surfaceJson: JSON.stringify(g.surface ?? []),
        curvature: String(num(g.curvature)), fabricStrength: String(num(g.fabricStrength)),
        blendMode: String(g.blendMode || "normal"),
        foregroundKey: g.foregroundMaskKey ? String(g.foregroundMaskKey) : null,
        preparationVersion: g.preparationVersion === undefined ? null : Number(g.preparationVersion),
        sourceWidth: Math.round(num(g.sourceWidth)), sourceHeight: Math.round(num(g.sourceHeight)),
        origin: incomingOrigin, updatedAt: now,
      };
      await db.insert(mockupSceneGeometry).values(row).onConflictDoUpdate({ target: mockupSceneGeometry.id, set: row });
    }
  }

  if (body.override?.sceneId && body.override.listingId && body.override.designKey) {
    const o = body.override as Record<string, unknown> & { sceneId: string; listingId: string; designKey: string };
    const row = {
      id: overrideKey(user.userId, o.listingId, o.designKey, o.sceneId),
      userId: user.userId, batchId: String(o.batchId || ""),
      listingId: o.listingId, designKey: o.designKey, sceneId: o.sceneId,
      offsetU: String(num(o.offsetU)), offsetV: String(num(o.offsetV)),
      scaleMultiplier: String(num(o.scaleMultiplier, 1)), rotation: String(num(o.rotation)),
      skewX: String(num(o.skewX)), skewY: String(num(o.skewY)),
      flipX: o.flipX ? 1 : 0, flipY: o.flipY ? 1 : 0,
      opacity: String(num(o.opacity, 1)),
      cornerAdjustJson: o.cornerAdjust ? JSON.stringify(o.cornerAdjust) : null,
      /* Null means "use the scene's setting". Only a value the seller actually
         changed for this listing is stored, so these cannot drift into becoming
         facts about the photograph. */
      blendMode: o.blendMode === undefined ? null : String(o.blendMode),
      fabricStrength: o.fabricStrength === undefined ? null : String(num(o.fabricStrength)),
      curvature: o.curvature === undefined ? null : String(num(o.curvature)),
      updatedAt: now,
    };
    await db.insert(mockupArtworkOverrides).values(row).onConflictDoUpdate({ target: mockupArtworkOverrides.id, set: row });
  }

  return NextResponse.json({ ok: true });
}

export const GET = withErrorLog("mockup-placement-load", handleGET);
export const PUT = withErrorLog("mockup-placement-save", handlePUT);
