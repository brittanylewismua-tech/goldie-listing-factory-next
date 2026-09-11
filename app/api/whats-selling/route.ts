import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { etsyApiCredential, etsyBudget, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * WHAT IS ALREADY WINNING THIS SEARCH.
 *
 * Etsy's own relevance order for a keyword, with the artwork, so a seller can
 * see what they are listing against before they list.
 *
 * WHAT THIS DOES NOT CLAIM. Not "best sellers" — Etsy does not publish sales
 * counts and inferring them from a ranking would be a guess dressed as a fact.
 * The ranking blends how well a listing matches the phrase with how it
 * performs, and new listings get a deliberate visibility boost, so a high
 * position is not proof of anything having sold. What is real: the position
 * Etsy gives it, the number of people who saved it, and how long it has been
 * up. Those are counted, not estimated, and the page says only those.
 *
 * SAVES PER DAY IS THE ONE DERIVED NUMBER, and it is honest arithmetic on two
 * real figures. Four hundred saves on a listing three weeks old and four
 * hundred on one from 2019 are the same number meaning opposite things; Etsy
 * hands over both halves, so the division is worth doing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WANT = 30;

/**
 * FRESH LOOKUPS A SELLER MAY SPEND IN A DAY.
 *
 * Only counted on a cache miss. Every keyword is stored for the day and shared
 * by everyone, so a phrase another seller looked up this morning is free to
 * serve again and must not count against anybody — the limit is there to bound
 * Etsy calls, not curiosity. In practice a seller researching one world hits
 * the same phrases as the last person in it, and never sees this number.
 */
const FRESH_PER_DAY = 25;

/** One shared row per keyword per day — see etsy_keyword_snapshots. */
const keyOf = (keyword: string, day: string) => `${day}:${keyword}`;
const tidy = (raw: string) =>
  raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);

type Listing = {
  listingId: number;
  title: string;
  url: string;
  image: string | null;
  price: number | null;
  currency: string;
  favorites: number;
  ageDays: number;
  savesPerDay: number;
  rank: number;
};

type EtsyListing = {
  listing_id?: number;
  title?: string;
  url?: string;
  num_favorers?: number;
  original_creation_timestamp?: number;
  price?: { amount?: number; divisor?: number; currency_code?: string };
  images?: { url_570xN?: string; url_fullxfull?: string }[];
};

function shape(rows: EtsyListing[]): Listing[] {
  const now = Date.now();
  return rows.flatMap((row, index) => {
    const listingId = Number(row.listing_id);
    if (!listingId) return [];
    const created = Number(row.original_creation_timestamp) * 1000;
    /* Guard the divisor: a listing created today is not an infinite rate. */
    const ageDays = Number.isFinite(created) && created > 0
      ? Math.max(1, Math.round((now - created) / DAY_MS))
      : 0;
    const favorites = Math.max(0, Number(row.num_favorers) || 0);
    const divisor = Number(row.price?.divisor) || 100;
    const amount = Number(row.price?.amount);
    return [{
      listingId,
      title: String(row.title ?? "").slice(0, 200),
      /* Linked back to Etsy, as their API terms require. */
      url: String(row.url ?? `https://www.etsy.com/listing/${listingId}`),
      image: row.images?.[0]?.url_570xN ?? row.images?.[0]?.url_fullxfull ?? null,
      price: Number.isFinite(amount) ? amount / divisor : null,
      currency: String(row.price?.currency_code ?? "USD"),
      favorites,
      ageDays,
      savesPerDay: ageDays > 0 ? Number((favorites / ageDays).toFixed(2)) : 0,
      rank: index + 1,
    }];
  });
}

async function handleGET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see what is selling." }, { status: 401 });

  const keyword = tidy(new URL(request.url).searchParams.get("keyword") ?? "");
  if (keyword.length < 2)
    return NextResponse.json({ error: "Type a keyword to look up." }, { status: 400 });

  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = keyOf(keyword, day);
  const db = env.DB as D1Database;

  const cached = await db
    .prepare("SELECT listings_json FROM etsy_keyword_snapshots WHERE keyword_day=?")
    .bind(cacheKey)
    .first<{ listings_json: string }>();
  if (cached) {
    try {
      return NextResponse.json({ keyword, day, fresh: false, listings: JSON.parse(cached.listings_json) as Listing[] });
    } catch {
      /* A corrupt row is not a reason to refuse; fall through and refetch. */
    }
  }

  /*
    PUBLISHING COMES FIRST, ALWAYS.

    This is a browsing feature. Someone else's batch going out is what they
    paid for. If the day's quota is tight, serve the most recent snapshot we
    have — yesterday's winners are a perfectly good answer — and never take a
    call that publishing might need.
  */
  /* Checked only now, after the cache has already answered for free. */
  const spentRow = await db
    .prepare("SELECT fresh_lookups FROM keyword_lookup_usage WHERE user_day=?")
    .bind(`${user.userId}:${day}`)
    .first<{ fresh_lookups: number }>();
  if (Number(spentRow?.fresh_lookups || 0) >= FRESH_PER_DAY)
    return NextResponse.json(
      { error: `That is ${FRESH_PER_DAY} new keywords today. Anything already looked up is still free — this resets tomorrow.`, capped: true },
      { status: 429 },
    );

  const budget = await etsyBudget();
  if (budget.remaining < 50) {
    const recent = await db
      .prepare("SELECT day,listings_json FROM etsy_keyword_snapshots WHERE keyword=? ORDER BY day DESC LIMIT 1")
      .bind(keyword)
      .first<{ day: string; listings_json: string }>();
    if (recent)
      return NextResponse.json({ keyword, day: recent.day, fresh: false, stale: true, listings: JSON.parse(recent.listings_json) as Listing[] });
    return NextResponse.json(
      { error: "Etsy lookups are paused while listings are publishing. This comes back on its own." },
      { status: 503 },
    );
  }

  await waitForEtsyCapacity();
  const query = new URLSearchParams({
    keywords: keyword,
    limit: String(WANT),
    sort_on: "score",
    sort_order: "desc",
  });
  const response = await fetch(`https://api.etsy.com/v3/application/listings/active?${query}`, {
    headers: { "x-api-key": etsyApiCredential() },
    signal: AbortSignal.timeout(20000),
  });
  await recordEtsyCall(response, "search");

  if (!response.ok)
    return NextResponse.json(
      { error: response.status === 429 ? "Etsy asked us to slow down. Try again shortly." : `Etsy could not answer that (${response.status}).` },
      { status: 502 },
    );

  const payload = (await response.json()) as { results?: EtsyListing[] };
  const listings = shape(payload.results ?? []);

  /* Written even when empty, so a keyword with no results does not re-ask Etsy
     on every visit for the rest of the day. */
  await db.batch([
    db.prepare("INSERT INTO etsy_keyword_snapshots (keyword_day,keyword,day,listings_json) VALUES (?,?,?,?) ON CONFLICT(keyword_day) DO UPDATE SET listings_json=excluded.listings_json")
      .bind(cacheKey, keyword, day, JSON.stringify(listings)),
    /* Spent only here — the one path that actually cost an Etsy call. */
    db.prepare("INSERT INTO keyword_lookup_usage (user_day,user_id,day,fresh_lookups) VALUES (?,?,?,1) ON CONFLICT(user_day) DO UPDATE SET fresh_lookups=fresh_lookups+1,updated_at=CURRENT_TIMESTAMP")
      .bind(`${user.userId}:${day}`, user.userId, day),
  ]);

  return NextResponse.json({ keyword, day, fresh: true, listings });
}

export const GET = withErrorLog("whats-selling", handleGET);
