import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyConnection, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * WHAT DOES AN ETSY IMAGE ID ACTUALLY MEAN?
 *
 * Every historical transaction names a `listing_image_id`, and all 39 of this
 * shop's are still retrievable. That is only evidence of what a buyer SAW if
 * an image id is immutable — if replacing a listing's image mints a new id and
 * leaves the old bytes alone. If an id can come to point at different bytes,
 * the same data means something much weaker and the language has to change
 * from "order-time image" to "transaction-linked listing image".
 *
 * Documentation does not settle this. So: a purpose-built draft, two images,
 * an overwrite, a rank change, and the bytes hashed at every step.
 *
 * SAFETY. It creates its own draft and never touches an existing listing. The
 * draft is never published — Etsy's own `state` is read back and reported at
 * every step — and it is deleted at the end. It refuses to run without an
 * explicit confirmation in the URL, so it cannot fire by accident.
 */
/* CRC32, which PNG requires on every chunk. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array) => {
  const name = new TextEncoder().encode(type);
  const body = new Uint8Array(name.length + data.length);
  body.set(name);
  body.set(data, name.length);
  const out = new Uint8Array(8 + data.length + 4);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(body, 4);
  new DataView(out.buffer).setUint32(out.length - 4, crc32(body));
  return out;
};

/**
 * A real PNG of one colour, built here so the test depends on nothing.
 *
 * Etsy rejects tiny images, so it is 600 square — small enough to be quick,
 * large enough to be accepted.
 */
async function solidPng(size: number, [red, green, blue]: [number, number, number]) {
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let row = 0; row < size; row += 1) {
    const start = row * (size * 3 + 1);
    raw[start] = 0;
    for (let column = 0; column < size; column += 1) {
      const at = start + 1 + column * 3;
      raw[at] = red; raw[at + 1] = green; raw[at + 2] = blue;
    }
  }
  /* PNG's IDAT is zlib, which is exactly what deflate gives us. */
  const compressed = new Uint8Array(await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 8;   /* bit depth */
  header[9] = 2;   /* truecolour */

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { png.set(part, at); at += part.length; }
  return png.buffer;
}

