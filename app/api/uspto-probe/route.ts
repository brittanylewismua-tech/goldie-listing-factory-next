import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";

/**
 * DO WE ACTUALLY NEED A USPTO ACCOUNT?
 *
 * The real trademark checker needs the federal register, and USPTO publishes
 * it as free bulk XML. The Open Data Portal now demands a signed-in USPTO.gov
 * account plus ID.me identity verification to issue an API key, which is an
 * evening of somebody's life and a video call with documents.
 *
 * But the bulk files historically sat on bulkdata.uspto.gov behind nothing at
 * all, and the portal's login wall may only cover the portal. That is worth
 * ten seconds of checking before it costs an evening.
 *
 * This cannot be tested from a build environment — that network is proxied and
 * returns 403 for everything, which is indistinguishable from USPTO refusing
 * us. The worker has real egress, so it asks from here and reports exactly
 * what came back rather than what was hoped for.
 */

/*
  THE KEY, ONCE IT EXISTS.

  Adding USPTO_API_KEY as a worker secret is the only step Brittany has to
  take, and the moment it is there this endpoint answers the next question by
  itself: does the key work, and can it see the trademark register. No round
  trip through me, and no secret pasted into a conversation.
*/
const key = () => (env as unknown as { USPTO_API_KEY?: string }).USPTO_API_KEY?.trim() || "";

const TARGETS = [
  /* The directory listing. If this is open, the files under it usually are. */
  "https://bulkdata.uspto.gov/data/trademark/dailyxml/applications/",
  /* The portal's own dataset page, which is what demanded a login in a browser. */
  "https://data.uspto.gov/bulkdata/datasets/TRTDXFAP",
  /* The documented API root, to see whether it answers unauthenticated. */
  "https://api.uspto.gov/api/v1/datasets/products/search?q=trademark",
];

export const GET = withErrorLog("uspto-probe", async (_request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const results = [];
  for (const url of TARGETS) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)",
          /* Sent only when it exists, so the unauthenticated result stays
             comparable to what was measured before the key arrived. */
          ...(key() ? { "X-API-KEY": key() } : {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.text();
      /* Filenames are the proof: a login page returns HTML with none. */
      const files = [...body.matchAll(/href="([^"]*\.(?:zip|xml|tar))"/gi)]
        .map(match => match[1]).slice(0, 5);
      results.push({
        url,
        status: response.status,
        type: response.headers.get("content-type"),
        bytes: body.length,
        looksLikeLogin: /sign in|id\.me|registration requirement|log in/i.test(body.slice(0, 4000)),
        fileLinksFound: files,
      });
    } catch (error) {
      results.push({ url, error: error instanceof Error ? error.message : "failed" });
    }
  }

  return NextResponse.json({
    question: key()
      ? "Does the USPTO key work, and does it reach the trademark register?"
      : "Can the worker reach USPTO bulk trademark data without an API key?",
    keyPresent: Boolean(key()),
    /* Never the value. Enough to confirm the right secret landed. */
    keyLooksLike: key() ? `${key().slice(0, 4)}…${key().slice(-2)} (${key().length} chars)` : null,
    verdict: key()
      ? "A 200 on the last row means the register is reachable and the ingest can be built."
      : "401 on the API and a dead origin on the old bulk host: the account is required.",
    results,
  });
});
