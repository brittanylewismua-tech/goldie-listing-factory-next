import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { check, toMatches, withRegister, type RegisterMatch } from "@/app/trademark-check";
import { liveTrademarkSearch } from "@/app/trademark-live";
import { logError } from "@/app/error-log";
import { lookup, normalize, squeeze, registerSize } from "@/app/trademark-register";

/** Current public USPTO phrase search, with the local register as a fallback. */
export const GET = withErrorLog("trademark", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to check a phrase." }, { status: 401 });

  const phrase = (new URL(request.url).searchParams.get("phrase") ?? "").slice(0, 200);
  const verdict = check(phrase);

  const db = (env as unknown as { DB?: D1Database }).DB;


  /* A register that is still loading must never be reported as a clean
     search, so its readiness travels with the answer. */
  /* D1705 · The size object travels, not a boolean derived from it, so the
     summary can tell "the queue has stopped" apart from "nothing was left
     out". */
  let size: Awaited<ReturnType<typeof registerSize>> | null = null;
  let matches: RegisterMatch[] = [];
  let registerFailed = "";
  try {
    if (!db) throw Error("Trademark database unavailable");
    const [held, hits] = await Promise.all([registerSize(db), lookup(db, phrase)]);
    size = held;
    /* toMatches rather than a second copy of it here: this route had its own
       inline mapping, which is how `exact` ended up computed two different
       ways in two places. */
    matches = toMatches(hits, phrase, normalize, squeeze);
  } catch (error) {
    /*
      A FAILED REGISTER READ IS NOT A CLEAN RESULT.

      This was a bare `catch {}`. Any error — a missing column, a timeout, a
      malformed query — left `matches` empty and `size` null, and the answer
      that reached the member was "no match was found", which is the single
      most dangerous thing this endpoint can say wrongly. The register being
      unreadable and the register being clean looked identical.

      Now the failure is recorded and travels with the answer. The curated
      list is still worth giving, so the check is not refused outright; but
      `registerRead: false` tells the caller the register was not consulted,
      and the summary is not allowed to describe a search that did not happen.
    */
    registerFailed = error instanceof Error ? error.message : String(error);
    await logError({
      area: "trademark/register-read",
      message: registerFailed,
      userId: user.userId,
    }).catch(() => {});
  }

  const live = await liveTrademarkSearch(phrase, db, matches.filter(m=>m.exact).map(m=>m.mark));
  const answer = withRegister(verdict, live?.records ?? matches, registerFailed ? null : size);
  if(live) return NextResponse.json({...answer, register:live.records,registerRead:true,
    registerReady:live.complete,registerComplete:live.complete,liveSource:true,sourceCheckedAt:live.checkedAt,sourceTotal:live.total,
    summary:live.records.length?`${live.records.length} live phrase matches from USPTO.`:"No live phrase match found in this USPTO search. This is screening information, not legal clearance."});
  return NextResponse.json(registerFailed
    ? { ...answer, registerRead: false,
        summary: verdict.risk === "clear"
          ? "The trademark records could not be read just now, so this is not "
            + "a search result. Try again in a moment. This is screening "
            + "information, not legal clearance."
          : answer.summary }
    : { ...answer, registerRead: true });
});
