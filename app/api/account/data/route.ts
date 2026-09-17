import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "cloudflare:workers";
import { describe, willBeRemoved, CONFIRMATION_REQUIRED, type Action }
  from "@/app/data-lifecycle";

/**
 * WHAT WOULD BE REMOVED, BEFORE ANYTHING IS.
 *
 * GET describes and counts. It deletes nothing. The counts come from the
 * member's own rows, so the description is not a generic leaflet — it says how
 * many of their scans, watches and listings are involved.
 *
 * Deletion itself is deliberately NOT implemented on this route during private
 * beta: an irreversible bulk delete is the one thing that must not ship
 * unattended, and no member has asked for one yet.
 */
export const GET = withErrorLog("account-data", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const action = (new URL(request.url).searchParams.get("action")
    ?? "account-deletion") as Action;
  const effects = describe(action);
  if (!effects.length)
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const count = async (sql: string) => {
    const row = await db.prepare(sql).bind(user.userId).first<{ n: number }>()
      .catch(() => null);
    return row ? Number(row.n) : null;
  };

  const yours = {
    scans: await count(`SELECT COUNT(*) AS n FROM scan_history WHERE user_id = ?`),
    designAnalyses: await count(`SELECT COUNT(*) AS n FROM scan_uploads WHERE user_id = ?`),
    nicheWatches: await count(`SELECT COUNT(*) AS n FROM niche_watches WHERE user_id = ?`),
    shopWatches: await count(`SELECT COUNT(*) AS n FROM member_shop_watches WHERE user_id = ?`),
    capturedArtwork: await count(`SELECT COUNT(*) AS n FROM artwork_provenance WHERE user_id = ?`),
    etsyShops: await count(`SELECT COUNT(*) AS n FROM etsy_connections WHERE user_id = ?`),
  };

  return NextResponse.json({
    action,
    yours,
    removed: willBeRemoved(action).map(effect => effect.say),
    kept: effects.filter(effect => effect.disposition !== "removed")
      .map(effect => ({ say: effect.say, why: effect.disposition })),
    needsConfirmation: CONFIRMATION_REQUIRED.includes(action),
    /* Stated plainly rather than discovered by clicking. */
    /*
      D1623 · THIS OUTLIVED THE THING IT DESCRIBED.

      It told every member that deletion was "carried out by hand during the
      private beta". The route that does it is built, scoped, audited and
      idempotent, and the control is wired — so the sentence was a standing
      apology for a feature that works. Removed from the page in D1621 and
      still served from here, which is the whole reason a member-facing
      string belongs in one place.
    */
    note: "Nothing is deleted by viewing this.",
  });
});
