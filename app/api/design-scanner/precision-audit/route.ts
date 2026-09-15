import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";

/**
 * IS THIS COHORT ACTUALLY THE NICHE IT CLAIMS TO BE?
 *
 * Deterministic term matching can produce a set that passes every count and
 * still is not a niche — "teacher" matching a teacher-appreciation mug and a
 * teaching-hospital scrub top equally. Before a cohort backs a member-facing
 * comparison, the listings in it are read and judged.
 *
 * OWNER-ONLY, AND DELIBERATELY NOT REUSABLE. This is the only endpoint in the
 * scanner that returns listing titles and tags, and it exists so a human can
 * check the matcher. Nothing member-facing may call it, and Design Scanner
 * never returns a title, tag, shop name or image of a reference listing.
 */
export const GET = withErrorLog("design-scanner-precision-audit", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const phrase = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!phrase) return NextResponse.json({ error: "Give a niche phrase as ?q=" }, { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - EVIDENCE_FRESH_DAYS * 86_400) * 1000).toISOString();

  const corpus = await db.prepare(
    `SELECT r.listing_id AS listingId, a.shop_id AS shopId,
            r.title AS title, r.tags AS tags
       FROM reference_images r
       JOIN (SELECT DISTINCT listing_id, shop_id FROM listing_sales_activity
              WHERE interval_id IS NOT NULL AND observed_at >= ?) a
         ON a.listing_id = r.listing_id
      WHERE r.outcome = 'recovered'`)
    .bind(since)
    .all<{ listingId: number; shopId: number; title: string; tags: string }>();

  const { terms } = normalizeNiche(phrase);
  const candidates: Candidate[] = (corpus.results ?? []).map(row => ({
    listingId: Number(row.listingId), shopId: Number(row.shopId),
    title: String(row.title ?? ""), tags: String(row.tags ?? "").split("|").filter(Boolean),
  }));
  const byId = new Map(candidates.map(row => [row.listingId, row]));
  const result = intersect(candidates, new Set(candidates.map(row => row.listingId)), terms);

  return NextResponse.json({
    phrase, terms, cohort: result.members.length,
    listings: result.members.map(member => ({
      listingId: member.listingId, shopId: member.shopId,
      matchedTerms: member.matchedTerms,
      title: byId.get(member.listingId)?.title ?? "",
      tags: byId.get(member.listingId)?.tags ?? [],
    })),
  });
});
