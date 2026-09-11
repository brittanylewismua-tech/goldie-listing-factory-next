import { env } from "cloudflare:workers";
import { readDrop, type DropListing } from "@/app/pod-drop";

/**
 * EVERY TEN LISTINGS CRACKS A CARD.
 *
 * The trigger is the one thing a seller completely controls — putting work
 * out — and the reward is the thing they are greedy for. Nothing here depends
 * on whether anything sold, because in print-on-demand most listings sell
 * nothing and a game scored on that is a weekly notice that you are failing.
 *
 * Every card is real intel taken from the drop the app already builds once a
 * day for everybody, so fifty sellers cracking cards costs the same twelve
 * Etsy calls as one seller.
 *
 * ONLY BONUS INTEL IS EVER BEHIND A CARD. The moment something a seller needs
 * to get their listings out sits behind a lock, this stops being a game and
 * becomes a paywall inside a subscription, and they will feel it immediately.
 */

/**
 * IT IS A WEEK, AND EVERY WEEK IS NEW.
 *
 * The counter resets every Monday and the access re-locks with it, so the tool
 * is worth opening in week forty as much as in week one. A ladder that is
 * finished is a subscription somebody stops noticing they pay for.
 *
 * WHAT NEVER RESETS IS THE CARDS THEY TURNED. Those are a record of what they
 * saw, kept forever. Taking back something earned reads as a punishment, and
 * loss stings roughly twice as hard as the same thing gained — which is
 * exactly the discouragement this design exists to avoid. Access is seasonal.
 * History is theirs.
 *
 * PER_CARD IS TUNED TO THE REAL WEEK. These sellers list twenty to thirty
 * designs a month, so five to eight in a week. At five per card that is one or
 * two cards in an ordinary week and three or four in a good one — often enough
 * to be a rhythm, rare enough to still be worth turning. It is one constant;
 * move it when the real numbers say to.
 */
export const PER_CARD = 5;

