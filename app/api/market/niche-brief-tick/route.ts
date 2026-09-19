import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { readNiche } from "@/app/niche-brief";
import { appendHistory, ensureNicheWatchTables } from "@/app/niche-watch-store";
import {
  classify, ensureBriefRunTable, noteAttempt, order,
  type BriefDb, type NicheRow,
} from "@/app/niche-brief-refresh";
import type { NicheState } from "@/app/niche-brief-state";

/**
 * REBUILD THE BRIEFS FOR SAVED NICHES.
 *
 * Briefs were written in two places only — when a member opened a niche, and
 * when they saved one. Nothing else ever wrote one, so a saved niche aged from
 * the last time it was opened, crossed the 36-hour line, and the list then
 * told the member its evidence "could not be refreshed". Nothing had failed;
 * nothing had been attempted.
 *
 * Costs no Etsy call and no paid provider call: a brief is built from data we
 * already hold.
 */
export const maxDuration = 300;

/* Bounded so one invocation cannot run past the worker's budget. Saved niches
   are few; this is a ceiling, not a target. */
const PER_RUN = 25;

export const POST = withErrorLog("market-niche-brief-tick", async (request: Request) => {
  /* The scheduled caller builds its request inside the worker, so it carries
     no cf-connecting-ip — the same proof of origin the other cron routes use. */
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const db = (env as unknown as { DB: D1Database }).DB as unknown as BriefDb;
  await ensureNicheWatchTables();
  await ensureBriefRunTable(db);
  const now = Math.floor(Date.now() / 1000);

  /*
    ONE ROW PER NICHE, NOT ONE PER MEMBER WATCHING IT.

    A brief belongs to the niche — `niche_watch_history` has no user column —
    and every figure the list shows is member-independent. Two members watching
    "dog mom" share one rebuild. Grouping here is what makes that true; without
    it the same niche would be rebuilt once per member holding it.

    `owner` is any one member who holds the niche, used only to satisfy
    readNiche's signature. The single per-member figure it can produce, "new
    since you last looked", is not stored by a scheduled rebuild — there is no
    member looking — and is computed live when they open the niche.
  */
  const saved = await db.prepare(
    `SELECT w.niche_key           AS key,
            MAX(w.terms)          AS terms,
            MAX(w.user_id)        AS owner,
            MAX(w.last_opened)    AS lastOpened,
            COUNT(DISTINCT w.user_id) AS watchers,
            COALESCE((SELECT MAX(h.observed_at) FROM niche_watch_history h
                       WHERE h.niche_key = w.niche_key), 0) AS lastBriefAt,
            COALESCE((SELECT r.consecutive_failures FROM niche_brief_runs r
                       WHERE r.niche_key = w.niche_key), 0) AS consecutiveFailures,
            COALESCE((SELECT r.last_attempt_at FROM niche_brief_runs r
                       WHERE r.niche_key = w.niche_key), 0) AS lastAttemptAt
       FROM niche_watches w
      GROUP BY w.niche_key`)
    .all<{ key: string; terms: string; owner: string; lastOpened: number;
      watchers: number; lastBriefAt: number; consecutiveFailures: number;
      lastAttemptAt: number }>();

  const rows: Array<NicheRow & { owner: string; watchers: number }> =
    (saved.results ?? []).map(row => ({
      key: String(row.key),
      terms: String(row.terms ?? "").split("|").filter(Boolean),
      lastOpened: Number(row.lastOpened) || 0,
      lastBriefAt: Number(row.lastBriefAt) || 0,
      consecutiveFailures: Number(row.consecutiveFailures) || 0,
      lastAttemptAt: Number(row.lastAttemptAt) || 0,
      owner: String(row.owner ?? ""),
      watchers: Number(row.watchers) || 0,
    }));

  /* The census BEFORE any work, so creation and completion can be compared. */
  const before: Record<NicheState, number> =
    { fresh: 0, due: 0, processing: 0, unavailable: 0, failing: 0 };
  for (const row of rows) before[classify(row, now)] += 1;

  const queue = order(rows, now).slice(0, PER_RUN);
  const outcomes: Array<{ key: string; state: NicheState; watchers: number }> = [];

  for (const row of queue) {
    const mine = rows.find(one => one.key === row.key)!;
    let state: NicheState = "fresh";
    let message = "";
    try {
      const view = await readNiche(mine.owner, row.terms, row.key, now);
      await appendHistory(row.key, view.summary, now);
      /*
        A REBUILD THAT FOUND NOTHING IS NOT A REBUILD THAT FAILED.

        A niche with no corroborated movement yet gets a real, current brief
        saying so. Recording that as a failure would put it into backoff and
        make an empty niche look broken.
      */
      const summary = view.summary as { moving?: number } | undefined;
      state = Number(summary?.moving ?? 0) > 0 ? "fresh" : "unavailable";
    } catch (error) {
      state = "failing";
      message = error instanceof Error ? error.message : String(error);
    }
    await noteAttempt(db, row.key, now, state, message);
    outcomes.push({ key: row.key, state, watchers: mine.watchers });
  }

  /* And after, so a reader can see the queue actually drained. */
  const after: Record<NicheState, number> =
    { fresh: 0, due: 0, processing: 0, unavailable: 0, failing: 0 };
  for (const row of rows) {
    const rebuilt = outcomes.find(one => one.key === row.key);
    after[rebuilt ? rebuilt.state : classify(row, now)] += 1;
  }

  const rebuilt = outcomes.filter(one => one.state !== "failing").length;
  return NextResponse.json({
    savedNiches: rows.length,
    distinctNiches: rows.length,
    watchersCovered: rows.reduce((total, row) => total + row.watchers, 0),
    dueBefore: before.due,
    rebuiltThisRun: rebuilt,
    failedThisRun: outcomes.length - rebuilt,
    remainingDue: Math.max(0, before.due - outcomes.length),
    before, after,
    /* Stated rather than implied: this path spends neither. */
    etsyCalls: 0,
    paidProviderCalls: 0,
    outcomes,
  });
});
