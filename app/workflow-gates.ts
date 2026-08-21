/* Workflow gates — the single source of truth for "can the seller move here?"
 *
 * These were previously defined inline inside listing-factory-app.tsx and read
 * by three different callers: the step rail, the Next button, and the URL
 * handler. Changing a condition for one caller silently closed the path for the
 * others, which is what produced D53 and D73.
 *
 * Pure functions, no React, no DOM — so tests/workflow-traversal.test.mjs can
 * assert that every step and phase stays reachable in every batch state.
 */

export type WorkflowStep = "connect" | "setup" | "designs" | "review" | "finish";
export type FinishPhase = "details" | "etsy" | "mockups" | "final";

export const WORKFLOW_ORDER: WorkflowStep[] = ["connect", "setup", "designs", "review", "finish"];
export const FINISH_ORDER: FinishPhase[] = ["details", "etsy", "mockups", "final"];

/** Everything a gate is allowed to look at. Nothing else. */
export type GateState = {
  localPreview: boolean;
  connected: boolean;          // Printify
  etsyConnected: boolean;
  productSelected: boolean;
  templateLoaded: boolean;
  ready: boolean;              // designs uploaded and prepared
  complete: boolean;           // Printify drafts exist
  hasDrafts: boolean;
};

/**
 * Can the seller open this step?
 *
 * RULE: once `complete` is true the batch has real drafts on Printify. From that
 * point every step must stay open — the seller has already paid for these
 * listings and must always be able to reach them. Do not add a condition here
 * that can be false on a completed batch. That is exactly what D53 was.
 */
export function canOpenStep(step: WorkflowStep, s: GateState): boolean {
  if (s.localPreview) return true;
  if (step === "connect") return true;
  if (s.complete) return true; // completed batches are always fully navigable
  if (step === "setup") return s.connected && s.etsyConnected;
  if (step === "designs") return s.connected && s.etsyConnected && s.productSelected && s.templateLoaded;
  if (step === "review") return s.etsyConnected && s.ready;
  return s.etsyConnected && s.productSelected && s.complete;
}

/**
 * Can the seller open this Finish phase?
 * Phases are views over drafts that already exist. Once inside Finish, all four
 * must be reachable in any order. D73 was this returning false silently.
 */
export function canOpenPhase(_phase: FinishPhase, s: GateState): boolean {
  if (s.localPreview) return true;
  return canOpenStep("finish", s);
}

/**
 * Why a step is blocked. Empty array means it is open.
 *
 * RULE: never render a control as enabled when this returns a non-empty array.
 * Disable it and show the first reason. An enabled control that does nothing on
 * click is how both blockers stayed invisible until a human sat clicking.
 */
export function blockedReasons(step: WorkflowStep, s: GateState): string[] {
  if (canOpenStep(step, s)) return [];
  const reasons: string[] = [];
  if (!s.connected) reasons.push("Connect your Printify account.");
  if (!s.etsyConnected) reasons.push("Connect the Etsy shop that will receive these listings.");
  if (step !== "connect" && step !== "setup" && !s.productSelected) reasons.push("Choose a saved product.");
  if (step === "designs" && !s.templateLoaded) reasons.push("Goldie is still loading this product from Printify.");
  if (step === "review" && !s.ready) reasons.push("Add at least one design.");
  if (step === "finish" && !s.complete) reasons.push("Create your Printify drafts first.");
  return reasons.length ? reasons : ["This step is not ready yet."];
}

/** The step a batch should land on when reopened from Batch History. */
export function resumeStep(s: GateState): WorkflowStep {
  if (s.complete || s.hasDrafts) return "finish";
  if (s.ready) return "review";
  if (s.productSelected) return "designs";
  if (s.connected && s.etsyConnected) return "setup";
  return "connect";
}