/** Monday, UTC. Everyone's week turns together, so "this week" means one thing. */
export function weekStart(at: Date = new Date()): string {
  const d = new Date(at);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Reachable inside a single week, all of them. A tier nobody can hit is not
 * aspiration, it is decoration — and the top one should take a genuinely good
 * week rather than a heroic one.
 */
export const MILESTONES = [
  { at: 3, key: "full-drop", name: "The full drop", blurb: "Thirty listings per category instead of ten, all week." },
  { at: 6, key: "climbers", name: "The Climbers board", blurb: "Everything rising across every category, not just today's snapshot." },
  { at: 10, key: "lookup", name: "Keyword lookup", blurb: "Type any phrase and see its top thirty." },
  { at: 15, key: "vault", name: "The Vault", blurb: "Thirty days of movement — what has climbed for a month against what spiked and died." },
] as const;

export type CardKind = "climber" | "hot-shelf" | "newcomer" | "stayer";
export type Card = {
  ordinal: number; kind: CardKind; title: string; line: string;
  listing?: { title: string; url: string; image: string | null };
  category?: string; openedAt?: string;
};

type Runtime = { DB: D1Database };
const db = () => (env as unknown as Runtime).DB;

/** Successful listings since Monday. This is the number the week is scored on. */
async function listingsThisWeek(userId: string) {
  const row = await db()
    .prepare("SELECT COUNT(*) count FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND substr(COALESCE(created_at,updated_at),1,10) >= ?")
    .bind(userId, weekStart()).first<{ count: number }>();
  return Number(row?.count || 0);
}

/**
 * Turn today's drop into the cards that could be dealt.
 *
 * Ordered most striking first, so the card that opens is the best one still
 * unseen rather than a random one. A pack that can hand you something dull is
 * a pack people stop opening.
 */
async function candidates(): Promise<Card[]> {
  const { categories } = await readDrop();
  const out: Card[] = [];
  const brief = (l: DropListing) => ({ title: l.title, url: l.url, image: l.image });

  for (const category of categories) {
    const byId = new Map(category.listings.map(l => [l.listingId, l]));

    for (const id of category.climbing) {
      const listing = byId.get(id);
      if (listing) out.push({
        ordinal: 0, kind: "climber", category: category.label,
        title: "Climbing fast",
        line: `Up the ${category.label.toLowerCase()} shelf to #${listing.rank} since yesterday.`,
        listing: brief(listing),
      });
    }

    for (const id of category.newToday.slice(0, 2)) {
      const listing = byId.get(id);
      if (listing) out.push({
        ordinal: 0, kind: "newcomer", category: category.label,
        title: "Broke in overnight",
        line: `Straight into the ${category.label.toLowerCase()} top thirty at #${listing.rank}. It was not there yesterday.`,
        listing: brief(listing),
      });
    }

    /* The quiet one that keeps winning. Old enough to have a real rate, and
       saved often enough that the rate means something. */
    const stayer = category.listings
      .filter(l => l.ageDays >= 90 && l.savesPerDay > 0)
      .sort((a, b) => b.savesPerDay - a.savesPerDay)[0];
    if (stayer) out.push({
      ordinal: 0, kind: "stayer", category: category.label,
      title: "Still going",
      line: `${Math.round(stayer.ageDays / 30)} months up and still saved ${stayer.savesPerDay} times a day.`,
      listing: brief(stayer),
    });

    if (category.heat > 0) out.push({
      ordinal: 0, kind: "hot-shelf", category: category.label,
      title: `${category.label} is moving`,
      line: `The middle of this shelf is being saved ${category.heat} times a day. Somewhere you have not listed yet?`,
    });
  }

  const weight: Record<CardKind, number> = { climber: 0, newcomer: 1, stayer: 2, "hot-shelf": 3 };
  return out.sort((a, b) => weight[a.kind] - weight[b.kind]);
}

export async function unlockState(userId: string) {
  const monday = weekStart();
  const [listings, openedRows, thisWeekRow] = await Promise.all([
    listingsThisWeek(userId),
    /* Every card ever turned. History does not reset. */
    db().prepare("SELECT ordinal,kind,payload_json,opened_at FROM unlock_cards WHERE user_id=? ORDER BY ordinal DESC LIMIT 30")
      .bind(userId).all<{ ordinal: number; kind: string; payload_json: string; opened_at: string }>(),
    /* Only this week's decides what is still owed. */
    db().prepare("SELECT COUNT(*) count, COALESCE(MAX(ordinal),0) top FROM unlock_cards WHERE user_id=? AND substr(opened_at,1,10) >= ?")
      .bind(userId, monday).first<{ count: number; top: number }>(),
  ]);
  const openedThisWeek = Number(thisWeekRow?.count || 0);

  const opened: Card[] = ((openedRows.results ?? []) as Record<string, unknown>[]).flatMap(row => {
    try {
      return [{ ...(JSON.parse(String(row.payload_json)) as Card), ordinal: Number(row.ordinal), openedAt: String(row.opened_at) }];
    } catch { return []; }
  });

  const earned = Math.floor(listings / PER_CARD);
  const toward = listings % PER_CARD;
  return {
    weekStart: monday,
    listings,
    earned,
    openedThisWeek,
    /* Cards sit unopened until they are opened, deliberately. The turn is the
       moment; handing them four at once while they were away wastes three. */
    unopened: Math.max(0, earned - openedThisWeek),
    toward,
    remaining: PER_CARD - toward,
    opened,
    milestones: MILESTONES.map(m => ({ ...m, unlocked: listings >= m.at, remaining: Math.max(0, m.at - listings) })),
  };
}

/** Open one. Returns null when none is owed. */
export async function crackCard(userId: string): Promise<Card | null> {
  const state = await unlockState(userId);
  if (state.unopened <= 0) return null;

  /* Ordinals keep climbing across weeks — card 27 is card 27 forever, even
     though the week's counter went back to nothing on Monday. */
  const highest = await db().prepare("SELECT COALESCE(MAX(ordinal),0) top FROM unlock_cards WHERE user_id=?")
    .bind(userId).first<{ top: number }>();
  const ordinal = Number(highest?.top || 0) + 1;
  const seen = new Set(state.opened.map(c => `${c.kind}:${c.listing?.url ?? c.category}`));
  const pool = await candidates();
  const pick = pool.find(c => !seen.has(`${c.kind}:${c.listing?.url ?? c.category}`)) ?? pool[0];

  /* Nothing to give is not an error and must not burn the card. The drop has
     not been built yet, or today's is thin; the card stays owed. */
  if (!pick) return null;

  const card: Card = { ...pick, ordinal };
  await db().prepare(
    "INSERT INTO unlock_cards (id,user_id,ordinal,kind,payload_json,listings_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,ordinal) DO NOTHING",
  ).bind(crypto.randomUUID(), userId, ordinal, card.kind, JSON.stringify(card), state.listings).run();
  return card;
}
