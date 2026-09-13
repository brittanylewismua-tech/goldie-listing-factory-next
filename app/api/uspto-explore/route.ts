import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";

/**
 * A KEYHOLE INTO USPTO, FOR BUILD TIME ONLY.
 *
 * The register is reachable now, but its shape is not documented anywhere I
 * can read from a build environment — that network is proxied. Rather than
 * spend a deploy per guess, this asks USPTO one owner-authorised question at
 * a time and reports the raw answer.
 *
 * It is deliberately narrow: owner only, uspto.gov only, GET only, truncated.
 * It comes out once the ingest is written.
 */
const key = () => (env as unknown as { USPTO_API_KEY?: string }).USPTO_API_KEY?.trim() || "";

export const GET = withErrorLog("uspto-explore", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const target = new URL(request.url).searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Pass ?url= a full https URL." }, { status: 400 });
  }
  /* Host allowlist, matched on the whole label so evil-uspto.gov cannot pass. */
  const host = parsed.hostname.toLowerCase();
  const allowed = host === "uspto.gov" || host.endsWith(".uspto.gov");
  if (parsed.protocol !== "https:" || !allowed)
    return NextResponse.json({ error: "Only https uspto.gov URLs." }, { status: 400 });

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "user-agent": "Goldie/1.0 (+https://thegoldiesuite.com)",
        accept: "application/json",
        ...(key() ? { "X-API-KEY": key() } : {}),
      },
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.text();
    return NextResponse.json({
      url: parsed.toString(),
      status: response.status,
      type: response.headers.get("content-type"),
      bytes: body.length,
      /* Enough to read the shape, never enough to be a proxy for the data. */
      body: body.slice(0, 12_000),
    });
  } catch (error) {
    return NextResponse.json({
      url: parsed.toString(),
      error: error instanceof Error ? error.message : "failed",
    });
  }
});
