import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { env } from "cloudflare:workers";
import { gateStatus } from "@/app/market-observation";
import { OBSERVATION_HOURS } from "@/app/observation-gate";
import { registerSize } from "@/app/trademark-register";
import { registerIsReady, registerIsComplete, registerParkedFiles } from "@/app/trademark-check";

/**
 * THE PRODUCT WATCHING ITS OWN CLOCKS.
 *
 * Two things finish on their own schedule: the 72-hour observation gate and
 * the USPTO backfile. Both were being read by a person opening a health view,
 * which means the moment either finished was only captured if somebody
 * happened to be looking. A desktop task that needs an app left open and a
 * human to approve a browser is not automation, it is a reminder.
 *
 * So the worker records it. This runs on the existing twenty-minute cron, has
 * no member surface, makes no provider call, and writes two kinds of row:
 *
 *   evidence_samples — one per run. The history, so "it passed" can be
 *                      checked against what was true at the time rather than
 *                      taken on trust.
 *   evidence_outcomes — one per clock, EVER. Written with INSERT OR IGNORE,
 *                      so the first moment a clock finished is the record and
 *                      no later run can quietly restate it.
 *
 * It deliberately does not judge. It records `passes` and the exact `failing`
 * list the gate itself produced. A tick that decided for itself whether a
 * standard had been met would be a second opinion competing with the gate.
 *
 * Called from inside the worker, so there is no secret: Cloudflare only
 * stamps cf-connecting-ip on requests that crossed the network.
 */
const internalOnly = (request: Request) =>
  !request.headers.get("cf-connecting-ip");

/*
  D1716 · A JOB IS NOT A GET.

  This ran work on a GET. The internal-only header check is what keeps the
  outside world out, and it held — but a GET is meant to be safe to repeat
  and safe to follow, and any prefetch, crawl or copied link that ever got
  past that check would have started the job. It answers on POST now, and
  the GET refuses without running anything.
*/
export async function GET() {
  return NextResponse.json(
    { error: "This runs a job, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

export const POST = withErrorLog("operations-evidence-tick", async (request: Request) => {
  if (!internalOnly(request))
    return NextResponse.json({ error: "Not available." }, { status: 404 });

  const db = (env as unknown as { DB: D1Database }).DB;
  const now = Math.floor(Date.now() / 1_000);

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS evidence_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS evidence_outcomes (
      kind TEXT PRIMARY KEY, decided_at INTEGER NOT NULL,
      passed INTEGER NOT NULL, payload_json TEXT NOT NULL)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS evidence_samples_kind_at
      ON evidence_samples (kind, at DESC)`),
  ]);

  const record = async (kind: string, payload: unknown) => {
    await db.prepare(
      `INSERT INTO evidence_samples (at, kind, payload_json) VALUES (?,?,?)`)
      .bind(now, kind, JSON.stringify(payload)).run();
  };

  /* First write wins. The moment a clock finished is not restatable. */
  const settle = async (kind: string, passed: boolean, payload: unknown) => {
    const done = await db.prepare(
      `INSERT OR IGNORE INTO evidence_outcomes
         (kind, decided_at, passed, payload_json) VALUES (?,?,?,?)`)
      .bind(kind, now, passed ? 1 : 0, JSON.stringify(payload)).run();
    return Number(done.meta?.changes ?? 0) > 0;
  };

  const out: Record<string, unknown> = { at: now };

  /* ------------------------------------------- the 72-hour observation gate */
  const gate = await gateStatus(now);
  const gateSample = {
    hoursObserved: gate.hoursObserved, passes: gate.passes,
    failing: gate.failing, samples: gate.samples,
    segmentStartedAt: gate.segmentStartedAt, measured: gate.measured,
  };
  await record("observation-gate", gateSample);
  out.gate = { hoursObserved: gate.hoursObserved, passes: gate.passes,
    failing: gate.failing };

  /*
    A RESET WOULD BE THE MOST IMPORTANT THING TO NOTICE AND THE EASIEST TO
    MISS. The segment start is part of every sample, so a changed one is
    visible in the history rather than inferred from hours going backwards.
  */
  if (gate.hoursObserved >= OBSERVATION_HOURS) {
    out.gateSettled = await settle("observation-gate", Boolean(gate.passes), {
      ...gateSample, standardHours: OBSERVATION_HOURS,
      /* Recorded even on a pass, because "which safeguards were measured"
         is part of what a pass means. */
      safeguards: Object.keys(gate.measured ?? {}),
    });
  }

  /* ----------------------------------------------------- the USPTO backfile */
  const size = await registerSize(db).catch(() => null);
  const files = size?.files ?? [];
  const byState = Object.fromEntries(files.map(file => [file.state, file.count]));
  const unfinished = files
    .filter(file => file.state === "waiting" || file.state === "partial")
    .reduce((total, file) => total + Number(file.count ?? 0), 0);
  const backfileSample = {
    marks: size?.marks ?? 0, byState, unfinished,
    ready: registerIsReady(size), complete: registerIsComplete(size),
    parkedFiles: registerParkedFiles(size),
  };
  await record("trademark-backfile", backfileSample);
  out.backfile = backfileSample;

  /*
    FINAL IS NOT THE SAME AS COMPLETE, AND BOTH ARE RECORDED.

    Every file having a final answer is what makes the backfile accounted
    for. Whether any of those answers was "could not be read" is a separate
    fact, and the one that decides what a member is told about a clean
    result.
  */
  if (size && !unfinished) {
    out.backfileSettled = await settle("trademark-backfile",
      registerIsComplete(size), backfileSample);
  }

  /* The history is evidence, not a log; it is not trimmed on a timer. It is
     one small row every twenty minutes and nothing reads it hot. */
  return NextResponse.json(out);
});
