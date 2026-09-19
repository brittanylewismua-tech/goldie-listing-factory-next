import { reportCeilingReached } from "@/app/log-scrubbing";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { logError } from "@/app/error-log";

/**
 * WHERE A POLICY VIOLATION GOES WHILE THE POLICY IS STILL LEARNING.
 *
 * The CSP ships report-only first, so the full walkthrough can be run against
 * real pages and the real violations collected before anything is blocked.
 * Without somewhere to send them, report-only is indistinguishable from no
 * policy at all.
 *
 * Unauthenticated by necessity — the browser posts these, and it will not
 * carry a session for them. So nothing here trusts the body: only four fields
 * are kept, each truncated, and they are stored as a warning rather than an
 * error so a noisy policy cannot bury a real failure.
 */
export async function POST(request: Request) {
  /*
    D1724 · Anyone can post here — the browser will not send a session with a
    violation report. So the volume is bounded before the write, or the log a
    member's broken publish lives in can be buried by a script.
  */
  const db = (env as unknown as { DB?: { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> } } } }).DB;
  if (db && await reportCeilingReached(db, "csp-report"))
    return new NextResponse(null, { status: 204 });

  const body = await request.json().catch(() => null) as
    { "csp-report"?: Record<string, unknown> } | Record<string, unknown> | null;
  const report = (body && typeof body === "object"
    ? ((body as { "csp-report"?: Record<string, unknown> })["csp-report"] ?? body)
    : {}) as Record<string, unknown>;

  const keep = (value: unknown, max = 200) =>
    typeof value === "string" ? value.slice(0, max) : "";

  /* The blocked URI can be a data: URL carrying the whole payload, so it is
     cut hard. Nothing else from the report is kept at all. */
  await logError({
    area: "csp-report",
    severity: "warning",
    message: `${keep(report["effective-directive"] ?? report.effectiveDirective, 40)
      || "unknown-directive"} blocked ${keep(report["blocked-uri"] ?? report.blockedURI, 120)
      || "unknown"}`,
    context: {
      documentUri: keep(report["document-uri"] ?? report.documentURI, 200),
      directive: keep(report["effective-directive"] ?? report.effectiveDirective, 40),
    },
  }).catch(() => undefined);

  /* 204: the browser is not waiting for anything and must not retry. */
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ error: "Reports are posted here." }, { status: 405 });
}
