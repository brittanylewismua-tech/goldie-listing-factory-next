import { env } from "cloudflare:workers";
import { LISTING_FLOW_FLAG, type CanaryDecision } from "@/app/listing-call-plan";
import { classifyBlueprint, mayUseNewFlow } from "@/app/blueprint-registry";
import { queueUnknownBlueprint } from "@/app/publish-identity";

/**
 * OFF GLOBALLY. ON FOR A NAMED LIST, AND NOBODY ELSE.
 *
 * There is no percentage rollout here on purpose: a percentage decides for
 * members who did not volunteer, and this path writes listings to their live
 * Etsy shops. An allowlist is the only form of "some members" that names who.
 *
 * The two pipelines are never run together on ordinary traffic. Comparing
 * them that way would bill twice for every listing to answer a question the
 * recorded fixtures already answer for nothing.
 */
export async function canaryFor(userId: string): Promise<CanaryDecision> {
  const db = (env as unknown as { DB: D1Database }).DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS feature_canary (
    flag TEXT NOT NULL,
    user_id TEXT NOT NULL,
    unmapped_behaviour TEXT NOT NULL DEFAULT 'legacy',
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (flag, user_id))`).run();

  const row = await db.prepare(
    `SELECT unmapped_behaviour FROM feature_canary WHERE flag = ? AND user_id = ?`)
    .bind(LISTING_FLOW_FLAG, userId)
    .first<{ unmapped_behaviour: string }>();

  /*
    ROLLBACK IS DELETING A ROW.

    No deploy, no build, no flag file to edit under pressure — the member
    returns to the path that has been running all along, on their next
    request.
  */
  if (!row) return { useNewFlow: false, unmappedBehaviour: "legacy",
    because: "Not on the layered-flow allowlist." };

  return {
    useNewFlow: true,
    unmappedBehaviour: row.unmapped_behaviour === "stop" ? "stop" : "legacy",
    because: "On the layered-flow allowlist.",
  };
}

/**
 * THE PER-PRODUCT GATE.
 *
 * The canary decides whether a MEMBER may use the new flow; this decides
 * whether a PRODUCT may. Both have to say yes, because a member on the
 * allowlist can still reach for a blank nobody has mapped.
 *
 * An unknown blueprint is queued by id and routed by the canary's configured
 * behaviour. It never receives a guessed category under any path.
 */
export async function productGate(
  decision: CanaryDecision,
  { blueprintId, blueprintTitle }: { blueprintId: number | null; blueprintTitle: string },
) {
  if (!decision.useNewFlow)
    return { flow: "legacy" as const, because: decision.because };

  const mapping = classifyBlueprint(blueprintTitle);
  if (mayUseNewFlow(mapping.status))
    return { flow: "new" as const, mapping };

  /* Identity and a count. Nothing about who selected it. */
  if (blueprintId) await queueUnknownBlueprint(blueprintId, blueprintTitle);

  return decision.unmappedBehaviour === "stop"
    ? { flow: "stop" as const,
        status: `${blueprintTitle} has no verified mapping. Held rather than published with a guessed category.` }
    : { flow: "legacy" as const, because: `No verified mapping for ${blueprintTitle}.` };
}
