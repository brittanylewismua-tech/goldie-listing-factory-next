import { reportCeilingReached, reporterKey } from "@/app/log-scrubbing";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { logError } from "@/app/error-log";
import { boundedReportBody } from "@/app/log-scrubbing";

export async function POST(request: Request) {
  let payload: { message?: string; source?: string; line?: number; column?: number; kind?: string; digest?: string; url?: string; stack?: string } = {};
  /* Bounded: the fields are truncated below, but only after a body is read. */
  const body = await boundedReportBody(request);
  if (!body || typeof body !== "object")
    return NextResponse.json({ ok: false }, { status: 400 });
  payload = body as typeof payload;
  const safe = {
    kind: String(payload.kind || "error").slice(0, 40),
    message: String(payload.message || "Unknown browser startup error").slice(0, 500),
    source: String(payload.source || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 300),
    line: Number(payload.line || 0),
    column: Number(payload.column || 0),
    digest: String(payload.digest || "").slice(0, 120),
  };
  console.error("[listing-factory-client-startup]", JSON.stringify(safe));

  /* D441 - this used to end at that console.error, in logs nobody can query and
     with nobody identified. A crash in the browser is the failure a customer
     actually experiences, so it belongs in the same log as everything else, with
     their name against it. Identity is read here rather than trusted from the
     body, which is why the beacon does not send it. */
  /* D1724 · Unauthenticated by necessity, so bounded before the write. */
  const db = (env as unknown as { DB?: { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> } } } }).DB;
  const source = await reporterKey(request);
  if (db && await reportCeilingReached(db, "browser/", source))
    return NextResponse.json({ received: true });

  const user = await getChatGPTUser().catch(() => null);
  await logError({
    area: `browser/${safe.kind}`,
    message: safe.message,
    userId: user?.userId,
    userEmail: user?.email,
    userName: user?.displayName || user?.fullName,
    errorCode: safe.digest || null,
    url: payload.url || safe.source,
    userAgent: request.headers.get("user-agent"),
    context: {
      /* D1727 · see log-scrubbing: the per-source ceiling counts this. */
      src: source,
      source: safe.source,
      line: safe.line,
      column: safe.column,
      stack: String(payload.stack || "").slice(0, 1200) || undefined,
    },
  });
  return new NextResponse(null, { status: 204 });
}
