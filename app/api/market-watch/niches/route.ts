import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireFeatureApi } from "@/app/require-feature";
import { env } from "cloudflare:workers";
import { normalizeNiche, intersect, type Candidate } from "@/app/niche-cohort";
import {
  stateOf, summarize, patterns, LABELS, type ListingEvidence,
} from "@/app/niche-watch";
import {
  saveWatch, removeWatch, watchesFor, markOpened, appendHistory, lastGood, trend,
  MAX_NICHE_WATCHES,
} from "@/app/niche-watch-store";
import { ANALYSIS_VERSION } from "@/app/reference-analysis";
import { candidateSummary } from "@/app/niche-candidate-store";
import { GATHERING } from "@/app/niche-candidates";
import { EVIDENCE_FRESH_DAYS } from "@/app/momentum-cohort";
import { describeWindow } from "@/app/evidence-window";
import { DISPLAY_FRESHNESS_SECONDS } from "@/app/reference-images";

/**
 * NICHE WATCH.
 *
 * Reads the shared corpus. No paid provider call exists on this path, and one
 * more saved niche costs one more local query — not an Etsy sweep.
 *
 * Listing images and titles displayed here come from `reference_images`, which
 * carries the time each was read from Etsy. Anything past six hours is marked
 * stale for display rather than shown as current, and the refresh job brings
 * it back inside the window.
 */
export const maxDuration = 300;

import { readNiche, summariesForWatches } from "@/app/niche-brief";

export const GET = withErrorLog("market-watch-niches", async (request: Request) => {
  /* The entitlement decides, not the owner flag: a complimentary beta
     member reaches this and a Listing Factory member does not. */
  const access = await requireFeatureApi("marketWatch");
  if (!access.ok) return access.response;
  const user = access.user;

  const now = Math.floor(Date.now() / 1000);
  const key = new URL(request.url).searchParams.get("key");
  const saved = await watchesFor(user.userId);

  if (!key)
    return NextResponse.json({
      limit: MAX_NICHE_WATCHES,
      watches: await (async () => {
        /*
          COUNTED LIVE, THE SAME WAY THE DETAIL PAGE COUNTS.

          These figures came from the stored brief, while the page behind them
          computed from current evidence — so the list said bachelorette had
          131 listings moving and the page said 136. One read of the corpus
          serves every saved niche, so this costs one query rather than one
          per row.

          The stored brief is still what answers if the read fails: a number
          that is a few hours old and labelled is better than a page of
          zeroes, and `stale` says which it is.
        */
        const live = await summariesForWatches(saved, now).catch(() => null);
        return Promise.all(saved.map(async watch => {
          const held = await lastGood(watch.key);
          const fresh = live?.get(watch.key);
          const payload = held?.payload as { moving?: number; repeated?: number;
            shops?: number } | undefined;
          return { key: watch.key, phrase: watch.phrase,
            moving: fresh ? fresh.moving : payload?.moving ?? 0,
            repeated: fresh ? fresh.repeated : payload?.repeated ?? 0,
            shops: fresh ? fresh.shops : payload?.shops ?? 0,
            lastCheckedAt: fresh ? now : held?.observedAt ?? 0,
            /* Live figures are current by definition. A fallback to the
               stored brief is only fresh if the brief itself is. */
            stale: fresh ? false : held ? now - held.observedAt > 36 * 3_600 : true };
        }));
      })(),
    });

  const watch = saved.find(row => row.key === key);
  if (!watch) return NextResponse.json({ error: "That watch is not saved." }, { status: 404 });

  try {
    const view = await readNiche(user.userId, watch.terms, key, now);
    await appendHistory(key, view.summary, now);
    await markOpened(user.userId, key, now);
    return NextResponse.json({ ...view, phrase: watch.phrase, stale: false,
      history: await trend(key) });
  } catch (error) {
    /*
      A FAILED REFRESH KEEPS THE LAST GOOD READING.

      Replacing a real brief with an empty state would tell the member their
      niche died when in fact a query failed.
    */
    const held = await lastGood(key);
    if (!held)
      return NextResponse.json({ error: "This watch has not gathered evidence yet.",
        phrase: watch.phrase, key, listings: [], stale: true }, { status: 200 });
    return NextResponse.json({ key, phrase: watch.phrase, summary: held.payload,
      listings: [], stale: true, lastCheckedAt: held.observedAt,
      note: error instanceof Error ? "" : "" });
  }
});

export const POST = withErrorLog("market-watch-save-niche", async (request: Request) => {
  /* The entitlement decides, not the owner flag: a complimentary beta
     member reaches this and a Listing Factory member does not. */
  const access = await requireFeatureApi("marketWatch");
  if (!access.ok) return access.response;
  const user = access.user;
  const body = await request.json().catch(() => null) as
    { phrase?: string; remove?: string } | null;
  const now = Math.floor(Date.now() / 1000);

  if (body?.remove) {
    await removeWatch(user.userId, body.remove);
    return NextResponse.json({ removed: true });
  }

  const phrase = String(body?.phrase ?? "").trim().slice(0, 80);
  if (!phrase) return NextResponse.json({ error: "Name a niche to watch." }, { status: 400 });
  const { terms } = normalizeNiche(phrase);
  const saved = await saveWatch(user.userId, phrase, terms, now);
  if (!saved.ok) return NextResponse.json({ error: saved.because }, { status: 400 });

  /* The first reading happens immediately, so a new watch is never an empty
     page waiting for a cron. */
  try {
    const view = await readNiche(user.userId, terms, saved.key, now);
    await appendHistory(saved.key, view.summary, now);
    return NextResponse.json({ saved: true, key: saved.key, phrase, ...view });
  } catch {
    return NextResponse.json({ saved: true, key: saved.key, phrase,
      listings: [], stale: true });
  }
});
