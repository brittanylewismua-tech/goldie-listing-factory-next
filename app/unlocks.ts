import { env } from "cloudflare:workers";

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

/**
 * A SET IS ONE DESIGN ON THREE OR MORE PRODUCTS, AND IT IS WORTH MORE.
 *
 * The tee, the sweatshirt and the hoodie. It is the thing the method has
 * always told people to do and the thing they skip, because it is three times
 * the listing work for one design.
 *
 * So the counter stops counting listings and starts counting credits: a
 * standalone listing is one, a set is five. Three singles earn three; the same
 * three listings as a set earn five. Nobody has to be told the set is better —
 * the number says it, every time.
 *
 * AND IT IS NOT A TRICK. A set genuinely is worth more than three unrelated
 * listings: the design work happened once and it gets three shots at the
 * market on three different shelves. The reward is pointed at the thing that
 * is actually true, which is the only kind of incentive that survives somebody
 * working out how it is scored.
 */
export const SET_PRODUCTS = 3;

/**
 * A SET IS ITS LISTINGS PLUS TWO. NOT A FLAT FIVE.
 *
 * The first version paid a flat five for any set, which quietly punished the
 * best behaviour in the product: one design on six products earned five, while
 * six unrelated singles earned six. Doing the harder and more valuable thing
 * scored worse, and the first seller to notice would have stopped doing it.
 *
 * Products plus two is monotonic — more products always earns more — and a set
 * always beats the same listings published apart, by the same two, whatever
 * its size. Three products earn five, four earn six, six earn eight.
 */
export const SET_BONUS = 2;

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
  { at: 3, key: "full-drop", name: "All 30 per category", blurb: "Thirty listings per category instead of ten, all week." },
  { at: 6, key: "climbers", name: "What went up since yesterday", blurb: "Everything rising across every category, not just today's snapshot." },
  { at: 12, key: "lookup", name: "Look up any keyword", blurb: "Type any phrase and see its top thirty." },
] as const;

/**
 * The history tier is the one tier credits cannot buy.
 *
 * Three sets in a week — nine listings, but only if they are three designs
 * each on three products. Somebody grinding out fifteen singles does not reach
 * it, and that is the point: the top reward is behind the behaviour the method
 * is actually about, not behind volume.
 */
export const VAULT_SETS = 3;

type Runtime = { DB: D1Database };
type Row = Record<string, unknown>;
const db = () => (env as unknown as Runtime).DB;

/**
 * The week in credits, and how it was earned.
 *
 * A bundle run puts one design through several child batches, one per product,
 * so the same client_id across three or more batch_ids IS a set — detectable
 * out of the existing record with nothing new to track, and true of everything
 * anybody has already published.
 */
async function weekScore(userId: string) {
  const monday = weekStart();
  const rows = await db().prepare(
    `SELECT client_id, COUNT(DISTINCT batch_id) products
       FROM printify_draft_results
      WHERE user_id=? AND status='succeeded'
        AND substr(COALESCE(created_at,updated_at),1,10) >= ?
      GROUP BY client_id`,
  ).bind(userId, monday).all<{ client_id: string; products: number }>();

  let listings = 0, sets = 0, credits = 0;
  for (const raw of ((rows.results ?? []) as Row[])) {
    const products = Number(raw.products) || 0;
    listings += products;
    if (products >= SET_PRODUCTS) { sets += 1; credits += products + SET_BONUS; }
    else credits += products;
  }
  return { listings, sets, credits };
}

export async function unlockState(userId: string) {
  const { listings, sets, credits } = await weekScore(userId);
  const toward = credits % PER_CARD;
  return {
    weekStart: weekStart(),
    listings,
    sets,
    credits,
    toward,
    remaining: PER_CARD - toward,
    milestones: [
      ...MILESTONES.map(m => ({ ...m, unlocked: credits >= m.at, remaining: Math.max(0, m.at - credits), needsSets: 0 })),
      {
        at: VAULT_SETS, key: "vault", name: "30 days of history",
        blurb: "What has climbed all month against what spiked and died. Sets only.",
        unlocked: sets >= VAULT_SETS, remaining: Math.max(0, VAULT_SETS - sets), needsSets: VAULT_SETS,
      },
    ],
  };
}

