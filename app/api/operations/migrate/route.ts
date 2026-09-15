import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { runMigrations, MIGRATIONS } from "@/app/deploy-migrations";
import { BUILD_MARKER } from "@/app/build-marker";

/**
 * RUN THE SCHEMA, AT DEPLOY.
 *
 * Called by the scheduled handler after a deploy and available to the owner on
 * demand. It is idempotent by construction — every step is the same
 * `ensure*` the runtime calls — so running it twice is the expected case.
 *
 * It reports each step, so a failure names the step rather than the request.
 */
export const maxDuration = 300;

const report = async () => {
  const outcomes = await runMigrations();
  const db = (env as unknown as { DB: D1Database }).DB;
  const tables = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all<{ name: string }>().catch(() => ({ results: [] as Array<{ name: string }> }));
  const failed = outcomes.filter(row => !row.ok);
  return {
    build: BUILD_MARKER,
    steps: outcomes.length,
    /* One failing step never stops the ones behind it. */
    failed: failed.map(row => ({ name: row.name, error: row.error })),
    ok: failed.length === 0,
    tables: (tables.results ?? []).map(row => row.name),
    slowest: [...outcomes].sort((a, b) => b.milliseconds - a.milliseconds)
      .slice(0, 5).map(row => ({ name: row.name, ms: row.milliseconds })),
  };
};

export const POST = withErrorLog("operations-migrate", async (request: Request) => {
  /*
    Two callers. The scheduled handler builds its request inside the worker, so
    it never carries cf-connecting-ip — the same proof of origin the other cron
    routes use, with no secret to leak. Anyone else must be the owner.
  */
  const internal = !request.headers.get("cf-connecting-ip");
  if (!internal) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return NextResponse.json({ ...(await report()), calledBy: internal ? "deploy" : "owner" });
});

/** What would run, without running it. */
export const GET = withErrorLog("operations-migrate-plan", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return NextResponse.json({ build: BUILD_MARKER,
    steps: MIGRATIONS.map(step => step.name) });
});
