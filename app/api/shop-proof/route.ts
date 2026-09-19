import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner, runtime } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { etsyApiCredential, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * CAN WE PROVE A PER-LISTING SALE, OR NOT?
 *
 * Everything built so far infers sales from a listing's quantity falling, and
 * that inference is unreliable: quantity is summed across variants, Printify
 * resets it on republish, and a seller editing stock looks identical to a
 * customer buying. Etsy's own `transaction_sold_count` is exact but belongs to
 * the SHOP, not the listing, and splitting a shop's total across its listings
 * by favourites would be inventing numbers again.
 *
 * THE IDEA THIS MEASURES. Watch every listing in a shop rather than a scatter
 * of listings across many shops. Then the shop's sold-count delta is fully
 * distributable across listings we can see, and the two signals check each
 * other: if the shop sold 12 and the quantity drops sum to 12, that is two
 * independent measurements agreeing, which is proof rather than inference.
 *
 * WHAT THIS ENDPOINT DOES NOT DO. It does not build the feature. It answers
 * the one question that decides whether the feature is worth building: how
 * often do the two signals actually agree? If it is most of the time, the
 * board can show only the shops where they agree and every number on it is
 * defensible. If it is rarely, quantity is dead and we stop pretending.
 *
 * Two passes, minutes apart. Pass one records; pass two compares.
 */

type Shop = { shop_id?: number; transaction_sold_count?: number; listing_active_count?: number };
type Listing = {
  listing_id?: number; shop_id?: number; quantity?: number; title?: string;
  num_favorers?: number; state?: string; shop?: Shop;
};

const db = () => runtime().DB!;

async function ensure() {
  await db().batch([
    db().prepare(
      `CREATE TABLE IF NOT EXISTS shop_proof (
         shop_id     INTEGER NOT NULL,
         listing_id  INTEGER NOT NULL,
         quantity    INTEGER,
         sold_count  INTEGER,
         active_count INTEGER,
         seen_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (shop_id, listing_id)
       )`),
  ]);
}

async function etsy(path: string) {
  await waitForEtsyCapacity();
  const response = await fetch(`https://openapi.etsy.com/v3/application/${path}`, {
    headers: { "x-api-key": etsyApiCredential() },
    signal: AbortSignal.timeout(20_000),
  });
  await recordEtsyCall(response, "qa");
  if (!response.ok) return null;
  return response.json() as Promise<{ results?: unknown[]; count?: number }>;
}

export const GET = withErrorLog("shop-proof", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensure();
  const url = new URL(request.url);
  const wantShops = Math.max(1, Math.min(60, Number(url.searchParams.get("shops")) || 25));

  /* Shops that already sell print-on-demand, taken from listings we watch. */
  const seeds = (await db().prepare(
    `SELECT DISTINCT shop_id FROM sold_watch
      WHERE shop_id IS NOT NULL AND favorites > 0
      ORDER BY RANDOM() LIMIT ?`).bind(wantShops).all())
    .results as unknown as { shop_id: number }[];
  if (!seeds.length)
    return NextResponse.json({ error: "No shops in the watch list yet." }, { status: 503 });

  let calls = 0;
  const now: { shopId: number; listingId: number; quantity: number | null;
               soldCount: number | null; activeCount: number | null }[] = [];

  for (const seed of seeds) {
    /*
      EVERY ACTIVE LISTING IN THE SHOP, not a sample of it. Partial coverage
      makes the comparison meaningless: a shop's total can only be checked
      against its listings if all of them are on the table.
    */
    const page = await etsy(
      `shops/${seed.shop_id}/listings/active?limit=100&includes=Shop`);
    calls++;
    const rows = (page?.results ?? []) as Listing[];
    if (!rows.length) continue;

    const shop = rows.find(row => row.shop)?.shop ?? null;
    for (const row of rows) {
      if (!Number.isSafeInteger(Number(row.listing_id))) continue;
      now.push({
        shopId: Number(seed.shop_id),
        listingId: Number(row.listing_id),
        quantity: Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : null,
        soldCount: shop && Number.isFinite(Number(shop.transaction_sold_count))
          ? Number(shop.transaction_sold_count) : null,
        activeCount: shop && Number.isFinite(Number(shop.listing_active_count))
          ? Number(shop.listing_active_count) : null,
      });
    }
  }

  /* ---- compare against the previous pass, per shop ---- */
  const before = (await db().prepare(
    "SELECT shop_id,listing_id,quantity,sold_count,active_count,seen_at FROM shop_proof").all())
    .results as unknown as {
      shop_id: number; listing_id: number; quantity: number | null;
      sold_count: number | null; active_count: number | null; seen_at: string;
    }[];
  const priorListing = new Map(before.map(r => [`${r.shop_id}:${r.listing_id}`, r]));
  const priorShop = new Map<number, { soldCount: number | null; seenAt: string }>();
  for (const row of before)
    if (!priorShop.has(row.shop_id))
      priorShop.set(row.shop_id, { soldCount: row.sold_count, seenAt: row.seen_at });

  const perShop = new Map<number, { quantityDrop: number; soldDelta: number | null;
                                    listings: number; covered: number | null }>();
  for (const row of now) {
    const at = perShop.get(row.shopId) ??
      { quantityDrop: 0, soldDelta: null, listings: 0, covered: row.activeCount };
    at.listings++;
    const was = priorListing.get(`${row.shopId}:${row.listingId}`);
    if (was?.quantity != null && row.quantity != null) {
      const fell = Number(was.quantity) - row.quantity;
      if (fell > 0) at.quantityDrop += fell;
    }
    const shopWas = priorShop.get(row.shopId);
    if (shopWas?.soldCount != null && row.soldCount != null)
      at.soldDelta = row.soldCount - Number(shopWas.soldCount);
    perShop.set(row.shopId, at);
  }

  const compared = [...perShop.entries()]
    .filter(([, at]) => at.soldDelta !== null)
    .map(([shopId, at]) => ({
      shopId,
      soldByEtsy: at.soldDelta as number,
      soldByQuantity: at.quantityDrop,
      listingsWatched: at.listings,
      listingsInShop: at.covered,
      /* Complete coverage is the precondition for the comparison meaning
         anything at all. */
      wholeShop: at.covered != null && at.listings >= at.covered,
      agrees: at.soldDelta === at.quantityDrop,
    }));

  const moved = compared.filter(row => row.soldByEtsy > 0 || row.soldByQuantity > 0);
  const whole = moved.filter(row => row.wholeShop);
  const agreeing = whole.filter(row => row.agrees);

  /* ---- store this pass for the next one ---- */
  const writes = now.map(row => db().prepare(
    `INSERT INTO shop_proof (shop_id,listing_id,quantity,sold_count,active_count,seen_at)
     VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(shop_id,listing_id) DO UPDATE SET
       quantity=excluded.quantity, sold_count=excluded.sold_count,
       active_count=excluded.active_count, seen_at=CURRENT_TIMESTAMP`)
    .bind(row.shopId, row.listingId, row.quantity, row.soldCount, row.activeCount));
  for (let at = 0; at < writes.length; at += 50) await db().batch(writes.slice(at, at + 50));

  return NextResponse.json({
    etsyCalls: calls,
    shopsRead: perShop.size,
    listingsRead: now.length,
    /* Does the endpoint even give us what this rests on? */
    shopFieldsPresent: {
      transactionSoldCount: now.filter(r => r.soldCount != null).length,
      listingActiveCount: now.filter(r => r.activeCount != null).length,
      of: now.length,
    },
    comparison: compared.length === 0
      ? "First pass — nothing to compare yet. Run it again in twenty minutes."
      : {
          shopsWhereSomethingMoved: moved.length,
          ofThoseFullyCovered: whole.length,
          andTheTwoSignalsAgreed: agreeing.length,
          agreementRate: whole.length
            ? `${Math.round((agreeing.length / whole.length) * 100)}%` : "n/a",
          examples: moved.slice(0, 12),
        },
  });
});
