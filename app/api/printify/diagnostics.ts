export type DiagnosticEvent = {
  stage: string;
  event: "started" | "retry" | "succeeded" | "failed";
  attempt?: number;
  httpStatus?: number | null;
  errorCode?: string | null;
  message?: string | null;
  templateProductId?: string | null;
  shopId?: number | null;
};

export function sanitizeDiagnosticMessage(value: unknown, limit = 600) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(token|authorization|signature)\s*[=:]\s*["']?[^\s,"'}&]+/gi, "$1=[redacted]")
    .replace(/[?&](signature|token)=[^&\s]+/gi, "$1=[redacted]")
    .slice(0, limit);
}

export function diagnosticCode(message: unknown) {
  const value = sanitizeDiagnosticMessage(message);
  return value.match(/\b(8253|8150|8201|429|401|403|500|502|503|504)\b/)?.[1] ?? null;
}

export async function startDiagnostic(db: D1Database | undefined, input: { reference: string; userId: string; userEmail: string; fileName: string }) {
  if (!db || !input.reference) return;
  try { await db.batch([
    db.prepare("DELETE FROM printify_diagnostic_events WHERE created_at < datetime('now', '-30 days')"),
    db.prepare("DELETE FROM printify_diagnostics WHERE created_at < datetime('now', '-30 days')"),
    db.prepare("INSERT INTO printify_diagnostics (reference, user_id, user_email, file_name, stage, outcome, created_at, updated_at) VALUES (?, ?, ?, ?, 'artwork_staging', 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(reference) DO UPDATE SET stage = 'artwork_staging', outcome = 'running', message = NULL, error_code = NULL, http_status = NULL, updated_at = CURRENT_TIMESTAMP")
      .bind(input.reference, input.userId, input.userEmail, sanitizeDiagnosticMessage(input.fileName, 240)),
    db.prepare("INSERT INTO printify_diagnostic_events (reference, stage, event, attempt) VALUES (?, 'artwork_staging', 'started', 0)").bind(input.reference),
  ]); } catch { /* Diagnostics must never block listing creation. */ }
}

export async function recordDiagnostic(db: D1Database | undefined, reference: string, input: DiagnosticEvent) {
  if (!db || !reference) return;
  const message = sanitizeDiagnosticMessage(input.message);
  const errorCode = input.errorCode ?? diagnosticCode(message);
  const outcome = input.event === "failed" ? "failed" : input.event === "succeeded" && input.stage === "draft_creation" ? "succeeded" : "running";
  try { await db.batch([
    db.prepare("UPDATE printify_diagnostics SET stage = ?, outcome = ?, retry_count = retry_count + ?, error_code = ?, http_status = ?, message = ?, template_product_id = COALESCE(?, template_product_id), shop_id = COALESCE(?, shop_id), updated_at = CURRENT_TIMESTAMP WHERE reference = ?")
      .bind(input.stage, outcome, input.event === "retry" ? 1 : 0, errorCode, input.httpStatus ?? null, message || null, input.templateProductId ?? null, input.shopId ?? null, reference),
    db.prepare("INSERT INTO printify_diagnostic_events (reference, stage, event, attempt, http_status, error_code, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(reference, input.stage, input.event, input.attempt ?? 0, input.httpStatus ?? null, errorCode, message || null),
  ]); } catch { /* Diagnostics must never block listing creation. */ }
}

export function publicSupportReference(reference: string) {
  return reference ? ` Support reference: ${reference}.` : "";
}