const sha256 = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export const GET = withErrorLog("shop-map-image-id-test", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parameters = new URL(request.url).searchParams;

  /*
    A way to remove a draft this route left behind. The first run created one
    and failed to delete it, and a test that litters somebody's shop needs its
    own broom rather than an apology.
  */
  const cleanup = Number(parameters.get("cleanup"));
  if (cleanup > 0) {
    const connection = await etsyConnection(user.userId);
    const remove = async (path: string, init?: RequestInit) => {
      await waitForEtsyCapacity();
      const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
        ...init,
        headers: {
          "x-api-key": etsyApiCredential(),
          authorization: `Bearer ${connection.token}`,
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
      await recordEtsyCall(response, "qa");
      const text = await response.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* status carries it */ }
      return { status: response.status, parsed, text: parsed ? "" : text.slice(0, 200) };
    };
    /* Only ever a draft, and only ever one this route would have made. */
    const listing = await remove(`/listings/${cleanup}`);
    const title = String((listing.parsed as { title?: string })?.title ?? "");
    const state = String((listing.parsed as { state?: string })?.state ?? "");
    if (listing.status === 404)
      return NextResponse.json({ listingId: cleanup, alreadyGone: true });
    if (!title.startsWith("GOLDIE INTERNAL"))
      return NextResponse.json({
        error: "That listing is not a Goldie test draft. Nothing was deleted.",
        title, state,
      }, { status: 400 });
    const deleted = await remove(`/listings/${cleanup}`, { method: "DELETE" });
    const readBack = await remove(`/listings/${cleanup}`);
    return NextResponse.json({
      listingId: cleanup, title, state,
      deleteStatus: deleted.status,
      confirmedGone: readBack.status === 404,
      said: deleted.status === 204 || deleted.status === 200 ? null : deleted.parsed ?? deleted.text,
    });
  }

  if (parameters.get("confirm") !== "create-and-delete-test-draft")
    return NextResponse.json({
      error: "This creates a draft listing on the connected shop. Add ?confirm=create-and-delete-test-draft to run it.",
    }, { status: 400 });

  /*
    RUNNING AGAINST A DRAFT THAT ALREADY EXISTS.

    A draft this route created earlier is still there, unpublished and
    invisible to buyers, and it cannot be deleted without a permission nobody
    should grant for a test. Using it costs nothing new: no listing is
    created, none is deleted, and `listings_w` already covers the image
    operations. It is verified to be a Goldie test draft in draft state before
    a single byte is uploaded.
  */
  const existing = Number(parameters.get("existing"));

  /*
    DO NOT CREATE WHAT YOU CANNOT REMOVE.

    The first run created a draft and then discovered that deleting a listing
    needs `listings_d`, which this connection does not have — so a test that
    promised to clean up after itself left a draft in somebody's shop instead.
    The capability is checked before anything is created now, and the run is
    refused rather than started.
  */
  const db = (env as unknown as { DB: D1Database }).DB;
  const grant = await db
    .prepare(`SELECT scopes FROM etsy_connections WHERE user_id = ? AND is_active = 1`)
    .bind(user.userId).first<{ scopes: string | null }>();
  const canDelete = Boolean(grant?.scopes?.split(/\s+/).includes("listings_d"));
  if (!canDelete && !existing)
    return NextResponse.json({
      refused: "This test creates a draft listing, and deleting one needs Etsy's listings_d permission, which this connection does not have. Nothing was created.",
      grantedScopes: grant?.scopes ?? null,
      whatWouldBeNeeded: "listings_d",
    }, { status: 412 });

  const connection = await etsyConnection(user.userId);
  const shopId = connection.shopId;
  const steps: Array<Record<string, unknown>> = [];
  const created: Record<string, unknown> = { listingId: null, imageIds: [] as number[] };

  const call = async (path: string, init?: RequestInit) => {
    await waitForEtsyCapacity();
    const response = await fetch(`https://openapi.etsy.com/v3/application${path}`, {
      ...init,
      headers: {
        "x-api-key": etsyApiCredential(),
        authorization: `Bearer ${connection.token}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    await recordEtsyCall(response, "qa");
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* status carries it */ }
    return { status: response.status, parsed, text: parsed ? "" : text.slice(0, 300) };
  };

  try {
    /*
      Two images built here, rather than fetched.

      The first run pulled them from Goldie's own origin and got sixteen
      identical bytes back — the worker fetching itself — so both uploads
      failed and the test proved nothing. Generating them removes the
      dependency entirely, and nothing of the seller's is involved either way.
    */
    const imageA = await solidPng(600, [255, 79, 195]);
    const imageB = await solidPng(600, [12, 10, 14]);
    const hashA = await sha256(imageA);
    const hashB = await sha256(imageB);
    steps.push({ step: "prepared images", hashA, bytesA: imageA.byteLength, hashB, bytesB: imageB.byteLength });

    /* ------------------------------------------------- the draft to use */
    /*
      A DIGITAL DRAFT, DELIBERATELY.

      A physical listing now needs a shipping profile AND a readiness state —
      Etsy answered "A readiness_state_id is required for physical listings" —
      which means reaching into the seller's real shipping configuration for a
      throwaway test. A download listing needs neither, touches nothing the
      seller has set up, and uploads images through exactly the same endpoint,
      which is the only part under test.
    */
    const fields = {
      quantity: "1",
      title: "GOLDIE INTERNAL — image id test, do not publish",
      description: "Internal Goldie test listing. Created and deleted automatically. Never published.",
      price: "1.00",
      who_made: "i_did",
      when_made: "made_to_order",
      taxonomy_id: "1855",
      type: "download",
      state: "draft",
    };
    let draft = existing
      ? await call(`/listings/${existing}`)
      : await call(`/shops/${shopId}/listings`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });

    /* Anything reached by id has to prove it is ours and still a draft. */
    if (existing) {
      const title = String((draft.parsed as { title?: string })?.title ?? "");
      const state = String((draft.parsed as { state?: string })?.state ?? "");
      if (!title.startsWith("GOLDIE INTERNAL") || state !== "draft")
        return NextResponse.json({
          error: "That listing is not an unpublished Goldie test draft. Nothing was touched.",
          title, state,
        }, { status: 400 });
      steps.push({ step: "using the existing test draft", listingId: existing, state });
    }

    /* If Etsy will not take a download listing, fall back to a physical one
       with a readiness state it names itself. */
    if (!existing && draft.status !== 201 && draft.status !== 200) {
      const profiles = await call(`/shops/${shopId}/shipping-profiles`);
      const profileId = Number(
        ((profiles.parsed as { results?: Array<{ shipping_profile_id?: number }> })?.results ?? [])[0]
          ?.shipping_profile_id ?? 0);
      const readiness = await call(`/shops/${shopId}/readiness-states`);
      const readinessId = Number(
        ((readiness.parsed as { results?: Array<{ readiness_state_id?: number }> })?.results ?? [])[0]
          ?.readiness_state_id ?? 0);
      steps.push({
        step: "download listing refused, trying physical",
        said: draft.parsed ?? draft.text, profileId, readinessId,
      });
      if (profileId && readinessId)
        draft = await call(`/shops/${shopId}/listings`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            ...fields, type: "physical",
            shipping_profile_id: String(profileId),
            readiness_state_id: String(readinessId),
          }),
        });
    }
    const listingId = Number((draft.parsed as { listing_id?: number })?.listing_id ?? 0);
    if (!listingId)
      return NextResponse.json({ step: "create-draft", said: draft.parsed ?? draft.text }, { status: 502 });
    created.listingId = existing ? null : listingId;
    if (!existing)
      steps.push({
        step: "created draft", listingId,
        state: (draft.parsed as { state?: string })?.state ?? null,
      });

    const upload = async (bytes: ArrayBuffer, rank: number, overwrite?: number) => {
      const form = new FormData();
      form.set("image", new File([bytes], "goldie-test.png", { type: "image/png" }));
      form.set("rank", String(rank));
      if (overwrite) form.set("listing_image_id", String(overwrite));
      return call(`/shops/${shopId}/listings/${listingId}/images`, { method: "POST", body: form });
    };

    /* --------------------------------------------------- image A at rank 1 */
    const first = await upload(imageA, 1);
    const idA = Number((first.parsed as { listing_image_id?: number })?.listing_image_id ?? 0);
    (created.imageIds as number[]).push(idA);
    steps.push({ step: "uploaded A at rank 1", listingImageId: idA, status: first.status });

    const fetchImage = async (imageId: number) => {
      const meta = await call(`/shops/${shopId}/listings/${listingId}/images/${imageId}`);
      const url = (meta.parsed as { url_fullxfull?: string })?.url_fullxfull;
      if (meta.status !== 200 || !url) return { status: meta.status, hash: null, url: null };
      const bytes = await fetch(url).then(response => response.arrayBuffer()).catch(() => null);
      return { status: meta.status, hash: bytes ? await sha256(bytes) : null, url };
    };

    const afterA = await fetchImage(idA);
    steps.push({ step: "read A back", listingImageId: idA, status: afterA.status, hash: afterA.hash });

    /* ------------------------------- overwrite the SAME rank with image B */
    const second = await upload(imageB, 1, idA);
    const idB = Number((second.parsed as { listing_image_id?: number })?.listing_image_id ?? 0);
    if (idB) (created.imageIds as number[]).push(idB);
    steps.push({
      step: "uploaded B over rank 1", listingImageId: idB, status: second.status,
      sameIdAsA: idB === idA,
    });

    /* The question the whole thing exists to answer. */
    const oldIdAfterOverwrite = await fetchImage(idA);
    const newIdAfterOverwrite = idB && idB !== idA ? await fetchImage(idB) : null;
    steps.push({
      step: "old id after overwrite", listingImageId: idA,
      status: oldIdAfterOverwrite.status, hash: oldIdAfterOverwrite.hash,
      stillOriginalBytes: oldIdAfterOverwrite.hash === hashA,
      nowHoldsImageB: oldIdAfterOverwrite.hash === hashB,
    });
    if (newIdAfterOverwrite)
      steps.push({
        step: "new id after overwrite", listingImageId: idB,
        status: newIdAfterOverwrite.status, hash: newIdAfterOverwrite.hash,
        holdsImageB: newIdAfterOverwrite.hash === hashB,
      });

    /* ------------------------------------ rank movement, without replacing */
    const liveId = idB && idB !== idA ? idB : idA;
    const ranked = await upload(imageA, 2);
    const idSecondSlot = Number((ranked.parsed as { listing_image_id?: number })?.listing_image_id ?? 0);
    if (idSecondSlot) (created.imageIds as number[]).push(idSecondSlot);
    const liveAfterRank = await fetchImage(liveId);
    steps.push({
      step: "added a second image, then re-read the first",
      secondSlotImageId: idSecondSlot,
      firstImageId: liveId,
      status: liveAfterRank.status,
      identityUnchanged: liveAfterRank.status === 200,
      hashUnchanged: liveAfterRank.hash === (liveId === idA ? hashA : hashB),
    });

    /* --------------------------------------------- confirm it never published */
    const finalState = await call(`/listings/${listingId}`);
    const state = (finalState.parsed as { state?: string })?.state ?? null;
    steps.push({ step: "state before deletion", state });

    /* ------------------------------------------------------------- clean up */
    /*
      Etsy deletes a listing at /listings/{id}, NOT under the shop — the
      shop-scoped path answers 404 and leaves the draft sitting there.

      And nothing is deleted at all when the draft was already here: this
      connection holds no listings_d, the attempt would fail, and a failed
      delete in the middle of a successful measurement reads like the
      measurement failed.
    */
    let removed = { status: 0 };
    let gone = { status: 0 };
    if (!existing) {
      removed = await call(`/listings/${listingId}`, { method: "DELETE" });
      gone = await call(`/listings/${listingId}`);
      steps.push({
        step: "deleted the draft", deleteStatus: removed.status,
        readBackStatus: gone.status, confirmedGone: gone.status === 404,
      });
    } else {
      steps.push({
        step: "left the draft in place",
        why: "No listings_d on this connection. It must be deleted by hand in Shop Manager.",
      });
    }

    /*
      The verdict, stated as one of the four behaviours rather than left for
      somebody to infer from the steps.
    */
    const overwriteMintedNewId = Boolean(idB && idB !== idA);
    const oldBytesSurvived = oldIdAfterOverwrite.hash === hashA;
    const verdict = overwriteMintedNewId && oldBytesSurvived
      ? "new-id-old-bytes-preserved"
      : overwriteMintedNewId && !oldBytesSurvived
        ? "new-id-old-image-removed"
        : !overwriteMintedNewId && oldIdAfterOverwrite.hash === hashB
          ? "same-id-different-bytes"
          : "other";

    return NextResponse.json({
      shopId,
      created,
      neverPublished: state === "draft" || state === "removed" || state === null,
      draftRemoved: existing ? false : gone.status === 404,
      manualDeletionRequired: Boolean(existing),
      listingToDeleteByHand: existing || null,
      verdict,
      /* What the verdict licenses us to say on a screen. */
      language: verdict === "new-id-old-bytes-preserved"
        ? "order-time Etsy image"
        : "transaction-linked listing image",
      steps,
    });
  } catch (error) {
    /* If anything throws, say what exists so it can be cleaned up by hand. */
    return NextResponse.json({
      error: error instanceof Error ? error.message : "failed",
      created, steps,
      note: "Anything listed under `created` may still exist and should be checked.",
    }, { status: 500 });
  }
});
