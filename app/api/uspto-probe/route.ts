import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";

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
        headers: { "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)" },
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
    question: "Can the worker reach USPTO bulk trademark data without an API key?",
    results,
  });
});
