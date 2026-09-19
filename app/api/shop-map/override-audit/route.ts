import { crossSiteWrite, CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { ensureListingTables } from "@/app/shop-map-listings";
import { quoteIsFromTheListing } from "@/app/listing-placement";

/**
 * ARE THERE ANY CORRECTIONS POINTING AT NOTHING?
 *
 * D1669 stopped an override being written for a listing the shop does not
 * have, but that check arrived after the panel had been usable for a while,
 * so it says nothing about rows already stored. This counts them.
 *
 * NO BLANKET CATCHES. An audit that turns a failed query into an empty result
 * reports "no problems found" when what happened is "nothing was looked at",
 * which is the exact failure it exists to catch. Every query here throws, and
 * a thrown query makes the whole response a 500 with the reason in it.
 *
 * ?repair=1 reverses the orphans rather than deleting them: a correction is
 * part of how the map came to look the way it does, so it is retired with a
 * timestamp, the same way a member's own reversal works.
 */
class AuditIncomplete extends Error {}

export const GET = withErrorLog("shop-map-override-audit", async (request: Request) => {
  if (crossSiteWrite(request)) return NextResponse.json(CROSS_SITE_REFUSAL, { status: 403 });
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  await ensureListingTables();
  const db = (env as unknown as { DB: D1Database }).DB;
  const repair = new URL(request.url).searchParams.get("repair") === "1";

  const all = async <T>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    const out = await db.prepare(sql).bind(...binds).all<T>()
      .catch((error: unknown) => {
        throw new AuditIncomplete(`${sql.trim().slice(0, 70)}… — ${String(error)}`);
      });
    if (!out || out.success === false)
      throw new AuditIncomplete(`${sql.trim().slice(0, 70)}… returned no result set`);
    return (out.results ?? []) as T[];
  };

  try {
    const shop = await all<{ shop_id: number }>(
      `SELECT shop_id FROM etsy_connections WHERE user_id = ? AND is_active = 1 LIMIT 1`,
      user.userId);
    if (!shop.length)
      return NextResponse.json({ error: "No connected shop, so there is nothing to audit." },
        { status: 400 });
    const shopId = Number(shop[0].shop_id);

    const rows = await all<{
      listing_id: number; world_ids: string; reversed_at: number | null;
      created_at: number; present: number;
    }>(
      `SELECT o.listing_id, o.world_ids, o.reversed_at, o.created_at,
              (SELECT COUNT(*) FROM shop_map_listings l
                WHERE l.user_id = o.user_id AND l.shop_id = o.shop_id
                  AND l.listing_id = o.listing_id) AS present
         FROM shop_map_world_overrides o
        WHERE o.user_id = ? AND o.shop_id = ?`,
      user.userId, shopId);

    const active = rows.filter(row => row.reversed_at === null);
    const orphans = active.filter(row => Number(row.present) === 0);
    /* More than one niche on one override would be money in two places. */
    const multiNiche: number[] = [];
    const unreadable: number[] = [];
    for (const row of active) {
      let ids: unknown = null;
      try { ids = JSON.parse(row.world_ids); } catch { unreadable.push(row.listing_id); continue; }
      if (Array.isArray(ids) && ids.length > 1) multiNiche.push(row.listing_id);
    }

    /* The primary key makes this impossible; it is checked because "impossible"
       is a claim about a schema, and the schema is what is being audited. */
    const duplicated = await all<{ listing_id: number; rows: number }>(
      `SELECT listing_id, COUNT(*) AS rows FROM shop_map_world_overrides
        WHERE user_id = ? AND shop_id = ?
        GROUP BY listing_id HAVING COUNT(*) > 1`,
      user.userId, shopId);

    /*
      HOW OFTEN DOES A MEMBER SEE A REAL REASON?

      D1682 shows the stored reason when it reads like a sentence a shop owner
      would write and replaces it with a general explanation otherwise. Which
      of those a member actually gets is a fact about the stored prose, not
      about the code, so it is measured rather than assumed. A low share here
      is not a bug — it means the panel is mostly explaining how placement
      works — but it should be known rather than discovered by a member.
    */
    const reasons = await all<{ evidence: string; title: string; tags: string }>(
      `SELECT c.evidence AS evidence, l.title AS title, l.tags AS tags
         FROM shop_map_classifications c
         LEFT JOIN shop_map_listings l
           ON l.user_id = c.user_id AND l.shop_id = c.shop_id
          AND l.listing_id = c.listing_id
        WHERE c.user_id = ? AND c.shop_id = ? AND c.primary_niche <> ''`,
      user.userId, shopId);
    const usable = reasons.filter(row => quoteIsFromTheListing(
      String(row.evidence ?? ""), String(row.title ?? ""), String(row.tags ?? "")));

    let repaired = 0;
    if (repair && orphans.length) {
      const now = Math.floor(Date.now() / 1_000);
      for (const row of orphans) {
        const done = await db.prepare(
          `UPDATE shop_map_world_overrides SET reversed_at = ?
            WHERE user_id = ? AND shop_id = ? AND listing_id = ? AND reversed_at IS NULL`)
          .bind(now, user.userId, shopId, row.listing_id).run()
          .catch((error: unknown) => {
            throw new AuditIncomplete(`retiring ${row.listing_id} failed — ${String(error)}`);
          });
        if (done.success === false)
          throw new AuditIncomplete(`retiring ${row.listing_id} reported no success`);
        repaired += 1;
      }
    }

    return NextResponse.json({
      shopId,
      overrides: { stored: rows.length, active: active.length,
        reversed: rows.length - active.length },
      orphaned: {
        count: orphans.length,
        listingIds: orphans.map(row => row.listing_id).slice(0, 50),
        retired: repaired,
      },
      moneyInTwoPlaces: { count: multiNiche.length, listingIds: multiNiche.slice(0, 50) },
      unreadable: { count: unreadable.length, listingIds: unreadable.slice(0, 50) },
      duplicatedRows: duplicated,
      storedReasons: {
        classified: reasons.length,
        shownAsTheMembersOwnWords: usable.length,
        replacedWithTheGeneralExplanation: reasons.length - usable.length,
        empty: reasons.filter(row => !String(row.evidence ?? "").trim()).length,
      },
      clean: !orphans.length && !multiNiche.length && !unreadable.length && !duplicated.length,
    });
  } catch (error) {
    if (error instanceof AuditIncomplete)
      return NextResponse.json({
        error: "This audit could not complete, so its result would not mean anything.",
        because: error.message,
      }, { status: 500 });
    throw error;
  }
});
