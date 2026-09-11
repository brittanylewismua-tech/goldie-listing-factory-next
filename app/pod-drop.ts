import { env } from "cloudflare:workers";
import { etsyApiCredential, etsyBudget, recordEtsyCall, waitForEtsyCapacity } from "@/app/api/etsy/client";

/**
 * TODAY'S DROP — WHAT MOVED IN PRINT-ON-DEMAND WHILE THEY WERE AWAY.
 *
 * The reason to open the Listing Factory on a day you do not feel like
 * listing. It is built once a day for everybody, not per seller: "what is
 * winning in sweatshirts" has one answer, so it costs a dozen Etsy calls a day
 * whether fifty people read it or five thousand.
 *
 * THE HISTORY IS THE PRODUCT. Any tool can show a snapshot. Only one that has
 * photographed the market every night can say what ENTERED the top thirty
 * today, what climbed, what fell out. That is the part nobody else has, it
 * cannot be copied by shipping the same feature tomorrow, and it is what makes
 * coming back worth something — the interesting half only exists because
 * yesterday's row exists.
 *
 * WHAT IT NEVER CLAIMS. Not sales, not revenue, not "best sellers". Etsy
 * publishes no sales figures, its ranking mixes keyword match with
 * performance, and new listings get a deliberate visibility boost — so a high
 * position proves nothing was sold. Everything here is counted: the position
 * Etsy gives a listing, how many people saved it, how old it is. The single
 * derived number is saves per day, which is division on two real figures.
 */

const DAY_MS = 86_400_000;
const PER_CATEGORY = 30;
/** Below this a listing is too new for saves-per-day to mean anything. */
const MIN_AGE_DAYS = 7;
/** Enough headroom that a drop build can never starve someone's publish. */
const BUDGET_FLOOR = 200;

/**
 * The print-on-demand shelf, by name rather than by id.
 *
 * Etsy has no "is print on demand" flag — it cannot tell a printed tee from a
 * hand-screened one, and neither can we. What it does have is a category tree,
 * and POD is in practice a known set of products. Matched by name against the
 * live tree rather than hardcoded as numbers, because an id copied from a blog
 * post can quietly come to mean something else and nobody would notice.
 */
const POD_PRODUCTS = [
  "T-Shirts", "Sweatshirts", "Hoodies", "Tank Tops",
  "Mugs", "Tote Bags", "Prints", "Stickers",
  "Phone Cases", "Blankets", "Throw Pillows", "Hats",
];

export type DropListing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string; favorites: number;
  ageDays: number; savesPerDay: number; rank: number;
};
export type DropCategory = {
  taxonomyId: number; label: string;
  listings: DropListing[];
  /** Median saves-per-day across the category — how hot the shelf is. */
  heat: number;
  /** In today's top thirty, absent from yesterday's. The breakout. */
  newToday: number[];
  /** Ranked higher than yesterday by five places or more. */
  climbing: number[];
};

type Runtime = { DB: D1Database };
type Row = Record<string, unknown>;
const db = () => (env as unknown as Runtime).DB;
const today = () => new Date().toISOString().slice(0, 10);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};

type EtsyRow = {
  listing_id?: number; title?: string; url?: string; num_favorers?: number;
  original_creation_timestamp?: number;
  price?: { amount?: number; divisor?: number; currency_code?: string };
  images?: { url_570xN?: string; url_fullxfull?: string }[];
};

function shape(rows: EtsyRow[]): DropListing[] {
  const now = Date.now();
  return rows.flatMap((row, i) => {
    const listingId = Number(row.listing_id);
    if (!listingId) return [];
    const created = Number(row.original_creation_timestamp) * 1000;
    const ageDays = created > 0 ? Math.max(1, Math.round((now - created) / DAY_MS)) : 0;
    const favorites = Math.max(0, Number(row.num_favorers) || 0);
    const amount = Number(row.price?.amount), divisor = Number(row.price?.divisor) || 100;
    return [{
      listingId,
      title: String(row.title ?? "").slice(0, 200),
      /* Linked back to the listing, as Etsy's API terms require. */
      url: String(row.url ?? `https://www.etsy.com/listing/${listingId}`),
      image: row.images?.[0]?.url_570xN ?? row.images?.[0]?.url_fullxfull ?? null,
      price: Number.isFinite(amount) ? amount / divisor : null,
      currency: String(row.price?.currency_code ?? "USD"),
      favorites, ageDays,
      /* A listing four days old with sixty saves is not doing fifteen a day
         forever; it is too new to have a rate. Reported as zero rather than as
         a spectacular number that would top every chart it appears in. */
      savesPerDay: ageDays >= MIN_AGE_DAYS ? Number((favorites / ageDays).toFixed(2)) : 0,
      rank: i + 1,
    }];
  });
}

