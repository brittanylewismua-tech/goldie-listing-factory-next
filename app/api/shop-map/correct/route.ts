import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";

/**
 * MEMBER CORRECTIONS.
 *
 * Every correction is stored BESIDE the imported data, never on top of it.
 * The Etsy listing row and the Printify order row are what those services
 * said; a member disagreeing with how Goldie grouped or costed something is a
 * separate fact, and keeping them apart is what makes a correction reversible
 * and an import re-runnable.
 *
 * Reversal is a timestamp, not a delete: what someone thought last week is
 * part of how the current map came to look the way it does.
 */
export const POST = withErrorLog("shop-map-correct", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1_000);
  const body = await request.json().catch(() => ({})) as {
    action?: string; listingId?: number; worldIds?: string[]; worldId?: string;
    label?: string; mergeInto?: string; productFamily?: string;
    costMinor?: number; shippingMinor?: number; receiptId?: number; reason?: string;
  };

  const shopRow = await db.prepare(
    `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`)
    .bind(user.userId).first<{ shop_id: number }>();
  if (!shopRow) return NextResponse.json({ error: "No connected shop." }, { status: 400 });
  const shopId = Number(shopRow.shop_id);

  switch (body.action) {
    case "move-listing": {
      if (!body.listingId) return NextResponse.json({ error: "Which listing?" }, { status: 400 });
      /*
        D1669 · A CORRECTION FOR A LISTING THIS SHOP DOES NOT HAVE WAS ACCEPTED.

        Measured against the live shop: moving listing 999999999 returned
        {ok:true} with a 200. The write is an INSERT, so it did not merely
        fail to match — it created an override row for a listing that does
        not exist, and the member was told their correction had worked.

        The listing ID is typed by hand on that panel, so a typo or an ID
        copied from another shop is the ordinary case rather than the exotic
        one. An action must not report success it did not achieve.
      */
      const owns = await db.prepare(
        `SELECT 1 AS found FROM shop_map_listings
          WHERE user_id = ? AND shop_id = ? AND listing_id = ? LIMIT 1`)
        .bind(user.userId, shopId, body.listingId).first<{ found: number }>()
        .catch(() => null);
      if (!owns)
        return NextResponse.json({
          error: `Listing ${body.listingId} is not in this shop's map, so nothing `
            + `was changed. Check the listing ID on Etsy — it is the number in `
            + `the listing's own URL.`,
        }, { status: 404 });
      /*
        The niche is NOT validated here on purpose. The targets come from the
        shop's own map through a select, so an unknown one means a stale page
        rather than a mistake — and a first attempt at checking it queried a
        world_id column that shop_map_classifications does not have, which
        with its catch would have refused every correction instead. A check
        that can break the feature it guards is worse than the gap.
      */
      await db.prepare(
        `INSERT INTO shop_map_world_overrides
           (user_id, shop_id, listing_id, world_ids, reason, created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(user_id, shop_id, listing_id) DO UPDATE SET
           world_ids = excluded.world_ids, reason = excluded.reason,
           created_at = excluded.created_at, reversed_at = NULL`)
        .bind(user.userId, shopId, body.listingId,
          JSON.stringify(body.worldIds ?? []), String(body.reason ?? ""), now).run();
      return NextResponse.json({ ok: true, action: body.action });
    }
    /*
      BACK TO THE AUTOMATIC PLACEMENT.

      A member who corrected a listing had no way to undo it. Moving it to
      Unclassified is not the same thing: that is a member saying "this
      belongs nowhere", which is itself a correction and still overrides the
      build. Without this, a correction made by mistake was permanent, and
      the only records that could ever be retired were the orphans an audit
      found — which is a strange shape for a feature whose whole promise is
      that a member can fix what the shop got wrong.

      Reversal is a timestamp, not a delete. What someone thought last week is
      part of how the current map came to look the way it does.
    */
    case "clear-correction": {
      if (!body.listingId)
        return NextResponse.json({ error: "Which listing?" }, { status: 400 });
      const done = await db.prepare(
        `UPDATE shop_map_world_overrides SET reversed_at = ?
          WHERE user_id = ? AND shop_id = ? AND listing_id = ? AND reversed_at IS NULL`)
        .bind(now, user.userId, shopId, body.listingId).run()
        .catch(() => null);
      if (!done || !done.success)
        return NextResponse.json({
          error: "That correction could not be cleared, so it is still in place.",
        }, { status: 500 });
      /*
        Nothing to clear is not success. A member told "done" when no
        correction existed would believe a listing had gone back to the
        automatic placement when it had never left it.
      */
      if (!Number(done.meta?.changes ?? 0))
        return NextResponse.json({
          error: `Listing ${body.listingId} has no correction of yours to clear, `
            + `so nothing was changed.`,
        }, { status: 404 });
      return NextResponse.json({ ok: true, action: body.action });
    }
    case "rename-world":
    case "merge-worlds": {
      if (!body.worldId) return NextResponse.json({ error: "Which world?" }, { status: 400 });
      await db.prepare(
        `INSERT INTO shop_map_world_labels
           (user_id, shop_id, world_id, label, merged_into, created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(user_id, shop_id, world_id) DO UPDATE SET
           label = excluded.label, merged_into = excluded.merged_into,
           created_at = excluded.created_at`)
        .bind(user.userId, shopId, body.worldId, String(body.label ?? ""),
          String(body.mergeInto ?? ""), now).run();
      return NextResponse.json({ ok: true, action: body.action });
    }
    case "confirm-cost-rule": {
      if (!body.productFamily)
        return NextResponse.json({ error: "Which product family?" }, { status: 400 });
      await db.prepare(
        `INSERT INTO shop_map_cost_rules
           (user_id, shop_id, product_family, cost_minor, shipping_minor, currency, confirmed, created_at)
         VALUES (?,?,?,?,?, 'USD', 1, ?)
         ON CONFLICT(user_id, shop_id, product_family) DO UPDATE SET
           cost_minor = excluded.cost_minor, shipping_minor = excluded.shipping_minor,
           confirmed = 1, created_at = excluded.created_at`)
        .bind(user.userId, shopId, body.productFamily,
          Math.round(Number(body.costMinor ?? 0)), Math.round(Number(body.shippingMinor ?? 0)), now)
        .run();
      return NextResponse.json({ ok: true, action: body.action });
    }
    case "reverse": {
      /* A reversal is recorded, not erased. */
      if (body.listingId)
        await db.prepare(
          `UPDATE shop_map_world_overrides SET reversed_at = ?
            WHERE user_id = ? AND shop_id = ? AND listing_id = ?`)
          .bind(now, user.userId, shopId, body.listingId).run();
      if (body.worldId)
        await db.prepare(
          `DELETE FROM shop_map_world_labels WHERE user_id = ? AND shop_id = ? AND world_id = ?`)
          .bind(user.userId, shopId, body.worldId).run();
      if (body.productFamily)
        await db.prepare(
          `UPDATE shop_map_cost_rules SET confirmed = 0
            WHERE user_id = ? AND shop_id = ? AND product_family = ?`)
          .bind(user.userId, shopId, body.productFamily).run();
      return NextResponse.json({ ok: true, action: "reverse" });
    }
    default:
      return NextResponse.json({ error: "Unknown correction." }, { status: 400 });
  }
});
