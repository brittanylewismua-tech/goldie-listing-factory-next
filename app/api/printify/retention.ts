// Created drafts are durable owned products, not a thirty-day response cache.
// Keep their template geometry and all ambiguous/in-progress intents intact.
export const DELETE_UNUSED_TEMPLATE_SESSIONS = "DELETE FROM printify_batch_sessions WHERE expires_at <= unixepoch() AND NOT EXISTS (SELECT 1 FROM printify_draft_results r WHERE r.batch_id=printify_batch_sessions.id AND r.user_id=printify_batch_sessions.user_id)";