/** Etsy's category tree, fetched once and kept. It changes about never. */
async function taxonomy(): Promise<{ id: number; name: string }[]> {
  const cached = await db().prepare("SELECT nodes_json FROM etsy_taxonomy_cache WHERE id=1").first<{ nodes_json: string }>();
  if (cached) { try { return JSON.parse(cached.nodes_json) as { id: number; name: string }[]; } catch { /* refetch */ } }

  await waitForEtsyCapacity();
  const response = await fetch("https://openapi.etsy.com/v3/application/seller-taxonomy/nodes", {
    headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20000),
  });
  await recordEtsyCall(response, "taxonomy");
  if (!response.ok) throw new Error(`Etsy would not give the category list (${response.status}).`);

  const payload = await response.json() as { results?: { id?: number; name?: string; children?: unknown[] }[] };
  const flat: { id: number; name: string }[] = [];
  const walk = (nodes: unknown[]) => {
    for (const raw of nodes) {
      const node = raw as { id?: number; name?: string; children?: unknown[] };
      if (node.id && node.name) flat.push({ id: Number(node.id), name: String(node.name) });
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(payload.results ?? []);
  await db().prepare("INSERT INTO etsy_taxonomy_cache (id,nodes_json) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET nodes_json=excluded.nodes_json,fetched_at=CURRENT_TIMESTAMP").bind(JSON.stringify(flat)).run();
  return flat;
}

/** The POD shelf: the first tree node whose name matches each product. */
async function podCategories() {
  const nodes = await taxonomy();
  return POD_PRODUCTS.flatMap(want => {
    const hit = nodes.find(n => n.name.toLowerCase() === want.toLowerCase());
    return hit ? [{ taxonomyId: hit.id, label: want }] : [];
  });
}

/**
 * Build the day's drop, once.
 *
 * Claimed before it starts, so twenty sellers arriving at seven in the morning
 * do not each begin their own build — the same claim the Etsy publish worker
 * uses. A build that dies mid-way leaves the claim behind, so a claim older
 * than ten minutes is treated as abandoned and retaken.
 */
export async function buildDrop(): Promise<{ built: boolean; why?: string }> {
  const day = today();

  const state = await db().prepare("SELECT last_built_day,building_day,building_since FROM pod_drop_state WHERE id=1")
    .first<{ last_built_day: string | null; building_day: string | null; building_since: string | null }>();
  if (state?.last_built_day === day) return { built: false, why: "already built today" };

  /* Publishing outranks the drop. Somebody's batch going out is what they paid
     for; today's intel can be yesterday's for another hour. */
  const budget = await etsyBudget();
  if (budget.remaining < BUDGET_FLOOR) return { built: false, why: "Etsy capacity reserved for publishing" };

  const claimed = await db().prepare(
    "UPDATE pod_drop_state SET building_day=?,building_since=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND (building_day IS NULL OR building_day!=? OR building_since<datetime('now','-10 minutes'))",
  ).bind(day, day).run();
  if (!claimed.meta.changes) return { built: false, why: "another request is building it" };

  try {
    const categories = await podCategories();
    if (!categories.length) throw new Error("No print-on-demand categories matched Etsy's tree.");

    for (const category of categories) {
      await waitForEtsyCapacity();
      const query = new URLSearchParams({
        taxonomy_id: String(category.taxonomyId),
        limit: String(PER_CATEGORY),
        sort_on: "score",
        sort_order: "desc",
      });
      const response = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${query}`, {
        headers: { "x-api-key": etsyApiCredential() }, signal: AbortSignal.timeout(20000),
      });
      await recordEtsyCall(response, "search");
      /* One category Etsy will not answer for is a thinner drop, never a
         failed one. The rest of the shelf is still worth reading. */
      if (!response.ok) continue;
      const payload = await response.json() as { results?: EtsyRow[] };
      await db().prepare(
        "INSERT INTO pod_drop_snapshots (day_taxonomy,day,taxonomy_id,label,listings_json) VALUES (?,?,?,?,?) ON CONFLICT(day_taxonomy) DO UPDATE SET listings_json=excluded.listings_json",
      ).bind(`${day}:${category.taxonomyId}`, day, category.taxonomyId, category.label, JSON.stringify(shape(payload.results ?? []))).run();
    }

    await db().prepare("UPDATE pod_drop_state SET last_built_day=?,building_day=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1").bind(day).run();
    /* THE DIFF NEEDS TWO DAYS. THE ARCHIVE NEEDS ALL OF THEM.
       A seller keeps every day they have already opened, so the snapshot it
       replays has to still be here — a fortnight's retention would quietly
       empty their archive from underneath them. Twelve rows of JSON a day is
       about four thousand a year; the Vault is made of exactly this. */
    await db().prepare("DELETE FROM pod_drop_snapshots WHERE day < date('now','-400 days')").run();
    return { built: true };
  } catch (error) {
    await db().prepare("UPDATE pod_drop_state SET building_day=NULL,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
      .bind(error instanceof Error ? error.message : "The drop could not be built.").run();
    throw error;
  }
}

/** Today's drop, with yesterday's alongside it so movement can be named. */
export async function readDrop(): Promise<{ day: string; categories: DropCategory[] }> {
  const rows = await db().prepare(
    "SELECT day,taxonomy_id,label,listings_json FROM pod_drop_snapshots WHERE day >= date('now','-2 days') ORDER BY day DESC",
  ).all<{ day: string; taxonomy_id: number; label: string; listings_json: string }>();

  const byDay = new Map<string, Map<number, DropListing[]>>();
  for (const row of ((rows.results ?? []) as Row[]).map(r => ({ day: String(r.day), taxonomy_id: Number(r.taxonomy_id), listings_json: String(r.listings_json) }))) {
    const parsed = (() => { try { return JSON.parse(row.listings_json) as DropListing[]; } catch { return []; } })();
    if (!byDay.has(row.day)) byDay.set(row.day, new Map());
    byDay.get(row.day)!.set(Number(row.taxonomy_id), parsed);
  }
  const days = [...byDay.keys()].sort().reverse();
  const day = days[0];
  if (!day) return { day: today(), categories: [] };
  const current = byDay.get(day)!, previous = days[1] ? byDay.get(days[1])! : new Map<number, DropListing[]>();

  const labels = new Map<number, string>(((rows.results ?? []) as Row[]).map(r => [Number(r.taxonomy_id), String(r.label)]));
  const categories: DropCategory[] = [...current.entries()].map(([taxonomyId, listings]) => {
    const before = previous.get(taxonomyId) ?? [];
    const beforeRank = new Map(before.map(l => [l.listingId, l.rank]));
    return {
      taxonomyId,
      label: labels.get(taxonomyId) ?? String(taxonomyId),
      listings,
      heat: median(listings.filter(l => l.savesPerDay > 0).map(l => l.savesPerDay)),
      /* Only meaningful once there IS a yesterday. On day one both are empty,
         which is honest — nothing has moved yet because nothing was watched. */
      newToday: before.length ? listings.filter(l => !beforeRank.has(l.listingId)).map(l => l.listingId) : [],
      climbing: listings.filter(l => { const was = beforeRank.get(l.listingId); return was !== undefined && was - l.rank >= 5; }).map(l => l.listingId),
    };
  }).sort((a, b) => b.heat - a.heat);

  return { day, categories };
}

/**
 * THE STREAK IS EARNED, NOT CLAIMED.
 *
 * There is no button. A star is a day on which something was actually
 * published, read straight out of the publish record — so it cannot be gamed
 * by opening the tab, and everybody's history is already there the day this
 * ships rather than starting at zero.
 *
 * FIVE DAYS IN A ROLLING SEVEN, not a chain and not Monday-to-Sunday. A chain
 * means one missed Wednesday wipes the board, and the feeling that follows is
 * failure rather than resolve — which is how an accountability feature becomes
 * a cancellation. A fixed week is nearly as unkind: list Thursday to Monday,
 * five days straight, and a Monday reset splits it into a two and a three and
 * tells them they missed twice. Rolling never does that.
 *
 * One day with any successful listing is one star, whether they published one
 * or twenty. The habit being built is showing up often, not emptying a queue
 * every second Sunday.
 */
export const STREAK_TARGET = 5;
export const STREAK_WINDOW = 7;

export async function listingStreak(userId: string) {
  const rows = await db().prepare(
    "SELECT DISTINCT substr(COALESCE(created_at,updated_at),1,10) day FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND COALESCE(created_at,updated_at) >= datetime('now','-6 days') ORDER BY day DESC",
  ).bind(userId).all<{ day: string }>();

  const days = ((rows.results ?? []) as Row[]).map(r => String(r.day)).filter(Boolean);
  const listedToday = days.includes(today());
  const count = days.length;
  return {
    days, count, target: STREAK_TARGET, window: STREAK_WINDOW,
    listedToday,
    hit: count >= STREAK_TARGET,
    /* Never a scold. The copy says how far along they are, or that they made
       it — there is no state in which this tells somebody they are behind. */
    message: count >= STREAK_TARGET
      ? `${count} listing days in the last 7 — you've hit your five.`
      : count === 0
        ? "List anything today to start your week."
        : `${count} of ${STREAK_TARGET} listing days this week.`,
  };
}

/**
 * MARK TODAY AS SEEN, AT THE DEPTH THEY WERE GIVEN.
 *
 * Recorded at read time rather than inferred later, because the depth is a
 * fact about the moment: they had earned ten per category on Tuesday, so
 * Tuesday is theirs at ten forever, whatever they earn afterwards. Upserted to
 * the deepest they reached that day — listing more in the afternoon should
 * open the morning further, never close it.
 */
export async function markSeen(userId: string, day: string, depth: number) {
  await db().prepare(
    "INSERT INTO drop_seen (user_day,user_id,day,depth) VALUES (?,?,?,?) ON CONFLICT(user_day) DO UPDATE SET depth=MAX(depth,excluded.depth),seen_at=CURRENT_TIMESTAMP",
  ).bind(`${userId}:${day}`, userId, day, depth).run();
}

/** Every day this seller has opened, newest first, with what they saw in it. */
export async function readArchive(userId: string, limit = 30) {
  const seen = await db().prepare(
    "SELECT day,depth FROM drop_seen WHERE user_id=? ORDER BY day DESC LIMIT ?",
  ).bind(userId, limit).all<{ day: string; depth: number }>();
  const days = ((seen.results ?? []) as Row[]).map(r => ({ day: String(r.day), depth: Number(r.depth) }));
  if (!days.length) return [];

  const rows = await db().prepare(
    `SELECT day,taxonomy_id,label,listings_json FROM pod_drop_snapshots WHERE day IN (${days.map(() => "?").join(",")})`,
  ).bind(...days.map(d => d.day)).all<{ day: string; taxonomy_id: number; label: string; listings_json: string }>();

  const byDay = new Map<string, { label: string; listings: DropListing[] }[]>();
  for (const raw of ((rows.results ?? []) as Row[])) {
    const day = String(raw.day);
    const listings = (() => { try { return JSON.parse(String(raw.listings_json)) as DropListing[]; } catch { return []; } })();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ label: String(raw.label), listings });
  }

  return days.flatMap(({ day, depth }) => {
    const categories = byDay.get(day);
    /* A day whose snapshot has aged out is dropped rather than shown empty —
       an archive entry that opens onto nothing is worse than one absent. */
    if (!categories?.length) return [];
    return [{ day, depth, categories: categories.map(c => ({ ...c, listings: c.listings.slice(0, depth) })) }];
  });
}
