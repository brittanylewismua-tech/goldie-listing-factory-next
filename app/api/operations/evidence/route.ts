import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";

/**
 * WHAT THE CLOCKS DID, WITHOUT ANYBODY HAVING WATCHED THEM.
 *
 * The outcomes are the point: one row per clock, written the first time it
 * finished and never restated. The samples are there so a pass can be checked
 * against what was true at the time rather than taken on trust.
 *
 * No blanket catches. An audit that turns a failed query into an empty result
 * says "nothing finished" when what happened is "nothing was read", which is
 * the one answer this endpoint must never give.
 */
class EvidenceUnavailable extends Error {}

export const GET = withErrorLog("operations-evidence", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const limit = Math.min(200, Math.max(1,
    Number(new URL(request.url).searchParams.get("samples") ?? 12)));

  const all = async <T>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    const out = await db.prepare(sql).bind(...binds).all<T>()
      .catch((error: unknown) => {
        throw new EvidenceUnavailable(`${sql.trim().slice(0, 60)}… — ${String(error)}`);
      });
    if (!out || out.success === false)
      throw new EvidenceUnavailable(`${sql.trim().slice(0, 60)}… returned no result set`);
    return (out.results ?? []) as T[];
  };

  try {
    const outcomes = await all<{ kind: string; decided_at: number; passed: number; payload_json: string }>(
      `SELECT kind, decided_at, passed, payload_json FROM evidence_outcomes
        ORDER BY decided_at ASC`);
    const samples = await all<{ at: number; kind: string; payload_json: string }>(
      `SELECT at, kind, payload_json FROM evidence_samples
        ORDER BY at DESC LIMIT ?`, limit);

    const read = (row: { payload_json: string }) => {
      try { return JSON.parse(row.payload_json) as unknown; }
      catch { return { unreadable: true }; }
    };

    return NextResponse.json({
      outcomes: outcomes.map(row => ({
        clock: row.kind,
        decidedAt: row.decided_at,
        passed: Boolean(row.passed),
        evidence: read(row),
      })),
      /* Nothing settled yet is a state, not an error. */
      settled: outcomes.length,
      samples: samples.map(row => ({ at: row.at, clock: row.kind, evidence: read(row) })),
    });
  } catch (error) {
    if (error instanceof EvidenceUnavailable)
      return NextResponse.json({
        error: "The timed-evidence record could not be read, so its absence "
          + "would not mean anything.",
        because: error.message,
      }, { status: 500 });
    throw error;
  }
});
