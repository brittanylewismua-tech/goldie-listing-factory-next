import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { decryptPrintifyToken } from "@/app/api/printify/token-crypto";

const PRINTIFY_API = "https://api.printify.com/v1";
type Runtime = { DB?: D1Database; PRINTIFY_TOKEN_KEY?: string };
type Product = { variants?: Array<{ is_enabled?: boolean }>; print_areas?: Array<{ placeholders?: Array<{ position?: string; images?: Array<{ id?: string }> }> }> };
type Member = { userId: string; email: string; displayName: string | null };

function runtime() { return env as unknown as Runtime; }

async function decryptToken(value: string) {
  const secret = runtime().PRINTIFY_TOKEN_KEY;
  if (!secret) throw new Error("Token encryption is unavailable.");
  return decryptPrintifyToken(value, secret);
}

async function status(path: string, token: string) {
  const response = await fetch(`${PRINTIFY_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "Goldie-Listing-Factory" }, cache: "no-store" });
  return { response, status: response.status };
}

function safeJson(value: string | null) {
  try { return value ? JSON.parse(value) as Record<string, unknown> : {}; } catch { return {}; }
}

function draftSummary(row: { requestKey: string; batchId: string; clientId: string; status: string; responseJson: string | null; createdAt: string | null; updatedAt: string }) {
  const result = safeJson(row.responseJson);
  return {
    requestKey: row.requestKey,
    batchId: row.batchId,
    clientId: row.clientId,
    status: row.status,
    phase: typeof result.phase === "string" ? result.phase : null,
    error: typeof result.error === "string" ? result.error : null,
    productId: typeof result.id === "string" ? result.id : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function batchSummary(row: { id: string; status: string; step: string; setupName: string; designCount: number; stateJson: string | null; updatedAt: string }) {
  const state = safeJson(row.stateJson);
  const drafts = Array.isArray(state.drafts) ? state.drafts as Array<Record<string, unknown>> : [];
  return {
    id: row.id,
    status: row.status,
    step: row.step,
    setupName: row.setupName,
    designCount: row.designCount,
    updatedAt: row.updatedAt,
    drafts: drafts.map((draft) => ({
      clientId: typeof draft.clientId === "string" ? draft.clientId : null,
      productId: typeof draft.id === "string" ? draft.id : null,
      status: typeof draft.status === "string" ? draft.status : null,
      error: typeof draft.error === "string" ? draft.error : null,
    })),
  };
}

export async function resolveMastermindMember(query: string) {
  const db = runtime().DB;
  if (!db || !query.trim()) return [] as Member[];
  const members = await db.prepare(`SELECT m.user_id AS userId, m.email,
    (SELECT e.user_name FROM error_log e WHERE e.user_id=m.user_id AND e.user_name IS NOT NULL AND trim(e.user_name)!='' ORDER BY e.created_at DESC LIMIT 1) AS displayName
    FROM mastermind_access m ORDER BY m.redeemed_at DESC`).all<Member>();
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (members.results ?? []).filter((member) => {
    const searchable = `${member.email} ${member.displayName ?? ""}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export async function auditMemberPrintify(email: string) {
  const db = runtime().DB;
  if (!db || !email) return { error: "Member email is required." };

  const access = await db.prepare("SELECT user_id AS userId FROM mastermind_access WHERE lower(email) = ?").bind(email).first<{ userId: string }>();
  if (!access) return { error: "That member has not redeemed access." };
  const [connection, diagnostic, recentDiagnostics, recentDrafts, recentBatches] = await Promise.all([
    db.prepare("SELECT encrypted_token AS encryptedToken, updated_at AS updatedAt FROM printify_connections WHERE user_id = ?").bind(access.userId).first<{ encryptedToken: string; updatedAt: string }>(),
    db.prepare("SELECT template_product_id AS templateProductId, shop_id AS shopId, error_code AS errorCode, stage, updated_at AS updatedAt FROM printify_diagnostics WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(access.userId).first<{ templateProductId: string | null; shopId: number | null; errorCode: string | null; stage: string; updatedAt: string }>(),
    db.prepare("SELECT reference, file_name AS fileName, stage, outcome, retry_count AS retryCount, error_code AS errorCode, http_status AS httpStatus, message, updated_at AS updatedAt FROM printify_diagnostics WHERE user_id=? ORDER BY updated_at DESC LIMIT 12").bind(access.userId).all(),
    db.prepare("SELECT request_key AS requestKey, batch_id AS batchId, client_id AS clientId, status, response_json AS responseJson, created_at AS createdAt, updated_at AS updatedAt FROM printify_draft_results WHERE user_id=? ORDER BY updated_at DESC LIMIT 20").bind(access.userId).all(),
    db.prepare("SELECT id,status,step,setup_name AS setupName,design_count AS designCount,state_json AS stateJson,updated_at AS updatedAt FROM listing_batches WHERE user_id=? ORDER BY updated_at DESC LIMIT 8").bind(access.userId).all(),
  ]);
  const activity = {
    recentDiagnostics: recentDiagnostics.results ?? [],
    recentDrafts: (recentDrafts.results as Array<Parameters<typeof draftSummary>[0]> ?? []).map(draftSummary),
    recentBatches: (recentBatches.results as Array<Parameters<typeof batchSummary>[0]> ?? []).map(batchSummary),
  };
  if (!connection) return { email, connection: "missing", latestFailure: diagnostic ?? null, ...activity };

  const token = await decryptToken(connection.encryptedToken);
  const shopsCheck = await status("/shops.json", token);
  const result: Record<string, unknown> = {
    email,
    connection: shopsCheck.status === 200 ? "valid" : "rejected",
    connectionHttpStatus: shopsCheck.status,
    connectionSavedAt: connection.updatedAt,
    latestFailure: diagnostic ?? null,
    ...activity,
  };
  if (shopsCheck.status !== 200) { result.accountDiagnosis = "The saved Printify connection is invalid or expired."; return result; }
  if (!diagnostic?.shopId || !diagnostic.templateProductId) { result.accountDiagnosis = "No Printify template was recorded for this failure."; return result; }

  const templateCheck = await status(`/shops/${diagnostic.shopId}/products/${diagnostic.templateProductId}.json`, token);
  result.templateHttpStatus = templateCheck.status;
  if (!templateCheck.response.ok) { result.accountDiagnosis = "The template no longer exists in the connected Printify shop."; return result; }
  const product = await templateCheck.response.json() as Product;
  const placeholders = product.print_areas?.flatMap((area) => area.placeholders ?? []) ?? [];
  const inheritedIds = [...new Set(placeholders.flatMap((placeholder) => placeholder.images?.map((image) => image.id).filter(Boolean) ?? []))] as string[];
  const mediaChecks = await Promise.all(inheritedIds.slice(0, 20).map(async (id) => (await status(`/uploads/${encodeURIComponent(id)}.json`, token)).status));
  result.template = {
    enabledVariants: product.variants?.filter((variant) => variant.is_enabled).length ?? 0,
    printAreas: product.print_areas?.length ?? 0,
    placeholderPositions: placeholders.map((placeholder) => placeholder.position ?? "unknown"),
    inheritedImageReferences: inheritedIds.length,
    inheritedMediaAvailable: mediaChecks.filter((code) => code === 200).length,
    inheritedMediaUnavailable: mediaChecks.filter((code) => code !== 200).length,
    inheritedMediaStatuses: mediaChecks,
  };
  result.accountDiagnosis = mediaChecks.some((code) => code !== 200)
    ? "The template contains media references that no longer exist in this Printify account. Goldie will remove them before creating drafts."
    : (product.variants?.filter((variant) => variant.is_enabled).length ?? 0) === 0
      ? "The template has no enabled product variants."
      : placeholders.length === 0
        ? "The template has no configured print placements."
        : "The saved connection, shop, template, variants, placements and template media are currently healthy.";
  return result;
}

export async function GET(request: Request) {
  const owner = await getChatGPTUser();
  if (!owner || !isOwner(owner)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const url = new URL(request.url);
  let email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const query = url.searchParams.get("query")?.trim() ?? "";
  if (!email && query) {
    const matches = await resolveMastermindMember(query);
    if (matches.length !== 1) return NextResponse.json({ error: matches.length ? "More than one member matched." : "No mastermind member matched that name or email.", matches: matches.map(({email, displayName}) => ({email, displayName})) }, { status: 400 });
    email = matches[0].email.toLowerCase();
  }
  const result = await auditMemberPrintify(email);
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
