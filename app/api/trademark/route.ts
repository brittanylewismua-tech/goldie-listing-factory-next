import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { check, withRegister, type RegisterMatch } from "@/app/trademark-check";
import { lookup, normalize, registerSize } from "@/app/trademark-register";

/**
 * Check a phrase before it goes on a product.
 *
 * Two passes. The curated list of things that actually get shops closed is
 * compiled into the worker and answers instantly. The federal register lives
 * in our own database — USPTO publishes no trademark search API, only bulk
 * files — so it is one indexed query, no third-party call, no quota, and
 * nobody who can change their terms on us.
 */
export const GET = withErrorLog("trademark", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to check a phrase." }, { status: 401 });

  const phrase = (new URL(request.url).searchParams.get("phrase") ?? "").slice(0, 200);
  const verdict = check(phrase);

  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return NextResponse.json(withRegister(verdict, [], null));

  /* A register that is still loading must never be reported as a clean
     search, so its readiness travels with the answer. */
  /* D1705 · The size object travels, not a boolean derived from it, so the
     summary can tell "the queue has stopped" apart from "nothing was left
     out". */
  let size: Awaited<ReturnType<typeof registerSize>> | null = null;
  let matches: RegisterMatch[] = [];
  try {
    const [held, hits] = await Promise.all([registerSize(db), lookup(db, phrase)]);
    size = held;
    const normalized = normalize(phrase);
    matches = hits.map(hit => ({
      mark: hit.mark,
      owner: hit.owner,
      registration: hit.registration,
      classes: hit.classes,
      registered: hit.registered,
      exact: normalize(hit.mark) === normalized,
    }));
  } catch {
    /* The curated answer is still worth giving. */
  }

  return NextResponse.json(withRegister(verdict, matches, size));
});
