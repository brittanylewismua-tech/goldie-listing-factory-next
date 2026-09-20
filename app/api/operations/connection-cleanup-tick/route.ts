import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { confirmedRejections, markRetired, clearRejection } from "@/app/connection-cleanup";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

/**
 * THE ONLY PLACE A CONNECTION IS RETIRED.
 *
 * Reports arrive from the read paths, which never act on them. This decides,
 * and it decides twice: a report only reaches here after the provider refused
 * the same credential on two occasions at least half an hour apart, and then
 * this asks the provider one more time itself.
 *
 * That last check is the point. If the credential works now, the refusals
 * were an outage and the report is dropped rather than acted on. A working
 * token is never destroyed by a bad afternoon.
 *
 * Idempotent throughout: the queue holds one row per member and provider, a
 * retired row is not selected again, and deleting a connection that is
 * already gone changes nothing.
 */
export async function GET() {
  return NextResponse.json(
    { error: "This runs a job, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

export const POST = withErrorLog("connection-cleanup-tick", async (request: Request) => {
  /* Inside the worker only; Cloudflare stamps this header on anything that
     crossed the network. */
  if (request.headers.get("cf-connecting-ip"))
    return NextResponse.json({ error: "Not available." }, { status: 404 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const due = await confirmedRejections(db);
  const outcome: Array<Record<string, unknown>> = [];

  for (const report of due) {
    if (report.provider !== "printify") continue;

    /* One more question, asked by us rather than reported to us. */
    let stillRefused = false;
    let recovered = false;
    try {
      const row = await db.prepare(
        `SELECT encrypted_token AS token FROM printify_connections WHERE user_id = ?`)
        .bind(report.userId).first<{ token: string }>();
      if (!row?.token) {
        /* Nothing left to retire. The report has been overtaken by events. */
        await clearRejection(report.userId, "printify", db);
        outcome.push({ user: report.userId, action: "already-gone" });
        continue;
      }
      const secret = (env as unknown as { PRINTIFY_TOKEN_KEY?: string }).PRINTIFY_TOKEN_KEY;
      if (!secret) { outcome.push({ user: report.userId, action: "no-key" }); continue; }
      const token = await decryptPrintifyToken(row.token, secret);
      const answer = await fetch("https://api.printify.com/v1/shops.json", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (answer.ok) recovered = true;
      else if (answer.status === 401 || answer.status === 403) stillRefused = true;
    } catch {
      /*
        We could not ask. That is not a confirmation, so nothing is retired
        and the report waits for the next tick.
      */
      outcome.push({ user: report.userId, action: "could-not-verify" });
      continue;
    }

    if (recovered) {
      await clearRejection(report.userId, "printify", db);
      outcome.push({ user: report.userId, action: "recovered" });
      continue;
    }
    if (!stillRefused) {
      outcome.push({ user: report.userId, action: "inconclusive" });
      continue;
    }

    await db.prepare(`DELETE FROM printify_connections WHERE user_id = ?`)
      .bind(report.userId).run().catch(() => undefined);
    await markRetired(report.userId, "printify", db);
    outcome.push({ user: report.userId, action: "retired", reason: report.reason,
      sightings: report.sightings });
  }

  return NextResponse.json({ considered: due.length, outcome });
});
