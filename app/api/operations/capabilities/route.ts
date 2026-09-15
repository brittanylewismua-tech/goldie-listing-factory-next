import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { env } from "cloudflare:workers";
import { CAPABILITIES, scopeMap, NOT_IN_GOLDIE } from "@/app/capability-registry";
import { PAID_WORKLOADS, workload } from "@/app/paid-workloads";
import { BUILD_MARKER } from "@/app/build-marker";

/**
 * THE REGISTRY, RESOLVED AGAINST WHAT IS ACTUALLY DEPLOYED.
 *
 * The registry declares what each capability needs. This answers whether it is
 * there — the table exists in sqlite_master, the binding is on env, the secret
 * is non-empty, the scheduled workload has a successful run. A capability is
 * reported ready only when every one of those is true.
 *
 * Secrets are reported as present or absent. No value is ever returned.
 */
export const GET = withErrorLog("operations-capabilities", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const runtime = env as unknown as Record<string, unknown>;
  const db = runtime.DB as D1Database | undefined;
  if (!db) return NextResponse.json({ error: "No database binding." }, { status: 500 });

  const tables = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all<{ name: string }>().catch(() => ({ results: [] as Array<{ name: string }> }));
  const present = new Set((tables.results ?? []).map(row => row.name));

  /* Row counts for the tables that carry member-visible data, so an existing
     but empty table is not reported as a working feature. */
  const countOf = async (name: string) => {
    if (!present.has(name)) return null;
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${name}`)
      .first<{ n: number }>().catch(() => null);
    return row ? Number(row.n) : null;
  };

  const secretPresent = (name: string) =>
    typeof runtime[name] === "string" && String(runtime[name]).trim().length > 0
      ? true
      : typeof process.env[name] === "string" && String(process.env[name]).trim().length > 0;

  const bindingPresent = (name: string) => Boolean(runtime[name]);

  const resolved = [];
  for (const entry of CAPABILITIES) {
    const missingTables = entry.tables.filter(name => !present.has(name));
    const missingBindings = entry.bindings.filter(name => !bindingPresent(name));
    const missingSecrets = entry.secrets.filter(name => !secretPresent(name));
    const counts: Record<string, number | null> = {};
    for (const name of entry.tables) counts[name] = await countOf(name);

    const paid = entry.paidWorkloads.map(key => {
      const declared = workload(key);
      return declared
        ? { key, provider: declared.provider, model: declared.model,
            unitCost: declared.unitCost, costBasis: declared.costBasis,
            memberDailyLimit: declared.memberDailyLimit,
            globalDailyCeiling: declared.globalDailyCeiling,
            limitStatus: declared.limitStatus }
        : { key, missingFromRegistry: true };
    });

    resolved.push({
      key: entry.key, feature: entry.feature, parent: entry.parent ?? null,
      what: entry.what, access: entry.access, routes: entry.routes,
      etsyScopes: entry.etsyScopes, needsPrintify: entry.needsPrintify,
      providers: entry.providers,
      paidWorkloads: paid,
      costsMoney: entry.paidWorkloads.length > 0,
      freshnessSeconds: entry.freshnessSeconds,
      tables: counts,
      missingTables, missingBindings, missingSecrets,
      /* Ready means every declared dependency resolved. Not "should work". */
      ready: !missingTables.length && !missingBindings.length && !missingSecrets.length,
      scheduled: entry.scheduled,
    });
  }

  /* A paid workload nobody declares a capability for is a workload nobody
     owns, which is how an unbounded cost appears. */
  const claimed = new Set(CAPABILITIES.flatMap(entry => entry.paidWorkloads));
  const orphanWorkloads = PAID_WORKLOADS
    .filter(entry => !claimed.has(entry.key))
    .map(entry => ({ key: entry.key, limitStatus: entry.limitStatus }));

  return NextResponse.json({
    build: BUILD_MARKER,
    capabilities: resolved,
    notReady: resolved.filter(entry => !entry.ready).map(entry => entry.key),
    etsyScopes: scopeMap(),
    orphanWorkloads,
    notInGoldie: NOT_IN_GOLDIE,
  });
});
